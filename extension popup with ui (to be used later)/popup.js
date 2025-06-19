document.addEventListener('DOMContentLoaded', function () {
    console.log('[QuizWhiz] DOMContentLoaded fired. Starting script.');
    
    try {
        if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
            throw new Error("Supabase library (supabase.js) is not loaded. Make sure it's in your extension folder and included in popup.html *before* popup.js.");
        }
        console.log('[QuizWhiz] Step 1: Supabase library found.');

        const SUPABASE_URL = 'https://mtjresshxqalntppwgtr.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10anJlc3NoeHFhbG50cHB3Z3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3Nzk2NDEsImV4cCI6MjA2NTM1NTY0MX0.epw5v72Oan976RusvZ7kWR2brOiAtdW1WsqaYWd9N8g';
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[QuizWhiz] Step 2: Supabase client initialized.');
        
        const elements = {
            authContainer: document.getElementById("authContainer"),
            signInView: document.getElementById("signInView"),
            signUpView: document.getElementById("signUpView"),
            appView: document.getElementById("appView"),
            authMessage: document.getElementById("authMessage"),
            showSignUp: document.getElementById("showSignUp"),
            showSignIn: document.getElementById("showSignIn"),
            signOutBtn: document.getElementById("signOutBtn"),
            signInEmail: document.getElementById("signInEmail"),
            signInPassword: document.getElementById("signInPassword"),
            signInBtn: document.getElementById("signInBtn"),
            signUpEmail: document.getElementById("signUpEmail"),
            signUpPassword: document.getElementById("signUpPassword"),
            signUpBtn: document.getElementById("signUpBtn"),
            adminLoginBtn: document.getElementById("adminLoginBtn"),
            rememberMe: document.getElementById("rememberMe")
        };

        for (const key in elements) {
            if (!elements[key]) {
                throw new Error(`CRITICAL: HTML element with ID '${key}' not found. Check popup.html.`);
            }
        }
        console.log('[QuizWhiz] Step 3: All required authentication elements were found.');

        const showAppView = () => {
            elements.authContainer.classList.add("hidden");
            elements.appView.classList.remove("hidden");
            initializeMainApp();
            console.log('[QuizWhiz] Switched to App View.');
        };
        const showAuthView = () => {
            elements.appView.classList.add("hidden");
            elements.authContainer.classList.remove("hidden");
            elements.signInView.classList.remove("hidden");
            elements.signUpView.classList.add("hidden");
            elements.authMessage.textContent = ""; 
            console.log('[QuizWhiz] Switched to Auth View.');
        };

        console.log('[QuizWhiz] Step 5: Checking for existing session...');
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                console.log('[QuizWhiz] Active session found. Showing app.');
                showAppView();
            } else {
                console.log('[QuizWhiz] No active session. Showing login.');
                showAuthView();
            }
        }).catch(err => {
            throw new Error(`Error getting session: ${err.message}`);
        });

        elements.showSignUp.addEventListener("click", (e) => { e.preventDefault(); elements.signInView.classList.add("hidden"); elements.signUpView.classList.remove("hidden"); elements.authMessage.textContent = ""; });
        elements.showSignIn.addEventListener("click", (e) => { e.preventDefault(); elements.signUpView.classList.add("hidden"); elements.signInView.classList.remove("hidden"); elements.authMessage.textContent = ""; });
        elements.signUpBtn.addEventListener("click", async () => { const email = elements.signUpEmail.value; const password = elements.signUpPassword.value; const { error } = await supabaseClient.auth.signUp({ email, password }); elements.authMessage.textContent = error ? error.message : 'Check your email for the verification link!'; });
        elements.signInBtn.addEventListener("click", async () => { const email = elements.signInEmail.value; const password = elements.signInPassword.value; const clientWithOptions = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: elements.rememberMe.checked } }); const { data, error } = await clientWithOptions.auth.signInWithPassword({ email, password }); if (error) { elements.authMessage.textContent = error.message; } else if (data.user) { showAppView(); } });
        elements.adminLoginBtn.addEventListener("click", () => { showAppView(); });
        elements.signOutBtn.addEventListener("click", async () => { await supabaseClient.auth.signOut(); showAuthView(); });
        console.log('[QuizWhiz] Step 6: All event listeners attached.');
        
        function initializeMainApp() {
            const enableToggle = document.getElementById("enableToggle");
            const highlightToggle = document.getElementById("highlightToggle");
            const snipQuestionBtn = document.getElementById("snipQuestionBtn");
            const selectElementBtn = document.getElementById("selectElementBtn");
            const defineOcrElementBtn = document.getElementById("defineOcrElementBtn");
            const resetSnipBtn = document.getElementById("resetSnipBtn");
            const resetElementBtn = document.getElementById("resetElementBtn");
            const resetOcrElementBtn = document.getElementById("resetOcrElementBtn");
            const debugText = document.getElementById("debugText");
            const sendDebugTextBtn = document.getElementById("sendDebugTextBtn");
            const debugMessage = document.getElementById("debugMessage");

            if(!enableToggle || !highlightToggle || !snipQuestionBtn || !selectElementBtn || !defineOcrElementBtn || !resetSnipBtn || !resetElementBtn || !resetOcrElementBtn || !debugText || !sendDebugTextBtn || !debugMessage) {
                 throw new Error("Could not find one or more buttons/toggles inside the main app view.");
            }
            
            chrome.storage.sync.get(["toolEnabled", "highlightEnabled"], (data) => { enableToggle.checked = data.toolEnabled !== false; highlightToggle.checked = data.highlightEnabled === true; });
            enableToggle.addEventListener("change", () => { chrome.storage.sync.set({ toolEnabled: enableToggle.checked }); });
            highlightToggle.addEventListener("change", () => { chrome.storage.sync.set({ highlightEnabled: highlightToggle.checked }); });
            
            snipQuestionBtn.addEventListener("click", async () => {
                console.log('[Popup] "Snip Question Area" button clicked.');
                try {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    const tab = tabs[0];

                    if (!tab || !tab.id) {
                        alert("Could not find a valid active tab.");
                        return;
                    }

                    // Send the message and wait for a response before closing
                    chrome.runtime.sendMessage({ action: 'startCapture', tab: tab }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Error sending message:', chrome.runtime.lastError.message);
                            alert('Could not start the snipping tool. Please try again or reload the page.');
                            return;
                        }
                        
                        // If the background script responded successfully, it means the process has started. Now we can close the popup.
                        if (response && response.success) {
                            console.log('[Popup] Background script acknowledged. Closing popup.');
                            window.close();
                        } else {
                            alert('Failed to start snipping tool. Check the console for errors.');
                        }
                    });
                } catch (error) {
                    alert(`Error starting snip tool: ${error.message}`);
                    console.error('[Popup] Error in snip button handler:', error);
                }
            });

            resetSnipBtn.addEventListener("click", () => { 
                console.log('[Popup] "Reset Snip Area" button clicked.');
                chrome.storage.local.remove(["savedSnipZone", "activeMethod"], () => alert("Saved snip area has been reset.")); 
            });
            selectElementBtn.addEventListener("click", () => {
                console.log('[Popup] "Teach Text Area" button clicked.');
                executeInAllFrames("startElementSelection");
            });
            defineOcrElementBtn.addEventListener("click", () => {
                console.log('[Popup] "Teach Screenshot Element" button clicked.');
                executeInAllFrames("startOcrElementSelection");
            });
            resetElementBtn.addEventListener("click", () => { 
                console.log('[Popup] "Reset Text Area" button clicked.');
                chrome.storage.local.remove(["savedSelector", "activeMethod"], () => alert("Text area has been reset.")); 
            });
            resetOcrElementBtn.addEventListener("click", () => { 
                console.log('[Popup] "Reset Screenshot Element" button clicked.');
                chrome.storage.local.remove(["savedOcrZone", "activeMethod"], () => alert("Screenshot area has been reset.")); 
            });

            sendDebugTextBtn.addEventListener("click", async () => {
                console.log('[Popup] "Send Test Text" button clicked.');
                const text = debugText.value;
                if (!text) {
                    debugMessage.textContent = "Please enter some text.";
                    debugMessage.style.color = 'red';
                    console.warn('[Popup] Debug text is empty.');
                    return;
                }
                debugMessage.textContent = "Sending...";
                debugMessage.style.color = 'orange';
                console.log(`[Popup] Sending debug text to backend (length: ${text.length}).`);
                try {
                    const response = await fetch('http://localhost:4000/ask-ai', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ input: text })
                    });
                    if (!response.ok) {
                        const errorTxt = await response.text();
                        console.error(`[Popup] Backend test failed: Server responded with status ${response.status} - ${errorTxt}`);
                        throw new Error(`Backend server responded with status: ${response.status}`);
                    }
                    const result = await response.json();
                    console.log("[Popup] Backend Test Response:", result);
                    debugMessage.textContent = "Success! Backend received text.";
                    debugMessage.style.color = 'green';
                } catch (err) {
                    console.error("[Popup] Backend Test Failed:", err);
                    debugMessage.textContent = `Error: ${err.message}. Is the AI server running?`;
                    debugMessage.style.color = 'red';
                }
            });
        }

        async function executeInAllFrames(action) {
            console.log(`[Popup] executeInAllFrames called for action: ${action}`);
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const tab = tabs[0];
                if (!tab || !tab.id) { 
                    console.error('[Popup] No active tab found for script execution.');
                    throw new Error("Active tab not found."); 
                }
                console.log(`[Popup] Executing script in all frames of tab: ${tab.id}.`);
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    args: [action],
                    func: (actionToExecute) => {
                        console.log(`[CS-InjectedFunc] Received actionToExecute: ${actionToExecute}`);
                        if (actionToExecute === 'startElementSelection') {
                            if (typeof startElementSelectionMode === 'function') {
                                console.log('[CS-InjectedFunc] Calling startElementSelectionMode("text").');
                                startElementSelectionMode('text');
                            } else {
                                console.error('[CS-InjectedFunc] startElementSelectionMode function not found.');
                            }
                        } else if (actionToExecute === 'startOcrElementSelection') {
                            if (typeof startOcrElementSelection === 'function') {
                                console.log('[CS-InjectedFunc] Calling startOcrElementSelection("ocr").');
                                startOcrElementSelection('ocr');
                            } else {
                                console.error('[CS-InjectedFunc] startOcrElementSelection function not found.');
                            }
                        } else {
                            console.warn(`[CS-InjectedFunc] Unrecognized actionToExecute: ${actionToExecute}`);
                        }
                    },
                });
                console.log('[Popup] Script execution in all frames initiated. Closing popup.');
                window.close();
            } catch (err) {
                console.error("--- QUIZWHIZ CRITICAL ERROR in executeInAllFrames ---", err);
                alert(`QuizWhiz encountered a critical error trying to activate the tool.\n\nError: ${err.message}\n\nOpen the extension's console for more details.`);
            }
        }
        
        console.log('[QuizWhiz] Script loaded successfully.');

    } catch (error) {
        console.error("QuizWhiz Popup Critical Error during DOMContentLoaded:", error);
        document.body.innerHTML = `<div style="padding: 20px; color: red; font-family: sans-serif;"><h3>Critical Error</h3><p>${error.message}</p><p>Please check the extension's console for more details.</p></div>`;
    }
});