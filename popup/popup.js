document.addEventListener("DOMContentLoaded", () => {
	// --- QUERY SELECTORS ---
	const masterEnable = document.getElementById("master-enable");
	const blurIntensitySlider = document.getElementById("blur-intensity");
	const startSessionBtn = document.getElementById("start-session-btn");
	const addBlurBtn = document.getElementById("add-blur-btn");
	const clearBlursBtn = document.getElementById("clear-blurs-btn");
	const profilesDropdown = document.getElementById("profiles-dropdown");
	const profileNameInput = document.getElementById("profile-name-input");
	const saveProfileBtn = document.getElementById("save-profile-btn");
	const deleteProfileBtn = document.getElementById("delete-profile-btn");
	const statusIdle = document.getElementById("status-idle");
	const statusActive = document.getElementById("status-active");

	let currentTabId;

	// --- INITIALIZATION ---
	async function initialize() {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		currentTabId = tab.id;

		const settings = await chrome.storage.sync.get([
			"isEnabled",
			"blurIntensity",
			"profiles",
		]);
		masterEnable.checked = settings.isEnabled !== false;
		blurIntensitySlider.value = settings.blurIntensity || 16;
		updateUIEnabledState(masterEnable.checked);
		loadProfiles(settings.profiles || {});

		const tabState = await chrome.storage.local.get(
			`session_active_${currentTabId}`
		);
		if (tabState[`session_active_${currentTabId}`]) {
			setUIState("active");
		} else {
			setUIState("idle");
		}
	}

	// --- UI STATE MANAGEMENT ---
	function setUIState(state) {
		if (state === "active") {
			statusIdle.style.display = "none";
			statusActive.style.display = "block";
		} else {
			statusIdle.style.display = "block";
			statusActive.style.display = "none";
		}
	}

	function updateUIEnabledState(isEnabled) {
		const mainContent = document.getElementById("main-content");
		mainContent.style.opacity = isEnabled ? 1 : 0.5;
		mainContent.style.pointerEvents = isEnabled ? "auto" : "none";
	}

	// --- ROBUST SESSION START LOGIC (THE FIX) ---
	async function startOrUpdateSession() {
		if (!masterEnable.checked || !currentTabId) return;

		// Proactively inject the content script to ensure it's always available.
		// This is more reliable than waiting for an error.
		await chrome.scripting.executeScript({
			target: { tabId: currentTabId },
			files: ["content/content.js"],
		});

		// Now, send the message to start the session.
		await chrome.tabs.sendMessage(currentTabId, { type: "START_SESSION" });

		// Update the state and UI
		chrome.storage.local.set({ [`session_active_${currentTabId}`]: true });
		setUIState("active");

		// Close the popup as requested
		window.close();
	}

	// --- EVENT LISTENERS ---
	masterEnable.addEventListener("change", () => {
		const isEnabled = masterEnable.checked;
		chrome.storage.sync.set({ isEnabled });
		updateUIEnabledState(isEnabled);
		sendMessageToContentScript({
			type: "SET_ENABLED",
			payload: { isEnabled },
		});
		if (!isEnabled) {
			sendMessageToContentScript({ type: "CLEAR_ALL_BLURS" });
		}
	});

	blurIntensitySlider.addEventListener("input", () => {
		const intensity = blurIntensitySlider.value;
		chrome.storage.sync.set({ blurIntensity: intensity });
		sendMessageToContentScript({
			type: "UPDATE_INTENSITY",
			payload: { intensity },
		});
	});

	// Both "Start Session" and "Add More" will now use the same reliable function
	startSessionBtn.addEventListener("click", startOrUpdateSession);
	addBlurBtn.addEventListener("click", startOrUpdateSession);

	clearBlursBtn.addEventListener("click", () => {
		chrome.storage.local.remove(`blurs_for_tab_${currentTabId}`);
		chrome.storage.local.set({ [`session_active_${currentTabId}`]: false });
		sendMessageToContentScript({ type: "CLEAR_ALL_BLURS" });
		setUIState("idle");
	});

	// --- PROFILES LOGIC ---
	saveProfileBtn.addEventListener("click", async () => {
		const name = profileNameInput.value.trim();
		if (!name) return;

		const { blurs } = await chrome.runtime.sendMessage({
			type: "GET_BLURS",
		});
		if (!blurs || blurs.length === 0) return;

		const { profiles } = await chrome.storage.sync.get("profiles");
		profiles[name] = blurs;
		await chrome.storage.sync.set({ profiles });

		loadProfiles(profiles);
		profilesDropdown.value = name;
		profileNameInput.value = "";
	});

	profilesDropdown.addEventListener("change", async () => {
		const name = profilesDropdown.value;
		if (!name) return;

		const { profiles } = await chrome.storage.sync.get("profiles");
		const blursToLoad = profiles[name];

		if (blursToLoad) {
			await sendMessageToContentScript({
				type: "APPLY_BLURS",
				payload: { blurs: blursToLoad },
			});
			chrome.storage.local.set({
				[`session_active_${currentTabId}`]: true,
			});
			setUIState("active");
		}
	});

	deleteProfileBtn.addEventListener("click", async () => {
		const name = profilesDropdown.value;
		if (!name) return;

		const { profiles } = await chrome.storage.sync.get("profiles");
		delete profiles[name];
		await chrome.storage.sync.set({ profiles });
		loadProfiles(profiles);
	});

	function loadProfiles(profiles) {
		profilesDropdown.innerHTML =
			'<option value="">Load a profile...</option>';
		for (const name in profiles) {
			const option = document.createElement("option");
			option.value = name;
			option.textContent = name;
			profilesDropdown.appendChild(option);
		}
	}

	// --- HELPER FUNCTIONS ---
	async function sendMessageToContentScript(message) {
		if (!currentTabId) return;
		try {
			await chrome.tabs.sendMessage(currentTabId, message);
		} catch (error) {
			console.warn(
				"Could not send message, content script may not be active yet.",
				error
			);
		}
	}

	// --- RUN INITIALIZATION ---
	initialize();
});
