describe('content.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    
    // Clear local storage
    localStorage.clear();

    jest.isolateModules(() => {
      require('../../src/content.js');
    });
  });

  describe('Utility Functions', () => {
    test('clampContent restricts values', () => {
      const { clampContent } = window;
      expect(clampContent(50, 1, 100)).toBe(50);
      expect(clampContent(0, 1, 100)).toBe(1);
      expect(clampContent(150, 1, 100)).toBe(100);
    });

    test('sanitizeContent applies bounds', () => {
      const { sanitizeContent } = window;
      const rawInvalid = {
        limit: 500, // Should be clamped to 200
        chunkSize: -10, // Should be clamped to 1
      };

      const sanitized = sanitizeContent(rawInvalid);
      expect(sanitized.limit).toBe(200);
      expect(sanitized.chunkSize).toBe(1);
    });
  });

  describe('initContent functionality', () => {
    test('dispatches configuration on init', async () => {
      const { initContent } = window;
      
      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
      
      await chrome.storage.sync.set({
        cgpt_optimizer_config_v1: {
          enabled: false
        }
      });

      await initContent();
      
      // Wait for promises
      await new Promise(process.nextTick);

      const calls = dispatchSpy.mock.calls;
      const configCall = calls.find(call => call[0].type === 'cgptopt-config');
      
      expect(configCall).toBeDefined();
      expect(configCall[0].detail.enabled).toBe(false);
    });
  });
});
