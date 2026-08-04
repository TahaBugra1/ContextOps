const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

if (!global.crypto) global.crypto = {};
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => 'mocked-uuid-' + Math.random();
}

// Mock IndexedDB
const dummyIDB = {
  transaction: jest.fn(() => ({
    objectStore: jest.fn(() => ({
      put: jest.fn(),
      get: jest.fn(() => {
        const req = {};
        setTimeout(() => { req.result = null; req.onsuccess(); }, 0);
        return req;
      })
    })),
    oncomplete: null,
    onerror: null
  }))
};
global.indexedDB = {
  open: jest.fn(() => {
    const req = {};
    setTimeout(() => { req.result = dummyIDB; req.onsuccess({ target: { result: dummyIDB } }); }, 0);
    return req;
  })
};

jest.mock('@orama/orama', () => ({
  create: jest.fn(() => Promise.resolve({ id: 'dummy_db' })),
  insert: jest.fn(() => Promise.resolve()),
  search: jest.fn(() => Promise.resolve({ hits: [] })),
  count: jest.fn(() => Promise.resolve(0)),
  removeMultiple: jest.fn(() => Promise.resolve()),
  save: jest.fn(() => Promise.resolve('{}')),
  load: jest.fn(() => Promise.resolve()),
  getByID: jest.fn(() => Promise.resolve({ id: 'test', text: 'test' })),
  remove: jest.fn(() => Promise.resolve())
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(() => Promise.resolve(async (text) => ({ data: new Float32Array(384) }))),
  env: {
    allowLocalModels: true,
    useBrowserCache: false,
    backends: { onnx: { wasm: { numThreads: 1 } } }
  }
}));

describe('offscreen.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.onMessage.clear();
    
    jest.isolateModules(() => {
      require('../../src/offscreen.js');
    });
  });

  test('handles INIT message successfully', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'INIT' };

    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    
    // Wait for async init
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('ignores messages not meant for offscreen', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'popup', type: 'INIT' };

    const results = await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    expect(results[0]).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  test('handles EMBED_AND_STORE', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'EMBED_AND_STORE', text: 'memory text' };
    
    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('handles RAG_SEARCH', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'RAG_SEARCH', text: 'query' };
    
    // We mock @orama/orama count to return 1 so it proceeds to search
    require('@orama/orama').count.mockResolvedValue(1);
    
    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith({ success: true, results: [] });
  });

  test('handles GET_STATS', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'GET_STATS' };
    
    require('@orama/orama').count.mockResolvedValue(5);

    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      stats: expect.objectContaining({ vectorCount: 5, modelLoaded: true })
    });
  });

  test('handles CLEAR_MEMORY', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'CLEAR_MEMORY' };

    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('handles GET_ALL_MEMORIES', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'GET_ALL_MEMORIES' };

    // Need to trigger an insert to populate insertionOrder before getting memories
    const insertRequest = { target: 'offscreen', type: 'EMBED_AND_STORE', text: 'text', id: '123' };
    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(insertRequest, {}, jest.fn())));
    await new Promise(r => setTimeout(r, 100));

    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, memories: expect.any(Array) })
    );
  });

  test('handles DELETE_MEMORY', async () => {
    const sendResponse = jest.fn();
    const request = { target: 'offscreen', type: 'DELETE_MEMORY', id: '123' };

    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(r => setTimeout(r, 100));

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
