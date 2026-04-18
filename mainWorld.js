(() => {
  const CONFIG_KEY = 'cgpt_optimizer_config_v1';
  const STARRED_KEY = 'cgpt_optimizer_starred_v1';
  let authToken = null;
  let authHeaders = {};
  let lastModelSlug = 'gpt-4o';
  let isOptimizing = false;
  let optimizationResolver = null;
  let currentOptimizationRequestId = null;
 // Default fallback
  const EXTRA_KEY = 'cgpt_optimizer_extra_v1';
  const DEFAULTS = {
    enabled: true,
    limit: 5,
    chunkSize: 5,
    autoTrim: true,
    showToolbar: false,
    optimizerEnabled: true,
    optimizerLanguage: 'en'
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

    const mapping = payload.mapping;
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

    const finalRendered = Array.from(keptSet).filter(id => isVisibleMessageNode(mapping[id])).length;
    console.log(`[CGPTOpt] Trim Done. Visible kept: ${finalRendered}, Total path: ${path.length}`);

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

        if (currentAuth) {
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

      resetExtraAfterNewPrompt(url, method, init.body);

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

function normalizeText(text) {
  if (!text) return '';
  return text.toString().toLowerCase()
    .replace(/[\s\n\r]+/g, ' ')
    .replace(/[^\w\sğüşıöç]/g, '')
    .trim();
}

function tagMessages() {
  if (!currentMapping) return;
  const articles = document.querySelectorAll('article, [data-testid^="conversation-turn-"]');

  articles.forEach(article => {
    if (article.hasAttribute('data-cgptopt-id')) return;

    const textNode = article.querySelector('.markdown') || article.querySelector('.flex-col.gap-1.md\\:gap-3') || article;
    const domText = normalizeText(textNode.textContent);
    if (domText.length < 5) return;

    const match = Object.entries(currentMapping).find(([id, node]) => {
      if (!node.message || !node.message.content || !node.message.content.parts) return false;
      const partText = normalizeText(node.message.content.parts.join(' '));
      if (partText.length < 5) return false;

      // Check if one contains a significant portion of the other
      return partText.includes(domText) || domText.includes(partText);
    });

    if (match) {
      article.setAttribute('data-cgptopt-id', match[0]);
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

async function optimizePrompt(text) {
  if (!text || text.trim().length === 0) return null;

  return new Promise((resolve) => {
    const requestId = generateUUID();
    isOptimizing = true;

    // Show overlay
    window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-ui-lock', payload: { active: true } }, '*');

    const isTr = settings.optimizerLanguage === 'tr';
    
    // REDESIGNED: Professional Prompt Engineering Template (CO-STAR Concept)
    const role = isTr ? "Kıdemli Prompt Mühendisi" : "Senior Prompt Engineer";
    const langRule = isTr ? "ÇIKTI DİLİ: Kesinlikle TÜRKÇE olmalıdır." : "OUTPUT LANGUAGE: Strictly ENGLISH.";

    const systemPrompt = `You are a ${role}. Your goal is to transform the user's raw input into a world-class prompt.

### OBJECTIVE:
Rewrite the provided text into a highly effective, professional, and structured prompt for an AI. 

### STRUCTURE TO APPLY:
1. **Persona/Role:** Define who the AI should act as.
2. **Context:** Provide background information/scenario.
3. **Task:** State clearly what needs to be done.
4. **Constraints/Rules:** List negative constraints or style guides.
5. **Output Format:** Define the expected structure (Markdown, Table, etc.).

### CRITICAL RULES:
- ${langRule}
- RETURN ONLY the refined prompt text.
- NO commentary, NO "Here is your prompt", NO conversational fillers.
- Preserve the core intent but elevate the technical depth.

### USER INPUT TO ENHANCE:
"${text}"`;

    const instruction = systemPrompt;

    // Callback for result
    const handleResult = (event) => {
      if (event.data.source === 'cgpt_optimizer_content' && event.data.type === 'cgptopt-optimize-response') {
        if (event.data.payload.requestId === requestId) {
          window.removeEventListener('message', handleResult);
          cleanupOptimization();
          if (event.data.payload.success) {
            resolve(event.data.payload.optimized);
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
      payload: { instruction, requestId } 
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
  window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-optimize-result', payload: { optimized, requestId } }, '*');
});

window.addEventListener('cgptopt-request-status', () => {
  postStatus({});
});

patchFetch();
postStatus({});
}) ();
