# Göç Bütünlüğü Raporu (Dalga 4 — Görev I3)
**Tarih:** 2026-09-13  
**Kapsam:** Excel ("BigBlackBook_2026v15 kopyası.xlsm") `Trade Log` ve `Stock Position` sayfaları ile defter (`data/transactions.json`) mutabakatı ve 2026 öncesi satış/kâr analizi.

---

## Yönetici Özeti

1. **2026 Öncesi SAT/SELL Satırları:** Excel Trade Log sayfasında **2026 öncesine ait TEK BİR SATIŞ (SELL) SATIRI YOKTUR**. 2016–2024 yılları arasında girilmiş 43 satırın tamamı AL (BUY) işlemidir. Göç betiği hiçbir satırı sessizce düşürmemiştir; Excel'in kendisinde 2026-02-03 öncesi satış kaydı tutulmamıştır.
2. **Excel El ile Girilen Kâr Sütunu (Column W):** 2016–2024 arasındaki 43 satır için kâr toplamı **$0.00**'dır. Excel'deki $119,689.63'lik kârın tamamı (110 satır) **2026 yılına** aittir. Dolayısıyla defterin $113,704.47 tutarındaki kârı ile Excel kârı "10 yıllık vs 2026" karşılaştırması değil, her ikisi de **yalnızca 2026 gerçekleşen kârını** temsil etmektedir.
3. **2016–2024 Alımlarının Durumu:** 43 alımın **29 adedi bugün hâlâ AÇIKTIR**, **14 adedi ise 2026 yılı içinde** kapatılmıştır (23 FIFO eşleşmesi ile). Kapatılan alımların elde tutma günleri (min 909 gün, maks 2,828 gün / 7.75 yıl, ortalama 1,132 gün / 3.1 yıl) fiziki altın ve ana hisseler için tamamen tutarlıdır.
4. **TP2 584,140 Lot Farkının Kaynağı:** Excel `Stock Position` sayfasındaki 791,292 lot ile defterdeki 207,152 lot arasındaki 584,140 lotluk fark kuruşu kuruşuna çözülmüştür:
   - **499,500 lot:** Excel Trade Log 124. satırındaki klerikal yazım hatası (500,000 lotluk satış sehven 500 lot yazılmış, $21,821.20 nakit girilmiş).
   - **84,640 lot:** Excel dosyası dondurulduktan sonra deftere eklenen iki satış (2026-08-24'te 61,955 lot ve 2026-09-02'de 22,685 lot).
   - `499,500 + 61,955 + 22,685 = 584,140 lot`. Excel `Stock Position` sayfası hem bayat kalmış hem de 499,500 lotluk veri giriş hatasından etkilenmiştir. Defter pozisyonu (207,152 lot) doğrudur.
5. **Nakit Düzeltmesi İlişkisi:** `kimlik.ts: gocNakitDuzeltmesi` ($14,989.38 — bkz. Session 6/E3 güncellemesi, madde 5), Excel'in çift taraflı kayıt tutmayan ve kuruluş sermayelerini işlem bazlı nakitle karıştıran yapısının bir sonucudur; eksik satış geçmişi ile aynı dönemin (ad-hoc Excel dönemi) parçasıdır ancak bağımsız bir nakit mutabakatı kalemidir.

---

## 5 Sorunun Sayısal ve Kesin Yanıtları

### 1. Excel Trade Log'da Yön Sütunu (G) SAT/SELL Olan Satırların Yıl Dağılımı

| Yıl | AL (BUY) | SAT (SELL) | Toplam |
|:---|---:|---:|---:|
| 2016 | 5 | **0** | 5 |
| 2017 | 2 | **0** | 2 |
| 2018 | 6 | **0** | 6 |
| 2019 | 3 | **0** | 3 |
| 2021 | 4 | **0** | 4 |
| 2022 | 5 | **0** | 5 |
| 2023 | 11 | **0** | 11 |
| 2024 | 7 | **0** | 7 |
| 2026 | 78 | **32** | 110 |
| **Toplam** | **121** | **32** | **153** |

*Not: Defterdeki (`transactions.json`) 47 satış satırı; Excel'deki 32 satış satırının çoklu varlık/hesap kırılımları ve Ağustos/Eylül 2026'da deftere sonradan eklenen manuel satış işlemlerinden (2 adet) ileri gelmektedir.*

**Hüküm:** Excel Trade Log'da 2026 öncesine ait SELL satırı sayısı: **SIFIR (0)**.

---

### 2. Excel El ile Girilen Kâr Sütunu (Column W) Yıl Dağılımı

| Yıl | Satır Sayısı | Excel Kâr/Zarar Toplamı (USD) |
|:---|---:|---:|
| 2016 | 5 | $0.00 |
| 2017 | 2 | $0.00 |
| 2018 | 6 | $0.00 |
| 2019 | 3 | $0.00 |
| 2021 | 4 | $0.00 |
| 2022 | 5 | $0.00 |
| 2023 | 11 | $0.00 |
| 2024 | 7 | $0.00 |
| 2026 | 110 | **$119,689.63** |
| **Toplam** | **153** | **$119,689.63** |

- **2026 öncesi payı:** **$0.00 (%0)**.
- **Defterdeki temsil durumu:** Defterdeki $113,704.47'lık realize kârın tamamı 2026 satışlarından üretilmektedir. Excel'deki $119,689.63 toplamı da yalnızca 2026'ya aittir.
- **Farkın sebebi ($5,985.16):** 10 yıllık bir kapsam farkı değildir. Excel'de formülle değil satır bazında el yordamıyla girilmiş kâr sütunu ile defterin tam FIFO eşleşmesi arasındaki hesaplama farkıdır.

---

### 3. 2016–2024 Alımlarının Durumu ve Elde Tutma Günleri (tutmaGunu)

2016–2024 arasında sisteme giren 43 alım işleminin bugünkü durumu:
- **Halen Açık Kalan Alımlar:** **29 adet**
  - ATA LIRA (10 alım, 2016–2024)
  - YARIM (1 alım, 2016)
  - XAU (2 alım, 2016 & 2018)
  - EGEEN (9 alım, 2022–2023)
  - KCHOL (2 alım, 2023)
  - ENKAI (2 alım, 2023)
  - KLKIM (3 alım, 2023–2024)
- **2026'da Kapatılan Alımlar:** **14 adet** (2026'daki 47 satışın 23 FIFO eşleşmesine kaynaklık etmiştir)
- **Kapatılan Alımların Elde Tutma Günleri:**
  - Minimum tutma süresi: **909 gün** (~2.5 yıl — 2023-08-08 alımı, 2026-02-03 satışı)
  - Maksimum tutma süresi: **2,828 gün** (~7.75 yıl — 2018-05-08 XAU alımı, 2026-02-03 satışı)
  - Ortalama tutma süresi: **1,132 gün** (~3.1 yıl)

**Hüküm:** Elde tutma süreleri fiziki altın ve uzun vadeli hisse pozisyonlarının dinamikleriyle bütünüyle tutarlı ve gerçektir.

---

### 4. TP2 584,140 Lot Farkının Analizi

Excel `Stock Position` sayfasında toplam 791,292 lot açık pozisyon görünürken, BBB defterinde 207,152 lot açık pozisyon vardır. Aradaki 584,140 lot fark:

1. **Excel Satır 124 Klerikal Hatası (499,500 lot):**
   - 2026-07-02 tarihinde Excel Trade Log satır 124'e girilen satışta işlem tutarı $21,821.20 girilmiş, ancak lot hanesine sehven **500** yazılmıştır (hisse birim fiyatı ~$0.04366 iken 500,000 lot satılması gerekirken 500 lot girilmiştir).
   - Deftere aktarılırken bu tutar gerçek lot adedi olan 500,000 lot olarak düzeltilmiştir. Excel `Stock Position` formülü ise 500 lot düşmüş, dolayısıyla **499,500 lot fazladan açık** göstermiştir.
2. **Excel Sonrası Eklenen Satışlar (84,640 lot):**
   - Excel çalışma kitabı dondurulduktan sonra deftere Ağustos ve Eylül aylarında iki satış işlenmiştir:
     - 2026-08-24 (`t_c77412f2b4780cfb`): 61,955 lot
     - 2026-09-02 (`t_9bdf44594b1d4dd4`): 22,685 lot
     - Toplam: **84,640 lot**
3. **Doğrulama:**
   $$499,500 + 61,955 + 22,685 = 584,140 \text{ lot}$$
   $$791,292 - 584,140 = 207,152 \text{ lot}$$

**Hüküm:** Excel `Stock Position` sayfası hem dondurulma tarihi itibarıyla bayattır hem de Trade Log satır 124'teki 499,500 lotluk veri giriş hatasını içermektedir. Defterdeki 207,152 lot kesin ve doğrudur.

---

### 5. `kimlik.ts: gocNakitDuzeltmesi` ($14,989.38) ile İlişki

> [!NOTE]
> Session 6 (Görev E3) güncellemesi: Bu kalem eskiden `meta.gocNakitDuzeltmesi` ($14,989.79)
> olarak elle ayarlanmış, `beklenenVarlik`'ten geriye çözülmüş bir tıkaçtı. Artık
> `turetilmisNakit(ds) − nakit` olarak bağımsız hesaplanır ($14,989.38); eski tıkaçın
> içindeki $0,41'lik fark ayrı bir kalem olarak adlandırılmıştır (`yuvarlamaArtigi`,
> bkz. `docs/2026-09-12-mutabakat-raporu.md` §3 Hipotez 4).

`kimlik.ts: gocNakitDuzeltmesi`, defterin kendi işlem ve nakit akışlarından türettiği nakit ile kurum ekstre bakiyelerinin toplamı arasındaki, bağımsız ölçülen mutabakat farkıdır.

- Excel'de nakit akışları (mevduat yatırma/çekme, temettü, faiz) çift taraflı bir yevmiye defteri yerine ad-hoc toplamlarla izlenmiştir.
- Bu durum, satışların kaydedilmemesi ile aynı tarihsel bağlama (Excel'in 2026 öncesinde düzenli bir işlem defteri olarak değil, bir varlık envanteri listesi olarak tutulması) aittir.
- Ancak sayısal olarak bağımsızdır; nakit düzeltmesi nakit akışlarının (giriş/çıkış) mutabakatıdır.

---

## Uygulama ve Rapor Güncellemeleri

1. **Panorama Arayüzü Kapsam İfadesi:**
   - Panorama sayfasındaki "Kapanan İşlemler" kartında yer alan `"tüm zamanlar"` ibaresi, araştırmanın kanıtladığı üzere gerçeği yansıtmamaktadır (tüm işlemler 2026-02-03 sonrasına aittir).
   - Bu ifade `"2026-02'den bu yana"` olarak güncellenmiştir.
2. **Mutabakat Raporu Madde K2:**
   - `docs/2026-09-12-mutabakat-raporu.md` altındaki Madde K2 revize edilerek, Excel kârının da 2026 öncesi sıfır olduğu, aradaki $5,985.16 farkın kapsam farkı değil hesaplama metodolojisi farkı olduğu belirtilmiştir.
