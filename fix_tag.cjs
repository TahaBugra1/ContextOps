const fs = require('fs');
let code = fs.readFileSync('src/mainWorld.js', 'utf8');

const target1 = /currentMapping = parsed\.mapping;[\s\S]*?const trimmed = trimConversationPayload\(parsed\);/;
const repl1 = `currentMapping = parsed.mapping;
        // OPTIMIZATION: Pre-compute heavy regex operations ONCE for the entire mapping
        // to prevent 'Aw, Snap!' CPU lockups in the tagMessages interval loop.
        normalizedMappingEntries = Object.entries(currentMapping)
          .filter(([id, node]) => node.message && node.message.content && Array.isArray(node.message.content.parts))
          .map(([id, node]) => {
             const joinedText = node.message.content.parts.join(' ');
             return { id, norm: normalizeText(joinedText) };
          })
          .filter(x => x.norm.length >= 3);
        const trimmed = trimConversationPayload(parsed);`;
code = code.replace(target1, repl1);

const target2 = /let currentMapping = null;[\s\S]*?function normalizeText\(text\)/;
const repl2 = `let currentMapping = null;
let normalizedMappingEntries = [];

function normalizeText(text)`;
code = code.replace(target2, repl2);

const target3 = /function tagMessages\(\) \{[\s\S]*?console\.log\(\`\[CGPTOpt\] Tagged message \$\{match\[0\]\}\`\);\s*\}\s*\}\);\s*\}/;
const repl3 = `function tagMessages() {
  if (!normalizedMappingEntries || normalizedMappingEntries.length === 0) return;
  const articles = document.querySelectorAll('article:not([data-cgptopt-id]), [data-testid^="conversation-turn-"]:not([data-cgptopt-id]), div[class*="ChatMessage"]:not([data-cgptopt-id]), div[class*="message_wrapper"]:not([data-cgptopt-id])');

  articles.forEach(article => {
    const textNode = article.querySelector('.markdown') || 
                     article.querySelector('[data-message-author-role]') ||
                     article.querySelector('.flex-col.gap-1.md\\\\:gap-3') ||
                     article.querySelector('div[class*="content"]') ||
                     article;
                     
    const domText = normalizeText(textNode.textContent);
    if (domText.length < 3) return;

    const match = normalizedMappingEntries.find(entry => {
      const partText = entry.norm;
      return partText.includes(domText) || domText.includes(partText) || 
             (domText.length > 20 && partText.substring(0, 50).includes(domText.substring(0, 50)));
    });

    if (match) {
      article.setAttribute('data-cgptopt-id', match.id);
      if (!article.hasAttribute('data-message-id')) {
        article.setAttribute('data-message-id', match.id);
      }
    }
  });
}`;
code = code.replace(target3, repl3);

fs.writeFileSync('src/mainWorld.js', code);
console.log("Fixes applied successfully.");
