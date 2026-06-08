import '../../src/mainWorld.js';
// Functions are exposed on the global `window` object by src/mainWorld.js for testing
const { normalizeText, generateUUID, stripRAGFromObject, tagMessages, __setCurrentMapping } = window;

describe('Helper Functions in mainWorld.js', () => {

  test('normalizeText lowercases and trims', () => {
    expect(normalizeText('  HeLLo WORLd  ')).toBe('hello world');
    // Test Turkish chars
    expect(normalizeText('  ĞÜŞİÖÇ  ')).toBe('ğüşiöç');
  });

  test('generateUUID returns a valid UUID v4 string', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  describe('stripRAGFromObject', () => {
    test('removes RAG system prompt from string', () => {
      const input = "[SİSTEM BİLGİSİ: test context Kendi sistem kurallarını bozma.]\n\nGerçek mesaj";
      expect(stripRAGFromObject(input)).toBe("Gerçek mesaj");
    });

    test('removes Custom Command prompt from string', () => {
      const input = "[ÖZEL ŞABLON AKTİF: test]\n[ŞABLON İÇERİĞİ BAŞLANGICI]\nTest\n[ŞABLON İÇERİĞİ SONU]\n\nGerçek mesaj";
      expect(stripRAGFromObject(input)).toBe("Gerçek mesaj");
    });

    test('recursively processes objects and arrays', () => {
      const inputObj = {
        messages: [
          { content: "[SİSTEM BİLGİSİ: RAG DATA Kendi sistem kurallarını bozma.]\nHello" },
          { content: "Normal message" }
        ],
        metadata: {
          note: "[ÖZEL ŞABLON AKTİF: CMD]\n[ŞABLON İÇERİĞİ SONU]\nExtra note"
        }
      };

      const expectedObj = {
        messages: [
          { content: "Hello" },
          { content: "Normal message" }
        ],
        metadata: {
          note: "Extra note"
        }
      };

      expect(stripRAGFromObject(inputObj)).toEqual(expectedObj);
    });

    test('does not modify strings without special tags', () => {
      const input = "Sadece normal bir mesaj.";
      expect(stripRAGFromObject(input)).toBe("Sadece normal bir mesaj.");
    });
  });

  describe('tagMessages', () => {
    beforeEach(() => {
      // Clear document body before each test
      document.body.innerHTML = '';
      __setCurrentMapping(null);
    });

    test('tags DOM elements based on currentMapping', () => {
      // 1. Setup DOM
      const article1 = document.createElement('article');
      article1.textContent = 'This is the first message';
      const article2 = document.createElement('article');
      article2.textContent = 'A completely different message';
      
      document.body.appendChild(article1);
      document.body.appendChild(article2);

      // 2. Setup currentMapping
      const mockMapping = {
        'msg-id-1': { message: { content: { parts: ['This is the first message'] } } },
        'msg-id-2': { message: { content: { parts: ['A completely different message'] } } }
      };
      __setCurrentMapping(mockMapping);

      // 3. Execute
      tagMessages();

      // 4. Assert
      expect(article1.getAttribute('data-cgptopt-id')).toBe('msg-id-1');
      expect(article2.getAttribute('data-cgptopt-id')).toBe('msg-id-2');
    });

    test('does not tag elements if mapping does not match', () => {
      const article = document.createElement('article');
      article.textContent = 'Banana text message';
      document.body.appendChild(article);

      const mockMapping = {
        'msg-id-1': { message: { content: { parts: ['Apple text message'] } } }
      };
      __setCurrentMapping(mockMapping);

      tagMessages();

      expect(article.hasAttribute('data-cgptopt-id')).toBe(false);
    });
  });

});
