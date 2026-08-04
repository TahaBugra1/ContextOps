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

  describe('DOM Utilities (Phase 7)', () => {
    test('showToast creates and displays toast element', () => {
      const { showToast } = window;
      showToast('Test Message');
      
      const toast = document.getElementById('cgptopt-toast');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBe('Test Message');
      expect(toast.classList.contains('show')).toBe(true);
    });

    test('toggleTextareaLock disables/enables prompt textarea', () => {
      const { toggleTextareaLock } = window;
      
      const ta = document.createElement('textarea');
      ta.id = 'prompt-textarea';
      document.body.appendChild(ta);
      
      toggleTextareaLock(true);
      expect(ta.style.pointerEvents).toBe('none');
      expect(ta.style.opacity).toBe('0.4');
      
      toggleTextareaLock(false);
      expect(ta.style.pointerEvents).toBe('auto');
      expect(ta.style.opacity).toBe('1');
    });

    test('showPreviewBubble injects overlay with translations', () => {
      const { showPreviewBubble } = window;
      
      const ta = document.createElement('textarea');
      ta.id = 'prompt-textarea';
      document.body.appendChild(ta);
      
      const result = { en: 'English', tr: 'Turkish' };
      showPreviewBubble(result, ta, 'original', 'en');
      
      const overlay = document.getElementById('cgptopt-preview-container');
      expect(overlay).not.toBeNull();
      
      const content = overlay.querySelector('.cgptopt-preview-content');
      expect(content.textContent).toBe('English');
      
      // Simulate click on TR toggle
      const trBtn = overlay.querySelector('.cgptopt-lang-btn[data-lang="tr"]');
      trBtn.click();
      expect(content.textContent).toBe('Turkish');
    });
  });

  describe('DOM Injection and MutationObserver (Phase 7)', () => {
    beforeEach(() => {
      if (window.__setSettingsContent) {
        window.__setSettingsContent({ enabled: true, optimizerEnabled: true });
      }
      // Mock URL to provide convId
      delete window.location;
      window.location = new URL('https://chatgpt.com/c/1234567890123');
    });

    test('injectStarButtons adds star icons to messages', () => {
      const { injectStarButtons, __setStarredIds } = window;
      __setStarredIds([{ convId: '1234567890123', messageId: 'msg-1' }]);
      
      const article = document.createElement('article');
      article.setAttribute('data-message-id', 'msg-1');
      
      const toolbar = document.createElement('div');
      toolbar.className = 'flex items-center gap-1'; // Mock typical toolbar class
      article.appendChild(toolbar);
      
      document.body.appendChild(article);
      
      injectStarButtons();
      
      const btn = article.querySelector('.cgptopt-star-btn');
      expect(btn).not.toBeNull();
      expect(btn.classList.contains('starred')).toBe(true);
      expect(article.classList.contains('cgptopt-starred-message')).toBe(true);
    });

    test('injectSphereMenu creates magic wand SVG and handles custom commands', () => {
      const { injectSphereMenu, __setSettingsContent } = window;
      __setSettingsContent({
        customCommands: [{ id: '/test', name: { en: 'TestBtn' }, icon: '🚀' }],
        selectedStyles: ['/test', '/image']
      });
      
      const form = document.createElement('form');
      const ta = document.createElement('textarea');
      ta.id = 'prompt-textarea';
      form.appendChild(ta);
      document.body.appendChild(form);
      
      injectSphereMenu();
      
      const wrapper = document.querySelector('.cgptopt-sphere-wrapper');
      expect(wrapper).not.toBeNull();
      
      const slices = wrapper.querySelectorAll('.cgptopt-slice-group');
      expect(slices.length).toBe(2);
      
      const titles = Array.from(wrapper.querySelectorAll('title')).map(t => t.textContent);
      expect(titles).toContain('TestBtn');
      
      const icons = Array.from(wrapper.querySelectorAll('.cgptopt-slice-icon')).map(i => i.textContent);
      expect(icons).toContain('🚀');
      
      // Simulate click on slice
      const firstSlice = slices[0];
      firstSlice.onclick(new Event('click'));
      expect(ta.value).toBe('/test '); // Assumes it prefixes the empty textarea
    });
  });
});
