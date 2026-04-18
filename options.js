const DEFAULTS = {
  enabled: true,
  limit: 5,
  chunkSize: 5,
  autoTrim: true,
  showToolbar: false,
  optimizerEnabled: true,
  optimizerLanguage: 'en'
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
    optimizerLanguage: (raw.optimizerLanguage === 'en' || raw.optimizerLanguage === 'tr') ? raw.optimizerLanguage : DEFAULTS.optimizerLanguage
  };
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

async function init() {
  applyI18n();

  const enabledEl = document.getElementById('enabled');
  const limitEl = document.getElementById('limit');
  const autoTrimEl = document.getElementById('autoTrim');
  const optimizerEnabledEl = document.getElementById('optimizerEnabled');
  const optimizerLanguageEl = document.getElementById('optimizerLanguage');
  const saveEl = document.getElementById('save');
  const resetEl = document.getElementById('reset');
  const statusEl = document.getElementById('status');

  const CONFIG_KEY = 'cgpt_optimizer_config_v1';
  const store = storageArea();
  let settings = sanitize((await store.get(CONFIG_KEY))[CONFIG_KEY] || DEFAULTS);

  function render() {
    enabledEl.checked = settings.enabled;
    limitEl.value = String(settings.limit);
    autoTrimEl.checked = settings.autoTrim;
    optimizerEnabledEl.checked = settings.optimizerEnabled;
    optimizerLanguageEl.value = settings.optimizerLanguage;
  }

  render();

  saveEl.addEventListener('click', async () => {
    settings = sanitize({
      enabled: enabledEl.checked,
      limit: clamp(Number(limitEl.value) || settings.limit, LIMIT_MIN, LIMIT_MAX),
      chunkSize: settings.chunkSize,
      autoTrim: autoTrimEl.checked,
      showToolbar: false,
      optimizerEnabled: optimizerEnabledEl.checked,
      optimizerLanguage: optimizerLanguageEl.value
    });
    await store.set({ [CONFIG_KEY]: settings });
    render();
    statusEl.textContent = t('savedStatus');
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });

  resetEl.addEventListener('click', async () => {
    settings = { ...DEFAULTS };
    await store.set({ [CONFIG_KEY]: settings });
    render();
    statusEl.textContent = t('resetDone');
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
}

init();
