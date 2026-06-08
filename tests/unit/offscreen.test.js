const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

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
});
