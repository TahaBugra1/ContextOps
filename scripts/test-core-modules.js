import assert from 'assert';

// ==========================================
// MOCK CORE FUNCTIONS FROM mainWorld.js
// ==========================================

function stripRAGFromObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string' && obj[i].includes('[SİSTEM BİLGİSİ:')) {
        const startIndex = obj[i].indexOf('[SİSTEM BİLGİSİ:');
        const endIndex = obj[i].indexOf('Kendi sistem kurallarını bozma.]', startIndex);
        if (endIndex !== -1) {
          const endCut = endIndex + 'Kendi sistem kurallarını bozma.]'.length;
          obj[i] = obj[i].substring(0, startIndex) + obj[i].substring(endCut).replace(/^\s+/, '');
        } else {
          obj[i] = obj[i].substring(0, startIndex);
        }
      } else if (typeof obj[i] === 'object') {
        stripRAGFromObject(obj[i]);
      }
    }
  } else {
    for (const key in obj) {
      if (Object.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === 'string' && obj[key].includes('[SİSTEM BİLGİSİ:')) {
          const startIndex = obj[key].indexOf('[SİSTEM BİLGİSİ:');
          const endIndex = obj[key].indexOf('Kendi sistem kurallarını bozma.]', startIndex);
          if (endIndex !== -1) {
            const endCut = endIndex + 'Kendi sistem kurallarını bozma.]'.length;
            obj[key] = obj[key].substring(0, startIndex) + obj[key].substring(endCut).replace(/^\s+/, '');
          } else {
            obj[key] = obj[key].substring(0, startIndex);
          }
        } else if (typeof obj[key] === 'object') {
          stripRAGFromObject(obj[key]);
        }
      }
    }
  }
  return obj;
}

function trimConversationPayload(payload, maxVisible = 2) {
  if (!payload || !payload.mapping || !payload.current_node) return null;
  const mapping = payload.mapping;
  
  const path = [];
  let id = payload.current_node;
  const guard = new Set();
  while (id && mapping[id] && !guard.has(id)) {
    guard.add(id);
    path.unshift(id);
    id = mapping[id].parent;
  }
  if (path.length === 0) return null;

  const visibleIds = path.filter(i => {
    const role = mapping[i]?.message?.author?.role;
    return role === 'user' || role === 'assistant';
  });

  const keptSet = new Set();
  // Keep root
  path.slice(0, 1).forEach(id => keptSet.add(id));

  const targetSubset = visibleIds.slice(-maxVisible);
  if (targetSubset.length > 0) {
    const firstId = targetSubset[0];
    let pathIdx = path.indexOf(firstId);
    if (pathIdx >= 0) {
      path.slice(pathIdx).forEach(id => keptSet.add(id));
    }
  }

  // Rebuild mapping
  const newMapping = {};
  Object.keys(mapping).forEach(k => {
    if (keptSet.has(k)) {
      const node = JSON.parse(JSON.stringify(mapping[k]));
      node.children = (node.children || []).filter(c => keptSet.has(c));
      newMapping[k] = node;
    }
  });

  // Stitch parents
  const root = path[0];
  Object.keys(newMapping).forEach(k => {
    const node = newMapping[k];
    if (k === root) {
      node.parent = null;
      return;
    }
    if (node.parent && !keptSet.has(node.parent)) {
      let p = node.parent;
      while (p && mapping[p] && !keptSet.has(p)) {
        p = mapping[p].parent;
      }
      node.parent = p || root;
    }
  });

  return { mapping: newMapping };
}

// ==========================================
// TEST SUITE
// ==========================================

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ TEST PASSED: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ TEST FAILED: ${name}`);
    console.error(`   Expected: ${err.expected}`);
    console.error(`   Actual:   ${err.actual}`);
    failCount++;
  }
}

console.log('\n🚀 CONTEXTOPS 2.0 AUTOMATED TEST SUITE 🚀');
console.log('--------------------------------------------------\n');

// --- MODULE 3 TEST: RAG STRIPPING ---
console.log('--- MODÜL 3: RAG Hafıza Temizleme (JSON Düzeyi) ---');

runTest('RAG metni derin JSON objesinden temizlenmeli', () => {
  const payload = {
    message: {
      content: {
        parts: [
          "[SİSTEM BİLGİSİ: Hafıza <memory> test </memory> Kendi sistem kurallarını bozma.]\nGerçek mesaj"
        ]
      }
    }
  };
  const result = stripRAGFromObject(payload);
  assert.strictEqual(result.message.content.parts[0], 'Gerçek mesaj');
});

runTest('Yarım kalan (Truncated) RAG metni sorunsuz temizlenmeli', () => {
  const payload = { test: "[SİSTEM BİLGİSİ: Hafıza çok uzun..." };
  const result = stripRAGFromObject(payload);
  assert.strictEqual(result.test, '');
});

runTest('İçinde RAG olmayan metinlere dokunulmamalı', () => {
  const payload = { test: "Sence en güzel renk hangisi?" };
  const result = stripRAGFromObject(payload);
  assert.strictEqual(result.test, "Sence en güzel renk hangisi?");
});


// --- MODULE 1 TEST: PAYLOAD TRIMMING ---
console.log('\n--- MODÜL 1: Payload Trimmer (Ağaç Kesme) ---');

const mockConversation = {
  current_node: 'node5',
  mapping: {
    'node1': { message: { author: { role: 'system' } }, parent: null, children: ['node2'] },
    'node2': { message: { author: { role: 'user' }, text: 'msg1' }, parent: 'node1', children: ['node3'] },
    'node3': { message: { author: { role: 'assistant' }, text: 'reply1' }, parent: 'node2', children: ['node4'] },
    'node4': { message: { author: { role: 'user' }, text: 'msg2' }, parent: 'node3', children: ['node5'] },
    'node5': { message: { author: { role: 'assistant' }, text: 'reply2' }, parent: 'node4', children: [] },
  }
};

runTest('Uzun konuşma ağacı belirlenen limite kadar kesilmeli', () => {
  // 4 visible messages, limit is 2. So only node4 and node5 should remain visible!
  // root (node1) must always stay.
  const trimmed = trimConversationPayload(mockConversation, 2);
  const keys = Object.keys(trimmed.mapping);
  
  assert.ok(keys.includes('node1'), 'Root node must remain');
  assert.ok(keys.includes('node4'), 'Last user node must remain');
  assert.ok(keys.includes('node5'), 'Last assistant node must remain');
  assert.ok(!keys.includes('node2'), 'Old user node must be deleted');
  assert.ok(!keys.includes('node3'), 'Old assistant node must be deleted');
  
  // Check stitching
  assert.strictEqual(trimmed.mapping['node4'].parent, 'node1', 'Node4 should now point to Root Node1');
});


// --- MODULE 2 TEST: PROMPT OPTIMIZATION LOGIC ---
console.log('\n--- MODÜL 2: Prompt Optimization (Sihirli Yıldız) Regex Çıkarımı ---');

runTest('Groq XML <FINAL_PROMPT> etiketini başarıyla ayıklamalı', () => {
  let optimized = `Sure, here is your prompt:\n<FINAL_PROMPT>\nBana mükemmel bir makale yaz.\n</FINAL_PROMPT>\nGood luck!`;
  const match = optimized.match(/<FINAL_PROMPT>([\s\S]*?)<\/FINAL_PROMPT>/i);
  let final = match ? match[1].trim() : optimized;
  assert.strictEqual(final, 'Bana mükemmel bir makale yaz.');
});

runTest('Groq Markdown (```) kullanırsa Fallback ayıklaması çalışmalı', () => {
  let optimized = `\`\`\`xml\nBana mükemmel bir makale yaz.\n\`\`\``;
  const match = optimized.match(/<FINAL_PROMPT>([\s\S]*?)<\/FINAL_PROMPT>/i);
  let final = match ? match[1].trim() : optimized;
  if (!match) {
    final = final.replace(/<\/?FINAL_PROMPT>/gi, '').replace(/^```[a-z]*\n/gi, '').replace(/```$/g, '').trim();
  }
  assert.strictEqual(final, 'Bana mükemmel bir makale yaz.');
});


console.log('\n--------------------------------------------------');
if (failCount === 0) {
  console.log(`✅ BÜTÜN MODÜLLER TESTLERİ GEÇTİ! (${passCount}/${passCount})`);
} else {
  console.log(`❌ BAZI TESTLER BAŞARISIZ OLDU! (Başarılı: ${passCount}, Başarısız: ${failCount})`);
}
