(() => {
  console.log('[CGPTOpt] Content V4.1 Loaded');
  // DEEP LOOK: Exit early if this is a background automation tab to avoid self-interference
  if (window.location.search.includes('temporary-chat=true')) {
    console.log('[CGPTOpt] Stealth automation tab detected. Disabling content script features.');
    return;
  }

  const DEFAULTS = {
    enabled: true,
    limit: 5,
    chunkSize: 5,
    autoTrim: true,
    showToolbar: false,
    optimizerEnabled: true,
    optimizerLanguage: 'en'
  };

  const CONFIG_KEY = 'cgpt_optimizer_config_v1';
  const EXTRA_KEY = 'cgpt_optimizer_extra_v1';
  const STARRED_KEY = 'cgpt_optimizer_starred_v1';
  const TOAST_ID = 'cgptopt-toast';
  const TOAST_COOLDOWN_MS = 30000;

  let settings = { ...DEFAULTS };
  let starredIds = [];
  let lastStatus = {
    layoutSupported: null,
    totalMessages: 0,
    renderedMessages: 0,
    hiddenMessages: 0,
    hasOlderMessages: false,
    extraMessages: 0,
    active: false
  };

  let visibilityToastShown = false;
  let lastToastAt = 0;

  function storageArea() {
    return chrome.storage.sync || chrome.storage.local;
  }

  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sanitize(raw) {
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
      limit: clamp(Number(raw.limit) || DEFAULTS.limit, 1, 200),
      chunkSize: clamp(Number(raw.chunkSize) || DEFAULTS.chunkSize, 1, 100),
      autoTrim: typeof raw.autoTrim === 'boolean' ? raw.autoTrim : DEFAULTS.autoTrim,
      showToolbar: typeof raw.showToolbar === 'boolean' ? raw.showToolbar : DEFAULTS.showToolbar,
      optimizerEnabled: typeof raw.optimizerEnabled === 'boolean' ? raw.optimizerEnabled : DEFAULTS.optimizerEnabled,
      optimizerLanguage: (raw.optimizerLanguage === 'en' || raw.optimizerLanguage === 'tr') ? raw.optimizerLanguage : DEFAULTS.optimizerLanguage,
      starredIds: Array.isArray(raw.starredIds) ? raw.starredIds : (Array.isArray(starredIds) ? starredIds : [])
    };
  }

  function showToast(text) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  function toggleMagicOverlay(active) {
    let overlay = document.querySelector('.cgptopt-magic-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'cgptopt-magic-overlay';
      overlay.innerHTML = `
        <div class="cgptopt-magic-spinner">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M7.5 5.6L10 7L8.6 4.5L10 2L7.5 3.4L5 2L6.4 4.5L5 7L7.5 5.6M19.5 15.4L17 14L18.4 16.5L17 19L19.5 17.6L22 19L20.6 16.5L22 14L19.5 15.4M22 2L19.5 3.4L17 2L18.4 4.5L17 7L19.5 5.6L22 7L20.6 4.5L22 2"/>
          </svg>
        </div>
        <div class="cgptopt-magic-text">Sihirli Değnek Hazırlanıyor...</div>
      `;
      // Append to body instead of main to avoid layout issues, but keep it positioned
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active', active);
    
    // Add a subtle blur/dim to the textarea area instead of blocking the whole screen
    const textarea = document.getElementById('prompt-textarea');
    if (textarea) {
      textarea.style.opacity = active ? "0.5" : "1";
      textarea.style.pointerEvents = active ? "none" : "auto";
    }
  }

  function maybeShowActiveToast() {
    if (document.hidden) {
      return;
    }
    if (!(settings.enabled && settings.autoTrim)) {
      return;
    }
    if (lastStatus.layoutSupported === false) {
      return;
    }
    const now = Date.now();
    if (visibilityToastShown || now - lastToastAt < TOAST_COOLDOWN_MS) {
      return;
    }
    visibilityToastShown = true;
    lastToastAt = now;
    showToast(t('activeToast'));
  }

  function dispatchConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(settings));
      localStorage.setItem(STARRED_KEY, JSON.stringify(starredIds));
    } catch (error) {
      return;
    }
    window.dispatchEvent(new CustomEvent('cgptopt-config', { detail: { ...settings, starredIds } }));
  }

  function getStarredIdsForCurrentConversation() {
    const url = new URL(location.href);
    const convId = url.pathname.split('/').pop();
    if (!convId || convId.length < 10) return [];
    
    return starredIds.filter(item => item.convId === convId).map(item => item.messageId);
  }

  function injectStarButtons() {
    if (!settings.enabled) return;

    // ChatGPT uses different selectors depending on the version/experiment
    const messages = document.querySelectorAll('article, [data-testid^="conversation-turn-"]');
    const currentStarred = getStarredIdsForCurrentConversation();
    
    if (messages.length > 0) {
      console.log(`[CGPTOpt] Found ${messages.length} messages. Injecting buttons...`);
    }

    messages.forEach((msg) => {
      // Find a suitable place for the button (look for standard toolbars or actions area)
      const toolbar = msg.querySelector('.flex.justify-between') || 
                      msg.querySelector('.empty\\:hidden') ||
                      msg.querySelector('div[class*="toolbar"]') ||
                      msg.querySelector('.justify-start.flex'); // Fallback for some versions
      
      if (!toolbar) return;

      let btn = msg.querySelector('.cgptopt-star-btn');
      
      // Try to find the message ID from various locations in the DOM
      const msgId = msg.getAttribute('data-message-id') || 
                    msg.getAttribute('data-turn-id') ||
                    msg.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                    msg.getAttribute('data-cgptopt-id');

      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'cgptopt-star-btn';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        toolbar.appendChild(btn);
        
        btn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Re-check ID at click time if it was missing before
          const currentId = msg.getAttribute('data-message-id') || 
                            msg.getAttribute('data-turn-id') ||
                            msg.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                            msg.getAttribute('data-cgptopt-id');

          if (!currentId) {
            showToast(t('idNotFound') || "Mesaj ID'si henüz eşleşmedi. Lütfen bekleyin.");
            return;
          }
          await toggleStar(currentId);
          btn.classList.toggle('starred');
          msg.classList.toggle('cgptopt-starred-message');
        };
      }

      // Update appearance based on ID existence and star status
      if (msgId) {
        const isStarred = currentStarred.includes(msgId);
        btn.classList.toggle('starred', isStarred);
        msg.classList.toggle('cgptopt-starred-message', isStarred);
        btn.title = t(isStarred ? 'unstar' : 'star');
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
      } else {
        btn.title = "ID matching...";
        btn.style.opacity = "0.3";
        btn.style.cursor = "wait";
      }
    });
  }

  function injectPromptOptimizer() {
    if (!settings.enabled || !settings.optimizerEnabled) {
      const existing = document.querySelector('.cgptopt-optimize-btn');
      if (existing) existing.remove();
      return;
    }

    const textarea = document.getElementById('prompt-textarea');
    if (!textarea) return;

    // In new ChatGPT, textarea is a contenteditable div.
    // We attach our button to its parent or a stable sibling.
    const container = textarea.closest('.flex.w-full.items-center') || textarea.parentElement;
    if (!container || container.querySelector('.cgptopt-optimize-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'cgptopt-optimize-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.5 5.6L10 7L8.6 4.5L10 2L7.5 3.4L5 2L6.4 4.5L5 7L7.5 5.6M19.5 15.4L17 14L18.4 16.5L17 19L19.5 17.6L22 19L20.6 16.5L22 14L19.5 15.4M22 2L19.5 3.4L17 2L18.4 4.5L17 7L19.5 5.6L22 7L20.6 4.5L22 2M14.08 15.59L16.68 12.99L11.01 7.32L8.41 9.92L14.08 15.59M16.14 4.41C16.14 4.41 15.14 3.41 14.14 4.41L12.14 6.41L17.59 11.86L19.59 9.86C20.59 8.86 19.59 7.86 19.59 7.86L16.14 4.41Z"/></svg>`;
    btn.title = t('improvePrompt') || "Sihirli Değnek: Promptu Geliştir";
    
    // Inject near the end of the container
    container.style.position = 'relative'; 
    container.appendChild(btn);

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = textarea.innerText || textarea.value || "";
      if (!text.trim()) return;

      btn.classList.add('loading');
      const requestId = Math.random().toString(36).substring(7);
      window.dispatchEvent(new CustomEvent('cgptopt-optimize', { detail: { text, requestId } }));
    };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'cgpt_optimizer_main') return;
    
    if (event.data.type === 'cgptopt-status') {
      lastStatus = { ...lastStatus, ...event.data.payload };
    } else if (event.data.type === 'cgptopt-ui-lock') {
      const { active } = event.data.payload || {};
      toggleMagicOverlay(active);
    } else if (event.data.type === 'cgptopt-warmup-worker') {
      chrome.runtime.sendMessage({ type: 'WARMUP_WORKER' });
    } else if (event.data.type === 'cgptopt-reset-worker') {
      chrome.runtime.sendMessage({ type: 'RESET_WORKER' });
    } else if (event.data.type === 'cgptopt-optimize-request') {
      const { instruction, requestId } = event.data.payload;
      chrome.runtime.sendMessage({ 
        type: 'OPTIMIZE_PROMPT_BACKGROUND', 
        payload: { instruction } 
      }, (response) => {
        window.postMessage({ 
          source: 'cgpt_optimizer_content', 
          type: 'cgptopt-optimize-response', 
          payload: { 
            success: response?.success, 
            optimized: response?.optimized, 
            error: response?.error,
            requestId 
          } 
        }, '*');
      });
    } else if (event.data.type === 'cgptopt-optimize-result') {
      const { optimized, requestId, error } = event.data.payload || {};
      const textarea = document.getElementById('prompt-textarea');
      const btn = document.querySelector('.cgptopt-optimize-btn'); 
      
      if (btn) btn.classList.remove('loading');
      toggleMagicOverlay(false);
      
      if (error === 'no_token') {
        showToast("Lütfen önce bir mesaj gönderin.");
        return;
      }

      if (optimized && textarea) {
        if (textarea.tagName === 'DIV') {
          textarea.innerText = optimized;
        } else {
          textarea.value = optimized;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        showToast("Sihirli Değnek: Prompt Geliştirildi! ✨");
      }
    }
  });

  async function toggleStar(messageId) {
    const url = new URL(location.href);
    const convId = url.pathname.split('/').pop();
    
    const index = starredIds.findIndex(s => s.messageId === messageId);
    if (index > -1) {
      starredIds.splice(index, 1);
    } else {
      starredIds.push({ convId, messageId });
    }
    
    await storageArea().set({ [STARRED_KEY]: starredIds });
    dispatchConfig();
  }

  function setupObserver() {
    const observer = new MutationObserver(() => {
      injectStarButtons();
      injectPromptOptimizer();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function getExtraForCurrentUrl() {
    try {
      const raw = localStorage.getItem(EXTRA_KEY);
      if (!raw) {
        return 0;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.url !== location.href) {
        return 0;
      }
      return clamp(Number(parsed.extra) || 0, 0, 1000);
    } catch (error) {
      return 0;
    }
  }

  function setExtraForCurrentUrl(extra) {
    try {
      localStorage.setItem(EXTRA_KEY, JSON.stringify({
        url: location.href,
        extra: clamp(Number(extra) || 0, 0, 1000)
      }));
    } catch (error) {
      return;
    }
  }

  function notifyMainStatusRequest() {
    window.dispatchEvent(new Event('cgptopt-request-status'));
  }

  function applySettings(next) {
    settings = sanitize({ ...settings, ...next });
    dispatchConfig();
  }

  function setupWindowBridge() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'cgpt_optimizer_main') {
        return;
      }
      if (event.data.type === 'cgptopt-status' && event.data.payload && typeof event.data.payload === 'object') {
        lastStatus = { ...lastStatus, ...event.data.payload };
      }
    });
  }

  function setupVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        visibilityToastShown = false;
        return;
      }
      maybeShowActiveToast();
      notifyMainStatusRequest();
    });
  }

  function setupMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== 'string') {
        return;
      }

      if (message.type === 'settingsUpdated') {
        applySettings(message.payload || {});
        sendResponse({ ok: true });
      } else if (message.type === 'showActiveToast') {
        maybeShowActiveToast();
        sendResponse({ ok: true });
      } else if (message.type === 'trimNow') {
        setExtraForCurrentUrl(0);
        location.reload();
        sendResponse({ ok: true });
      } else if (message.type === 'loadOlder') {
        const extra = getExtraForCurrentUrl() + settings.chunkSize;
        setExtraForCurrentUrl(extra);
        location.reload();
        sendResponse({ ok: true });
      } else if (message.type === 'getStatus') {
        sendResponse({
          ok: true,
          layoutSupported: lastStatus.layoutSupported,
          enabled: settings.enabled,
          autoTrim: settings.autoTrim,
          limit: settings.limit,
          totalMessages: lastStatus.totalMessages,
          renderedMessages: lastStatus.renderedMessages,
          visibleMessages: lastStatus.renderedMessages,
          hiddenMessages: lastStatus.hiddenMessages,
          hasOlderMessages: lastStatus.hasOlderMessages,
          extraMessages: lastStatus.extraMessages,
          starredIds: starredIds,
          currentConvId: new URL(location.href).pathname.split('/').pop(),
          processing: false
        });
      } else {
        sendResponse({ ok: false, error: 'unknown_type' });
      }
      return true;
    });
  }

  async function init() {
    try {
      const raw = await storageArea().get([CONFIG_KEY, STARRED_KEY]);
      settings = sanitize(raw[CONFIG_KEY] || DEFAULTS);
      starredIds = Array.isArray(raw[STARRED_KEY]) ? raw[STARRED_KEY] : [];
      
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' && areaName !== 'local') return;
        
        if (changes[CONFIG_KEY]) {
          settings = sanitize(changes[CONFIG_KEY].newValue || DEFAULTS);
          dispatchConfig();
        }
        if (changes[STARRED_KEY]) {
          starredIds = Array.isArray(changes[STARRED_KEY].newValue) ? changes[STARRED_KEY].newValue : [];
          dispatchConfig();
        }
      });

      dispatchConfig();
      setupWindowBridge();
      setupVisibility();
      setupMessages();
      setupObserver();
      injectStarButtons();
      injectPromptOptimizer();
      
      notifyMainStatusRequest();
      if (!document.hidden) {
        maybeShowActiveToast();
      }
    } catch (error) {
      console.error('Optimizer init failed', error);
    }
  }

  init();
})();
