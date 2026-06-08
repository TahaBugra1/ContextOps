// Background Script Tests
require('../../src/background.js');

describe('background.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('onInstalled listener initializes offscreen document', async () => {
    // Trigger onInstalled event
    chrome.runtime.onInstalled.trigger();

    // Verify if offscreen document creation was attempted
    // Since getContexts is mocked to return [], it should try to create it.
    // wait for async promises
    await new Promise(process.nextTick);

    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run heavy AI models and Vector DB in background'
    });
  });

  test('routes RAG_SEARCH messages to offscreen document', async () => {
    const sendResponse = jest.fn();
    const request = { type: 'RAG_SEARCH', text: 'test query' };
    
    // setupOffscreenDocument calls sendMessage with INIT first
    chrome.runtime.sendMessage
      .mockResolvedValueOnce({ success: true }) // for INIT
      .mockResolvedValueOnce({ success: true, results: [] }); // for RAG_SEARCH

    // Trigger onMessage
    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));

    // wait for async inner IIFE
    await new Promise(process.nextTick);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      type: 'RAG_SEARCH',
      text: 'test query'
    });
    
    expect(sendResponse).toHaveBeenCalledWith({ success: true, results: [] });
  });

  test('handles RESET_WORKER message', async () => {
    const sendResponse = jest.fn();
    const request = { type: 'RESET_WORKER' };

    await Promise.all(chrome.runtime.onMessage.listeners.map(fn => fn(request, {}, sendResponse)));
    await new Promise(process.nextTick);

    // resetWorkerTab closes the window if workerWindowId exists
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
