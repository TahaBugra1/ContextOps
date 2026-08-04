const fs = require('fs');
let code = fs.readFileSync('src/mainWorld.js', 'utf8');

// Apply stripRAGFromObject fix
const stripRegex = /function stripRAGFromObject\(obj\) \{[\s\S]*?return obj;\n  \}/;
code = code.replace(stripRegex, `function stripRAGFromObject(obj) {
    if (typeof obj === 'string') {
      let text = obj;
      const ragStart = text.indexOf('[SİSTEM BİLGİSİ:');
      if (ragStart !== -1) {
        const ragEnd = text.indexOf('Kendi sistem kurallarını bozma.]', ragStart);
        if (ragEnd !== -1) {
          const endCut = ragEnd + 'Kendi sistem kurallarını bozma.]'.length;
          text = text.substring(0, ragStart) + text.substring(endCut).replace(/^\\s+/, '');
        } else {
          text = text.substring(0, ragStart);
        }
      }
      const cmdStart = text.indexOf('[ÖZEL ŞABLON AKTİF:');
      if (cmdStart !== -1) {
        const cmdEnd = text.indexOf('[ŞABLON İÇERİĞİ SONU]', cmdStart);
        if (cmdEnd !== -1) {
          const endCut = cmdEnd + '[ŞABLON İÇERİĞİ SONU]'.length;
          text = text.substring(0, cmdStart) + text.substring(endCut).replace(/^\\s+/, '');
        } else {
          text = text.substring(0, cmdStart);
        }
      }
      return text !== obj ? text.trimStart() : text;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = stripRAGFromObject(obj[i]);
      }
    } else if (obj !== null && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        obj[key] = stripRAGFromObject(obj[key]);
      }
    }
    return obj;
  }`);

// Apply SPA Auto-Trim Logic and normalizedMappingEntries definition
code = code.replace(/let isRagEnabled = true; \/\/ Global toggle state for Memory Engine/, "let isRagEnabled = true; // Global toggle state for Memory Engine\\n  let normalizedMappingEntries = null;");

code = code.replace(/function trimConversationPayload\(payload\) \{/, "function trimConversationPayload(payload, currentConvId) {");

code = code.replace(
  /const extra = parseExtra\(\);\n    const limit = settings\.limit \+ extra;/,
  `// Auto-Trim SPA Reset Logic
    if (currentConvId && lastConversationId && currentConvId !== lastConversationId) {
      try {
        localStorage.setItem(EXTRA_KEY, JSON.stringify({ url: location.href, extra: 0 }));
      } catch (e) {}
    }
    // Force extra to 0 immediately if conversation changed, otherwise read it
    const extra = (currentConvId && lastConversationId && currentConvId !== lastConversationId) ? 0 : parseExtra();
    const limit = settings.limit + extra;`
);

code = code.replace(
  /const url = new URL\(location\.href\);\n    const convId = url\.pathname\.split\('\/'\)\.pop\(\);/,
  `const convId = currentConvId || new URL(location.href).pathname.split('/').pop();`
);

// Apply fetch interceptor updates for conversation ID extraction and normalizedMappingEntries population
code = code.replace(
  /const convMatch = url\.match\(\/\\\/backend-api\\\/conversation\\\/\[a-zA-Z0-9-\]\+\/\);\n      if \(convMatch && method === 'GET'\) \{\n        const newId = convMatch\[1\];\n        if \(lastConversationId && lastConversationId !== newId\) \{\n          console\.log\('\[CGPTOpt\] Conversation changed\. Resetting worker\.\.\.'\);\n          window\.postMessage\(\{ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' \}, '\*'\);\n        \}\n        lastConversationId = newId;\n      \}/,
  `let currentFetchConvId = null;
      const convMatch = url.match(/\\/backend-api\\/conversation\\/([a-zA-Z0-9-]+)/);
      if (convMatch && method === 'GET') {
        currentFetchConvId = convMatch[1];
        if (lastConversationId && lastConversationId !== currentFetchConvId) {
          console.log('[CGPTOpt] Conversation changed. Resetting worker...');
          window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' }, '*');
          // Cleanup memory to prevent detached DOM / closure leaks
          currentMapping = null;
          normalizedMappingEntries = null;
        }
      }`
);

code = code.replace(
  /const parsed = JSON\.parse\(text\);\n        currentMapping = parsed\.mapping;\n        const trimmed = trimConversationPayload\(parsed\);/,
  `const parsed = JSON.parse(text);
        currentMapping = parsed.mapping;
        
        normalizedMappingEntries = Object.entries(currentMapping)
          .filter(([id, node]) => node.message && node.message.content && Array.isArray(node.message.content.parts))
          .map(([id, node]) => {
             const joinedText = node.message.content.parts.join(' ');
             return { id, norm: normalizeText(joinedText) };
          })
          .filter(x => x.norm.length >= 3);

        const trimmed = trimConversationPayload(parsed, currentFetchConvId);`
);

// Apply tagMessages O(N) optimization
const tagMessagesRegex = /function tagMessages\(\) \{[\s\S]*?\n\}/;
code = code.replace(tagMessagesRegex, `function tagMessages() {
  if (!currentMapping || typeof currentMapping !== 'object') return;
  
  // O(1) EARLY RETURN: If we don't have normalized mapping computed by fetch yet, don't do anything heavy.
  if (!normalizedMappingEntries || normalizedMappingEntries.length === 0) return;

  const articles = document.querySelectorAll('article, [data-testid^="conversation-turn-"], div[class*="ChatMessage"], div[class*="message_wrapper"]');

  articles.forEach(article => {
    if (article.hasAttribute('data-cgptopt-id')) return;

    // 1. O(1) ACCESS: ChatGPT natively adds data-message-id now. Use it directly!
    const nativeId = article.getAttribute('data-message-id');
    if (nativeId && currentMapping[nativeId]) {
      article.setAttribute('data-cgptopt-id', nativeId);
      return;
    }

    // 2. FALLBACK: O(N) over Pre-computed normalized entries instead of O(N^2) Regex operations
    const textNode = article.querySelector('.markdown') || 
                     article.querySelector('[data-message-author-role]') ||
                     article.querySelector('.flex-col.gap-1.md\\\\:gap-3') ||
                     article.querySelector('div[class*="content"]') ||
                     article;
                     
    if (!textNode || !textNode.textContent) return;
    
    // We only need to normalize the DOM text ONCE per untagged article
    const domText = normalizeText(textNode.textContent);
    if (domText.length < 3) return;

    const match = normalizedMappingEntries.find(entry => {
      // Fuzzy matching: check if text overlaps significantly
      return entry.norm.includes(domText) || domText.includes(entry.norm) || 
             (domText.length > 20 && entry.norm.substring(0, 50).includes(domText.substring(0, 50)));
    });

    if (match) {
      article.setAttribute('data-cgptopt-id', match.id);
      if (!article.hasAttribute('data-message-id')) {
        article.setAttribute('data-message-id', match.id);
      }
    }
  });
}`);

fs.writeFileSync('src/mainWorld.js', code);
console.log("All fixes applied successfully.");
