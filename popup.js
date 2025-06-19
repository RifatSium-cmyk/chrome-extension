/**
 * popup.js (with Hotkey Failure Detection)
 */
document.addEventListener('DOMContentLoaded', () => {
    // This example assumes the user is logged in
    const authContainer = document.getElementById('authContainer');
    const appView = document.getElementById('appView');
    authContainer.classList.add('hidden');
    appView.classList.remove('hidden');
    
    initializeMainApp();
});

function initializeMainApp() {
    // --- NEW: Elements for the hotkey warning ---
    const hotkeyWarning = document.getElementById("hotkey-warning");
    const fixHotkeyLink = document.getElementById("fix-hotkey-link");

    // Check if the hotkey failed to be set
    chrome.storage.local.get("hotkeySetupFailed", (data) => {
        if (data.hotkeySetupFailed) {
            hotkeyWarning.classList.remove("hidden");
        }
    });

    // Make the "fix it" link open the shortcuts page
    fixHotkeyLink.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
    
    // --- Existing elements and listeners ---
    const enableToggle = document.getElementById("enableToggle");
    const snipQuestionBtn = document.getElementById("snipQuestionBtn");
    const selectElementBtn = document.getElementById("selectElementBtn");
    const resetSnipBtn = document.getElementById("resetSnipBtn");
    const resetElementBtn = document.getElementById("resetElementBtn");

    chrome.storage.sync.get(["toolEnabled"], (data) => {
        enableToggle.checked = data.toolEnabled !== false;
    });

    enableToggle.addEventListener("change", () => {
        chrome.storage.sync.set({ toolEnabled: enableToggle.checked });
    });

    snipQuestionBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: 'startOcrCapture' });
        window.close();
    });

    resetSnipBtn.addEventListener("click", () => {
        chrome.storage.local.remove(["savedSnipZone"], () => {
            alert("Saved snip area has been reset.");
        });
    });

    selectElementBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                 chrome.tabs.sendMessage(tabs[0].id, { action: 'startElementSelection' });
            }
        });
        window.close();
    });

    resetElementBtn.addEventListener("click", () => {
        chrome.storage.local.remove(["savedSelector"], () => {
            alert("Taught text area has been reset.");
        });
    });
}