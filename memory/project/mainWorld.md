# mainWorld.js Code Map

### Core Logic
- `clamp(value, min, max)`: Değeri alt ve üst sınırlar arasında tutar.
- `sanitize(raw)`: Ham ayarları varsayılanlarla harmanlayıp doğrular.
- `loadSettings()`: `localStorage` üzerinden ayarları yükler.
- `postStatus(patch)`: Güncel durumu `content.js`'e `postMessage` ile iletir.
- `parseExtra()`: Daha fazla mesaj yükleme miktarını (extra) okur.
- `isConversationGet(url, method)`: İsteğin bir konuşma getirme isteği olup olmadığını kontrol eder.
- `isMessageNode(node)`: Verilen düğümün bir mesaj düğümü olup olmadığını belirler.
- `isVisibleMessageNode(node)`: Mesajın kullanıcı veya asistan mesajı (görünür) olup olmadığını belirler.
- `buildPath(mapping, currentNode)`: Konuşma ağacındaki yolu oluşturur.
- `cloneNode(node)`: Bir düğümün derin kopyasını oluşturur.

### Conversation Trimming
- `trimConversationPayload(payload)`: Konuşma verisini ayarlar limitine ve yıldızlı mesajlara göre budar.
- `resetExtraAfterNewPrompt(url, method, bodyStr)`: Yeni mesaj gönderildiğinde "extra" yükleme miktarını sıfırlar.

### Network Interception
- `patchFetch()`: Tarayıcının `fetch` fonksiyonunu yamalayarak konuşma verilerini yakalar ve budanmış versiyonuyla değiştirir.

### Message Tagging
- `normalizeText(text)`: Metni Türkçe karakter duyarlı şekilde (toLocaleLowerCase) normalleştirir.
- `tagMessages()`: DOM üzerindeki mesajları API'den gelen mesaj ID'leriyle eşleştirerek etiketler (`data-cgptopt-id`).

### Prompt Optimization (Magic Wand)
- `generateUUID()`: Benzersiz istek ID'si üretir.
- `getContextMessages()`: Optimizasyon için son 5 mesajı bağlam olarak toplar.
- `optimizePrompt(text)`: Ham metni seçilen stil ve bağlama göre Groq API kullanarak optimize eder.
- `cleanupOptimization()`: Optimizasyon sonrası UI kilidini kaldırır.
