import { pipeline, env } from '@xenova/transformers';
import { create, insert, search, count, removeMultiple, save, load } from '@orama/orama';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1; // Prevent SharedArrayBuffer errors in MV3

const MAX_VECTORS = 5000; // LRU Garbage Collection limit
const GC_BATCH_SIZE = 200; // How many oldest to remove at once

let extractor;
let db;
let dbInitialized = false;
let insertionOrder = []; // Track insertion order for LRU eviction
let initPromise = null;

// IndexedDB Helper
const DB_NAME = 'ContextOpsRAG';
const STORE_NAME = 'OramaStore';

function getIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveToIDB(key, value) {
  const idb = await getIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function loadFromIDB(key) {
  const idb = await getIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function performInit() {
  if (dbInitialized) return;
  
  try {
    const savedData = await loadFromIDB('orama_db');
    const savedOrder = await loadFromIDB('orama_order');
    
    if (savedData) {
      db = await create({
        schema: {
          id: 'string',
          text: 'string',
          timestamp: 'number',
          vector: 'vector[384]',
        }
      });
      await load(db, savedData);
      insertionOrder = savedOrder || [];
      console.log('[Offscreen] Orama DB restored from disk. Vectors:', await count(db));
    } else {
      throw new Error("No saved DB");
    }
  } catch (err) {
    console.log('[Offscreen] Creating fresh Orama DB...', err.message);
    db = await create({
      schema: {
        id: 'string',
        text: 'string',
        timestamp: 'number',
        vector: 'vector[384]',
      }
    });
    insertionOrder = [];
  }
  
  dbInitialized = true;

  if (!extractor) {
    console.log('[Offscreen] Loading Xenova/all-MiniLM-L6-v2...');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
    console.log('[Offscreen] Model loaded successfully');
  }
}

async function init() {
  if (!initPromise) {
    initPromise = performInit();
  }
  return initPromise;
}

// Debounced Save
let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      console.log('[Offscreen] Persisting DB to disk...');
      const dbData = await save(db);
      await saveToIDB('orama_db', dbData);
      await saveToIDB('orama_order', insertionOrder);
      console.log('[Offscreen] DB persisted successfully.');
    } catch (err) {
      console.error('[Offscreen] Failed to persist DB:', err);
    }
  }, 2000); // 2 seconds debounce
}

async function getEmbedding(text) {
  await init();
  // Truncate very long texts to avoid OOM on embedding
  const truncated = text.length > 1000 ? text.substring(0, 1000) : text;
  const output = await extractor(truncated, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * LRU Garbage Collection:
 * When the vector count exceeds MAX_VECTORS, remove the oldest GC_BATCH_SIZE entries.
 */
async function runGarbageCollection() {
  try {
    const totalCount = await count(db);
    if (totalCount <= MAX_VECTORS) return;

    const toRemove = insertionOrder.splice(0, GC_BATCH_SIZE);
    if (toRemove.length > 0) {
      await removeMultiple(db, toRemove);
      console.log(`[Offscreen] GC: Removed ${toRemove.length} oldest vectors. Remaining: ${await count(db)}`);
    }
  } catch (err) {
    console.error('[Offscreen] GC Error:', err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'INIT') {
    init()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'EMBED_AND_STORE') {
    (async () => {
      try {
        await init();
        const docId = message.id || crypto.randomUUID();

        // Skip if already indexed (dedup check)
        if (insertionOrder.includes(docId)) {
          sendResponse({ success: true, skipped: true });
          return;
        }

        const vector = await getEmbedding(message.text);
        await insert(db, {
          id: docId,
          text: message.text,
          timestamp: Date.now(),
          vector: vector
        });
        insertionOrder.push(docId);

        // Run GC after insert
        await runGarbageCollection();
        
        scheduleSave(); // Persist changes

        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // RAG_SEARCH: semantic vector search
  if (message.type === 'RAG_SEARCH') {
    (async () => {
      try {
        await init();
        const totalCount = await count(db);
        if (totalCount === 0) {
          sendResponse({ success: true, results: [] });
          return;
        }

        const queryVector = await getEmbedding(message.text);
        const results = await search(db, {
          mode: 'vector',
          vector: {
            value: queryVector,
            property: 'vector'
          },
          limit: 5,
          similarity: 0.0
        });
        sendResponse({ success: true, results: results.hits });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // GET_STATS: return db statistics for popup UI
  if (message.type === 'GET_STATS') {
    (async () => {
      try {
        await init();
        const totalCount = await count(db);
        sendResponse({
          success: true,
          stats: {
            vectorCount: totalCount,
            maxVectors: MAX_VECTORS,
            modelLoaded: !!extractor
          }
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // CLEAR_MEMORY: wipe the entire vector DB
  if (message.type === 'CLEAR_MEMORY') {
    (async () => {
      try {
        // Recreate DB from scratch
        db = await create({
          schema: {
            id: 'string',
            text: 'string',
            timestamp: 'number',
            vector: 'vector[384]',
          }
        });
        insertionOrder = [];
        console.log('[Offscreen] Memory cleared.');
        scheduleSave(); // Persist empty state
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
