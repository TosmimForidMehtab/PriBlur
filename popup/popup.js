document.addEventListener('DOMContentLoaded', () => {
    // --- QUERY SELECTORS ---
    const masterEnable = document.getElementById('master-enable');
    const blurIntensitySlider = document.getElementById('blur-intensity');
    const startSessionBtn = document.getElementById('start-session-btn');
    const addBlurBtn = document.getElementById('add-blur-btn');
    const clearBlursBtn = document.getElementById('clear-blurs-btn');
    const profilesDropdown = document.getElementById('profiles-dropdown');
    const profileNameInput = document.getElementById('profile-name-input');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const deleteProfileBtn = document.getElementById('delete-profile-btn');
    const statusIdle = document.getElementById('status-idle');
    const statusActive = document.getElementById('status-active');

    let currentTabId;

    // --- INITIALIZATION ---
    async function initialize() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabId = tab.id;

        const settings = await chrome.storage.sync.get(['isEnabled', 'blurIntensity', 'profiles']);
        masterEnable.checked = settings.isEnabled !== false;
        blurIntensitySlider.value = settings.blurIntensity || 16;
        updateUIEnabledState(masterEnable.checked);
        loadProfiles(settings.profiles || {});

        const tabState = await chrome.storage.local.get(`session_active_${currentTabId}`);
        if (tabState[`session_active_${currentTabId}`]) {
            setUIState('active');
        } else {
            setUIState('idle');
        }
    }

    // --- UI STATE MANAGEMENT ---
    function setUIState(state) {
        if (state === 'active') {
            statusIdle.style.display = 'none';
            statusActive.style.display = 'block';
        } else {
            statusIdle.style.display = 'block';
            statusActive.style.display = 'none';
        }
    }
    
    function updateUIEnabledState(isEnabled) {
        const mainContent = document.getElementById('main-content');
        if (isEnabled) {
            mainContent.style.opacity = 1;
            mainContent.style.pointerEvents = 'auto';
        } else {
            mainContent.style.opacity = 0.5;
            mainContent.style.pointerEvents = 'none';
        }
    }
    
    // --- EVENT LISTENERS ---
    masterEnable.addEventListener('change', () => {
        const isEnabled = masterEnable.checked;
        chrome.storage.sync.set({ isEnabled });
        updateUIEnabledState(isEnabled);
        sendMessageToContentScript({ type: 'SET_ENABLED', payload: { isEnabled }});
        if (!isEnabled) {
            // If disabled, clear blurs on the page
             sendMessageToContentScript({ type: 'CLEAR_ALL_BLURS' });
        }
    });

    blurIntensitySlider.addEventListener('input', () => {
        const intensity = blurIntensitySlider.value;
        chrome.storage.sync.set({ blurIntensity: intensity });
        sendMessageToContentScript({ type: 'UPDATE_INTENSITY', payload: { intensity } });
    });

    startSessionBtn.addEventListener('click', () => {
        startSession();
    });
    
    addBlurBtn.addEventListener('click', () => {
        startSession();
    });

    function startSession() {
        if (!masterEnable.checked) return;
        chrome.storage.local.set({ [`session_active_${currentTabId}`]: true });
        setUIState('active');
        sendMessageToContentScript({ type: 'START_SESSION' });
        window.close(); // Close popup to allow user to interact with page
    }

    clearBlursBtn.addEventListener('click', () => {
        chrome.storage.local.remove(`blurs_for_tab_${currentTabId}`);
        chrome.storage.local.set({ [`session_active_${currentTabId}`]: false });
        sendMessageToContentScript({ type: 'CLEAR_ALL_BLURS' });
        setUIState('idle');
    });

    // --- PROFILES LOGIC ---
    saveProfileBtn.addEventListener('click', async () => {
        const name = profileNameInput.value.trim();
        if (!name) {
            alert('Please enter a name for the profile.');
            return;
        }

        const { blurs } = await chrome.runtime.sendMessage({ type: 'GET_BLURS', payload: { tabId: currentTabId } });
        if (!blurs || blurs.length === 0) {
            alert('No blurs to save. Please create some blurs first.');
            return;
        }

        const { profiles } = await chrome.storage.sync.get('profiles');
        profiles[name] = blurs;
        await chrome.storage.sync.set({ profiles });
        
        loadProfiles(profiles);
        profilesDropdown.value = name;
        profileNameInput.value = '';
    });
    
    profilesDropdown.addEventListener('change', async () => {
        const name = profilesDropdown.value;
        if (!name) return;
        
        const { profiles } = await chrome.storage.sync.get('profiles');
        const blursToLoad = profiles[name];

        if (blursToLoad) {
            await chrome.runtime.sendMessage({ type: 'SAVE_BLURS', payload: { tabId: currentTabId, blurs: blursToLoad } });
            await sendMessageToContentScript({ type: 'APPLY_BLURS', payload: { blurs: blursToLoad } });
            chrome.storage.local.set({ [`session_active_${currentTabId}`]: true });
            setUIState('active');
        }
    });
    
    deleteProfileBtn.addEventListener('click', async () => {
        const name = profilesDropdown.value;
        if (!name) {
            alert('Please select a profile to delete.');
            return;
        }
        
        const { profiles } = await chrome.storage.sync.get('profiles');
        delete profiles[name];
        await chrome.storage.sync.set({ profiles });
        loadProfiles(profiles);
    });

    function loadProfiles(profiles) {
        profilesDropdown.innerHTML = '<option value="">Load a profile...</option>';
        for (const name in profiles) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            profilesDropdown.appendChild(option);
        }
    }
    
    // --- HELPER FUNCTIONS ---
    async function sendMessageToContentScript(message) {
        try {
            await chrome.tabs.sendMessage(currentTabId, message);
        } catch (error) {
            // This can happen if the content script is not yet injected.
            // We can inject it now and then send the message.
            if (error.message.includes('Receiving end does not exist')) {
                await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    files: ['content/content.js']
                });
                await chrome.tabs.sendMessage(currentTabId, message);
            } else {
                console.error("Privacy Blur Error:", error);
            }
        }
    }

    // --- RUN INITIALIZATION ---
    initialize();
});