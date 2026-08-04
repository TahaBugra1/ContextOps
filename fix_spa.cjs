const fs = require('fs');
let code = fs.readFileSync('src/mainWorld.js', 'utf8');

// 1. Update trimConversationPayload signature and SPA Reset Logic
code = code.replace(
  /function trimConversationPayload\(payload\) \{\n    if \(!payload \|\| !payload\.mapping \|\| !payload\.current_node\) return null;\n\n    const mapping = payload\.mapping;\n    lastCurrentNode = payload\.current_node;\n    const path = buildPath\(mapping, payload\.current_node\);\n    if \(path\.length === 0\) return null;\n\n    const visibleIds = path\.filter\(id => isVisibleMessageNode\(mapping\[id\]\)\);\n    const extra = parseExtra\(\);\n    const limit = settings\.limit \+ extra;\n\n    const keptSet = new Set\(\);/g,
  `function trimConversationPayload(payload, currentConvId) {
    if (!payload || !payload.mapping || !payload.current_node) return null;

    const mapping = payload.mapping;
    lastCurrentNode = payload.current_node; // Capture node for context
    const path = buildPath(mapping, payload.current_node);
    if (path.length === 0) return null;

    const visibleIds = path.filter(id => isVisibleMessageNode(mapping[id]));
    
    // Auto-Trim SPA Reset Logic
    if (currentConvId && lastConversationId && currentConvId !== lastConversationId) {
      try {
        localStorage.setItem(EXTRA_KEY, JSON.stringify({ url: location.href, extra: 0 }));
      } catch (e) {}
    }

    // Force extra to 0 immediately if conversation changed, otherwise read it
    const extra = (currentConvId && lastConversationId && currentConvId !== lastConversationId) ? 0 : parseExtra();
    const limit = settings.limit + extra;

    const keptSet = new Set();`
);

// 2. Update starredIds logic to use currentConvId
code = code.replace(
  /const url = new URL\(location\.href\);\n    const convId = url\.pathname\.split\('\/'\)\.pop\(\);\n    const currentConvStars = starredIds\.filter\(s => s\.convId === convId\)\.map\(s => s\.messageId\);/g,
  `const convId = currentConvId || new URL(location.href).pathname.split('/').pop();
    const currentConvStars = starredIds.filter(s => s.convId === convId).map(s => s.messageId);`
);

// 3. Update lastConversationId setting logic
code = code.replace(
  /\/\/ Set conversation ID if not already set\n    if \(convId && convId\.length > 10\) lastConversationId = convId;/g,
  `// Update last conversation ID
    if (convId && convId.length > 10) lastConversationId = convId;`
);

// 4. Update patchFetch logic to capture currentFetchConvId but not update lastConversationId immediately
code = code.replace(
  /\/\/ Detect Conversation Change for Worker Reset\n      const convMatch = url\.match\(\/\\\/backend-api\\\/conversation\\\/\[a-zA-Z0-9-\]\+\/\);\n      if \(convMatch && method === 'GET'\) \{\n        const newId = convMatch\[1\];\n        if \(lastConversationId && lastConversationId !== newId\) \{\n          console\.log\('\[CGPTOpt\] Conversation changed\. Resetting worker\.\.\.'\);\n          window\.postMessage\(\{ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' \}, '\*'\);\n        \}\n        lastConversationId = newId;\n      \}/g,
  `// Detect Conversation Change for Worker Reset
      let currentFetchConvId = null;
      const convMatch = url.match(/\\/backend-api\\/conversation\\/([a-zA-Z0-9-]+)/);
      if (convMatch && method === 'GET') {
        currentFetchConvId = convMatch[1];
        if (lastConversationId && lastConversationId !== currentFetchConvId) {
          console.log('[CGPTOpt] Conversation changed. Resetting worker...');
          window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' }, '*');
        }
        // Do not update lastConversationId here, let trimConversationPayload do it to ensure trim logic detects the change
      }`
);

// 5. Update the trimConversationPayload call
code = code.replace(
  /\.filter\(x => x\.norm\.length >= 3\);\n        const trimmed = trimConversationPayload\(parsed\);\n        \n        if \(!trimmed\) \{/g,
  `.filter(x => x.norm.length >= 3);
        const trimmed = trimConversationPayload(parsed, currentFetchConvId);
        
        if (!trimmed) {`
);

fs.writeFileSync('src/mainWorld.js', code);
console.log("Applied SPA auto-trim fix.");
