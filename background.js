// Initialize storage on installation
chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.sync.set({
		blurIntensity: 16,
		profiles: {},
		isEnabled: true,
	});
});

// Main message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	const tabId = sender.tab.id;
	if (request.type === "SAVE_BLURS") {
		const { blurs } = request.payload;
		const key = `blurs_for_tab_${tabId}`;
		chrome.storage.local.set({ [key]: blurs }, () => {
			console.log(`Blurs saved for tab ${tabId}`);
			sendResponse({ success: true });
		});
		return true; // Indicates async response
	}

	if (request.type === "GET_BLURS") {
		// const { tabId } = request.payload;
		const key = `blurs_for_tab_${tabId}`;
		chrome.storage.local.get([key], (result) => {
			sendResponse({ blurs: result[key] || [] });
		});
		return true; // Indicates async response
	}
});

// Listener for the "Peek" keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
	if (command === "toggle-peek") {
		chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => {
				// This function is executed in the content script's context
				const overlays = document.querySelectorAll(
					".privacy-blur-overlay-container"
				);
				if (overlays.length > 0) {
					// A bit of a hack to detect if we're currently peeking
					const isPeeking =
						document.body.dataset.isPeeking === "true";
					overlays.forEach((overlay) => {
						overlay.style.display = isPeeking ? "" : "none";
					});
					document.body.dataset.isPeeking = !isPeeking;
				}
			},
		});
	}
});
