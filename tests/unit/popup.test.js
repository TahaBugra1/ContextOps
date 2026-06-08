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
});
