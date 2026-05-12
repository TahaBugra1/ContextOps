## [2026-05-12 00:50]

**Request:** Kullanıcının isteği: Sağ/sol üst köşeye 'Hatırla' butonu ekle. Aktif olduğunda, limitleri aşarak tüm sohbet geçmişini API'ye göndersin ve mesaj atıldıktan sonra otonom olarak kapansın.

**Files:**
- ui.css
- content.js
- mainWorld.js

**Change:** Hatırla butonu DOM'a eklendi. mainWorld.js içinde ememberAllActive state'i oluşturuldu ve limit = Infinity yapıldı. Fetch tamamlandığında buton kendi kendine kapanacak şekilde tasarlandı.

**Reason:** Kullanıcının, kırpma limitine takılmadan tek seferlik tam bağlam gönderimi yapabilmesi için.

**Test Result:** Manuel kontrol edildi. UI stilleri eklendi, mantık akışı sağlandı.

---
## [2026-05-12 00:32]

**Request:** Yıldızın konumunun dikeyde tam hizalanması ve biraz daha sola alınması.

**Files:**
- content.js

**Change:**
- content.js: updatePosition içinde dikey hizalama (top) ofseti -19px'ten -22px'e çekildi. Yatay konum (left) -80px'ten -95px'e çekilerek daha fazla sola kaydırıldı.

**Reason:** Görsel estetiği artırmak ve arayüz elemanlarıyla mükemmel bir hizada durmasını sağlamak.

**Test Result:** Uygulandı.

---
## [2026-05-12 00:29]

**Request:** Yarım küre dilimlerinin settings.promptStyles üzerinden dinamik (5 adede kadar) çekilmesi ve /image, /makale, /mail komutlarının options içine dahil edilmesi.

**Files:**
- options.js
- content.js

**Change:**
- options.js: PROMPT_STYLES içine /image, /makale, /mail tanımları eklendi. Varsayılan (DEFAULTS) olarak bu itemler eklendi.
- content.js: Menü içerisindeki statik items listesi kaldırıldı. Yerine settings.selectedStyles arrayinden ilk 5 elementi alan ve PROMPT_STYLES dictionary kullanarak ikon eşleştirmesi yapan yapı kuruldu.
- content.js: Sabit SVG path koordinatları yerine, dilim sayısına (n) göre SVG pie dilimlerini ve ikon/metin koordinatlarını trigonometri (Math.cos, Math.sin) ile dinamik hesaplayan bir algoritma eklendi.

**Reason:** Kullanıcıların eklenti ayarlarından (options) kendi istedikleri kısayolları küreye atayabilmesi ve menünün item sayısına göre kusursuz oranlarda şekillenmesi.

**Test Result:** Değişiklikler başarıyla yapıldı.

---
## [2026-05-12 00:24]

**Request:** Yıldızın metin kutusundan daha da uzağa itilerek (sol tamamen dışarı) menünün tekrar sola doğru açılması.

**Files:**
- content.js
- ui.css

**Change:**
- content.js: updatePosition ile wrapper ect.left - 80px konumuna çekilerek ChatGPT ataş butonundan vb. uzaklaştırıldı.
- ui.css: Yarım küre genişleme yönü tekrar sola doğru (	ransform-origin: right center) ayarlandı. Aradaki boşluk kaybını engellemek için yarım küre yıldıza sağ kenarından tam yaslandı (ight: 28px).
- content.js: SVG dilimleri yeniden M 80,80 (sol yarım daire) konumuna çevrildi.

**Reason:** Yıldızın metin kutusunun içindeki butonlarla çakışması ve kullanıcının menünün dışarı (sola) açılmasını istemesi.

**Test Result:** Değişiklikler başarıyla yapıldı.

---
## [2026-05-12 00:20]

**Request:** Yıldızın metin kutusunun dışına sol kenarına koyulması, hover genişlemesinin sağa doğru yapılması ve mevcut öğelerin üzerine komut yazılması (override).

**Files:**
- content.js
- ui.css

**Change:**
- content.js: updatePosition ile wrapper metin kutusunun sol dışına (ect.left - 50px) taşındı.
- ui.css: .cgptopt-hemisphere-expansion konumu sağ kenar yerine sol kenar ile sabitlendi (left: 28px), böylece yıldız ile arasındaki hover boşluk kaybı giderildi ve sağa doğru (	ransform-origin: left center) genişlemesi sağlandı.
- content.js: SVG dilimleri sol yarım daireden SAĞ yarım daireye (M 0,80) güncellendi.
- content.js: Regex güncellenerek /image, /makale gibi önden var olan komutların yeni seçilen komutla ezilmesi (override) garanti altına alındı.

**Reason:** Hover sırasında farenin yarım küreye geçerken boşluğa düşüp kapanması ve UX'in daha ergonomik olması (yıldız solda, seçenekler içe/sağa açılıyor).

**Test Result:** Değişiklikler başarıyla yapıldı.

---
## [2026-05-12 00:13]

**Request:** Yarım küre menünün 4 tam dilime (pie slice) ayrılması ve harici sihirli değnek (optimize) butonunun kaldırılarak altın yıldıza (ana küreye) bu işlevin yüklenmesi.

**Files:**
- content.js
- ui.css

**Change:**
- content.js: injectPromptOptimizer (harici buton) tamamen silindi. 
- content.js: injectSphereMenu içindeki hover alanına, 4 SVG <path> ile kesilmiş kusursuz bir pie menu eklendi. Ana yıldıza (.cgptopt-main-sphere) click eventi ile 'cgptopt-optimize' özelliği atandı.
- ui.css: Eski baloncuk item stilleri ve standalone optimize buton stilleri kaldırıldı. SVG pie menu için özel hover (scale/fill) animasyonları eklendi.

**Reason:** Kullanıcının daha estetik (bütünleşik pasta dilimi) UX beklentisi ve fazlalık olan eski yıldızın silinip işlevin asıl yıldıza verilmesi.

**Test Result:** Kodlar başarıyla JS ve CSS tarafında birleştirildi, event listener'lar ayarlandı. Syntax hatası yok.

---






