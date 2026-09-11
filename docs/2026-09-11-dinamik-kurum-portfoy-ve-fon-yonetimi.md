# BBB Tracker — Dinamik Kurum/Portföy Senkronizasyonu ve Varlık Detayı Raporu

**Tarih:** 11 Eylül 2026  
**Kapsam:** Web Uygulaması (BBB Dashboard), Telegram Botu (`bbb-telegram-bot`), Veri Mutabakatı  
**Durum:** Tamamlandı, test edildi ve canlıya alındı.

---

## 1. Yapılan Temel Geliştirmeler ve Çözümler

### A. Dinamik Kurum & Portföy Senkronizasyonu (Tera ve Yeni Kurum/Portföyler)
* **Problem:** Web arayüzünden eklenen veya silinen kurumlar (örneğin *Tera Yatırım*) Telegram botunun butonlarında ve doğal dil analizinde (NLP) çıkmıyordu.
* **Çözüm:**
  * Sabit liste yapısı kaldırıldı; botun klavye butonları (`keyboards.py`) ve NLP sözlükleri (`parser.py`, `entity_extractor.py`) doğrudan güncel `brokers.json` ve `portfolios.json` dosyalarından dinamik beslenecek şekilde yeniden yazıldı.
  * Google Drive $\leftrightarrow$ BBB Klasörü $\leftrightarrow$ Bot dizini arasında iki yönlü senkronizasyon (`reverse_import_from_bbb` ve `apply_sync_to_bbb`) devreye alındı.
  * Mobil uyumluluk için butonlar 3'lü sıralar halinde düzenlendi.

### B. Portföyler Sayfası: Kurum Dağılımı ve İşlem Geçmişi Detayı (Akordeon)
* **Problem:** Kullanıcı portföyündeki bir fonun (örneğin TP2) kaç lot kaldığını görebiliyor fakat bu lotların hangi aracı kurumda olduğunu anlayamıyordu.
* **Çözüm:**
  * `Portfoyler.svelte` sayfasına tıklanabilir satır (akordeon) özelliği eklendi.
  * Herhangi bir hisse veya fon satırına tıklandığında:
    1. **Kurum Dağılımı Kartları:** İlgili varlığın hangi kurumda kaç lot olduğu (örn: `QNB: 207.152 Lot (%100)`), portföy payı ve birim maliyeti kartlar halinde açılıyor.
    2. **İşlem Geçmişi Tablosu:** O varlığa ait geçmiş alış/satış dökümü (Tarih, Yön, Lot, Fiyat, Kurum, Portföy, Not) listeleniyor.

### C. Portföy Etiketlerinin Sadeleştirilmesi ve TP2 Veri Düzeltmesi
* **Problem:**
  * İşlem düzenleme/ekleme formundaki Portföy açılır menüsünde eski Excel açıklamaları (`Fonlar`, `Enis (kendi seçimlerim)`, vb.) çıkıyordu.
  * TP2 fonunun 24 Ağustos ve 2 Eylül tarihli satış işlemleri yanlışlıkla `ENIS` portföyü seçilerek kaydedilmişti. Sistem son işleme göre varlığı grupladığı için TP2 tamamen `ENIS` altına geçmiş ve `FON` portföyü boş kalmıştı.
* **Çözüm:**
  * `portfolios.json` sadeleştirilerek doğrudan kısa ve net kodlar (`FON`, `ENIS`, `ALFA`, `DELTA`, `USA`, `XAU`) tanımlandı.
  * `IslemFormu.svelte` ve `VarlikTransferiFormu.svelte` menüleri bu kodları gösterecek şekilde güncellendi.
  * 24.08.2026 ve 02.09.2026 TP2 satış işlemleri `FON` portföyüne aktarıldı. Böylece `FON` portföyü 207.152 lot TP2 ile Portföyler sayfasındaki yerini aldı.

### D. Web Üzerinden Dinamik Portföy Yönetimi (`PortfoyFormu`)
* Kullanıcının webden kolayca yeni portföy açabilmesi için:
  * `PortfoyFormu.svelte` bileşeni geliştirildi.
  * `EkleKaydi.svelte` sayfasına **Portföy Ekle** ve **Portföylerim** (düzenleme/silme) panelleri eklendi.
  * Eklenen her yeni portföy anında `dataset.portfolios`'a ve Google Drive'a işlenir; hem web formlarında hem de Telegram botunda anında seçilebilir hale gelir.

---

## 2. Git ve Canlı Dağıtım Kayıtları

| Depo | Commit | Mesaj | Canlı Durum |
| :--- | :--- | :--- | :--- |
| **bbb-tracker** | `ddaa6df` | `feat(portfoyler): varlik satirina tiklaninca acilan kurum dagilimi ve islem gecmisi detayi` | GitHub Pages Deploy ✅ |
| **bbb-tracker** | `6005fe1` | `feat(portfoyler): portfoy etiketlerini sadelestir, PortfoyFormu ekle ve dinamik portfoy yonetimini sagla` | GitHub Pages Deploy ✅ |
| **bbb-telegram-bot** | `e7055a4` | `feat(bot): add Tera Yatırım and dynamic brokers/portfolios sync from BBB data` | Oracle VM Active ✅ |
| **bbb-telegram-bot** | `5daafeb` | `fix(portfolios): simplify portfolio names to match short codes` | GitHub main ✅ |

---

## 3. Test ve Doğrulama

1. **Web Vitest Testleri:**
   * Toplam **403 test** çalıştırıldı, 0 hata ile tamamı geçti (`403 passed`).
   * `Portfoyler.test.ts` (satır tıklama ve akordeon açılma testi) geçti.
   * `PortfoyFormu.test.ts` (portföy ekleme, doğrulama ve mükerrer kod engelleme) geçti.
2. **Bot Pytest Testleri:**
   * Toplam **574 test** çalıştırıldı, 0 hata ile tamamı geçti (`574 passed`).
   * `test_dynamic_brokers.py` (Tera ve dinamik klavye/NLP) geçti.
3. **Canlı Doğrulama:**
   * GitHub Pages derlemesi `npm run check` ve `npm run build` ile doğrulandı.
   * Oracle VM üzerinde `bbb-bot.service` yeniden başlatıldı ve kesintisiz çalışıyor.
