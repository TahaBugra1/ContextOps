(() => {
  const CONFIG_KEY = 'cgpt_optimizer_config_v1';
  const STARRED_KEY = 'cgpt_optimizer_starred_v1';
  let authToken = null;
  let authHeaders = {};
  let lastModelSlug = 'gpt-4o';
  let isOptimizing = false;
  let optimizationResolver = null;
  let currentOptimizationRequestId = null;
  let lastCurrentNode = null; 
  let lastConversationId = null; // Track current conversation for worker reset
 // Default fallback
  const EXTRA_KEY = 'cgpt_optimizer_extra_v1';
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

  let settings = loadSettings();
  let lastStatus = {
    layoutSupported: null,
    totalMessages: 0,
    renderedMessages: 0,
    hiddenMessages: 0,
    hasOlderMessages: false,
    extraMessages: 0,
    active: Boolean(settings.enabled && settings.autoTrim)
  };

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
      groq_key: typeof raw.groq_key === 'string' ? raw.groq_key : DEFAULTS.groq_key,
      selectedStyles: Array.isArray(raw.selectedStyles) ? raw.selectedStyles : DEFAULTS.selectedStyles,
      starredIds: Array.isArray(raw.starredIds) ? raw.starredIds : (Array.isArray(settings?.starredIds) ? settings.starredIds : [])
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) {
        return { ...DEFAULTS };
      }
      return sanitize(JSON.parse(raw));
    } catch (error) {
      return { ...DEFAULTS };
    }
  }

  function postStatus(patch) {
    lastStatus = {
      ...lastStatus,
      ...patch,
      active: Boolean(settings.enabled && settings.autoTrim)
    };
    window.postMessage({
      source: 'cgpt_optimizer_main',
      type: 'cgptopt-status',
      payload: lastStatus
    }, '*');
  }

  function parseExtra() {
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

  function isConversationGet(url, method) {
    return method === 'GET' && /\/backend-api\/conversation\//.test(url) && !/\/backend-api\/conversations(\/|\?|$)/.test(url);
  }

  function isMessageNode(node) {
    if (!node || typeof node !== 'object') {
      return false;
    }
    return Boolean(node.message && typeof node.message === 'object');
  }

  function isVisibleMessageNode(node) {
    if (!isMessageNode(node)) return false;
    const role = node.message.author?.role;
    // System or tool nodes don't count towards the user's "message limit"
    return role === 'user' || role === 'assistant';
  }

  function buildPath(mapping, currentNode) {
    const path = [];
    let id = currentNode;
    const guard = new Set();
    while (id && mapping[id] && !guard.has(id)) {
      guard.add(id);
      path.unshift(id);
      id = mapping[id].parent;
    }
    return path;
  }

  function cloneNode(node) {
    return JSON.parse(JSON.stringify(node));
  }

  function trimConversationPayload(payload) {
    if (!payload || !payload.mapping || !payload.current_node) return null;

    // Save full original history to RAG memory before trimming
    saveToRagStore(payload);

    const mapping = payload.mapping;
    lastCurrentNode = payload.current_node; // Capture node for context
    const path = buildPath(mapping, payload.current_node);
    if (path.length === 0) return null;

    const visibleIds = path.filter(id => isVisibleMessageNode(mapping[id]));
    const extra = parseExtra();
    const limit = settings.limit + extra;

    const keptSet = new Set();
    // Keep root and potentially first system prompt (first 2 nodes)
    path.slice(0, 2).forEach(id => keptSet.add(id));

    // Determine exactly how many latest messages to keep (bubble-based)
    const targetSubset = visibleIds.slice(-limit);
    if (targetSubset.length > 0) {
      const firstId = targetSubset[0];
      const pathIdx = path.indexOf(firstId);
      if (pathIdx >= 0) {
        path.slice(pathIdx).forEach(id => keptSet.add(id));
      }
    }

    // Always keep starred path
    const starredIds = Array.isArray(settings.starredIds) ? settings.starredIds : [];
    const url = new URL(location.href);
    const convId = url.pathname.split('/').pop();
    const currentConvStars = starredIds.filter(s => s.convId === convId).map(s => s.messageId);

    currentConvStars.forEach(starId => {
      if (mapping[starId]) {
        keptSet.add(starId);
      }
    });

    // Build new mapping
    const newMapping = {};
    Object.keys(mapping).forEach(id => {
      if (keptSet.has(id)) {
        const node = cloneNode(mapping[id]);
        node.children = (node.children || []).filter(c => keptSet.has(c));
        if (node.parent && !keptSet.has(node.parent)) {
          let p = node.parent;
          while (p && mapping[p] && !keptSet.has(p)) p = mapping[p].parent;
          node.parent = p || null;
        }
        newMapping[id] = node;
      }
    });

    activeKeptIds = Array.from(keptSet);
    const finalRendered = activeKeptIds.filter(id => isVisibleMessageNode(mapping[id])).length;
    console.log(`[CGPTOpt] Trim Done. Visible kept: ${finalRendered}, Total path: ${path.length}`);

    // Set conversation ID if not already set
    if (convId && convId.length > 10) lastConversationId = convId;

    let root = payload.root;
    if (!keptSet.has(root)) root = path.find(id => keptSet.has(id)) || Array.from(keptSet)[0];

    return {
      json: { ...payload, mapping: newMapping, root, current_node: payload.current_node },
      status: { layoutSupported: true, totalMessages: visibleIds.length, renderedMessages: finalRendered, hiddenMessages: Math.max(0, visibleIds.length - finalRendered), hasOlderMessages: visibleIds.length > finalRendered, extraMessages: extra }
    };
  }

  function resetExtraAfterNewPrompt(url, method, bodyStr) {
    if (method !== 'POST') {
      return;
    }
    if (!/\/backend-api\/conversation(\?|$)/.test(url)) {
      return;
    }
    // Update last model slug from real requests
    try {
      if (bodyStr) {
        const body = JSON.parse(bodyStr);
        if (body.model) lastModelSlug = body.model;
      }
    } catch (e) { }

    try {
      localStorage.setItem(EXTRA_KEY, JSON.stringify({ url: location.href, extra: 0 }));
    } catch (error) {
      return;
    }
  }

  function patchFetch() {
    if (window.__cgptoptFetchPatched) {
      return;
    }
    window.__cgptoptFetchPatched = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1] || {};
      const url = input instanceof Request ? input.url : String(input);
      const method = (init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();

      // DEBUG: console.log('[CGPTOpt] Fetching:', url, method);

      // Aggressive Token/Header Capture (Before Request)
      if (url.includes('/backend-api/')) {
        let currentAuth = null;
        let hObj = null;

        if (init.headers) {
          hObj = new Headers(init.headers);
          currentAuth = hObj.get('Authorization') || hObj.get('X-Authorization');
        }
        if (!currentAuth && input instanceof Request) {
          hObj = input.headers;
          currentAuth = hObj.get('Authorization') || hObj.get('X-Authorization');
        }

        if (currentAuth && authToken !== currentAuth) {
          const authObj = Object.fromEntries(new Headers(hObj).entries());
          delete authObj['content-type'];
          delete authObj['content-length'];

          // Keep ONLY the most critical headers. Let the browser handle the rest (cookies, origin, etc.)
          const criticalHeaders = ['authorization', 'openai-sentinel-chat-token', 'openai-sentinel-chat-requirements-token', 'oai-device-id'];
          const cleaned = {};
          Object.keys(authHeaders).forEach(key => {
            const k = key.toLowerCase();
            if (criticalHeaders.includes(k)) {
              cleaned[k] = authHeaders[key];
            }
          });
          authHeaders = cleaned;
          authToken = currentAuth; // Capture full token
          console.log('[CGPTOpt] Aggressive Header Capture Success!');
        }
      }

      // DEEP LOOK: Removed original direct-fetch optimization logic to avoid 403 and conflict with Stealth Tab.
      // We only keep the token capture for background usage.
      if (url.includes('/backend-api/')) {
        let auth = null;
        if (init && init.headers) {
          const h = new Headers(init.headers);
          auth = h.get('Authorization') || h.get('X-Authorization');
        }
        if (!auth && input instanceof Request) {
          auth = input.headers.get('Authorization') || input.headers.get('X-Authorization');
        }

        if (auth && (authHeaders?.authorization !== auth)) {
          authHeaders = Object.fromEntries(new Headers(init.headers || input.headers).entries());
          authToken = auth;
          console.log('[CGPTOpt] Auth Token captured for background sync.');
        }
      }

      // Detect Conversation Change for Worker Reset
      const convMatch = url.match(/\/backend-api\/conversation\/([a-zA-Z0-9-]+)/);
      if (convMatch && method === 'GET') {
        const newId = convMatch[1];
        if (lastConversationId && lastConversationId !== newId) {
          console.log('[CGPTOpt] Conversation changed. Resetting worker...');
          window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' }, '*');
        }
        lastConversationId = newId;
      }

      resetExtraAfterNewPrompt(url, method, init.body);

      // Check if it's a new prompt POST request to inject RAG context
      if (settings.enabled && settings.autoTrim && method === 'POST' && /\/backend-api\/conversation(\?|$)/.test(url)) {
        try {
          if (init.body) {
            const body = JSON.parse(init.body);
            if (body.messages && body.messages[0] && body.messages[0].content && body.messages[0].content.parts) {
              const userPrompt = body.messages[0].content.parts[0];
              const convId = body.conversation_id || new URL(location.href).pathname.split('/').pop();
              
              if (userPrompt && convId && convId.length > 10) {
                const relevantDocs = searchRagStore(userPrompt, convId, activeKeptIds);
                if (relevantDocs.length > 0) {
                  console.log(
                    `%c[CGPTOpt - RAG] 🧠 EŞLEŞME TESPİT EDİLDİ!\n` +
                    `%cKullanıcı Mesajı: "${userPrompt.substring(0, 80)}${userPrompt.length > 80 ? '...' : ''}"\n` +
                    `Arşivden Geri Çağrılan İlgili Mesajlar:\n` +
                    relevantDocs.map((d, i) => `  [Belge ${i+1}] Yazar: ${d.role === 'user' ? 'Kullanıcı' : 'Asistan'} (ID: ${d.id.substring(0,8)}...)\n   İçerik: "${d.text.substring(0, 150)}${d.text.length > 150 ? '...' : ''}"`).join('\n'),
                    "color: #fbbf24; font-weight: bold; font-size: 13px;",
                    "color: #a3e635; font-size: 11px;"
                  );
                  
                  let ragContext = "";
                  if (settings.optimizerLanguage === 'tr') {
                    ragContext = "\n\n--- Bilgi Hafızası (RAG - Geçmişteki İlgili Mesajlar) ---\n" +
                      relevantDocs.map(d => `* Yazan: ${d.role === 'user' ? 'Kullanıcı' : 'Asistan'}\n  İçerik: ${d.text.substring(0, 400)}${d.text.length > 400 ? '...' : ''}`).join('\n') +
                      "\n-----------------------------------------------------";
                  } else {
                    ragContext = "\n\n--- Memory Archive (RAG - Relevant Past Messages) ---\n" +
                      relevantDocs.map(d => `* Author: ${d.role === 'user' ? 'User' : 'Assistant'}\n  Content: ${d.text.substring(0, 400)}${d.text.length > 400 ? '...' : ''}`).join('\n') +
                      "\n-----------------------------------------------------";
                  }
                  
                  body.messages[0].content.parts[0] = userPrompt + ragContext;
                  init.body = JSON.stringify(body);
                  
                  // Show a premium visual notification (toast) to user that RAG helped
                  window.postMessage({
                    source: 'cgpt_optimizer_main',
                    type: 'cgptopt-status-toast',
                    payload: { message: settings.optimizerLanguage === 'tr' ? "🧠 Geçmiş mesajlar RAG ile hatırlandı!" : "🧠 Past messages recalled via RAG!" }
                  }, '*');
                }
              }
            }
          }
        } catch (e) {
          console.error('[CGPTOpt] RAG injection failed', e);
        }
      }

      if (!(settings.enabled && settings.autoTrim && isConversationGet(url, method))) {
        return originalFetch(...args);
      }

      console.log('[CGPTOpt] Intercepting conversation fetch for trimming...');
      const response = await originalFetch(...args);

      try {
        const text = await response.clone().text();
        const parsed = JSON.parse(text);
        currentMapping = parsed.mapping;
        const trimmed = trimConversationPayload(parsed);
        
        if (!trimmed) {
          postStatus({ layoutSupported: false });
          return response;
        }

        postStatus(trimmed.status);

        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');

        return new Response(JSON.stringify(trimmed.json), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (error) {
        postStatus({ layoutSupported: false });
        return response;
      }
    };
  }

  let currentMapping = null;
  let activeKeptIds = [];

function normalizeText(text) {
  if (!text) return '';
  try {
    return text.toString().toLocaleLowerCase('tr-TR')
      .replace(/[\s\n\r\t]+/g, ' ') // Handle all whitespace
      .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, '') // Include all Turkish characters
      .trim();
  } catch (e) {
    // Fallback to standard lowercase if locale fails
    return text.toString().toLowerCase()
      .replace(/[\s\n\r\t]+/g, ' ')
      .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, '')
      .trim();
  }
}

/*
 * Purpose:      Saves full conversation messages to local storage for RAG search
 * Inputs:       payload (object)
 * Outputs:      none
 * Dependencies: localStorage, buildPath, isVisibleMessageNode
 * Usage:        Called in trimConversationPayload before trimming
 */
function saveToRagStore(payload) {
  try {
    const url = new URL(location.href);
    const convId = url.pathname.split('/').pop();
    if (!convId || convId.length < 10) return;

    const mapping = payload.mapping;
    const path = buildPath(mapping, payload.current_node);
    const messages = path
      .filter(id => isVisibleMessageNode(mapping[id]))
      .map(id => {
        const node = mapping[id];
        const role = node.message.author.role;
        const parts = node.message.content.parts || [];
        const text = parts.join(' ').trim();
        return { id, role, text, timestamp: Date.now() };
      });

    if (messages.length > 0) {
      localStorage.setItem(`cgptopt_rag_${convId}`, JSON.stringify(messages));
      console.log(`[CGPTOpt] RAG: Saved ${messages.length} messages for conversation ${convId}`);
    }
  } catch (e) {
    console.error('[CGPTOpt] RAG save failed', e);
  }
}

/*
 * Purpose:      Searches RAG memory for relevant past messages not in current context
 * Inputs:       queryText (string), convId (string), currentKeptIds (array of string)
 * Outputs:      Array of relevant past messages
 * Dependencies: localStorage, normalizeText
 * Usage:        Called in patchFetch before sending new prompt
 */
function searchRagStore(queryText, convId, currentKeptIds) {
  try {
    const raw = localStorage.getItem(`cgptopt_rag_${convId}`);
    if (!raw) return [];
    const messages = JSON.parse(raw);
    if (!Array.isArray(messages)) return [];

    const queryNormalized = normalizeText(queryText);
    const queryTokens = queryNormalized.split(/\s+/).filter(t => t.length > 2);
    if (queryTokens.length === 0) return [];

    // Turkish and English stop words list to filter out noisy common words
    const stopWords = new Set(['ve', 'bir', 'ama', 'ile', 'de', 'da', 'için', 'bu', 'şu', 'o', 'ki', 'mi', 'mu', 'en', 'ise', 'daha', 'gibi', 'hem', 'her', 'veya', 'ya', 'the', 'and', 'a', 'of', 'to', 'in', 'is', 'it']);
    const queryTerms = queryTokens.filter(t => !stopWords.has(t));
    if (queryTerms.length === 0) return [];

    console.log(
      `%c[CGPTOpt - RAG Search] %cAnalyzing query terms: %o\nSearching through ${messages.length} archived messages in localStorage...`,
      "color: #38bdf8; font-weight: bold;",
      "color: #e2e8f0;",
      queryTerms
    );

    const scored = [];
    messages.forEach(msg => {
      // Only search in messages that are NOT in the active trimmed view (currently kept in ChatGPT DOM)
      if (currentKeptIds.includes(msg.id)) return;

      const textNormalized = normalizeText(msg.text);
      const textTokens = textNormalized.split(/\s+/);
      
      let score = 0;
      queryTerms.forEach(term => {
        // Check for exact matching or fuzzy match
        const count = textTokens.filter(t => t.includes(term) || term.includes(t)).length;
        if (count > 0) {
          const termWeight = Math.min(2, term.length / 3);
          score += count * termWeight;
        }
      });

      if (score > 0) {
        scored.push({ msg, score });
      }
    });

    // Sort by score descending and return top K
    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
      console.log(
        `%c[CGPTOpt - RAG Search] %cMatches found: ${scored.length} messages. Top score: ${scored[0].score}`,
        "color: #38bdf8; font-weight: bold;",
        "color: #a3e635;"
      );
    } else {
      console.log(
        `%c[CGPTOpt - RAG Search] %cNo relevant past messages found for current query terms.`,
        "color: #38bdf8; font-weight: bold;",
        "color: #f43f5e;"
      );
    }
    return scored.slice(0, 2).map(item => item.msg);
  } catch (e) {
    console.error('[CGPTOpt] RAG search failed', e);
    return [];
  }
}

function tagMessages() {
  if (!currentMapping) return;
  // UPDATED: Added more robust selectors for the latest ChatGPT UI
  const articles = document.querySelectorAll('article, [data-testid^="conversation-turn-"], div[class*="ChatMessage"], div[class*="message_wrapper"]');

  articles.forEach(article => {
    if (article.hasAttribute('data-cgptopt-id')) return;

    // UPDATED: Better content extraction, specifically targeting the message content area
    const textNode = article.querySelector('.markdown') || 
                     article.querySelector('[data-message-author-role]') ||
                     article.querySelector('.flex-col.gap-1.md\\:gap-3') ||
                     article.querySelector('div[class*="content"]') ||
                     article;
                     
    const domText = normalizeText(textNode.textContent);
    if (domText.length < 3) return; // Allow shorter messages to be tagged

    const match = Object.entries(currentMapping).find(([id, node]) => {
      if (!node.message || !node.message.content || !node.message.content.parts) return false;
      const partText = normalizeText(node.message.content.parts.join(' '));
      if (partText.length < 3) return false;

      // Fuzzy matching: check if text overlaps significantly
      return partText.includes(domText) || domText.includes(partText) || 
             (domText.length > 20 && partText.substring(0, 50).includes(domText.substring(0, 50)));
    });

    if (match) {
      article.setAttribute('data-cgptopt-id', match[0]);
      // Also try to set standard attributes if they are missing
      if (!article.hasAttribute('data-message-id')) {
        article.setAttribute('data-message-id', match[0]);
      }
      console.log(`[CGPTOpt] Tagged message ${match[0]}`);
    }
  });
}

// Run tagging periodically
setInterval(tagMessages, 2000);

window.addEventListener('cgptopt-config', (event) => {
  const incoming = event && event.detail ? event.detail : null;
  if (!incoming || typeof incoming !== 'object') {
    return;
  }
  settings = sanitize({ ...settings, ...incoming });
  postStatus({ active: Boolean(settings.enabled && settings.autoTrim) });
});



function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function getContextMessages() {
  if (!currentMapping || !lastCurrentNode) {
    console.log('[CGPTOpt] Context missing:', { hasMapping: !!currentMapping, node: lastCurrentNode });
    return [];
  }
  
  const path = buildPath(currentMapping, lastCurrentNode);
  const visibleIds = path.filter(id => isVisibleMessageNode(currentMapping[id]));
  
  // Get last 5 messages for context
  const last5Ids = visibleIds.slice(-5);
  return last5Ids.map(id => {
    const node = currentMapping[id];
    const role = node.message.author.role;
    const parts = node.message.content.parts || [];
    const text = parts.join(' ').substring(0, 1000); // Truncate very long messages
    return { role, text };
  });
}

async function optimizePrompt(text) {
  if (!text || text.trim().length === 0) return null;

  return new Promise((resolve) => {
    if (!settings.groq_key || settings.groq_key.trim().length === 0) {
      window.postMessage({ 
        source: 'cgpt_optimizer_main', 
        type: 'cgptopt-status-toast', 
        payload: { message: settings.optimizerLanguage === 'tr' ? "Hata: API Anahtarı girilmemiş! Lütfen ayarlara gidin." : "Error: API Key missing! Please go to settings." } 
      }, '*');
      resolve(null);
      return;
    }

    const requestId = generateUUID();
    isOptimizing = true;
    const isTr = settings.optimizerLanguage === 'tr';
    const context = getContextMessages();
    
    // Command detection
    let command = null;
    let userText = text.trim();
    if (userText.startsWith('/')) {
      const firstSpace = userText.indexOf(' ');
      if (firstSpace > 0) {
        command = userText.substring(0, firstSpace).toLowerCase();
        userText = userText.substring(firstSpace).trim();
      } else {
        command = userText.toLowerCase();
        userText = "";
      }
    }

    // Show overlay with command specific message
    let statusMsg = isTr ? "Sihirli Değnek Hazırlanıyor..." : "Magic Wand Preparing...";
    if (command === '/image') statusMsg = isTr ? "Görsel Promptu Hazırlanıyor..." : "Image Prompt Preparing...";
    else if (command === '/makale') statusMsg = isTr ? "Makale Promptu Hazırlanıyor..." : "Article Prompt Preparing...";
    else if (command === '/mail') statusMsg = isTr ? "E-posta Promptu Hazırlanıyor..." : "Email Prompt Preparing...";

    window.postMessage({ 
      source: 'cgpt_optimizer_main', 
      type: 'cgptopt-ui-lock', 
      payload: { active: true, message: statusMsg } 
    }, '*');

    let contextStr = "";
    if (context.length > 0) {
      contextStr = "\n\n### CURRENT CONVERSATION CONTEXT:\n" + 
        context.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    }

    // Role and Template Definitions
    const PROMPT_STYLES = {
      '/spec': {
        icon: '📐', tr: 'SPEC Yöntemi', en: 'SPEC Method',
        desc: 'Specificity, Purpose, Evidence, Constraints odaklı yapılandırılmış prompt.'
      },
      '/cot': {
        icon: '🧠', tr: 'Chain of Thought', en: 'Chain of Thought',
        desc: 'Adım adım düşünme ve mantık yürütme sürecini tetikler.'
      },
      '/feynman': {
        icon: '👶', tr: 'Feynman Tekniği', en: 'Feynman Technique',
        desc: 'Karmaşık konuları en basit haliyle, bir çocuğa anlatır gibi açıklar.'
      },
      '/socratic': {
        icon: '🏛️', tr: 'Sokratik Yöntem', en: 'Socratic Method',
        desc: 'Soru-cevap yoluyla derinlemesine öğrenme ve keşif sağlar.'
      },
      '/step': {
        icon: '🪜', tr: 'Adım Adım', en: 'Step-by-Step',
        desc: 'Görevi küçük, yönetilebilir parçalara ayırarak ilerler.'
      },
      '/tot': {
        icon: '🌳', tr: 'Tree of Thoughts', en: 'Tree of Thoughts',
        desc: 'Farklı çözüm yollarını dallandırarak en iyisini bulur.'
      },
      '/first': {
        icon: '🧱', tr: 'İlk İlkeler', en: 'First Principles',
        desc: 'Konuyu temel gerçeklerine indirgeyerek yeniden inşa eder.'
      },
      '/few': {
        icon: '💡', tr: 'Few-Shot', en: 'Few-Shot',
        desc: 'Örnekler vererek yapay zekanın istenen formatı anlamasını sağlar.'
      },
      '/expert': {
        icon: '🎓', tr: 'Uzman Görüşü', en: 'Expert Perspective',
        desc: 'Konuyu ilgili alanın en iyisi olan bir uzman gözüyle ele alır.'
      },
      '/debate': {
        icon: '⚖️', tr: 'Münazara Modu', en: 'Debate Mode',
        desc: 'Konuyu farklı taraflardan savunarak objektif analiz yapar.'
      },
      '/table': {
        icon: '📊', tr: 'Tablo Formatı', en: 'Tabular Output',
        desc: 'Verileri ve açıklamaları düzenli tablolar halinde sunar.'
      },
      '/critic': {
        icon: '🧐', tr: 'Eleştirel Analiz', en: 'Critical Analysis',
        desc: 'Kendi yanıtını eleştirip geliştirerek en mükemmel hali sunar.'
      },
      '/analog': {
        icon: '🔗', tr: 'Analoji Kurma', en: 'Analogy Making',
        desc: 'Soyut kavramları somut benzerliklerle açıklar.'
      },
      '/code': {
        icon: '💻', tr: 'Kod Mantığı', en: 'Code Logic',
        desc: 'Açıklamaları algoritma ve mantıksal akış şeması şeklinde sunar.'
      },
      '/negative': {
        icon: '🚫', tr: 'Negatif Sınır', en: 'Negative Constraints',
        desc: 'Nelerin yapılmaması gerektiğini belirterek hassas sonuç üretir.'
      },
      '/creative': {
        icon: '🎭', tr: 'Yaratıcı Hikaye', en: 'Creative Story',
        desc: 'Bilgiyi ilgi çekici bir kurgu veya hikaye içinde sunar.'
      },
      '/risks': {
        icon: '⚠️', tr: 'Risk Analizi', en: 'Risk Analysis',
        desc: 'Konunun potansiyel tehlikelerini ve çözüm yollarını listeler.'
      },
      '/future': {
        icon: '🔮', tr: 'Gelecek Öngörüsü', en: 'Future Foresight',
        desc: 'Trendlere dayanarak konunun gelecekteki gelişimini tahmin eder.'
      },
      '/summary': {
        icon: '📉', tr: 'Yönetici Özeti', en: 'Executive Summary',
        desc: 'Sadece en kritik bilgileri içeren kısa ve öz rapor sunar.'
      },
      '/interact': {
        icon: '💬', tr: 'Etkileşimli', en: 'Interactive Mode',
        desc: 'Yanıt vermeden önce eksik bilgileri size sorar.'
      }
    };

    const roles = {
      '/image': {
        en: "Senior AI Image Prompt Engineer (Midjourney/DALL-E Expert)",
        tr: "Kıdemli Yapay Zeka Görsel Prompt Mühendisi (Midjourney/DALL-E Uzmanı)"
      },
      '/makale': {
        en: "Expert SEO Content Writer and Strategist",
        tr: "Uzman SEO İçerik Yazarı ve Stratejisti"
      },
      '/mail': {
        en: "Professional Corporate Communications Specialist",
        tr: "Profesyonel Kurumsal İletişim Uzmanı"
      },
      '/spec': {
        en: "Technical Document Specialist using SPEC Framework",
        tr: "SPEC Çerçevesini kullanan Teknik Doküman Uzmanı"
      },
      '/cot': {
        en: "Logical Reasoning Specialist using Chain of Thought",
        tr: "Chain of Thought kullanan Mantıksal Akıl Yürütme Uzmanı"
      },
      '/feynman': {
        en: "Expert Educator specializing in the Feynman Technique",
        tr: "Feynman Tekniği konusunda uzmanlaşmış Eğitimci"
      },
      '/socratic': {
        en: "Philosophical Inquirer using the Socratic Method",
        tr: "Sokratik Yöntemi kullanan Felsefi Sorgulayıcı"
      },
      '/tot': {
        en: "Strategic Planner using Tree of Thoughts",
        tr: "Tree of Thoughts kullanan Stratejik Planlamacı"
      },
      default: {
        en: "Senior Prompt Engineer",
        tr: "Kıdemli Prompt Mühendisi"
      }
    };

    const selectedRole = roles[command] || roles.default;
    const roleName = isTr ? selectedRole.tr : selectedRole.en;
    const langRule = isTr ? "OUTPUT LANGUAGE: Strictly TÜRKÇE." : "OUTPUT LANGUAGE: Strictly ENGLISH.";

    let taskInstruction = "";
    if (command === '/image') {
      taskInstruction = isTr ? 
        "GÖREV: Kullanıcının görsel fikrini Midjourney veya DALL-E için son derece detaylı, sanatsal ve teknik (ışık, lens, stil) bir prompta dönüştür." :
        "TASK: Transform the user's visual idea into a highly detailed, artistic, and technical (lighting, lens, style) prompt for Midjourney or DALL-E.";
    } else if (command === '/makale') {
      taskInstruction = isTr ?
        "GÖREV: Kullanıcının konusunu SEO uyumlu, başlıkları belirlenmiş, derinlemesine bir makale yazdıracak profesyonel bir prompta dönüştür." :
        "TASK: Transform the user's topic into a professional prompt for writing an in-depth, SEO-optimized article with predefined headings.";
    } else if (command === '/mail') {
      taskInstruction = isTr ?
        "GÖREV: Kullanıcının mesajını profesyonel, nazik ve etkileyici bir kurumsal e-posta taslağı oluşturacak mükemmel bir prompta dönüştür." :
        "TASK: Transform the user's message into a perfect prompt for creating a professional, polite, and impactful corporate email draft.";
    } else if (command === '/spec') {
      taskInstruction = isTr ?
        "YÖNTEM: SPEC (Specificity, Purpose, Evidence, Constraints). Kullanıcının isteğini; Belirginlik, Amaç, Kanıt Gereksinimi ve Kısıtlamalar içeren çok katmanlı bir teknik prompta dönüştür." :
        "METHOD: SPEC (Specificity, Purpose, Evidence, Constraints). Transform the request into a multi-layered technical prompt focusing on Specificity, Purpose, Evidence, and Constraints.";
    } else if (command === '/cot') {
      taskInstruction = isTr ?
        "YÖNTEM: Chain of Thought (CoT). Yapay zekanın sonucu vermeden önce adım adım akıl yürütmesini ve her aşamayı açıklamasını sağlayacak bir prompt oluştur." :
        "METHOD: Chain of Thought (CoT). Create a prompt that forces the AI to reason step-by-step and explain each stage before providing the final output.";
    } else if (command === '/feynman') {
      taskInstruction = isTr ?
        "YÖNTEM: Feynman Tekniği. Konuyu sanki 5 yaşındaki bir çocuğa veya teknik bilgisi olmayan birine anlatıyormuş gibi, analojiler kullanarak basitleştirecek bir prompt hazırla." :
        "METHOD: Feynman Technique. Prepare a prompt to explain the topic simply using analogies, as if explaining to a 5-year-old or a non-technical person.";
    } else if (command === '/socratic') {
      taskInstruction = isTr ?
        "YÖNTEM: Sokratik Yöntem. Yapay zekanın doğrudan cevap vermek yerine, kullanıcıya doğru soruları sorarak konuyu keşfetmesini sağlayacak bir prompt oluştur." :
        "METHOD: Socratic Method. Create a prompt where the AI asks the user the right questions to explore the topic instead of giving a direct answer.";
    } else if (command === '/tot') {
      taskInstruction = isTr ?
        "YÖNTEM: Tree of Thoughts. Sorunu farklı açılardan ele alacak, birden fazla çözüm yolu (dallar) geliştirecek ve en mantıklı olanı seçecek bir prompt hazırla." :
        "METHOD: Tree of Thoughts. Prepare a prompt that tackles the problem from multiple angles, develops various solution paths (branches), and selects the most logical one.";
    } else if (command === '/first') {
      taskInstruction = isTr ?
        "YÖNTEM: First Principles (İlk İlkeler). Mevcut varsayımları reddeden, konuyu en temel fiziksel veya mantıksal gerçeklerine indirgeyip oradan inşa eden bir prompt oluştur." :
        "METHOD: First Principles. Create a prompt that rejects assumptions, breaks the topic down to its fundamental truths, and builds back up from there.";
    } else if (command === '/expert') {
      taskInstruction = isTr ?
        "YÖNTEM: Expert Perspective. Konuyu o alanın dünyaca ünlü bir otoritesi gözüyle, derin teknik terimler ve vaka analizleriyle ele alacak bir prompt hazırla." :
        "METHOD: Expert Perspective. Prepare a prompt to handle the topic as a world-renowned authority in that field, using deep technical terms and case studies.";
    } else if (command === '/table') {
      taskInstruction = isTr ?
        "YÖNTEM: Tabular Analysis. Bilgileri karşılaştırmalı tablolar, kategorize edilmiş sütunlar ve yapılandırılmış veri formatında sunacak bir prompt oluştur." :
        "METHOD: Tabular Analysis. Create a prompt to present information in comparative tables, categorized columns, and structured data formats.";
    } else if (command === '/critic') {
      taskInstruction = isTr ?
        "YÖNTEM: Self-Criticism/Iterative. Yapay zekanın önce bir cevap üretmesini, sonra onu en sert şekilde eleştirmesini ve en sonunda mükemmel hali sunmasını sağlayan bir prompt yaz." :
        "METHOD: Self-Criticism/Iterative. Write a prompt that forces the AI to produce an initial answer, criticize it harshly, and then provide a perfected final version.";
    } else if (command === '/code') {
      taskInstruction = isTr ?
        "YÖNTEM: Code Logic. Konuyu bir algoritma, akış şeması veya psödo-kod mantığıyla, mantıksal kapılar kullanarak açıklayacak bir prompt oluştur." :
        "METHOD: Code Logic. Create a prompt to explain the topic using an algorithm, flowchart, or pseudo-code logic with logical gates.";
    } else if (command === '/few') {
      taskInstruction = isTr ?
        "YÖNTEM: Few-Shot Prompting. Kullanıcının isteğini, yapay zekaya 2-3 adet somut örnek (Girdi -> Çıktı) vererek formatı öğreten bir prompta dönüştür." :
        "METHOD: Few-Shot Prompting. Transform the request into a prompt that provides 2-3 concrete examples (Input -> Output) to teach the AI the desired format.";
    } else if (command === '/debate') {
      taskInstruction = isTr ?
        "YÖNTEM: Debate Mode. Konuyu hem savunan hem de eleştiren iki farklı uzman görüşü oluşturacak ve sonunda sentez yapacak bir prompt hazırla." :
        "METHOD: Debate Mode. Prepare a prompt that creates two different expert opinions (pro and con) and synthesizes them at the end.";
    } else if (command === '/analog') {
      taskInstruction = isTr ?
        "YÖNTEM: Analogy Engine. Soyut ve zor kavramları, herkesin bildiği somut günlük hayat örnekleri ve analojilerle açıklayacak bir prompt oluştur." :
        "METHOD: Analogy Engine. Create a prompt to explain abstract and difficult concepts using concrete everyday analogies that everyone understands.";
    } else if (command === '/negative') {
      taskInstruction = isTr ?
        "YÖNTEM: Negative Constraints. Yapılacaklardan ziyade kesinlikle *yapılmaması* gerekenleri (yasaklı kelimeler, tarzlar, konular) listeleyen bir prompt yaz." :
        "METHOD: Negative Constraints. Write a prompt that lists what should *definitely not* be done (forbidden words, styles, topics) rather than what should be done.";
    } else if (command === '/creative') {
      taskInstruction = isTr ?
        "YÖNTEM: Creative Narrative. Bilgiyi sıkıcı bir metin yerine, sürükleyici bir hikaye, senaryo veya kurgusal bir diyalog içinde sunacak bir prompt hazırla." :
        "METHOD: Creative Narrative. Prepare a prompt to present information in an engaging story, script, or fictional dialogue instead of boring text.";
    } else if (command === '/risks') {
      taskInstruction = isTr ?
        "YÖNTEM: Risk & Mitigation. Konunun potansiyel zayıf noktalarını, risklerini ve bu riskleri nasıl minimize edeceğini anlatan bir prompt oluştur." :
        "METHOD: Risk & Mitigation. Create a prompt that explains the potential weaknesses and risks of the topic and how to minimize them.";
    } else if (command === '/future') {
      taskInstruction = isTr ?
        "YÖNTEM: Future Foresight. Konunun 5, 10 ve 20 yıl sonraki halini trendlere ve verilere dayanarak tahmin eden spekülatif bir prompt yaz." :
        "METHOD: Future Foresight. Write a speculative prompt that predicts the state of the topic in 5, 10, and 20 years based on trends and data.";
    } else if (command === '/summary') {
      taskInstruction = isTr ?
        "YÖNTEM: Executive Summary. Uzun konuları sadece karar vericilerin bilmesi gereken en kritik noktalarla özetleyen (Bullet points) bir prompt hazırla." :
        "METHOD: Executive Summary. Prepare a prompt that summarizes long topics into the most critical points (bullet points) that decision-makers need to know.";
    } else if (command === '/interact') {
      taskInstruction = isTr ?
        "YÖNTEM: Interactive Discovery. Yapay zekanın yanıt vermeden önce, kullanıcıya konuyu daha iyi anlamak için 3 adet derinlemesine soru sormasını sağlayan bir prompt oluştur." :
        "METHOD: Interactive Discovery. Create a prompt where the AI asks the user 3 in-depth questions to better understand the topic before providing a final answer.";
    } else {
      taskInstruction = isTr ?
        "GÖREV: Kullanıcının ham metnini dünya standartlarında, etkili ve yapılandırılmış bir yapay zeka promptuna dönüştür." :
        "TASK: Transform the user's raw input into a world-class, effective, and structured AI prompt.";
    }

    const systemPrompt = `You are a ${roleName}. ${taskInstruction}

${contextStr}

### OBJECTIVE:
Rewrite the provided text into a highly effective, professional, and structured prompt for an AI. 

### INSTRUCTIONS:
1. **Analyze:** Think about the user's intent, the required domain expertise, and the best persona.
2. **Refine:** Use professional frameworks (like CO-STAR).
3. **Format:** Output ONLY the final prompt inside <FINAL_PROMPT> tags.

### CRITICAL RULES:
- ${langRule}
- RETURN the final result inside <FINAL_PROMPT> tags.
- NO commentary outside the tags.
- Ensure the result is a prompt *to be given to an AI*, not the final answer itself.

### USER INPUT TO ENHANCE:
"${userText}"`;

    const instruction = systemPrompt;

    // Callback for result
    const handleResult = (event) => {
      if (event.data.source === 'cgpt_optimizer_content' && event.data.type === 'cgptopt-optimize-response') {
        if (event.data.payload.requestId === requestId) {
          window.removeEventListener('message', handleResult);
          cleanupOptimization();
          if (event.data.payload.success) {
            // Extract from XML tag if present
            let optimized = event.data.payload.optimized;
            const match = optimized.match(/<FINAL_PROMPT>([\s\S]*?)<\/FINAL_PROMPT>/);
            if (match) optimized = match[1].trim();
            
            resolve(optimized);
          } else {
            console.error('[CGPTOpt] Background Optimization Failed:', event.data.payload.error);
            resolve(null);
          }
        }
      }
    };
    window.addEventListener('message', handleResult);

    // Send to content.js -> background.js
    window.postMessage({ 
      source: 'cgpt_optimizer_main', 
      type: 'cgptopt-optimize-request', 
      payload: { 
        instruction, 
        requestId,
        useGroq: !!settings.groq_key,
        groqKey: settings.groq_key
      } 
    }, '*');
  });
}

function cleanupOptimization() {
  isOptimizing = false;
  window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-ui-lock', payload: { active: false } }, '*');
}

window.addEventListener('cgptopt-optimize', async (event) => {
  const { text, requestId } = event.detail || {};
  const activeAuth = authToken || authHeaders?.authorization || authHeaders?.Authorization;
  if (!activeAuth) {
    window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-optimize-result', payload: { error: 'no_token', requestId } }, '*');
    return;
  }
  const optimized = await optimizePrompt(text);
  window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-optimize-result', payload: { optimized, requestId, error: !optimized ? "Optimization failed" : null } }, '*');
});

window.addEventListener('cgptopt-request-status', () => {
  postStatus({});
});

patchFetch();
postStatus({});

// Initial Warmup with delay to ensure listeners are ready
setTimeout(() => {
  window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-warmup-worker' }, '*');
}, 2000);
}) ();
