# ChatGPT Optimizer - Proje Hafzas

## Proje Amac
ChatGPT zerindeki uzun sohbetlerde yaanan donmalar engellemek iin eski mesajlar dinamik olarak gizleyen ve Groq API destei ile ham metinleri profesyonel "Prompt Mhendislii" teknikleriyle (20 farkl yntem) optimize eden ileri seviye bir tarayc eklentisi.

## Teknoloji Yn
- **ekirdek:** JavaScript (Manifest V3)
- **AI Engine:** Groq API (Model: llama-3.3-70b-versatile)
- **Stil:** Vanilla CSS (Glassmorphism, Modern Dark Theme, Flex/Grid Layout)
- **Depolama:** chrome.storage.sync (Kullanc ayarlar ve API anahtar)

## Ana zellikler & Modller

### 1. Prompt Mhendislii stasyonu
Eklenti, ham kullanc girdisini 20 farkl akademik ve teknik ynteme gre optimize edebilir:
- **Temel Komutlar:** /image (Grsel), /makale (SEO Makale), /mail (Kurumsal E-posta).
- **Akademik Yntemler:** SPEC, Chain of Thought (CoT), Feynman, Sokratik Yntem, Tree of Thoughts (ToT), lk lkeler, Mnazara Modu vb.
- **Kiiselletirme:** Kullanc, Ayarlar sayfasndaki zgara arayz zerinden favori 5 yntemini seerek ana menye sabitleyebilir.

### 2. Dinamik UI Enjeksiyonu
- **Fixed-Position Layer:** Men artk ChatGPT'nin metin kutusu iine deil, document.body zerine enjekte edilir.
- **Smart Tracking:** Metin kutusunun konumu (getBoundingClientRect) milisaniyelik hassasiyetle takip edilerek men her zaman doru yerde (sa alt kede) konumlandrlr.
- **Global Override:** z-index: 2147483647 ile dier tm elementlerin zerinde kalmas garanti edilir.

### 3. Hafza Ynetimi (Memory Guard)
- Belirlenmi limit (Varsaylan: 5-200 aras) aldnda eski mesajlar DOM zerinden kaldrarak tarayc performansn korur.

## Klasr Yaps
- memory/: Proje hafzas (project.md) ve gnlkler (ctivity_log_YYYY-MM-DD.md).
- mainWorld.js: Prompt optimizasyon mant, 20 yntemin sistem talimatlar.
- content.js: UI enjeksiyonu, konum takibi ve mesajlama kprs.
- ackground.js: Groq API isteklerini gvenli bir ekilde yneten arka plan scripti.
- options.html/js/css: 20 yntem arasndan 5 seimlik grid arayz ve API anahtar ynetimi.
- popup.html/js/css: Modern glassmorphic eklenti kontrol paneli.
- ui.css: ChatGPT sayfasna enjekte edilen tm grsel bileenlerin stilleri.

## Kritik Teknik Bilgiler
- **API Gvenlii:** API anahtar sadece yerel cihazda saklanr ve dorudan Groq sunucularna gnderilir.
- **Model:** Modeller decommissioned olduka ackground.js iinden gncellenmelidir (Mevcut: llama-3.3-70b-versatile).
- **Dil Destei:** TR ve EN tam uyumlu sistem talimatlar.

---
*Son Gncelleme: 2026-05-08 (V2.5.0)*
