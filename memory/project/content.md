# content.js Code Map

### Utilities & Helpers
- `storageArea()`: Kullanılabilir depolama alanını (`chrome.storage.sync` veya `local`) döner.
- `isContextValid()`: Eklenti bağlamının hala geçerli (invalidate olmamış) olduğunu kontrol eder.
- `t(key, substitutions)`: Çok dilli destek (`i18n`) için çeviri getirir.
- `clamp(value, min, max)`: Sayısal değerleri sınırlar içinde tutar.
- `sanitize(raw)`: Ayar verilerini doğrular ve temizler.
- `showToast(text)`: Kullanıcıya geçici bildirim (toast) gösterir.
- `toggleTextareaLock(active)`: Optimizasyon sırasında yazı alanını kilitler/açar.
- `maybeShowActiveToast()`: Eklenti aktif olduğunda kullanıcıya bilgi bildirimi gösterir.

### Configuration & State
- `dispatchConfig()`: Güncel ayarları `mainWorld.js`'e iletir.
- `getStarredIdsForCurrentConversation()`: Mevcut konuşma için yıldızlanmış mesaj ID'lerini filtreler.
- `applySettings(next)`: Yeni ayarları uygular ve dağıtır.

### UI Injection
- `injectStarButtons()`: Mesajların toolbar alanına "Yıldız" butonlarını enjekte eder ve durumlarını günceller.
- `injectPromptOptimizer()`: Yazı alanının yanına "Sihirli Değnek" (Prompt Optimizer) butonunu ve menüsünü enjekte eder.

### Event Handling & Bridge
- `setupWindowBridge()`: `mainWorld.js`'ten gelen `window.postMessage` mesajlarını dinler ve işler.
- `toggleStar(messageId)`: Bir mesajın yıldız durumunu değiştirir ve depolamaya kaydeder.
- `setupObserver()`: DOM değişikliklerini izleyerek yeni mesajlar için butonları otomatik enjekte eder.
- `setupVisibility()`: Sekme görünürlüğü değiştiğinde durumu günceller.
- `setupMessages()`: Arka plan betiğinden (`background.js`) veya popup'tan gelen mesajları dinler.

### Initialization
- `init()`: Eklentiyi başlatır, depolamadan ayarları yükler ve tüm dinleyicileri kurar.
