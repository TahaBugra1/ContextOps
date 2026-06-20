<!-- Banner Placeholder -->
<p align="center">
  <img src="assets/banner.png" alt="ContextOps Banner" width="100%">
</p>

<h1 align="center">ContextOps</h1>

<p align="center">
  <strong>Turbocharge ChatGPT: Eliminate "Aw, Snap!" crashes, inject RAG memory, and optimize your workflows.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs">
</p>

---

## 🚀 The Problem & The Solution

ChatGPT'nin SPA yapısı uzun sohbetlerde DOM şişmesine ve RAM sızıntılarına ("Aw, Snap!") neden olur. **ContextOps**, arka planda ağ isteklerini yakalayarak sohbeti otomatik olarak kırpar (Auto-Trim), CPU kullanımını %99 oranında düşürür ve özel RAG hafızası ile eski bağlamı asla unutmaz.

<!-- Main UI Screenshot -->
<p align="center">
  <img src="assets/screenshot-main.png" alt="ContextOps UI" width="80%">
  <br>
  <em>ContextOps Control Panel</em>
</p>

---

## ✨ Modules & Features

### ⚡ Auto-Trim Engine
Geçmiş mesajları arka planda Virtual DOM'dan güvenli bir şekilde gizleyerek sınırsız uzunlukta çökmesiz sohbet deneyimi sunar.

<!-- Auto-Trim GIF Placeholder (3-5s) -->
![Auto-Trim in Action](assets/demo-autotrim.gif)

### 🧠 RAG Memory Injection
Önemli bilgileri arka planda tutar ve sohbetin bağlamından koptuğunu hissettiğinde ilgili geçmişi prompte gizlice enjekte eder.

<!-- RAG Memory GIF Placeholder (3-5s) -->
![RAG Memory in Action](assets/demo-rag.gif)

### 🪄 Custom Commands
Sık kullandığınız prompt şablonlarına hızlıca erişin. `/cot` veya kendi belirlediğiniz kısa komutlarla anında devasa şablonları tetikleyin.

<!-- Custom Commands GIF Placeholder (3-5s) -->
![Custom Commands in Action](assets/demo-commands.gif)

---

## 📈 Performance Benchmarks

ContextOps'un O(1) etiketleme mekanizması ve akıllı RAM temizleme altyapısı sayesinde sistem kaynakları her zaman serbest kalır.

| Metric | Without ContextOps | With ContextOps |
|--------|--------------------|-----------------|
| CPU Usage (Idle) | ~15-20% | **< 1%** |
| Memory (10k msgs)| 1.5 GB (Crash) | **~150 MB** |
| Tagging Big-O | O(N²) | **O(1)** |

---

## 📦 Installation

ContextOps şu an açık kaynak ve manuel kuruluma açıktır.

1. Repoyu klonlayın:
   ```bash
   git clone https://github.com/yourusername/contextops.git
   ```
2. Google Chrome'u açın ve `chrome://extensions/` adresine gidin.
3. Sağ üstten **Developer mode**'u aktif edin.
4. **Load unpacked** butonuna tıklayın ve indirdiğiniz `contextops` klasörünü seçin.
5. ChatGPT'yi açın ve performansın tadını çıkarın!

---

## 🏗️ Architecture

ContextOps, doğrudan DOM manipülasyonundan kaçınarak React.js mimarisiyle tam uyumlu çalışır. Bunun yerine ChatGPT'nin `/backend-api/conversation` isteklerini yakalar ve veriyi ağ katmanında (`fetch` interceptor) modifiye eder.

<!-- Architecture Diagram Placeholder -->
<p align="center">
  <img src="assets/architecture.png" alt="ContextOps Architecture" width="80%">
</p>

---

## 🤝 Contributing

Katkılarınızı bekliyoruz! Geliştirme ortamını hazırlamak ve testleri (Jest) çalıştırmak için lütfen [CONTRIBUTING.md](CONTRIBUTING.md) belgesini inceleyin.

## 📝 License

Bu proje MIT Lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakabilirsiniz.
