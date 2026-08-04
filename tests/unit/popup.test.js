const fs = require('fs');
const path = require('path');

// Read actual HTML
const html = fs.readFileSync(path.resolve(__dirname, '../../src/popup.html'), 'utf8');

describe('popup.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = html;
    
    // Isolate module to re-evaluate it with the new DOM
    jest.isolateModules(() => {
      require('../../src/popup.js');
    });
  });

  describe('isSupportedUrl', () => {
    test('returns true for chatgpt.com', () => {
      expect(window.isSupportedUrl('https://chatgpt.com/')).toBe(true);
      expect(window.isSupportedUrl('https://chatgpt.com/c/123')).toBe(true);
    });

    test('returns false for other domains', () => {
      expect(window.isSupportedUrl('https://google.com')).toBe(false);
      expect(window.isSupportedUrl('http://chatgpt.com')).toBe(false); // HTTP instead of HTTPS
    });
  });

  describe('initPopup DOM binding', () => {
    test('loads popup and sets inputs based on storage', async () => {
      const { initPopup } = window;
      
      // Mock chrome.tabs.query for activeTab()
      chrome.tabs.query = jest.fn(() => Promise.resolve([{ id: 99, url: 'https://chatgpt.com/', active: true }]));
      
      // Mock chrome.storage.sync
      await chrome.storage.sync.set({
        cgpt_optimizer_config_v1: {
          enabled: false,
          limit: 10
        }
      });

      // Execute init
      await initPopup();

      const enabledEl = document.getElementById('enabled');
      const limitEl = document.getElementById('limit');

      expect(enabledEl.checked).toBe(false);
      expect(limitEl.value).toBe("10");
    });
  });

  describe('renderStatus and communication (Phase 9)', () => {
    test('renderStatus updates DOM based on runtime status', () => {
      const { renderStatus } = window;
      const statusEl = document.createElement('div');
      const debugEl = document.createElement('div');
      
      const settings = { enabled: true, limit: 15 };
      const runtime = {
        layoutSupported: true,
        renderedMessages: 5,
        totalMessages: 10,
        hiddenMessages: 2
      };

      renderStatus(statusEl, debugEl, settings, runtime);
      
      expect(statusEl.textContent).toBe('mocked_translation_for_statusKeeping'); // statusKeeping
      // debugEl uses string interpolation before translation: `${rendered}/${total} ${t('renderedLabel')}, ${hidden} ${t('hiddenLabel')}`
      expect(debugEl.textContent).toContain('5/10');
      expect(debugEl.textContent).toContain('2');
    });

    test('clearMemoryBtn sends CLEAR_MEMORY message', async () => {
      const { initPopup } = window;
      
      chrome.tabs.query = jest.fn(() => Promise.resolve([{ id: 99, url: 'https://chatgpt.com/', active: true }]));
      
      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        if (msg.type === 'GET_STATS') {
          cb({ success: true, stats: { vectorCount: 5, maxVectors: 100, modelLoaded: true } });
        } else if (msg.type === 'CLEAR_MEMORY') {
          cb({ success: true });
        }
      });

      await initPopup();
      
      // Await initial GET_STATS to complete
      await new Promise(process.nextTick);

      const btn = document.getElementById('clearMemoryBtn');
      btn.click();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_MEMORY' }, expect.any(Function));
    });

    test('change enabled state sends messages to tab', async () => {
      const { initPopup } = window;
      
      chrome.tabs.query = jest.fn(() => Promise.resolve([{ id: 99, url: 'https://chatgpt.com/', active: true }]));
      
      await initPopup();
      await new Promise(process.nextTick);
      
      const enabledEl = document.getElementById('enabled');
      enabledEl.checked = false;
      enabledEl.dispatchEvent(new Event('change'));
      
      await new Promise(process.nextTick);
      
      // Verifying chrome.tabs.sendMessage was called to notify the tab
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(99, expect.objectContaining({
        type: 'settingsUpdated',
        payload: expect.objectContaining({ enabled: false })
      }));
    });
  });
});
