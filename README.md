<div align="center">

# 🧠 ContextOps

**ChatGPT İçin Nihai Üretkenlik ve Performans Eklentisi**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Eklentisi-4285F4?logo=googlechrome&logoColor=white&style=for-the-badge)](#)
[![License: MIT](https://img.shields.io/badge/Lisans-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PR_Kabul_Edilir-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

ContextOps, uzun sohbetler sırasında ChatGPT'yi şimşek hızında tutmak için tasarlanmış açık kaynaklı bir Chrome MV3 eklentisidir. Ağ isteklerini dinleyerek arayüzü hızlandırır (Auto-Trim), yerel bir RAG bellek motoruyla geçmişi hatırlar ve özel şablonlarla iş akışınızı otomatikleştirir.

[Kurulum](#-kurulum) • [Özellikler](#-temel-özellikler) • [Nasıl Çalışır](#-sorun-ve-çözüm) • [Katkıda Bulunma](#-katkıda-bulunma)

</div>

---

## 🚀 Sorun ve Çözüm

ChatGPT ile derinlemesine sohbetler yaparken (özellikle yüzlerce mesajlık konuşmalarda), işlenen devasa miktardaki DOM elemanları nedeniyle tarayıcı arayüzü son derece yavaşlayabilir, kaydırma (scrolling) sırasında kasabilir ve sistem kaynaklarını tüketebilir.

**ContextOps bu sorunu**, ağ isteklerini doğrudan `fetch` katmanında (`MAIN World` üzerinde) yakalayarak çözer. Gelen sohbet verisini (payload) React tarafından işlenmeden ve ekrana çizilmeden önce güvenli bir şekilde "budar" (trimler). Yalnızca en son mesajları aktif tutarak **gecikmeyi (lag) tamamen ortadan kaldırırken**, tüm sohbet geçmişinizin OpenAI sunucularında güvenle saklanmaya devam etmesini sağlar.

> **Özetle:** Artık ChatGPT'de kasma/donma yok; üstelik tarayıcı içi %100 yerel hafıza (RAG) ve akıllı kısayollar var!

---

## ✨ Temel Özellikler

### 1. ⚡ Akıllı Otomatik Budama (Auto-Trim) Motoru
Sohbet verisini React tarafından işlenmeden önce görünmez bir şekilde optimize ederek, sohbet ne kadar uzun olursa olsun ChatGPT'nin ilk günkü kadar hızlı ve duyarlı kalmasını sağlar. İstediğiniz an tüm geçmişi yükleyebilir veya sadece son mesajlara odaklanabilirsiniz.

![Otomatik Budama Motoru](assets/demo-trim.gif)

### 2. 🧠 Yerel RAG (Hafıza) Motoru
Harici sunuculara veya veritabanlarına bel bağlamadan, ChatGPT'ye sohbetler arası kalıcı bir bellek kazandırır. Chrome Offscreen API kullanarak `@xenova/transformers` ile tarayıcı içinde vektörler (embeddings) oluşturur ve bunları `@orama/orama` ile IndexedDB üzerinde saklar. Önemli bağlamları sorunsuz bir şekilde arar ve gerektiğinde geçmiş verileri prompt'unuzun başına ekler.

![Yerel RAG Bellek](assets/demo-rag.gif)

### 3. 🪄 Özel Komut Şablonları & Prompt Optimizasyonu
Anında genişleyen kişiselleştirilmiş komut şablonlarıyla (Örn: `/cot`, `/feynman`, `/spec`) iş akışınızı hızlandırın. Ayrıca, "Sihirli Yıldız" arayüzü sayesinde (Groq API veya UI otomasyonu kullanarak) yazdığınız kısa metinleri anında çok daha detaylı ve profesyonel promptlara dönüştürür. 

![Özel Komutlar](assets/demo-commands.gif)

---

## 🔒 Önce Gizlilik (Privacy First)

ContextOps, kesin bir **önce-yerel (local-first)** felsefesiyle inşa edilmiştir.

- ✅ **Tamamen Yerel:** Tüm işleme, JSON budama, vektör çıkarma ve RAG bellek depolama işlemleri doğrudan tarayıcınızın içinde (istemci tarafında) gerçekleşir.
- ❌ **Veri Toplama Yok:** Sohbetlerinizi veya API anahtarlarınızı toplamıyoruz, kendi sunucularımıza saklamıyoruz veya iletmiyoruz.
- ❌ **Telemetri Yok:** Sıfır harici analiz veya izleme kodu.

---

## 🛠️ Teknoloji Yığını

- **Mimari:** Vite + Vanilla JS (Chrome MV3, Main World enjeksiyonu, Service Workers ve Offscreen Document API).
- **Arama & Vektör Veritabanı:** Hızlı, tarayıcı içi metin/vektör araması için IndexedDB destekli [@orama/orama](https://github.com/oramasearch/orama).
- **Yapay Zeka (Embeddings):** Yerel yerleştirmeleri doğrudan tarayıcıda çalıştırmak için [@xenova/transformers](https://github.com/xenova/transformers.js) (`Xenova/all-MiniLM-L6-v2` modeli).
- **Test:** Jest ve JSDOM.

---

## 📦 Kurulum (Geliştirici Modu)

Proje deposunda `node_modules` ve derlenmiş üretim (production) sürümü **bulunmadığı** için, eklentiyi kaynak koddan derlemek amacıyla sisteminizde Node.js yüklü olması gerekir.

### Önkoşullar
- **Node.js** (v18 veya üzeri önerilir)
- **npm** veya **yarn**

### Derleme Adımları
1. **Depoyu klonlayın:**
   ```bash
   git clone https://github.com/TahaBugra1/ContextOps.git
   cd ContextOps
   ```
2. **Gerekli paketleri (dependencies) yükleyin:**
   ```bash
   npm install
   ```
3. **Eklentiyi derleyin:**
   ```bash
   npm run build
   ```
   *(Bu komut, Vite kullanarak dosyaları derler ve bir `dist` klasörü oluşturur.)*

### Chrome'a Yükleme
4. Chrome'u açın ve adres çubuğuna `chrome://extensions/` yazın.
5. **Geliştirici modunu (Developer mode)** AÇIN (sağ üst köşe).
6. **Paketlenmemiş öğe yükle (Load unpacked)** butonuna tıklayın ve proje içindeki yeni oluşturulan **`dist`** klasörünü seçin.
7. [ChatGPT](https://chatgpt.com)'yi açın — ContextOps otomatik olarak arayüze entegre olacak ve etkinleşecektir!

---

## 👨‍💻 Geliştirme

Eğer kaynak kodu üzerinde aktif olarak geliştirme yapmak ve değişiklikleri test etmek isterseniz:
```bash
npm run dev
```
Bu komut, dosyalardaki değişiklikleri izler ve eklentiyi arka planda otomatik olarak yeniden derler. (Not: JS/HTML değişikliklerinin uygulanması için `chrome://extensions/` sayfasında eklentiyi yenilemeniz veya ChatGPT sayfasını yenilemeniz gerekebilir).

---

## 🤝 Katkıda Bulunma

Açık kaynak topluluğunu öğrenmek, ilham almak ve üretmek için harika bir yer yapan şey katkılardır. Yapacağınız her türlü katkı (hata düzeltmeleri, yeni özellikler, dokümantasyon güncellemeleri) **büyük bir memnuniyetle karşılanacaktır**.

Geliştirme standartlarımız, kod yapımız ve test yönergelerimiz hakkında ayrıntılar için lütfen [CONTRIBUTING.md](CONTRIBUTING.md) dosyamızı inceleyin.

## 📜 Lisans

ContextOps, MIT Lisansı altında dağıtılmaktadır. Daha fazla bilgi için `LICENSE` dosyasına bakın.

<div align="center">
  <i>Güçlü kullanıcılar ve yapay zeka meraklıları için ❤️ ile yapıldı.</i>
</div>