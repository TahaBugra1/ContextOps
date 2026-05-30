const DEFAULTS = {
  enabled: true,
  limit: 5,
  chunkSize: 5,
  autoTrim: true,
  showToolbar: false,
  optimizerEnabled: true,
  optimizerLanguage: 'en',
  groq_key: '',
  selectedStyles: ['/image', '/makale', '/spec', '/summary', '/mail']
};

const PROMPT_STYLES = {
  '/image': { icon: '🎨', tr: 'Görsel', en: 'Image' },
  '/makale': { icon: '📝', tr: 'Makale', en: 'Article' },
  '/mail': { icon: '📧', tr: 'E-posta', en: 'Email' },
  '/spec': { icon: '📐', tr: 'SPEC Yöntemi', en: 'SPEC Method' },
  '/cot': { icon: '🧠', tr: 'Chain of Thought', en: 'Chain of Thought' },
  '/feynman': { icon: '👶', tr: 'Feynman Tekniği', en: 'Feynman Technique' },
  '/socratic': { icon: '🏛️', tr: 'Sokratik Yöntem', en: 'Socratic Method' },
  '/step': { icon: '🪜', tr: 'Adım Adım', en: 'Step-by-Step' },
  '/tot': { icon: '🌳', tr: 'Tree of Thoughts', en: 'Tree of Thoughts' },
  '/first': { icon: '🧱', tr: 'İlk İlkeler', en: 'First Principles' },
  '/few': { icon: '💡', tr: 'Few-Shot', en: 'Few-Shot' },
  '/expert': { icon: '🎓', tr: 'Uzman Görüşü', en: 'Expert Perspective' },
  '/debate': { icon: '⚖️', tr: 'Münazara Modu', en: 'Debate Mode' },
  '/table': { icon: '📊', tr: 'Tablo Formatı', en: 'Tabular Output' },
  '/critic': { icon: '🧐', tr: 'Eleştirel Analiz', en: 'Critical Analysis' },
  '/analog': { icon: '🔗', tr: 'Analoji Kurma', en: 'Analogy Making' },
  '/code': { icon: '💻', tr: 'Kod Mantığı', en: 'Code Logic' },
  '/negative': { icon: '🚫', tr: 'Negatif Sınır', en: 'Negative Constraints' },
  '/creative': { icon: '🎭', tr: 'Yaratıcı Hikaye', en: 'Creative Story' },
  '/risks': { icon: '⚠️', tr: 'Risk Analizi', en: 'Risk Analysis' },
  '/future': { icon: '🔮', tr: 'Gelecek Öngörüsü', en: 'Future Foresight' },
  '/summary': { icon: '📉', tr: 'Yönetici Özeti', en: 'Executive Summary' },
  '/interact': { icon: '💬', tr: 'Etkileşimli', en: 'Interactive Mode' }
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
    groq_key: typeof raw.groq_key === 'string' ? raw.groq_key : DEFAULTS.groq_key,
    selectedStyles: Array.isArray(raw.selectedStyles) ? raw.selectedStyles : DEFAULTS.selectedStyles
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
  const groqKeyEl = document.getElementById('groqKey');
  const stylesGridEl = document.getElementById('styles-grid');
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
    if (groqKeyEl) groqKeyEl.value = settings.groq_key || '';
    
    // Render Styles Grid
    stylesGridEl.innerHTML = '';
    const isTr = settings.optimizerLanguage === 'tr';
    
    Object.entries(PROMPT_STYLES).forEach(([id, style]) => {
      const item = document.createElement('label');
      item.className = 'style-item';
      const checked = (settings.selectedStyles || []).includes(id);
      
      item.innerHTML = `
        <input type="checkbox" value="${id}" ${checked ? 'checked' : ''}>
        <div class="style-card">
          <span class="style-icon">${style.icon}</span>
          <span class="style-name">${isTr ? style.tr : style.en}</span>
        </div>
      `;
      
      const checkbox = item.querySelector('input');
      checkbox.addEventListener('change', () => {
        const checkedCount = stylesGridEl.querySelectorAll('input:checked').length;
        if (checkedCount > 5) {
          checkbox.checked = false;
          alert(isTr ? "En fazla 5 yöntem seçebilirsiniz." : "You can select up to 5 methods.");
        }
      });
      
      stylesGridEl.appendChild(item);
    });
  }

  render();

  saveEl.addEventListener('click', async () => {
    const selected = Array.from(stylesGridEl.querySelectorAll('input:checked')).map(el => el.value);
    
    settings = sanitize({
      enabled: enabledEl.checked,
      limit: clamp(Number(limitEl.value) || settings.limit, LIMIT_MIN, LIMIT_MAX),
      chunkSize: settings.chunkSize,
      autoTrim: autoTrimEl.checked,
      showToolbar: false,
      optimizerEnabled: optimizerEnabledEl.checked,
      optimizerLanguage: optimizerLanguageEl.value,
      groq_key: groqKeyEl ? groqKeyEl.value.trim() : settings.groq_key,
      selectedStyles: selected
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

  // --- MEMORY EXPLORER LOGIC ---
  const memoryListEl = document.getElementById('memory-list');
  const refreshMemoryBtn = document.getElementById('refresh-memory');
  const clearMemoryBtn = document.getElementById('clear-memory');

  function loadMemories() {
    memoryListEl.innerHTML = '<div class="memory-loading">Hafıza yükleniyor...</div>';
    chrome.runtime.sendMessage({ type: 'GET_ALL_MEMORIES' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        memoryListEl.innerHTML = '<div class="memory-empty">Hafıza yüklenemedi veya boş.</div>';
        return;
      }
      
      const memories = response.memories || [];
      if (memories.length === 0) {
        memoryListEl.innerHTML = '<div class="memory-empty">Henüz hiç anı kaydedilmemiş.</div>';
        return;
      }

      memoryListEl.innerHTML = '';
      memories.forEach(mem => {
        const item = document.createElement('div');
        item.className = 'memory-item';
        
        const date = new Date(mem.timestamp).toLocaleString(settings.optimizerLanguage === 'tr' ? 'tr-TR' : 'en-US');
        
        item.innerHTML = `
          <div class="memory-content">
            <div class="memory-text">${escapeHtml(mem.text)}</div>
            <div class="memory-date">${date}</div>
          </div>
          <button class="memory-delete-btn" title="Sil" data-id="${mem.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          </button>
        `;
        
        item.querySelector('.memory-delete-btn').addEventListener('click', () => {
          deleteMemory(mem.id, item);
        });
        
        memoryListEl.appendChild(item);
      });
    });
  }

  function deleteMemory(id, itemElement) {
    itemElement.style.opacity = '0.5';
    itemElement.style.pointerEvents = 'none';
    chrome.runtime.sendMessage({ type: 'DELETE_MEMORY', id }, (res) => {
      if (res && res.success) {
        itemElement.remove();
        if (memoryListEl.children.length === 0) {
          memoryListEl.innerHTML = '<div class="memory-empty">Henüz hiç anı kaydedilmemiş.</div>';
        }
      } else {
        itemElement.style.opacity = '1';
        itemElement.style.pointerEvents = 'auto';
        alert("Silinirken hata oluştu.");
      }
    });
  }

  function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  if (refreshMemoryBtn) {
    refreshMemoryBtn.addEventListener('click', loadMemories);
  }

  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener('click', () => {
      if (confirm(settings.optimizerLanguage === 'tr' ? "Tüm yapay zeka hafızası (RAG veritabanı) kalıcı olarak silinecek. Emin misiniz?" : "All AI memory (RAG database) will be permanently deleted. Are you sure?")) {
        chrome.runtime.sendMessage({ type: 'CLEAR_MEMORY' }, () => {
          loadMemories();
          alert(settings.optimizerLanguage === 'tr' ? "Hafıza tamamen temizlendi!" : "Memory fully cleared!");
        });
      }
    });
  }

  // Initial load
  if (memoryListEl) {
    loadMemories();
  }
}

init();
