# UI Scripts Code Map

## popup.js
- `updateUI(status)`: Eklentinin anlık durumunu (Limit, Gizlenen mesajlar, Yıldızlar) popup arayüzünde günceller.
- `loadStarred()`: Yıldızlanmış mesajları listede gösterir ve onlara tıklanıldığında ilgili sekmeye/mesaja gider.
- `setupListeners()`: Buton tıklamalarını (Ayarlar, Şimdi Temizle, Daha Fazla Yükle) yönetir ve `content.js`'e komut gönderir.

## options.js
- `saveSettings()`: Kullanıcının formdaki tercihlerini (Limit, Dil, Groq Key, Stil Seçimi) doğrular ve `chrome.storage`'a kaydeder.
- `loadSettings()`: Mevcut ayarları yükleyerek form alanlarını doldurur.
- `resetSettings()`: Ayarları fabrika ayarlarına (DEFAULTS) döndürür.
- `toggleGroqMode()`: API anahtarı girildiğinde veya silindiğinde ilgili UI alanlarını günceller.
