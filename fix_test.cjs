const fs = require('fs');
let code = fs.readFileSync('src/mainWorld.js', 'utf8');

const target = /Object\.defineProperty\(window, 'currentMapping', \{\s*get: \(\) => currentMapping,\s*set: \(val\) => \{ currentMapping = val; \}\s*\}\);/;
const repl = `Object.defineProperty(window, 'currentMapping', {
    get: () => currentMapping,
    set: (val) => { 
      currentMapping = val; 
      // Auto-compute normalized entries for tests
      if (val) {
        normalizedMappingEntries = Object.entries(val)
          .filter(([id, node]) => node.message && node.message.content && Array.isArray(node.message.content.parts))
          .map(([id, node]) => {
             const joinedText = node.message.content.parts.join(' ');
             return { id, norm: normalizeText(joinedText) };
          })
          .filter(x => x.norm.length >= 3);
      } else {
        normalizedMappingEntries = [];
      }
    }
  });`;
  
code = code.replace(target, repl);
fs.writeFileSync('src/mainWorld.js', code);
console.log("Test fix applied.");
