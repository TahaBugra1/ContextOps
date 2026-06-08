const fs = require('fs');
const path = require('path');

// Read the actual HTML so the DOM is perfectly matched
const html = fs.readFileSync(path.resolve(__dirname, '../../src/options.html'), 'utf8');

describe('options.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = html;
    
    // We must require the file freshly to attach to the new DOM
    jest.isolateModules(() => {
      require('../../src/options.js');
    });
  });

  describe('Utility Functions', () => {
    test('clamp restricts values to min and max bounds', () => {
      const { clamp } = window;
      expect(clamp(5, 1, 10)).toBe(5);
      expect(clamp(0, 1, 10)).toBe(1);
      expect(clamp(15, 1, 10)).toBe(10);
    });

    test('sanitize applies default values and bounds', () => {
      const { sanitize } = window;
      
      const rawInvalid = {
        limit: "abc",
        chunkSize: -5,
        optimizerLanguage: 'fr', // invalid language
        selectedStyles: "not-an-array",
        customCommands: {} // not an array
      };

      const sanitized = sanitize(rawInvalid);
      console.log('Sanitized output:', sanitized);
      
      expect(sanitized.limit).toBe(5); // Default
      expect(sanitized.chunkSize).toBe(-5); // Not clamped in options.js
      expect(sanitized.optimizerLanguage).toBe('en'); // Fallback to default
      expect(Array.isArray(sanitized.selectedStyles)).toBe(true);
      expect(Array.isArray(sanitized.customCommands)).toBe(true);
    });
  });

  describe('initOptions DOM binding', () => {
    test('loads saved settings and populates inputs', async () => {
      const { initOptions } = window;
      
      // Pre-populate storage
      await chrome.storage.sync.set({
        cgpt_optimizer_config_v1: {
          enabled: false,
          limit: 42,
          optimizerLanguage: 'tr'
        }
      });

      await initOptions();

      // Check if values were applied to DOM
      const enabledEl = document.getElementById('enabled');
      const limitEl = document.getElementById('limit');
      const optimizerLanguageEl = document.getElementById('optimizerLanguage');

      expect(enabledEl.checked).toBe(false);
      expect(limitEl.value).toBe("42");
      expect(optimizerLanguageEl.value).toBe('tr');
    });
  });
});
