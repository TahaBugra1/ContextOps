const fs = require('fs');
let code = fs.readFileSync('src/mainWorld.js', 'utf8');

// 1. Update tagMessages
const tagMessagesRegex = /function tagMessages\(\) \{[\s\S]*?\n\}/;
const newTagMessages = `function tagMessages() {
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
}`;

code = code.replace(tagMessagesRegex, newTagMessages);

// 2. Clear state on conversation switch
const spaResetRegex = /window\.postMessage\(\{ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' \}, '\*'\);/g;
const newSpaReset = `window.postMessage({ source: 'cgpt_optimizer_main', type: 'cgptopt-reset-worker' }, '*');
          // Cleanup memory to prevent detached DOM / closure leaks
          currentMapping = null;
          normalizedMappingEntries = null;`;

code = code.replace(spaResetRegex, newSpaReset);

fs.writeFileSync('src/mainWorld.js', code);
console.log("Applied tagMessages and memory leak fixes.");
