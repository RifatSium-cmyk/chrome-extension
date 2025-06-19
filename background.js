/**
 * background.js (FINAL - All fixes included)
 * - Responds to messages from the content script (which handles all hotkeys).
 * - Implements a forced delay to permanently fix screenshot-with-overlay bug.
 * - Includes detailed AI prompt logging.
 */

console.log("Service Worker started for QuizWhiz.");

const BACKEND_CONFIG = {
    aiServer: {
        baseUrl: 'http://localhost:4000',
        endpoints: {
            askAi: '/ask-ai',
            changeModel: '/change-model-parallel'
        }
    },
    ocrServer: {
        baseUrl: 'http://127.0.0.1:5000',
        endpoints: {
            extractText: '/extract_text'
        }
    }
};

function getBackendUrl(server, endpoint) {
    return `${BACKEND_CONFIG[server].baseUrl}${BACKEND_CONFIG[server].endpoints[endpoint]}`;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tab = sender.tab;
    console.log(`[BG-Listener] Received Command: ${request.action}`);

    switch (request.action) {
        case 'startOcrCapture':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'initiateOcrSnipping' });
                }
            });
            break;
        case 'saveOcrArea':
            chrome.storage.local.set({ savedSnipZone: request.data }, () => {
                chrome.tabs.sendMessage(tab.id, { action: 'showSuccessMessage', message: 'Snip area saved! Press Ctrl+Shift+Y to solve.' });
            });
            break;
        case 'solveWithSavedOcr':
            chrome.storage.local.get("savedSnipZone", ({ savedSnipZone }) => {
                if (savedSnipZone && savedSnipZone.width > 0) {
                    processCapturedImageAndGetAiAnswers(savedSnipZone, tab);
                } else {
                    chrome.tabs.sendMessage(tab.id, { action: 'showError', message: "No snip area has been saved. Use the popup to snip an area first." });
                }
            });
            break;
        case 'solveText':
            processSolveText(request, tab);
            break;
        case 'changeModel':
            processChangeModel(request, tab);
            break;
        case 'clearActivityLock':
            chrome.storage.local.remove(['extensionIsActive', 'activeTabId']);
            break;
    }
    return true; 
});

async function processCapturedImageAndGetAiAnswers(rect, tab) {
    try {
        await checkActivityLock(tab);

        // FINAL FIX: Forced-delay screenshot logic
        chrome.tabs.sendMessage(tab.id, { action: 'hideAllUI' });
        await new Promise(resolve => setTimeout(resolve, 150));
        
        console.log('[BG] Taking clean screenshot now.');
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        const croppedDataUrl = await cropImage(dataUrl, rect, tab);
        
        await chrome.tabs.sendMessage(tab.id, { action: 'showLoading' });

        const ocrText = await sendToOcrBackend(croppedDataUrl);
        if (!ocrText || ocrText.length < 10) throw new Error("OCR could not find enough text in the snipped area.");
        
        const aiResponse = await fetchAnswersFromAIServer(ocrText);
        
        await chrome.storage.local.set({ extensionIsActive: true, activeTabId: tab.id });
        
        await chrome.tabs.sendMessage(tab.id, {
            action: 'hideLoadingAndShowAnswers',
            data: aiResponse,
            ocrText: ocrText
        });
    } catch (error) {
        console.error("[BG-Process] Error in OCR/AI pipeline:", error);
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'hideLoadingAndShowError', message: error.message });
        } catch (uiError) {}
    }
}

async function processSolveText(request, tab) {
    try {
        await checkActivityLock(tab);
        await chrome.tabs.sendMessage(tab.id, { action: 'showLoading' });
        const aiResponse = await handleSolveText(request.text, tab);
        await chrome.tabs.sendMessage(tab.id, { action: 'hideLoadingAndShowAnswers', data: aiResponse, ocrText: request.text });
    } catch (error) {
         try {
            await chrome.tabs.sendMessage(tab.id, { action: 'hideLoadingAndShowError', message: error.message });
        } catch (uiError) {}
    }
}

async function processChangeModel(request, tab) {
    try {
        const result = await handleChangeModel(request.prompt, request.excludeModelIds);
        await chrome.tabs.sendMessage(tab.id, {
            action: 'updateOverlayWithNewAnswer',
            success: true,
            slot: request.slot,
            model: result.model,
            result: result.result,
            id: result.id
        });
    } catch (error) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'updateOverlayWithNewAnswer',
                success: false,
                slot: request.slot,
                error: error.message
            });
        } catch (uiError) {}
    }
}

async function handleSolveText(text, tab) {
    if (!text || text.length < 10) throw new Error("The selected text is not a valid question.");
    const aiResponse = await fetchAnswersFromAIServer(text);
    await chrome.storage.local.set({ extensionIsActive: true, activeTabId: tab.id });
    return aiResponse;
}

async function handleChangeModel(prompt, excludeModelIds) {
    const letterOnlyPrompt = `Your task is to analyze the following text from a quiz and determine the correct answer. Read the text, identify the question and options, and determine the correct letter or letters.

Your response MUST be ONLY the correct letter or letters. Nothing else.
- Do NOT provide explanations.
- Do NOT use full sentences.
- Do NOT repeat the question.
- Do NOT greet me.
If the answer is C, your entire response must be:
C
If the answers are A and C, your entire response must be:
A, C

Here is the text:
---
${prompt}
---`;
    
    console.groupCollapsed(`[AI-Prompt] Sending prompt for "Change AI Model"`);
    console.log(letterOnlyPrompt);
    console.log(`[AI-Prompt] Models to exclude:`, excludeModelIds);
    console.groupEnd();

    const response = await fetch(getBackendUrl('aiServer', 'changeModel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ input: letterOnlyPrompt, excludeModelIds: excludeModelIds })
    });
    if (!response.ok) throw new Error(`Server error (${response.status}): ${await response.text()}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Unknown server error');
    return data;
}

async function fetchAnswersFromAIServer(text) {
    console.groupCollapsed('[AI-Prompt] Sending prompts for Initial Solve');
    console.log(`(Full prompts will be visible in the AI backend's console)`);
    console.log(`--- Snippet being analyzed ---`);
    console.log(text);
    console.groupEnd();

    const response = await fetch(getBackendUrl('aiServer', 'askAi'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text })
    });
    if (!response.ok) throw new Error(`AI server responded with status: ${response.status} - ${await response.text()}`);
    return await response.json();
}

async function sendToOcrBackend(dataUrl) {
    const response = await fetch(getBackendUrl('ocrServer', 'extractText'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
    });
    if (!response.ok) throw new Error(`OCR Backend Error (${response.status})`);
    const result = await response.json();
    return result.text;
}

async function cropImage(dataUrl, rect, tab) {
    const imageBlob = await (await fetch(dataUrl)).blob();
    const sourceBitmap = await createImageBitmap(imageBlob);
    const ratioX = sourceBitmap.width / tab.width;
    const ratioY = sourceBitmap.height / tab.height;
    const canvas = new OffscreenCanvas(rect.width * ratioX, rect.height * ratioY);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceBitmap, rect.x * ratioX, rect.y * ratioY, rect.width * ratioX, rect.height * ratioY, 0, 0, rect.width * ratioX, rect.height * ratioY);
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(croppedBlob);
    });
}

async function checkActivityLock(tab) {
    const { extensionIsActive, activeTabId } = await chrome.storage.local.get(["extensionIsActive", "activeTabId"]);
    if (extensionIsActive && activeTabId !== tab.id) {
        const message = 'QuizWhiz is already active in another tab. Please close the overlays there first.';
        await chrome.tabs.sendMessage(tab.id, { action: 'showError', message: message });
        throw new Error(message);
    }
}