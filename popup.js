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
  if (statusEl) {
    if (!settings.enabled) {
      statusEl.textContent = t('statusPaused');
    } else {
      statusEl.textContent = t('statusKeeping', [String(settings.limit)]);
    }
  }

  if (!runtime) {
    if (debugEl) debugEl.textContent = '';
    return;
  }

  if (runtime.layoutSupported === false) {
    if (debugEl) debugEl.textContent = t('layoutUnsupported');
    return;
  }

  if (debugEl) {
    const rendered = Number(runtime.renderedMessages) || 0;
    const total = Number(runtime.totalMessages) || 0;
    const hidden = Number(runtime.hiddenMessages) || 0;
    debugEl.textContent = `${rendered}/${total} ${t('renderedLabel')}, ${hidden} ${t('hiddenLabel')}`;
  }

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
  const groqStatusWarningEl = document.getElementById('groqStatusWarning');
  const groqStatusActiveEl = document.getElementById('groqStatusActive');
  const openOptionsFromPopupEl = document.getElementById('openOptionsFromPopup');

  const store = storageArea();
  const CONFIG_KEY = 'cgpt_optimizer_config_v1';
  let settings = sanitize((await store.get(CONFIG_KEY))[CONFIG_KEY] || DEFAULTS);

  // Settings buttons should ALWAYS work
  if (openOptionsEl) {
    openOptionsEl.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }
  if (openOptionsFromPopupEl) {
    openOptionsFromPopupEl.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  if (enabledEl) enabledEl.checked = settings.enabled;
  if (limitEl) limitEl.value = String(settings.limit);
  if (scopeNoteEl) scopeNoteEl.textContent = t('onlyChatgptScope');

  if (settings.groq_key && settings.groq_key.trim().length > 0) {
    if (groqStatusWarningEl) groqStatusWarningEl.classList.add('hidden');
    if (groqStatusActiveEl) groqStatusActiveEl.classList.remove('hidden');
    if (openOptionsFromPopupEl) openOptionsFromPopupEl.textContent = t('changeGroqKey') || "Anahtarı Değiştir";
  } else {
    if (groqStatusWarningEl) groqStatusWarningEl.classList.remove('hidden');
    if (groqStatusActiveEl) groqStatusActiveEl.classList.add('hidden');
    if (openOptionsFromPopupEl) openOptionsFromPopupEl.textContent = t('setupGroqKey') || "API Key Kurulumu";
  }

  const tab = await activeTab();
  const supported = Boolean(tab && isSupportedUrl(tab.url));
  const tabId = tab && tab.id ? tab.id : null;

  async function notifyTab() {
    if (tabId) {
      await send(tabId, { type: 'settingsUpdated', payload: settings });
    }
  }

  if (openChatgptEl) {
    openChatgptEl.addEventListener('click', async () => {
      await chrome.tabs.create({ url: 'https://chatgpt.com/' });
      window.close();
    });
  }

  if (!supported) {
    if (popupRoot) popupRoot.classList.add('hidden');
    if (blockedBanner) blockedBanner.classList.remove('hidden');
    return;
  }

  if (popupRoot) popupRoot.classList.remove('hidden');
  if (blockedBanner) blockedBanner.classList.add('hidden');

  const runtime = await send(tabId, { type: 'getStatus' });
  renderStatus(statusEl, debugEl, settings, runtime);

  if (enabledEl) {
    enabledEl.addEventListener('change', async () => {
      settings = sanitize({ ...settings, enabled: enabledEl.checked });
      await store.set({ [CONFIG_KEY]: settings });
      await notifyTab();
      const s = await send(tabId, { type: 'getStatus' });
      renderStatus(statusEl, debugEl, settings, s);
    });
  }

  if (limitEl) {
    limitEl.addEventListener('change', async () => {
      const value = clamp(Number(limitEl.value) || settings.limit, LIMIT_MIN, LIMIT_MAX);
      limitEl.value = String(value);
      settings = sanitize({ ...settings, limit: value });
      await store.set({ [CONFIG_KEY]: settings });
      await notifyTab();
      const s = await send(tabId, { type: 'getStatus' });
      renderStatus(statusEl, debugEl, settings, s);
    });
  }

  if (loadOlderEl) {
    loadOlderEl.addEventListener('click', async () => {
      loadOlderEl.disabled = true;
      await send(tabId, { type: 'loadOlder' }, 1200);
      loadOlderEl.disabled = false;
      window.close();
    });
  }

  if (trimNowEl) {
    trimNowEl.addEventListener('click', async () => {
      trimNowEl.disabled = true;
      await send(tabId, { type: 'trimNow' }, 1200);
      trimNowEl.disabled = false;
      window.close();
    });
  }

  if (hotReloadEl) {
    hotReloadEl.addEventListener('click', async () => {
      hotReloadEl.disabled = true;
      await chrome.tabs.reload(tabId);
      window.close();
    });
  }
}

init();
