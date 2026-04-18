# ChatGPT Optimizer - Project Memory

## Proje Amacı
ChatGPT web arayüzünde (chatgpt.com ve chat.openai.com) uzun sohbetlerde oluşan performans sorunlarını ve yavaşlamaları (UI lag) gidermek için konuşma geçmişini render öncesi optimize eden bir Chrome eklentisidir.

## Teknoloji Yığını
- **Core:** JavaScript (ES6+), HTML, CSS
- **Manifest:** Manifest V3 (MV3)
- **APIs:** Chrome Extension Storage, Tabs APIs
- **Localization:** Chrome i18n sistemi (_locales)

## Klasör Yapısı
- `_locales/`: Yerelleştirme dosyaları (TR, EN)
- `background.js`: Arka plan servis çalışanı (service worker)
- `content.js`: Sayfa bağlamında çalışan içerik betiği (isolated world)
- `mainWorld.js`: Sayfanın ana dünyasına enjekte edilen betik (DOM manipülasyonu)
- `manifest.json`: Eklenti yapılandırması
- `popup.html/js/css`: Eklenti açılır pencere arayüzü
- `options.html/js/css`: Eklenti ayarlar sayfası
- `ui.css`: Arayüz stilleri
- `memory/`: Proje bellek sistemi

## Kritik Dosyalar
- `manifest.json`: Eklentinin kalbi, izinler ve dosya eşleşmeleri burada tanımlanır.
- `mainWorld.js`: ChatGPT'nin render sürecine müdahale eden ve Prompt Optimizasyonu sağlayan kritik mantığı içerir.
- `content.js`: Sayfa ile eklenti arasındaki iletişimi ve arayüz enjeksiyonunu sağlar.
- `background.js`: Arka plan görevlerini yönetir.

## Yeni Özellikler (2026-03-27)
- **Prompt Optimizer (Sihirli Değnek):** Kullanıcı girdilerini profesyonel promptlara dönüştürür.
- **Dil Desteği:** Optimizer için Türkçe ve İngilizce çıktı seçenekleri eklendi.
- **Yapılandırma:** Optimizer'ın açılıp kapatılabilmesi sağlandı.
