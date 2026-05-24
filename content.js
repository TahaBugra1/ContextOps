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
    optimizerLanguage: 'en',
    groq_key: '',
    selectedStyles: ['/spec', '/cot', '/feynman', '/socratic', '/step']
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

  function isContextValid() {
    return !!chrome.runtime && !!chrome.runtime.id;
  }

  function t(key, substitutions) {
    try {
      if (!isContextValid()) return key;
      return chrome.i18n.getMessage(key, substitutions) || key;
    } catch (e) {
      return key;
    }
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
      groq_key: typeof raw.groq_key === 'string' ? raw.groq_key : (settings.groq_key || DEFAULTS.groq_key),
      selectedStyles: Array.isArray(raw.selectedStyles) ? raw.selectedStyles : DEFAULTS.selectedStyles,
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

  function toggleTextareaLock(active) {
    const textarea = document.getElementById('prompt-textarea');
    if (textarea) {
      textarea.style.opacity = active ? "0.4" : "1";
      textarea.style.pointerEvents = active ? "none" : "auto";
      textarea.style.cursor = active ? "wait" : "auto";
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
    
    messages.forEach((msg) => {
      let btn = msg.querySelector('.cgptopt-star-btn');
      
      // Try to find the message ID from various locations in the DOM
      const msgId = msg.getAttribute('data-message-id') || 
                    msg.getAttribute('data-turn-id') ||
                    msg.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                    msg.querySelector('[data-turn-id]')?.getAttribute('data-turn-id') ||
                    msg.getAttribute('data-cgptopt-id') ||
                    msg.querySelector('[data-testid^="conversation-turn-"]')?.getAttribute('data-testid')?.split('-').pop();

      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'cgptopt-star-btn';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        
        // Ensure relative position so absolute star button positions perfectly
        if (msg.style.position !== 'relative') {
          msg.style.position = 'relative';
        }

        // Append directly to outer message container to prevent dynamic React toolbar crashes
        msg.appendChild(btn);
        
        btn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Re-check ID at click time if it was missing before
          const currentId = msg.getAttribute('data-message-id') || 
                            msg.getAttribute('data-turn-id') ||
                            msg.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                            msg.querySelector('[data-turn-id]')?.getAttribute('data-turn-id') ||
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
        btn.style.cursor = "pointer";
      } else {
        btn.title = "ID matching...";
        btn.style.cursor = "wait";
      }
    });
  }

  function injectSphereMenu() {
    if (!settings.enabled || !settings.optimizerEnabled) {
      const existing = document.querySelector('.cgptopt-sphere-wrapper');
      if (existing) existing.remove();
      return;
    }

    const textarea = document.getElementById('prompt-textarea');
    if (!textarea) return;

    if (document.querySelector('.cgptopt-sphere-wrapper')) return;

    // --- Root wrapper: fixed positioned, outside textarea to the right ---
    const wrapper = document.createElement('div');
    wrapper.className = 'cgptopt-sphere-wrapper';
    document.body.appendChild(wrapper);

    // --- Hemisphere expansion (SVG Pie Menu) ---
    const expansion = document.createElement('div');
    expansion.className = 'cgptopt-hemisphere-expansion';

    // PROMPT_STYLES dictionary for resolving icons/labels
    const PROMPT_STYLES = {
      '/image': { icon: '🎨', label: 'Görsel' },
      '/makale': { icon: '📝', label: 'Makale' },
      '/mail': { icon: '📧', label: 'E-posta' },
      '/spec': { icon: '📐', label: 'SPEC' },
      '/cot': { icon: '🧠', label: 'CoT' },
      '/feynman': { icon: '👶', label: 'Feynman' },
      '/socratic': { icon: '🏛️', label: 'Sokratik' },
      '/step': { icon: '🪜', label: 'Adım Adım' },
      '/tot': { icon: '🌳', label: 'ToT' },
      '/first': { icon: '🧱', label: 'İlk İlkeler' },
      '/few': { icon: '💡', label: 'Few-Shot' },
      '/expert': { icon: '🎓', label: 'Uzman' },
      '/debate': { icon: '⚖️', label: 'Münazara' },
      '/table': { icon: '📊', label: 'Tablo' },
      '/critic': { icon: '🧐', label: 'Eleştirel' },
      '/analog': { icon: '🔗', label: 'Analoji' },
      '/code': { icon: '💻', label: 'Kod' },
      '/negative': { icon: '🚫', label: 'Negatif' },
      '/creative': { icon: '🎭', label: 'Yaratıcı' },
      '/risks': { icon: '⚠️', label: 'Risk' },
      '/future': { icon: '🔮', label: 'Gelecek' },
      '/summary': { icon: '📉', label: 'Özet' },
      '/interact': { icon: '💬', label: 'Etkileşim' }
    };

    // Use selected styles from settings, limit to 5
    const selectedIds = (settings.selectedStyles && settings.selectedStyles.length > 0)
      ? settings.selectedStyles.slice(0, 5)
      : ['/image', '/makale', '/spec', '/summary', '/mail'];

    const items = selectedIds.map(id => ({
      id: id,
      icon: PROMPT_STYLES[id] ? PROMPT_STYLES[id].icon : '✨',
      label: PROMPT_STYLES[id] ? PROMPT_STYLES[id].label : id
    }));

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '80');
    svg.setAttribute('height', '160');
    svg.setAttribute('viewBox', '0 0 80 160');
    svg.style.overflow = 'visible';

    // Mathematically generate SVG paths for N slices of the left hemisphere
    // Hemisphere starts from Top (270 deg) to Bottom (90 deg) sweeping left
    const n = items.length;
    const totalAngle = 180;
    const angleStep = totalAngle / n;
    const startAngle = 270; // Top

    const slicesData = items.map((item, index) => {
      // Angle goes counter-clockwise: 270 -> 180 -> 90
      const a1 = startAngle - (index * angleStep);
      const a2 = startAngle - ((index + 1) * angleStep);
      
      const rad1 = a1 * Math.PI / 180;
      const rad2 = a2 * Math.PI / 180;

      const cx = 80, cy = 80, r = 80;
      
      const x1 = cx + r * Math.cos(rad1);
      const y1 = cy + r * Math.sin(rad1);
      const x2 = cx + r * Math.cos(rad2);
      const y2 = cy + r * Math.sin(rad2);

      // M cx,cy L x1,y1 A r,r 0 0,0 x2,y2 Z  (0 for sweep-flag = counter-clockwise)
      const path = `M ${cx},${cy} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 0,0 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;

      // Text coordinates (radius = 50)
      const midRad = ((a1 + a2) / 2) * Math.PI / 180;
      const textX = cx + 50 * Math.cos(midRad);
      const textY = cy + 50 * Math.sin(midRad);

      return { path, textX, textY, item };
    });

    slicesData.forEach(data => {
      const g = document.createElementNS(svgNS, 'g');
      g.className.baseVal = 'cgptopt-slice-group';
      
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', data.path);
      path.className.baseVal = 'cgptopt-slice-path';

      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', data.textX);
      text.setAttribute('y', data.textY);
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('text-anchor', 'middle');
      text.className.baseVal = 'cgptopt-slice-icon';
      text.textContent = data.item.icon;

      // Tooltip natively provided by <title> element inside <g>
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = data.item.label;

      g.appendChild(title);
      g.appendChild(path);
      g.appendChild(text);

      g.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ta = document.getElementById('prompt-textarea');
        if (!ta) return;
        const currentVal = ta.innerText || ta.value || '';
        // Eğer en başta mevcut bir komut (örneğin /image, /makale vs) varsa onu sil ve yenisini yaz
        const cleanedVal = currentVal.replace(/^\/[\w\-]+(\s+)?/, '').trim();
        const newVal = data.item.id + ' ' + cleanedVal;
        if (ta.tagName === 'DIV') {
          ta.innerText = newVal;
        } else {
          ta.value = newVal;
        }
        ta.focus();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      };

      svg.appendChild(g);
    });

    expansion.appendChild(svg);

    // --- Main sphere (star icon) which NOW acts as the Optimize button ---
    const mainSphere = document.createElement('div');
    mainSphere.className = 'cgptopt-main-sphere';
    mainSphere.title = t('improvePrompt') || 'Sihirli Yıldız: Promptu Geliştir';
    mainSphere.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </svg>
    `;

    mainSphere.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (mainSphere.classList.contains('loading')) return;
      const ta = document.getElementById('prompt-textarea');
      const text = ta ? (ta.innerText || ta.value || '') : '';
      if (!text.trim()) return;
      mainSphere.classList.add('loading');
      const requestId = Math.random().toString(36).substring(7);
      window.dispatchEvent(new CustomEvent('cgptopt-optimize', { detail: { text, requestId } }));
    };

    wrapper.appendChild(expansion);
    wrapper.appendChild(mainSphere);

    function updatePosition() {
      const ta = document.getElementById('prompt-textarea');
      if (!ta || !wrapper) return;
      const rect = ta.getBoundingClientRect();
      wrapper.style.top  = `${rect.top + rect.height / 2 - 22}px`;
      wrapper.style.left = `${rect.left - 95}px`; // Fully outside, further left
      wrapper.style.display = !!ta.offsetParent ? 'flex' : 'none';
    }

    setInterval(updatePosition, 100);
    window.addEventListener('resize', updatePosition);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'cgpt_optimizer_main') return;
    
    if (event.data.type === 'cgptopt-status') {
      lastStatus = { ...lastStatus, ...event.data.payload };
    } else if (event.data.type === 'cgptopt-status-toast') {
      showToast(event.data.payload.message);
    } else if (event.data.type === 'cgptopt-ui-lock') {
      const { active } = event.data.payload || {};
      toggleTextareaLock(active);
    } else if (event.data.type === 'cgptopt-reset-worker') {
      chrome.runtime.sendMessage({ type: 'RESET_WORKER' });
    } else if (event.data.type === 'cgptopt-optimize-request') {
      const { instruction, requestId, useGroq, groqKey } = event.data.payload;
      if (!isContextValid()) {
         console.warn('[CGPTOpt] Context invalidated. Please refresh the page.');
         return;
      }
      chrome.runtime.sendMessage({ 
        type: 'OPTIMIZE_PROMPT_BACKGROUND', 
        payload: { instruction, useGroq, groqKey } 
      }, (response) => {
        window.postMessage({ 
          source: 'cgpt_optimizer_content', 
          type: 'cgptopt-optimize-response', 
          payload: { 
            success: response?.success, 
            optimized: response?.optimized, 
            error: response?.error || (!response?.success ? "Optimization failed" : null),
            requestId 
          } 
        }, '*');
      });
    } else if (event.data.type === 'cgptopt-optimize-result') {
      const { optimized, requestId, error } = event.data.payload || {};
      const textarea = document.getElementById('prompt-textarea');
      const btn = document.querySelector('.cgptopt-optimize-btn'); 
      const sphere = document.querySelector('.cgptopt-main-sphere');
      
      if (btn) btn.classList.remove('loading');
      if (sphere) sphere.classList.remove('loading');
      toggleTextareaLock(false);
      
      if (error === 'no_token') {
        showToast("Lütfen önce bir mesaj gönderin.");
        return;
      }
      
      if (error && error !== 'no_token') {
        showToast(settings.optimizerLanguage === 'tr' ? "Hata: Prompt optimize edilemedi." : "Error: Could not optimize prompt.");
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
}

  function setupObserver() {
    // --- Original ChatGPT Logic ---
    const observer = new MutationObserver(() => {
      if (!isContextValid()) {
        observer.disconnect();
        return;
      }
      injectStarButtons();

      injectSphereMenu();
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
      if (!isContextValid()) return;
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
        if (!isContextValid()) return;
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

      injectSphereMenu();
      
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
