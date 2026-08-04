const fs = require('fs');
let code = fs.readFileSync('src/mainWorld.js', 'utf8');

const targetRegex = /function stripRAGFromObject\(obj\) \{[\s\S]*?return obj;\n  \}/;
const replacement = `function stripRAGFromObject(obj) {
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
  }`;

code = code.replace(targetRegex, replacement);
fs.writeFileSync('src/mainWorld.js', code);
console.log("Replaced stripRAGFromObject logic.");
