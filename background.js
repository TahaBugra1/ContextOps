chrome.runtime.onInstalled.addListener(() => {
  console.log('ChatGPT Optimizer background script installed.');
});

// Listener for prompt optimization requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'OPTIMIZE_PROMPT_BACKGROUND') {
    handleOptimization(request.payload.instruction)
      .then(result => sendResponse({ success: true, optimized: result }))
      .catch(error => {
        console.error('[CGPTOpt-Bg] General Error:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (request.type === 'WARMUP_WORKER') {
    ensureWorkerTab().then(() => sendResponse({ success: true }));
    return true;
  } else if (request.type === 'RESET_WORKER') {
    resetWorkerTab().then(() => sendResponse({ success: true }));
    return true;
  }
});

/**
 * Handles the optimization by opening a temporary background tab
 */
let workerWindowId = null;
let workerTabId = null;
let workerBusy = false;

/**
 * Ensures the worker tab is open and ready
 */
async function ensureWorkerTab() {
  let win = null;
  if (workerWindowId) {
    try {
      win = await chrome.windows.get(workerWindowId, { populate: true });
      if (win && win.tabs && win.tabs.length > 0) {
        workerTabId = win.tabs[0].id;
      } else {
        throw new Error('Window has no tabs');
      }
    } catch (e) {
      workerWindowId = null;
      workerTabId = null;
    }
  }

  if (!win) {
    console.log('[CGPTOpt-Bg] Creating fresh worker window (off-screen)...');
    win = await chrome.windows.create({
      url: 'https://chatgpt.com/?temporary-chat=true',
      type: 'popup',
      state: 'minimized',
      focused: false,
      left: -10000, // Off-screen
      top: -10000,  // Off-screen
      width: 400,
      height: 400
    });
    workerWindowId = win.id;
    workerTabId = win.tabs[0].id;
    await waitForTabComplete(workerTabId);
    await new Promise(r => setTimeout(r, 1500));
  }
  return win;
}

/**
 * Resets the worker tab to a fresh state (new temporary chat)
 */
async function resetWorkerTab() {
  if (!workerWindowId || workerBusy) return;
  console.log('[CGPTOpt-Bg] Resetting worker tab (Context Clear)...');
  try {
    await chrome.tabs.update(workerTabId, { url: 'https://chatgpt.com/?temporary-chat=true' });
    await waitForTabComplete(workerTabId);
    await new Promise(r => setTimeout(r, 800));
  } catch (e) {
    workerWindowId = null;
    await ensureWorkerTab();
  }
}

/**
 * Handles the optimization by using a persistent hidden worker window
 */
async function handleOptimization(instruction, attempt = 1) {
  if (workerBusy && attempt === 1) {
    await new Promise(r => setTimeout(r, 1000));
  }
  
  workerBusy = true;

  try {
    const win = await ensureWorkerTab();
    const tab = win.tabs[0];

    // Navigation check
    if (!tab.url.includes('temporary-chat=true')) {
      await chrome.tabs.update(tab.id, { url: 'https://chatgpt.com/?temporary-chat=true' });
      await waitForTabComplete(tab.id);
      await new Promise(r => setTimeout(r, 800));
    }

    const tabId = workerTabId;

    // DEEP LOOK: Check if page is blank or errored before script injection
    let tabInfo = await chrome.tabs.get(tabId);
    if (!tabInfo.url.includes('chatgpt.com') || tabInfo.status === 'loading') {
       await chrome.tabs.reload(tabId);
       await waitForTabComplete(tabId);
       await new Promise(r => setTimeout(r, 1000));
       tabInfo = await chrome.tabs.get(tabId);
    }

    if (!tabInfo.url.includes('chatgpt.com')) {
       workerWindowId = null; // Reset
       throw new Error(`Page redirected or failed to load: ${tabInfo.url}`);
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: automateChatGPT,
      args: [instruction]
    });

    if (result && result.length > 0) {
      const scriptResult = result[0].result;
      
      if (scriptResult.trace) {
        console.groupCollapsed(`[CGPTOpt-Bg] Trace (Att:${attempt}) - ${scriptResult.success ? 'Success' : 'Fail'}`);
        scriptResult.trace.forEach(line => console.log(line));
        console.groupEnd();
      }

      if (scriptResult && scriptResult.success) {
        return scriptResult.text;
      } else {
        if (attempt < 2 && scriptResult.error?.includes('UI Setup Failed')) {
           console.warn('[CGPTOpt-Bg] UI Setup failed. Retrying with fresh window...');
           if (workerWindowId) await chrome.windows.remove(workerWindowId).catch(() => {});
           workerWindowId = null;
           return handleOptimization(instruction, attempt + 1);
        }
        throw new Error(scriptResult?.error || 'Automation script returned failure');
      }
    } else {
      throw new Error('No result returned from automation script');
    }
  } catch (err) {
    if (attempt < 2) {
       console.warn('[CGPTOpt-Bg] Error in handleOptimization. Retrying...', err.message);
       if (workerWindowId) {
         try { await chrome.windows.remove(workerWindowId); } catch(e){}
         workerWindowId = null;
       }
       return handleOptimization(instruction, attempt + 1);
    }
    throw err;
  } finally {
    workerBusy = false;
    // We DON'T remove the window here anymore to keep it for next time.
    // We'll set a timeout to close it after 5 minutes of inactivity if needed.
    resetInactivityTimer();
  }
}

let inactivityTimer = null;
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (workerWindowId) {
      chrome.windows.remove(workerWindowId).catch(() => {});
      workerWindowId = null;
      workerTabId = null;
      console.log('[CGPTOpt-Bg] Worker window closed due to inactivity.');
    }
  }, 300000); // 5 minutes
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const check = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(check);
    // Safety timeout to avoid infinite hangs
    setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
    }, 10000);
  });
}

/**
 * Runs in the temporary tab - REFACTORED TO BE BULLETPROOF
 */
async function automateChatGPT(instruction) {
  const trace = [];
  const log = (msg) => {
    const entry = `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`;
    console.log('[CGPTOpt-Tab]', entry);
    trace.push(entry);
  };

  log('Automation speed-optimized started.');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 0. Environment / Auth Check
  if (window.location.href.includes('/auth/login')) {
    return { success: false, error: 'AUTH_REQUIRED', trace };
  }

  const findElement = (selectors) => {
    const deepQuery = (root, selector) => {
      let el = root.querySelector(selector);
      if (el) return el;
      // Traverse Shadow DOM
      const hosts = Array.from(root.querySelectorAll('*')).filter(node => node.shadowRoot);
      for (const host of hosts) {
        el = deepQuery(host.shadowRoot, selector);
        if (el) return el;
      }
      return null;
    };
    
    for (const selector of selectors) {
      const el = deepQuery(document, selector);
      if (el) return el;
    }
    return null;
  };

  const dismissModals = () => {
    const texts = ['OK', 'Anladım', 'Got it', 'Stay in temporary', 'Continue', 'Devam et', 'Dismiss'];
    const buttons = Array.from(document.querySelectorAll('button'));
    const toClick = buttons.find(b => texts.some(t => b.innerText.includes(t)));
    if (toClick) {
      log(`Dismissing modal: ${toClick.innerText}`);
      toClick.click();
      return true;
    }
    return false;
  };

  try {
    log('Checking for initial modals...');
    dismissModals();
    await sleep(400); // 800 -> 400
    dismissModals();

    const text = await new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // Up to 18 seconds for UI to APPEAR

      const waitUI = setInterval(async () => {
        const textarea = findElement(['#prompt-textarea', 'div[contenteditable="true"]', 'textarea']);
        const isCloudflare = document.body.innerText.includes('Checking your browser') || !!document.querySelector('#cf-turnstile');
        
        if (textarea) {
          clearInterval(waitUI);
          log('UI Detected.');
          proceedToInput(textarea);
        } else if (isCloudflare) {
          log('Cloudflare detected.');
        } else if (++attempts >= maxAttempts) {
          clearInterval(waitUI);
          reject(new Error(`UI Not Found. Loc: ${window.location.pathname}`));
        }
      }, 300); // 500 -> 300

      async function proceedToInput(textarea) {
        log('Injecting...');
        const sendBtnSelectors = ['button[data-testid="send-button"]', 'button[aria-label="Send message"]', 'button:has(svg)'];
        let sendBtn = findElement(sendBtnSelectors);

        // Input simulation
        textarea.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, instruction);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        // Fast wait for send button
        let readyAtt = 0;
        while ((!sendBtn || sendBtn.disabled) && readyAtt < 20) {
          await sleep(150); // 250 -> 150
          sendBtn = findElement(sendBtnSelectors);
          readyAtt++;
        }

        if (sendBtn && !sendBtn.disabled) {
          log('Submitting...');
          
          const mouseOpts = { bubbles: true, cancelable: true, view: window };
          sendBtn.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
          sendBtn.click();
          sendBtn.dispatchEvent(new MouseEvent('mouseup', mouseOpts));

          const kbOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
          textarea.dispatchEvent(new KeyboardEvent('keydown', kbOpts));

          // Verification loop: Wait for Stop or Start
          let submitSuccess = false;
          for (let i = 0; i < 15; i++) {
            await sleep(150);
            const stopBtn = findElement(['button[aria-label*="Stop"]', 'button[data-testid*="stop"]']);
            if (stopBtn) {
              submitSuccess = true;
              break;
            }
          }

          if (!submitSuccess) {
            const form = textarea.closest('form');
            if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }

          startObservation();
        } else {
          reject(new Error(`Send button error. B:${!!sendBtn} D:${sendBtn?.disabled}`));
        }
      }

      function startObservation() {
        log('Observing...');
        let lastCapturedText = '';
        let stableCount = 0;
        let generationDetected = false;
        let stopBtnVisibleBefore = false;
        const limit = 50000;
        const startTime = Date.now();

        const obsInterval = setInterval(() => {
          const stopBtn = findElement(['button[aria-label*="Stop"]', 'button[data-testid*="stop"]']);
          const typingIndicator = document.querySelector('.result-streaming');
          
          if (stopBtn || typingIndicator) {
             generationDetected = true;
             stopBtnVisibleBefore = true;
          }

          // ROBUST SELECTORS: Try multiple ways to find the last assistant message
          const selectors = [
            '[data-message-author-role="assistant"]',
            '.markdown.prose',
            '.agent-turn .markdown',
            'main article:last-of-type'
          ];
          
          let lastMsg = null;
          for (const sel of selectors) {
            const found = document.querySelectorAll(sel);
            if (found.length > 0) {
              lastMsg = Array.from(found).pop();
              break;
            }
          }
          
          if (lastMsg) {
            const current = lastMsg.innerText.trim();
            if (current.length > 1) { // More sensitive
              generationDetected = true;
              if (current === lastCapturedText && current.length > 10) {
                stableCount++;
              } else {
                lastCapturedText = current;
                stableCount = 0;
              }
            }
          }

          // TERMINATION CONDITIONS:
          // 1. Stop button was there and now it's gone (Best signal)
          if (generationDetected && stopBtnVisibleBefore && !stopBtn && !typingIndicator && lastCapturedText.length > 5) {
             clearInterval(obsInterval);
             resolve(lastCapturedText);
             return;
          }

          // 2. Stable fallback (Safe Pacer)
          if (generationDetected && stableCount >= 4) {
            clearInterval(obsInterval);
            resolve(lastCapturedText);
            return;
          }

          if (Date.now() - startTime > limit) {
            clearInterval(obsInterval);
            reject(new Error(`Timeout. G:${generationDetected}, L:${lastCapturedText.length}`));
          }
        }, 400); 
      }
    });

    return { success: true, text, trace };
  } catch (err) {
    log(`FATAL: ${err.message}`);
    return { success: false, error: err.message, trace };
  }
}
