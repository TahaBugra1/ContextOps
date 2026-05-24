# background.js Code Map

### Core Logic
- `onInstalled`: Eklenti kurulduğunda veya güncellendiğinde varsayılan ayarları hazırlar.
- `onMessage`: `content.js` veya popup'tan gelen mesajları (Ayarlar, Optimizasyon, Reset) dinler ve ilgili işlemleri başlatır.

### Prompt Optimization (Worker Integration)
- `OPTIMIZE_PROMPT_BACKGROUND`: Gelen optimizasyon isteğini yönetir. Groq API veya Stealth Tab (Yapay Zeka oturumu) arasında karar verir.
- `getAuthToken()`: ChatGPT oturum bilgilerini `mainWorld.js`'ten yakalanan verilerle senkronize eder.
- `stealthOptimize(instruction)`: Arka planda gizli bir sekme açarak ChatGPT'yi "Prompt Mühendisi" olarak kullanır ve sonucu döndürür.
- `groqOptimize(instruction, key)`: Kullanıcının kendi Groq API anahtarını kullanarak hızlı optimizasyon yapar.

### Stealth Mode Management
- `getOrCreateWorkerTab()`: Arka planda mesajlaşma için kullanılacak gizli ChatGPT sekmesini bulur veya oluşturur.
- `resetWorker()`: Bağlam değişikliğinde (yeni konuşma vb.) arka plan sekmesini temizler/yeniler.
- `waitForResponse(requestId)`: Arka plan sekmesinden gelen yanıtı bekler ve zaman aşımı kontrolü yapar.
