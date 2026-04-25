const DEFAULTS = {
  enabled: true,
  limit: 5,
  chunkSize: 5,
  autoTrim: true,
  showToolbar: false,
  optimizerEnabled: true,
  optimizerLanguage: 'en',
  groq_key: null
};

const LIMIT_MIN = 1;
const LIMIT_MAX = 200;

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
    limit: clamp(Number(raw.limit) || DEFAULTS.limit, LIMIT_MIN, LIMIT_MAX),
    chunkSize: Number(raw.chunkSize) || DEFAULTS.chunkSize,
    autoTrim: typeof raw.autoTrim === 'boolean' ? raw.autoTrim : DEFAULTS.autoTrim,
    showToolbar: typeof raw.showToolbar === 'boolean' ? raw.showToolbar : DEFAULTS.showToolbar,
    optimizerEnabled: typeof raw.optimizerEnabled === 'boolean' ? raw.optimizerEnabled : DEFAULTS.optimizerEnabled,
    optimizerLanguage: (raw.optimizerLanguage === 'en' || raw.optimizerLanguage === 'tr') ? raw.optimizerLanguage : DEFAULTS.optimizerLanguage,
    groq_key: typeof raw.groq_key === 'string' ? raw.groq_key : DEFAULTS.groq_key
  };
}

function isSupportedUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'chatgpt.com' || parsed.hostname === 'chat.openai.com');
  } catch (error) {
    return false;
  }
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    return null;
  }
  return tab;
}

async function send(tabId, message, timeout = 900) {
  if (!tabId) {
    return null;
  }
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, message),
      new Promise((resolve) => setTimeout(() => resolve(null), timeout))
    ]);
  } catch (error) {
    return null;
  }
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

function renderStatus(statusEl, debugEl, settings, runtime) {
  if (!settings.enabled) {
    statusEl.textContent = t('statusPaused');
  } else {
    statusEl.textContent = t('statusKeeping', [String(settings.limit)]);
  }

  if (!runtime) {
    debugEl.textContent = '';
    return;
  }

  if (runtime.layoutSupported === false) {
    debugEl.textContent = t('layoutUnsupported');
    return;
  }

  const rendered = Number(runtime.renderedMessages) || 0;
  const total = Number(runtime.totalMessages) || 0;
  const hidden = Number(runtime.hiddenMessages) || 0;
  debugEl.textContent = `${rendered}/${total} ${t('renderedLabel')}, ${hidden} ${t('hiddenLabel')}`;

  const pinnedEl = document.getElementById('pinnedCount');
  if (pinnedEl) {
    const pinnedCount = Array.isArray(runtime.starredIds) ? 
        runtime.starredIds.filter(s => runtime.currentConvId && s.convId === runtime.currentConvId).length : 0;
    pinnedEl.textContent = pinnedCount > 0 ? `${pinnedCount} ${t('pinned')}` : '';
  }
}

async function init() {
  applyI18n();

  const popupRoot = document.getElementById('popupRoot');
  const blockedBanner = document.getElementById('blockedBanner');
  const openChatgptEl = document.getElementById('openChatgpt');

  const enabledEl = document.getElementById('enabled');
  const limitEl = document.getElementById('limit');
  const loadOlderEl = document.getElementById('loadOlder');
  const trimNowEl = document.getElementById('trimNow');
  const hotReloadEl = document.getElementById('hotReload');
  const openOptionsEl = document.getElementById('openOptions');
  const scopeNoteEl = document.getElementById('scopeNote');
  const statusEl = document.getElementById('status');
  const debugEl = document.getElementById('debug');
  const connectGroqEl = document.getElementById('connectGroq');
  const groqStatusEl = document.getElementById('groqStatus');
  const groqKeyDisplayEl = document.getElementById('groqKeyDisplay');

  const store = storageArea();
  const CONFIG_KEY = 'cgpt_optimizer_config_v1';
  let settings = sanitize((await store.get(CONFIG_KEY))[CONFIG_KEY] || DEFAULTS);
  enabledEl.checked = settings.enabled;
  limitEl.value = String(settings.limit);
  scopeNoteEl.textContent = t('onlyChatgptScope');

  if (settings.groq_key) {
    connectGroqEl.classList.add('hidden');
    groqStatusEl.classList.remove('hidden');
    if (groqKeyDisplayEl) {
      groqKeyDisplayEl.textContent = settings.groq_key.substring(0, 7) + '...' + settings.groq_key.slice(-4);
      groqKeyDisplayEl.classList.remove('hidden');
    }
  }

  const tab = await activeTab();
  const supported = Boolean(tab && isSupportedUrl(tab.url));
  const tabId = tab && tab.id ? tab.id : null;

  async function notifyTab() {
    if (tabId) {
      await send(tabId, { type: 'settingsUpdated', payload: settings });
    }
  }

  openOptionsEl.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  openChatgptEl.addEventListener('click', async () => {
    await chrome.tabs.create({ url: 'https://chatgpt.com/' });
    window.close();
  });

  if (!supported) {
    popupRoot.classList.add('hidden');
    blockedBanner.classList.remove('hidden');
    return;
  }

  popupRoot.classList.remove('hidden');
  blockedBanner.classList.add('hidden');

  const runtime = await send(tabId, { type: 'getStatus' });
  renderStatus(statusEl, debugEl, settings, runtime);

  enabledEl.addEventListener('change', async () => {
    settings = sanitize({ ...settings, enabled: enabledEl.checked });
    await store.set({ [CONFIG_KEY]: settings });
    await notifyTab();
    const s = await send(tabId, { type: 'getStatus' });
    renderStatus(statusEl, debugEl, settings, s);
  });

  limitEl.addEventListener('change', async () => {
    const value = clamp(Number(limitEl.value) || settings.limit, LIMIT_MIN, LIMIT_MAX);
    limitEl.value = String(value);
    settings = sanitize({ ...settings, limit: value });
    await store.set({ [CONFIG_KEY]: settings });
    await notifyTab();
    const s = await send(tabId, { type: 'getStatus' });
    renderStatus(statusEl, debugEl, settings, s);
  });

  loadOlderEl.addEventListener('click', async () => {
    loadOlderEl.disabled = true;
    await send(tabId, { type: 'loadOlder' }, 1200);
    loadOlderEl.disabled = false;
    window.close();
  });

  trimNowEl.addEventListener('click', async () => {
    trimNowEl.disabled = true;
    await send(tabId, { type: 'trimNow' }, 1200);
    trimNowEl.disabled = false;
    window.close();
  });

  hotReloadEl.addEventListener('click', async () => {
    hotReloadEl.disabled = true;
    await chrome.tabs.reload(tabId);
    window.close();
  });

  connectGroqEl.addEventListener('click', async () => {
    connectGroqEl.disabled = true;
    connectGroqEl.textContent = t('groqWait');
    
    chrome.runtime.sendMessage({ type: 'GET_GROQ_KEY' }, async (response) => {
      if (response && response.success) {
        settings.groq_key = response.key;
        await store.set({ [CONFIG_KEY]: settings });
        connectGroqEl.classList.add('hidden');
        groqStatusEl.classList.remove('hidden');
        if (groqKeyDisplayEl) {
          groqKeyDisplayEl.textContent = response.key.substring(0, 7) + '...' + response.key.slice(-4);
          groqKeyDisplayEl.classList.remove('hidden');
        }
        await notifyTab();
      } else {
        connectGroqEl.disabled = false;
        connectGroqEl.textContent = t('groqBoostBtn');
        alert(response?.error || 'Groq connection failed. Please ensure you are logged in to console.groq.com');
      }
    });
  });
}

init();
