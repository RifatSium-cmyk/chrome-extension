/**
 * chrome_extension_script.js (FINAL - All fixes included)
 * - All hotkeys are handled by this content script for simplicity.
 * - All message listeners are finalized.
 * - Logic for tracking active models is corrected.
 */
if (typeof quizWhizInitialized === 'undefined') {
    var quizWhizInitialized = true;

    console.log('✅ [CS-Init] QuizWhiz Content Script Injected & Running in frame:', window.location.href);

    let isSelectionModeActive = false;
    let isProcessing = false;
    let currentOcrText = '';
    let activeModelIds = new Set();
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log(`[CS-Listener] Received UI command: "${request.action}"`);
        
        switch (request.action) {
            case 'initiateOcrSnipping':
                initiateOcrSnippingTool();
                break;
            case 'startElementSelection':
                startElementSelectionMode('text');
                break;
            case 'showLoading':
                showLoadingOverlay();
                break;
            case 'hideLoadingAndShowAnswers':
                hideLoadingOverlay();
                isProcessing = false;
                if (request.data && request.data.responses) {
                    currentOcrText = request.ocrText;
                    showAnswerOverlays(request.data.responses, request.ocrText);
                }
                break;
            case 'hideLoadingAndShowError':
                hideLoadingOverlay();
                isProcessing = false;
                alert(`QuizWhiz Error: ${request.message}`);
                break;
            case 'showSuccessMessage':
                showTemporaryMessage(request.message);
                break;
            case 'showError':
                alert(`QuizWhiz Error: ${request.message}`);
                break;
            case 'updateOverlayWithNewAnswer':
                const overlay = document.querySelectorAll('.quizai-answer')[request.slot];
                if (!overlay) return;
                const changeModelBtn = overlay.querySelector('.change-model-btn');
                if (request.success) {
                    overlay.querySelector('.quizai-model-tag').textContent = `📌 ${request.model}`;
                    overlay.querySelector('.quizai-content').innerHTML = `<pre>${request.result}</pre>`;
                    if (changeModelBtn) changeModelBtn.remove();
                    activeModelIds.add(request.id); // Add the new model to the "used" set
                } else {
                    overlay.querySelector('.quizai-content').innerHTML = `<div style="color:red;">Error: ${request.error || 'No response.'}</div>`;
                    if (changeModelBtn) {
                        changeModelBtn.disabled = false;
                        changeModelBtn.style.opacity = '1';
                    }
                }
                break;
            case 'hideAllUI':
                clearOldOverlays();
                hideLoadingOverlay();
                break;
        }
    });

    document.addEventListener('keydown', async (e) => {
        const isSolveTextKey = (e.key === 'A' || e.key === 'a');
        const isSolveOcrKey = (e.key === 'Y' || e.key === 'y');
        const isClearKey = (e.key === 'Q' || e.key === 'q');
        const isShiftPressed = e.shiftKey;
        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const solveTextHotkey = isSolveTextKey && isShiftPressed;
        const solveOcrHotkey = isSolveOcrKey && isShiftPressed && isCtrlPressed;
        const clearHotkey = isClearKey && isShiftPressed;

        if ((!solveTextHotkey && !solveOcrHotkey && !clearHotkey) || isSelectionModeActive) return;

        const settings = await chrome.storage.sync.get('toolEnabled');
        if (settings.toolEnabled === false) return;
        
        e.preventDefault();
        e.stopPropagation();

        if (clearHotkey) {
            clearOldOverlays();
            isProcessing = false;
            return;
        }
        
        if (isProcessing) return;
        isProcessing = true;
        
        // Before any solve action, clear previous UI
        clearOldOverlays();
        
        if (solveOcrHotkey) {
            chrome.runtime.sendMessage({ action: 'solveWithSavedOcr' });
        } 
        else if (solveTextHotkey) {
            const selection = window.getSelection().toString().trim();
            if (selection) {
                chrome.runtime.sendMessage({ action: 'solveText', text: selection });
            } else {
                const data = await chrome.storage.local.get(['savedSelector']);
                const element = data.savedSelector ? document.querySelector(data.savedSelector) : null;
                const foundText = element ? getTextFromElementAndChildren(element) : null;
                if (foundText) {
                    chrome.runtime.sendMessage({ action: 'solveText', text: foundText });
                } else {
                    alert("QuizWhiz Error: Select text or use 'Teach Text Area' first.");
                    isProcessing = false;
                }
            }
        }
    });
    
    function initiateOcrSnippingTool() {
        if (document.getElementById('ocr-snip-overlay')) return;
        clearOldOverlays();
        const overlay = document.createElement('div');
        overlay.id = 'ocr-snip-overlay';
        overlay.style.cssText = `position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.4); cursor:crosshair; z-index:2147483647;`;
        document.body.appendChild(overlay);
        const selectionBox = document.createElement('div');
        selectionBox.style.cssText = `position:absolute; border:2px dashed #fff; background:rgba(255,255,255,0.2); box-sizing:border-box; pointer-events:none;`;
        overlay.appendChild(selectionBox);
        let startX, startY, isDrawing = false;
        const onMouseDown = (e) => {
            isDrawing = true; startX = e.clientX; startY = e.clientY;
            Object.assign(selectionBox.style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px', display: 'block' });
        };
        const onMouseMove = (e) => {
            if (!isDrawing) return;
            const left = Math.min(startX, e.clientX); const top = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX); const height = Math.abs(e.clientY - startY);
            Object.assign(selectionBox.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
        };
        const onMouseUp = (e) => {
            if (!isDrawing) return;
            isDrawing = false;
            const rect = { x: parseInt(selectionBox.style.left), y: parseInt(selectionBox.style.top), width: parseInt(selectionBox.style.width), height: parseInt(selectionBox.style.height) };
            cleanup();
            if (rect.width > 5 && rect.height > 5) {
                chrome.runtime.sendMessage({ action: 'saveOcrArea', data: rect });
                flashHighlight(rect);
            }
        };
        const onKeyDown = (e) => { if (e.key === 'Escape') cleanup(); };
        function cleanup() {
            if (document.getElementById('ocr-snip-overlay')) { document.body.removeChild(overlay); }
            window.removeEventListener('keydown', onKeyDown, true);
        }
        overlay.addEventListener('mousedown', onMouseDown);
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown, { capture: true });
    }

    function flashHighlight(rect) {
        const highlightDiv = document.createElement('div');
        highlightDiv.style.cssText = `position: fixed; left: ${rect.x}px; top: ${rect.y}px; width: ${rect.width}px; height: ${rect.height}px; background-color: rgba(2, 132, 199, 0.4); border: 2px solid #0284c7; z-index: 2147483647; box-sizing: border-box; pointer-events: none;`;
        document.body.appendChild(highlightDiv);
        setTimeout(() => { document.body.removeChild(highlightDiv); }, 800);
    }

    function clearOldOverlays() {
        document.querySelectorAll('.quizai-answer').forEach(el => el.remove());
        document.getElementById('quizai-loader')?.remove();
        chrome.runtime.sendMessage({ action: 'clearActivityLock' });
        activeModelIds.clear();
    }

    function showAnswerOverlays(models, text) {
        injectStylesheet('overlay_styles.css');
        clearOldOverlays();
        const limitedModels = models.slice(0, 3);
        
        limitedModels.forEach(model => { if (model && model.id) activeModelIds.add(model.id); });
        console.log('[CS] Active models set:', Array.from(activeModelIds));

        limitedModels.forEach((model, idx) => {
            if (!model || !model.result) return;
            const overlay = document.createElement('div');
            overlay.className = 'quizai-answer';
            if (idx === 0) {
                overlay.classList.add('quizai-primary-overlay');
                overlay.style.right = '20px';
                overlay.style.top = '10%';
            } else {
                overlay.classList.add('quizai-secondary-overlay');
                overlay.style.left = '20px';
                overlay.style.top = `${10 + (idx - 1) * 30}%`; 
            }
            
            const changeModelButtonHTML = (idx > 0) ? `<button class="change-model-btn">Change AI Model</button>` : '';
            overlay.innerHTML = `
                <div class="quizai-header">
                    <h3><span class="quizai-model-tag ${idx === 0 ? 'quizai-model-tag-primary' : 'quizai-model-tag-secondary'}">📌 ${model.model}</span>${changeModelButtonHTML}</h3>
                    <div class="quizai-button-group"><button class="quizai-control-btn" data-action="collapse">_</button><button class="quizai-control-btn" data-action="close">✖</button></div>
                </div>
                <div class="quizai-content"><pre>${model.result}</pre></div>`;
            document.body.appendChild(overlay);
            makeDraggable(overlay);

            if (idx > 0) {
                const changeModelBtn = overlay.querySelector('.change-model-btn');
                if (changeModelBtn) {
                    changeModelBtn.onclick = function() {
                        changeModelBtn.disabled = true;
                        changeModelBtn.style.opacity = '0.5';
                        overlay.querySelector('.quizai-content').innerHTML = `<div class="quizai-loader-container"><div class="quizai-loader-spinner"></div><span>Getting new answer...</span></div>`;
                        
                        console.log('[CS] Sending "changeModel" command, excluding:', Array.from(activeModelIds));
                        chrome.runtime.sendMessage({
                            action: 'changeModel',
                            prompt: text,
                            excludeModelIds: Array.from(activeModelIds),
                            slot: idx
                        });
                    };
                }
            }
        });
    }

    function getTextFromElementAndChildren(element) {
        if (!element) return '';
        let text = '';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) { text += node.textContent.trim() + ' '; }
        return text.trim().replace(/\s+/g, ' ');
    }
    
    function startElementSelectionMode(type) { 
        if (isSelectionModeActive) return;
        isSelectionModeActive = true;
        selectionModeType = type; 
        let highlightBox = document.getElementById('quizai-element-highlighter');
        if (!highlightBox) {
            highlightBox = document.createElement('div');
            highlightBox.id = 'quizai-element-highlighter';
            highlightBox.style.cssText = `position: fixed; background-color: rgba(135, 206, 250, 0.5); border: 2px solid #1e90ff; pointer-events: none; z-index: 2147483647; display: none;`;
            document.body.appendChild(highlightBox);
        }
        document.addEventListener('mouseover', handleElementMouseOver); 
        document.addEventListener('click', handleElementMouseClick, true); 
        document.addEventListener('keydown', handleSelectionKeyDown, true); 
    }

    function handleElementMouseClick(e) {
        if (!isSelectionModeActive) return;
        e.preventDefault();
        e.stopPropagation();
        const targetElement = e.target;
        if (selectionModeType === 'text' && targetElement.id !== 'quizai-element-highlighter') {
            const selector = generateStableSelector(targetElement);
            chrome.storage.local.set({ savedSelector: selector }, () => {
                showTemporaryMessage('Text area saved! Press Shift+A to solve.');
            });
        }
        stopElementSelectionMode();
    }

    function stopElementSelectionMode() { 
        if (!isSelectionModeActive) return;
        isSelectionModeActive = false;
        const highlightBox = document.getElementById('quizai-element-highlighter');
        if (highlightBox) {
            highlightBox.style.display = 'none';
        }
        document.removeEventListener('mouseover', handleElementMouseOver); 
        document.removeEventListener('click', handleElementMouseClick, true); 
        document.removeEventListener('keydown', handleSelectionKeyDown, true); 
    }
    
    function handleElementMouseOver(e) { 
        const element = e.target;
        const highlightBox = document.getElementById('quizai-element-highlighter');
        if (!highlightBox || element === highlightBox) return; 
        highlightBox.style.display = 'block';
        const rect = element.getBoundingClientRect(); 
        Object.assign(highlightBox.style, { width: `${rect.width}px`, height: `${rect.height}px`, top: `${rect.top}px`, left: `${rect.left}px` });
    }

    function handleSelectionKeyDown(e) { 
        if (isSelectionModeActive && e.key === "Escape") { 
            stopElementSelectionMode(); 
        } 
    }

    function generateStableSelector(el) { 
        if (!el) return '';
        if (el.id) return `#${el.id.trim()}`;
        let path = '', parent; 
        while ((parent = el.parentElement)) { 
            let tag = el.tagName.toLowerCase(); 
            let nth = `:nth-child(${Array.from(parent.children).indexOf(el) + 1})`; 
            path = ` > ${tag}${nth}` + path; 
            el = parent; 
        } 
        return 'html > body' + path;
    }
    
    function injectStylesheet(fileName) { 
        const styleId = `quizai-style-${fileName.split('.')[0]}`; 
        if (document.getElementById(styleId)) return;
        const link = document.createElement('link'); 
        link.id = styleId; 
        link.rel = 'stylesheet'; 
        link.type = 'text/css'; 
        link.href = chrome.runtime.getURL(fileName); 
        document.head.appendChild(link); 
    }

    function showLoadingOverlay() { 
        if (document.getElementById('quizai-loader')) return;
        injectStylesheet('loading_overlay.css'); 
        const div = document.createElement('div'); 
        div.id = 'quizai-loader'; 
        div.className = 'quizai-loader-container'; 
        const spinner = document.createElement('div'); 
        spinner.className = 'quizai-loader-spinner'; 
        div.appendChild(spinner); 
        div.appendChild(document.createTextNode(' QuizWhiz is thinking...')); 
        document.body.appendChild(div); 
    }

    function hideLoadingOverlay() { 
        document.getElementById('quizai-loader')?.remove(); 
    }

    function showTemporaryMessage(message) { 
        injectStylesheet('temporary_message.css'); 
        const messageDiv = document.createElement('div'); 
        messageDiv.className = 'quizai-temp-message'; 
        const icon = document.createElement('div'); 
        icon.className = 'quizai-temp-message-icon'; 
        icon.textContent = '✓'; 
        messageDiv.appendChild(icon); 
        messageDiv.appendChild(document.createTextNode(` ${message}`)); 
        document.body.appendChild(messageDiv); 
        setTimeout(() => { 
            messageDiv.style.opacity = '0'; 
            setTimeout(() => messageDiv.remove(), 500); 
        }, 4000); 
    }

    function makeDraggable(element) { 
        const header = element.querySelector('.quizai-header'); 
        let isDragging = false, xOffset = 0, yOffset = 0; 
        header.onmousedown = function(e) { 
            if (e.target.dataset.action) return;
            isDragging = true; 
            const rect = element.getBoundingClientRect(); 
            xOffset = e.clientX - rect.left; 
            yOffset = e.clientY - rect.top; 
            document.onmousemove = drag; 
            document.onmouseup = dragEnd; 
        }; 
        function drag(e) { 
            if (isDragging) { 
                e.preventDefault(); 
                element.style.left = `${e.clientX - xOffset}px`; 
                element.style.top = `${e.clientY - yOffset}px`; 
            } 
        } 
        function dragEnd() { 
            isDragging = false; 
            document.onmousemove = null; 
            document.onmouseup = null; 
        } 
        element.addEventListener('click', (e) => { 
            const action = e.target.dataset.action; 
            if (action === 'close') { 
                clearOldOverlays(); 
            } else if (action === 'collapse') { 
                const content = element.querySelector('.quizai-content'); 
                const button = e.target; 
                const isHidden = content.style.display === 'none'; 
                content.style.display = isHidden ? '' : 'none'; 
                button.textContent = isHidden ? '_' : '□'; 
            } 
        }); 
    }
}