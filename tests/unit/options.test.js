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

  describe('initOptions DOM binding (Phase 8)', () => {
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

    test('saveEl click saves current settings', async () => {
      const { initOptions } = window;
      await initOptions();
      
      document.getElementById('limit').value = "55";
      document.getElementById('enabled').checked = false;
      document.getElementById('save').click();
      
      // Allow async save to process
      await new Promise(process.nextTick);
      
      const stored = await chrome.storage.sync.get('cgpt_optimizer_config_v1');
      expect(stored.cgpt_optimizer_config_v1.limit).toBe(55);
      expect(stored.cgpt_optimizer_config_v1.enabled).toBe(false);
    });

    test('resetEl click resets settings to defaults', async () => {
      const { initOptions } = window;
      
      await chrome.storage.sync.set({
        cgpt_optimizer_config_v1: { limit: 99, enabled: false }
      });
      await initOptions();
      
      document.getElementById('reset').click();
      
      await new Promise(process.nextTick);
      
      const stored = await chrome.storage.sync.get('cgpt_optimizer_config_v1');
      expect(stored.cgpt_optimizer_config_v1.limit).toBe(5); // Default limit
      expect(stored.cgpt_optimizer_config_v1.enabled).toBe(true); // Default enabled
      
      // Verify DOM updated
      expect(document.getElementById('limit').value).toBe("5");
    });
  });

  describe('Custom Commands and Memory Explorer (Phase 8)', () => {
    test('Custom command adds to list and storage', async () => {
      const { initOptions } = window;
      await initOptions();
      
      document.getElementById('cc-id').value = '/testcmd';
      document.getElementById('cc-name').value = 'Test Command';
      document.getElementById('cc-instruction').value = 'Do the test';
      
      document.getElementById('cc-add-btn').click();
      
      await new Promise(process.nextTick);
      
      const stored = await chrome.storage.sync.get('cgpt_optimizer_config_v1');
      expect(stored.cgpt_optimizer_config_v1.customCommands.length).toBe(1);
      expect(stored.cgpt_optimizer_config_v1.customCommands[0].id).toBe('/testcmd');
      
      // Verify DOM updated
      const ccList = document.getElementById('custom-commands-list');
      expect(ccList.children.length).toBe(1);
      expect(ccList.innerHTML).toContain('/testcmd');
    });

    test('loadMemories fetches from background and renders', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
        if (msg.type === 'GET_ALL_MEMORIES') {
          cb({ success: true, memories: [{ id: 'm1', text: 'memory1', timestamp: 123456 }] });
        }
      });
      
      const { initOptions } = window;
      await initOptions();
      
      // initOptions calls loadMemories automatically
      await new Promise(process.nextTick);
      
      const list = document.getElementById('memory-list');
      expect(list.children.length).toBe(1);
      expect(list.innerHTML).toContain('memory1');
    });

    test('clearMemoryBtn triggers CLEAR_MEMORY', async () => {
      window.confirm = jest.fn(() => true); // Mock confirm dialog
      
      const { initOptions } = window;
      await initOptions();
      
      document.getElementById('clear-memory').click();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_MEMORY' }, expect.any(Function));
    });
  });
});
