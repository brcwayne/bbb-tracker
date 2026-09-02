# BBB Tracker — Tasarım Dokümanı

**Tarih:** 2026-09-02
**Durum:** Taslak — kullanıcı incelemesi bekliyor
**Sahibi:** Enis

---

## 1. Amaç ve bağlam

Enis, finansal işlemlerini bugüne kadar "BigBlackBook / AA Excel Spreadsheet" adlı ticari bir
trading-journal şablonunun deneme sürümü üzerinden takip ediyor
(`~/Desktop/Market/BBB/BigBlackBook_2026v15 kopyası.xlsm`). Şablon ağır şekilde özelleştirilmiş,
kısmen Türkçeleştirilmiş ve 2016'dan bugüne gerçek veriyle dolu.

Mevcut sistemin sorunları:

- **Platform bağımlılığı:** Excel + VBA makroları gerektiriyor; pratikte Windows'a bağımlı, Mac'te
  sancılı, telefondan hiç erişilemiyor.
- **Deneme sürümü kısıtları:** Hem bu şablon hem denenen alternatif bir uygulama "trial".
- **Veri girişi birikmesi:** Enis emirleri gün içinde telefondan veriyor; kayıt haftalarca birikiyor.
- **Broker ekstresi:** Aylık mutabakat için aracı kurumdan PDF ekstre alınıyor; sayı formatları
  karışık (`.` / `,`), döküman okunması zor.
- **Bozuk formüller:** Tanımlı adların çoğu `#REF!` / `#VALUE!` veriyor.

Bu doküman, Excel'i **Google Drive tabanlı, her cihazdan erişilebilen, kısıtsız ve verisi
kullanıcıda olan bir PWA** ile değiştirmenin tasarımını tanımlar.

## 2. Hedefler ve hedef olmayanlar

### Hedefler

1. Mac ve iPhone tarayıcısından erişilebilen, ana ekrana kurulabilen tek bir uygulama (PWA).
2. Verinin tamamı kullanıcının Google Drive'ında, **insan- ve AI-okunur JSON** olarak. Claude
   (ve başka AI'lar) Drive erişimiyle portföyü doğrudan okuyup analiz edebilir.
3. **USD bazlı muhasebe:** her işlem, o günün USD/TRY kuruyla USD'ye çevrilir; tüm toplamlar ve
   grafikler USD.
4. Telefondan **çevrimdışı bile** saniyeler içinde işlem kaydı; çevrimiçi olunca Drive'a senkron.
5. Excel'deki değerli sayfaların — **Dashboard, Aylık Rapor, Stok/Pozisyon, Portföyler** —
   yeniden, daha iyi tasarlanmış karşılıkları.
6. Enstrüman bazında **destek / direnç / hedef** seviyeleri ve "hedefe/dirence yaklaşanlar" görünümü.
7. Aylık broker PDF ekstresiyle **mutabakat**: "atladığım işlem var mı?"
8. Excel'deki tüm geçmişin (≈154 işlem, ≈201 nakit hareketi, ≈190 temettü) taşınması.
9. Yüksek estetik: editoryal, sofistike, kişilikli tasarım (bkz. Bölüm 10).

### Hedef olmayanlar

- Native iOS uygulaması (Apple Developer hesabı + sürekli yeniden derleme maliyeti).
- Canlı / intraday fiyat akışı. Fiyatlar "Yenile" düğmesiyle, talep üzerine güncellenir.
- Çok kullanıcılı erişim, paylaşım, işbirliği.
- Kısa vadeli trader araçları: işlem kurulum istatistikleri, duygu/zamanlama değerlendirmesi,
  Kelly Criterion — bunlar **kapsam dışı** (Enis uzun vadeli BIST + altın yatırımcısı).
- Vergi beyannamesi üretimi.
- Otomatik emir iletimi / broker API entegrasyonu.

## 3. Kullanıcı ve senaryolar

**Kullanıcı:** Tek kişi (Enis). Uzun vadeli yatırımcı: BIST hisseleri, fiziki altın
(ATA LIRA, XAU, YARIM), para/hisse fonları, birkaç ABD hissesi. Birden çok aracı kurum.

**Ana senaryolar:**

1. *Emir sonrası hızlı kayıt:* Telefonda, "GARAN / ASTOR / AL / 315 lot / 7,19 TL" — 10 saniye,
   çevrimdışı olsa bile. Kur otomatik eklenir.
2. *Geçmiş tarihli işlem:* "3 gün önceki satışı" girer; sistem o tarihin kurunu bulur.
3. *Durum kontrolü:* Uygulamayı açar, "neyim nerede" — portföy dağılımı, gerçekleşmemiş K/Z,
   hedefe yaklaşan pozisyonlar.
4. *Aylık kapanış:* Ay sonu broker PDF ekstresini verir; eksik/yanlış işlemler raporlanır.
5. *AI'ya danışma:* "Portföyüm hakkında ne düşünüyorsun?" — Claude Drive'daki JSON'u okur.

## 4. Mimari genel bakış

```
┌──────────────────────────┐        ┌───────────────────────────┐
│  PWA (Cloudflare Pages)   │        │  Cloudflare Worker         │
│  - Svelte/React + Vite    │──────▶ │  (kur + fiyat çevirmeni)   │
│  - Elle SVG/D3 grafikler  │  HTTPS │  - TCMB kurları            │
│  - IndexedDB önbellek     │        │  - BIST/ABD/altın fiyatı  │
│  - Çevrimdışı senkron     │        │  - kullanıcı verisi YOK    │
└─────────┬────────────────┘        └───────────────────────────┘
          │ Google OAuth (drive.file)
          ▼
┌──────────────────────────┐
│  Google Drive: BBB/       │  ← tek doğruluk kaynağı
│  *.json                   │  ← Claude buradan okur/analiz eder
└──────────────────────────┘
```

- **Backend yok** (kullanıcı verisi için). Worker yalnızca CORS'lu dış kaynakları proxy'ler;
  durum tutmaz, kimlik istemez.
- **Tek doğruluk kaynağı:** Drive'daki JSON dosyaları. PWA bunları IndexedDB'ye önbelleğe alır,
  değişiklikleri geri yazar (son-yazan-kazanır; tek kullanıcı olduğu için çakışma nadir).
- Kod açık bir GitHub deposunda, Enis'e ait.

## 5. Veri modeli

Drive'da tek klasör: `BBB/`. Dosyalar:

### 5.1 `transactions.json`

Alım/satım defteri. Dizi; her kayıt:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (ULID) | Kalıcı benzersiz kimlik |
| `tarih` | `YYYY-MM-DD` | İşlem tarihi |
| `hesap` | string | Aracı kurum kodu (`brokers.json`) |
| `portfoy` | string | Portföy/strateji etiketi (`portfolios.json`) |
| `enstruman` | string | Enstrüman kodu (`instruments.json`) |
| `yon` | `AL` \| `SAT` | |
| `lot` | number | Adet |
| `girisParaBirimi` | `TL` \| `USD` | Kullanıcının fiyatı hangi para biriminde girdiği |
| `fiyat_tl` | number \| null | TL birim fiyat — `girisParaBirimi=TL` ise girilen, `USD` ise `fiyat_usd * kur` (gösterim için) |
| `fiyat_usd` | number | USD birim fiyat — `girisParaBirimi=TL` ise `fiyat_tl / kur`, `USD` ise girilen |
| `kur` | number | O tarihteki USD/TRY (`fxrates.json`'dan) |
| `komisyon_usd` | number | Toplam işlem masrafı (USD) |
| `brut_usd` | number | `lot * fiyat_usd` |
| `net_usd` | number | AL: `brut + komisyon`, SAT: `brut - komisyon` |
| `not` | string | Serbest metin |
| `kaynak` | `manuel` \| `migration` \| `ekstre` | Kaydın kökeni |
| `olusturulma` | ISO 8601 | |

### 5.2 `cashflows.json`

Para giriş/çıkış + temettü. Her kayıt:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (ULID) | |
| `tarih` | `YYYY-MM-DD` | |
| `hesap` | string | |
| `portfoy` | string \| null | Temettüde ilgili portföy |
| `tur` | `YATIRMA` \| `CEKME` \| `TEMETTU` | |
| `enstruman` | string \| null | Temettüde hisse kodu |
| `tutar_tl` | number \| null | |
| `tutar_usd` | number | |
| `kur` | number | |
| `aciklama` | string | |
| `kaynak` | string | |

### 5.3 `brokers.json`

Aslında **hesaplar** listesi — aracı kurum + hesap sahibi birlikte (aynı kurumda birden
çok hesap olabilir, örn. Oyak'ta Enis'in ve annesinin hesabı). Ekstre mutabakatı hesap bazlı
olduğu için her hesap ayrı kayıt.

```json
[
  { "kod": "GARAN",     "ad": "Garanti Yatırım",  "tur": "BROKER", "sahip": "Enis", "aktif": true },
  { "kod": "MIDAS",     "ad": "Midas",            "tur": "BROKER", "sahip": "Enis", "aktif": true },
  { "kod": "QNB",       "ad": "QNB Finansinvest", "tur": "BROKER", "sahip": "Enis", "aktif": true },
  { "kod": "TEB",       "ad": "TEB Yatırım",      "tur": "BROKER", "sahip": "Enis", "aktif": true },
  { "kod": "OYAK-E",    "ad": "Oyak · Enis",      "tur": "BROKER", "sahip": "Enis", "aktif": true },
  { "kod": "OYAK-ANNE", "ad": "Oyak · Anne",      "tur": "BROKER", "sahip": "Anne", "aktif": true },
  { "kod": "KASA",      "ad": "Kasa (fiziki)",    "tur": "FIZIKI", "sahip": "Enis", "aktif": true }
]
```

`OYAK-ANNE` şimdilik işlemsiz — tanımlı, boş. Kullanıcı uygulamadan **yeni hesap ekleyebilir,
yeniden adlandırabilir, pasife alabilir** (serbest kod/ad).

### 5.4 `portfolios.json`

Portföy/strateji etiketleri. Hesaptan bağımsız. Bir işlem bir hesaba **ve** bir portföye ait.

```json
[
  { "kod": "ENIS",  "ad": "Enis (kendi seçimlerim)", "aktif": true },
  { "kod": "ALFA",  "ad": "Alfa (Yatırım101)",       "aktif": true },
  { "kod": "DELTA", "ad": "Delta (Yatırım101)",      "aktif": true },
  { "kod": "FON",   "ad": "Fonlar",                  "aktif": true },
  { "kod": "USA",   "ad": "ABD Piyasası",            "aktif": true }
]
```

Kullanıcı uygulamadan **yeni portföy etiketi ekleyebilir, yeniden adlandırabilir, pasife
alabilir**; bir pozisyonun/işlemin portföy etiketini tek tıkla değiştirebilir (ileride
holding'leri yeni etiketlere taşımak için). `ALTIN` bir portföy etiketi değil — varlık sınıfı
(bkz. 5.5) onu zaten taşıyor.

### 5.5 `instruments.json`

```json
[
  {
    "kod": "ASTOR",
    "ad": "Astor Enerji",
    "sinif": "BIST",            // BIST | ALTIN | FON_PARA | FON_HISSE | USA  (Varlik Siniflari ile aynı)
    "girisParaBirimi": "TL",    // giriş formunun varsayılan para birimi: BIST/ALTIN → TL, USA → USD (kullanıcı yine değiştirebilir)
    "fiyatKaynagi": "yahoo",
    "fiyatSembolu": "ASTOR.IS",
    "seviyeler": {
      "destek": 6.10,
      "direnc": 7.80,
      "hedef": 9.00,
      "birim": "USD",           // USD | TL
      "not": "3. çeyrek bilanço sonrası revize",
      "guncelleme": "2026-08-20"
    }
  }
]
```

Altın enstrümanları için `fiyatKaynagi: "altin-turev"` — fiyat `XAU/USD * katsayı`
(çeyrek/yarım/tam/gram) formülüyle hesaplanır; katsayılar `instruments.json`'da tutulur.

Kodun sonundaki `.F` eki fon işaretidir; kod olduğu gibi saklanır (ör. `"AFT.F"`), sınıf
`FON_PARA` (para piyasası / likit) veya `FON_HISSE` (hisse fonu) olur — dağılım grafiği ve
TEFAS fiyatı için ayrım burada.

### 5.6 `fxrates.json`

```json
{ "2016-01-01": 2.9207, "2024-02-22": 30.8512, "2026-09-01": 41.05 }
```

Kaynak: TCMB günlük döviz kuru (alış/satış ortalaması veya "döviz alış"; migration'da karar
verilecek). Hafta sonu/tatil tarihleri için **en yakın önceki iş günü** kuru kullanılır (uygulama
mantığında; dosyada boş bırakılır).

### 5.7 `prices.json`

```json
{
  "guncelleme": "2026-09-02T14:30:00Z",
  "fiyatlar": {
    "ASTOR.IS": { "usd": 7.19, "tl": 295.30, "ts": "2026-09-02T14:29:00Z" },
    "XAUUSD":   { "usd": 2510.4, "ts": "2026-09-02T14:29:00Z" }
  }
}
```

"Yenile" düğmesiyle güncellenir. Enstrüman → sembol eşlemesi `instruments.json`'dan.

### 5.8 `snapshots.json`

Ay sonu portföy değeri anlık görüntüleri (equity curve ve aylık rapor performans eğrisi için).

```json
[
  {
    "tarih": "2026-08-31",
    "toplamOzkaynak_usd": 455875.61,
    "nakit_usd": 49403.88,
    "gerceklesmemisKZ_usd": 151279.29,
    "hesapBazli": { "GARAN": 3246.78, "KASA": 205330.69 },
    "portfoyBazli": { "ALFA": 8009.47 },
    "sinifBazli": { "ALTIN": 178869.82, "BIST": 134842.44, "USA": 3413.73 }
  }
]
```

Uygulama, ay değiştiğinde otomatik snapshot ekler; migration geçmiş ayları geriye dönük üretir.

### 5.9 `meta.json`

Şema sürümü, son senkron zamanı, uygulama ayarları (varsayılan mod, para birimi gösterimi,
komisyon oranları).

## 6. Google Drive entegrasyonu ve kimlik

- **OAuth:** Tarayıcıda Google Identity Services. İstenen kapsam: `drive.file` — uygulama yalnızca
  kendi oluşturduğu dosyaları görür, Drive'ın kalanına erişemez.
- İlk açılışta `BBB/` klasörü ve boş JSON dosyaları oluşturulur.
- Token bellekte/oturumda; her cihazda oturumda bir kez giriş.
- **Okuma:** açılışta tüm JSON'lar çekilip IndexedDB'ye yazılır; sonra Drive `changes` ile fark
  senkronu.
- **Yazma:** her mutasyon önce IndexedDB'ye (anında UI), sonra Drive'a `PATCH`. Çevrimdışıysa
  kuyruğa alınır, bağlantı gelince gönderilir.
- **Çakışma:** tek kullanıcı; dosya bazında `modifiedTime` kontrolü, son-yazan-kazanır +
  çakışma olursa yerel kopya `*.conflict.json` olarak saklanır.
- **Yedek:** haftalık otomatik `BBB/backups/YYYY-MM-DD/` kopyası (Drive içinde). İleride Synology
  hedefi eklenebilir.

## 7. Kur ve fiyat çevirmeni (Cloudflare Worker)

Tek dosya, ~30–60 satır, ücretsiz plan. Uç noktalar:

- `GET /fx?date=YYYY-MM-DD` → TCMB'den o günün (veya en yakın önceki iş gününün) USD/TRY'si.
- `GET /fx/range?from=&to=` → migration için toplu geçmiş kur.
- `GET /price?symbols=ASTOR.IS,THYAO.IS,XAUUSD` → güncel fiyatlar.
  - BIST / ABD: Yahoo Finance resmi olmayan uç (`?symbols=` / `chart`).
  - Altın: `XAUUSD` spot + `instruments.json` katsayıları (hesap uygulamada).
  - Fonlar (TEFAS): sonraki fazda, ayrı uç.

Worker durum tutmaz, kimlik istemez, kullanıcı verisi görmez. CORS başlıkları yalnızca PWA
kaynağına açık.

## 8. Migration planı (tek seferlik, rehberli)

**Hacim (gerçek):** Trade Log ≈ **154 işlem** (122 alış, 32 satış), 2016-07 → 2026-08,
46 farklı enstrüman. Bank Transfers ≈ 201 satır. Dividends ≈ 190 satır. (Şablonun yardımcı
hücreleri satır 807'ye kadar dolu ama gerçek işlem sayısı bu.)

**Trade Log sütun düzeni:** `C`=No., `D`=portföy etiketi, `E`=tarih, `F`=enstrüman kodu,
`G`=işlem yönü (BUY/SELL), `H`=TL, `I`=fiyat, `J`=lot, `K`=manuel komisyon, `A`=`#VALUE!`
(formül, yok sayılır).

1. **Çıkarma:** Python (openpyxl) scripti `.xlsm`'den ham satırlar:
   - `Trade Log` → işlem taslakları
   - `Bank Transfers` → nakit hareketleri
   - `Dividends` → temettüler
   - `Stock Position`, `Portföyler` → **doğrulama referansı**
2. **Hesap / portföy eşleme tablosu (kesinleşti):**

   | Excel `D` | → `hesap` | → `portfoy` |
   |-----------|-----------|-------------|
   | `QNB`     | `QNB`     | `ENIS` |
   | `KASA`    | `KASA`    | `ENIS` |
   | `MID.USA` | `MIDAS`   | `USA`  |
   | `TEB`     | `TEB`     | `ENIS` |
   | `OYAK E`  | `OYAK-E`  | `ENIS` |
   | `M.Delta` | `MIDAS`   | `DELTA` |
   | `GARAN`   | `GARAN`   | `ENIS` |
   | `MIDAS`   | `MIDAS`   | `ENIS` |
   | `M.Alfa`  | `MIDAS`   | `ALFA` |
   | `QNB.F`   | `QNB`     | `FON`  |

   Etiket eşleşmesi büyük/küçük harf ve nokta duyarsız yapılır.
3. **Fiyat para birimi (kural — netleşti):** Excel'de `H`=TL sütunu opsiyoneldi ve çoğunlukla
   boş; `I`=Price sütunu **USD** tutuyor (tıpkı yeni sistemdeki gibi: TL enstrümanlar için
   kullanıcı TL girer, sistem yan sütuna USD yazar). Migration'da:
   `fiyat_usd` ← Excel `I`. `fiyat_tl` ← Excel `H` doluysa o, değilse `fiyat_usd * kur`.
   `girisParaBirimi` ← enstrüman sınıfına göre (BIST/ALTIN → `TL`, USA → `USD`).
4. **Kur doldurma:** Tüm işlem/nakit tarihleri için TCMB geçmiş kuru → `fxrates.json`.
5. **Türetme:** işlemlerden pozisyonlar, gerçekleşmiş K/Z, nakit bakiyeleri, aylık snapshot'lar.
6. **Mutabakat raporu:** türetilen değerler vs. Excel'in Stock Position / Monthly Report /
   Portföyler değerleri. Fark eşiğini aşanlar tek tek listelenir ve çözülür.
7. **Doğrulama çapaları:** toplam yatırılan, toplam gerçekleşmiş K/Z, güncel lot adetleri.
8. Çıktı: `BBB/` içinde doğrulanmış JSON seti. Excel arşive taşınır.

**Migration sırasında Enis ile çözülecek kalanlar:** `#VALUE!` / `#REF!` / boş satırlar ·
karışık ondalık ayıraçları · her enstrümanın `sinif`'ı ve fiyat sembolü · `XAU` fiziki altının
giriş para birimi.

## 9. Sayfalar ve bileşenler

### 9.1 Panorama (ana sayfa)

- **KPI şeridi:** Toplam Özkaynak · Gerçekleşmiş Kâr (içeride kalan) · Kâr/Çekimler ·
  Dönem Sonu Sermaye · Gerçekleşmemiş K/Z · Nakit Bakiyesi
- **Equity curve** — zaman içinde toplam özkaynak (snapshot + canlı son nokta). İnce çizgi +
  hafif alan yıkaması.
- **Varlık sınıfı dağılımı** — Altın / BIST / Hisse Fonları / Para Fonları / USA. Doğrudan
  etiketli donut veya yatay yığın bar.
- **Portföy dağılımı** — ENIS / ALFA / DELTA / FON / USA
- **Kâr/zarar dağılımı** — kapanmış işlemlerin % getiri histogramı (Excel'deki 22 kova).
- **Win/Loss** ve **Profit/Loss** oranları — iki küçük donut.
- **Kümülatif en çok kazandıran/kaybettiren** — hisse bazında gerçekleşmiş + gerçekleşmemiş,
  yatay bar.
- **Seviye Takibi / Yaklaşanlar** — açık pozisyonlar için güncel fiyat vs. destek/direnç/hedef;
  "hedefe %2 kaldı", "dirençte", "desteğin altında" rozetleri; en yakın olanlar üstte.
- **Dönemsel performans** — Bu hafta / geçen hafta / bu ay / Ç1–Ç4 / YTD / önceki YTD:
  K/Z ($) ve % .

### 9.2 Aylık Rapor (tam sayfa — Enis için kritik)

- Ay ay tablo: Başlangıç Sermaye · Net Mevduat/Çekim · Ek Mevduat · Çekim · Kazanç · Kayıp ·
  Nakit Temettü · Dönem Sonu Sermaye · Vergi & Komisyon · % Getiri · İşlem K/Z
- Seçili ayın büyük kartı (Excel'deki "This Month Performance").
- Aylık net K/Z bar grafiği (pozitif oküra / negatif mürekkep mavisi ya da tersi — Bölüm 10).
- Ay-üstü-ay (MoM) ve YTD karşılaştırma.
- Performans eğrisi (aylık özkaynak).

### 9.3 Pozisyonlar / Stok (tam sayfa — Enis için kritik)

- **Açık pozisyonlar:** Hisse · Toplam Lot · Ort. Maliyet (USD) · Toplam Maliyet · Güncel Fiyat ·
  Güncel Değer · Gerçekleşmemiş K/Z ($ ve %) · Portföy İçi Ağırlık · Seviye rozetleri
- **Kapanmış pozisyonlar:** Hisse · Alış Ort. · Alış Tutarı · Satış Ort. · Satış Tutarı ·
  Gerçekleşmiş K/Z ($ ve %)
- Hesaba / portföye / varlık sınıfına göre filtre. Sıralanabilir. Ağırlığa göre görsel bar.
- İstatistik başlığı: Win/Loss, ortalama kazanç/kayıp %, en büyük kazanç/kayıp, risk/ödül oranı.

### 9.4 İşlemler

- Ham işlem defteri; tarih/hesap/portföy/enstruman/yön filtreleri, arama.
- **Hızlı ekleme:** her yerden erişilen kompakt form — hesap, portföy, enstruman (otomatik
  tamamlama), yön, lot, fiyat (TL veya USD seçilebilir), tarih (varsayılan bugün), not.
  Kur otomatik. Çevrimdışı çalışır.
- Satır düzenleme / silme (yumuşak silme, geri alınabilir).

### 9.5 Portföyler

- Her portföy için ayrı kart/bölüm (Excel'deki "Portföyler" sayfasının karşılığı): portföy
  büyüklüğü, toplam maliyet, K/Z ($ ve %), içindeki hisseler ve portföy-içi pay.
- Hesap bazlı ve portföy bazlı iki görünüm arasında geçiş.

### 9.6 Temettü & Nakit

- Temettü geçmişi (nakit/hisse/bölünme), toplam alınan temettü, yıllık kırılım.
- Para giriş/çıkış listesi, hesap bazlı toplam mevduat/çekim.

### 9.7 Gezinme

- Mobil: alt sekme çubuğu (Panorama · Pozisyonlar · +Ekle · Aylık · Diğer).
- Mac: sol kenar gezinme + geniş içerik alanı.
- Global "+Ekle" her ekrandan tek dokunuş.

## 10. Sanat yönü

**His:** iyi basılmış bir finansal yıllık rapor / broadsheet. SaaS dashboard değil.

- **Mod:** Koyu varsayılan; açık mod da tam destekli. Kullanıcı değiştirebilir, tercih saklanır.
- **Renk:** Zemin — koyu modda sıcak antrasit (saf siyah değil), açık modda sıcak kırık beyaz.
  Mürekkep — neredeyse siyah / açık modda; kırık beyaz / koyu modda.
  **Vurgu paleti: mürekkep mavisi + oküra.** Kazanç/kayıp bu ikiliyle kodlanır (yön migration
  sonrası netleşir; muhtemelen kazanç = derin mürekkep mavisi, kayıp = yanık oküra/kızıl).
  Altın portföyün ağırlığı için ince, ölçülü bir altın/pirinç vurgu tonu.
- **Tipografi:** Büyük rakamlar için karakterli display yüz (zarif serif ya da kişilikli grotesk).
  Tablo/veri için tabular (hizalı) rakamlar, gerekirse monospace. Rakamlar iri ve kendinden emin.
- **Izgara:** Editoryal, geniş kenar boşlukları, güçlü hiyerarşi, hairline çizgi sistemi. Eşit
  ağırlıklı kart ızgarası yok — bir "kapak" öğesi (büyük KPI), gerisi ona tabi.
- **Grafikler:** Hazır kütüphane yok — elle SVG/D3. İnce çizgi, gölge/gradyan yok, chartjunk yok.
  Legend yerine doğrudan etiketleme. Equity curve ince çizgi + hafif alan. Dağılımlar zarif
  donut veya doğrudan etiketli yatay yığın bar.
- **Detaylar:** Bölüm numaraları, üstte akan başlık (tarih / seçili portföy), dipnot tarzı
  açıklamalar, monospace "son güncelleme" damgası. Mikro-animasyonlar ölçülü ve amaçlı.
- **Yoğunluk:** Bilgi yoğun ama sakin (FT / Tufte etkisi).

Uygulama aşamasında `frontend-design` skill'i devreye girecek; bu bölüm onun için yön verir.

## 11. Hesaplama kuralları

- **Ortalama maliyet:** Hareketli ağırlıklı ortalama. AL → `(mevcut_maliyet + net_usd) / yeni_lot`.
  SAT → lot azalır, ort. maliyet **değişmez**; gerçekleşmiş K/Z = `(satis_fiyat_usd - ort_maliyet) * satilan_lot - komisyon`.
- **Kısa pozisyon yok** (uzun vadeli yatırımcı); SAT yalnızca eldeki lota kadar. Fazlası
  migration'da hata olarak işaretlenir.
- **Nakit bakiyesi (hesap bazlı):** `Σ YATIRMA - Σ CEKME + Σ satış net_usd - Σ alış net_usd + Σ TEMETTU`.
- **Gerçekleşmemiş K/Z:** `Σ (guncel_fiyat_usd - ort_maliyet) * lot` açık pozisyonlar üzerinden.
- **Toplam özkaynak:** `nakit + Σ açık pozisyon güncel değer`.
- **Dönemsel getiri %:** dönem net K/Z / dönem başı sermaye (mevduat/çekim akışları
  zaman-ağırlıklı düzeltilir — basit sürüm: dönem ortası akışları yok sayılır, ileride TWR).
- **Equity curve:** ay sonu snapshot'lar + canlı son nokta. Migration geçmiş ayları üretir.
- **Kur:** işlem tarihindeki değer; tarih `fxrates.json`'da yoksa en yakın önceki iş günü.
- **Altın fiyatı:** `XAUUSD * katsayı` (gram/çeyrek/yarım/tam), katsayılar `instruments.json`'da.
- Tüm para değerleri USD; gösterimde TL karşılığı opsiyonel ikinci satır.

## 12. Aylık ekstre eşleştirme

- **v1 (kod yok):** Enis broker PDF ekstresini bir Claude oturumunda paylaşır. Claude:
  1. PDF'i ayrıştırır → işlem listesi (tarih, hisse, yön, lot, fiyat, komisyon).
  2. İlgili `hesap` + dönem için `transactions.json` ile karşılaştırır.
  3. Rapor: **eksik işlemler**, adet/fiyat uyuşmazlıkları, komisyon farkları, ekstrede olup
     kayıtta olmayan / kayıtta olup ekstrede olmayan.
  4. Enis onaylar → eksikler `transactions.json`'a `kaynak: "ekstre"` ile eklenir.
- **v2 (opsiyonel):** Formatı oturmuş bir broker için Worker'a veya uygulamaya `pdf.js` tabanlı
  içe-aktarma ekranı. Sadece tekrar sıklığı gerektirirse.
- **Gerekli girdi:** her aktif broker'dan birer örnek PDF ekstre.

## 13. Teknoloji seçimleri

| Katman | Seçim | Gerekçe |
|--------|-------|---------|
| Önyüz | Svelte veya React + Vite, TypeScript | Hafif, hızlı, PWA dostu |
| Grafik | Elle SVG + D3 ölçekleri (kütüphane çizim yok) | Sanat yönü için tam kontrol |
| Depolama | Google Drive (`drive.file`) + IndexedDB önbellek | Veri kullanıcıda, AI-okunur, ücretsiz |
| Çevrimdışı | Service Worker + IndexedDB kuyruk | Telefondan anında giriş |
| Kur/fiyat | Cloudflare Worker (proxy) | CORS çözümü, ücretsiz, durumsuz |
| Barındırma | Cloudflare Pages veya GitHub Pages | Ücretsiz |
| Migration | Python + openpyxl | `.xlsm` okuma, zaten çalışıyor |
| Kod deposu | GitHub (Enis'e ait) | |

## 14. Fazlar ve teslimatlar

| Faz | Kapsam | Teslimat / değer |
|-----|--------|------------------|
| **P0** | Bölüm 5 veri modeli kesinleşir; Bölüm 8 migration | Drive'da doğrulanmış JSON; Claude portföyü analiz edebilir |
| **P1** | Salt-okunur PWA: Panorama + Pozisyonlar + Aylık Rapor; koyu tema, mürekkep mavisi + oküra, özel grafikler; Drive'dan okuma; OAuth | "Neyim nerede", görsel, her cihazdan |
| **P2** | Hızlı işlem girişi + İşlemler sayfası + çevrimdışı senkron + Drive'a yazma | Veri girişi birikmesi biter |
| **P3** | Cloudflare Worker: otomatik kur + fiyat "Yenile" | Elle kur/fiyat girme biter |
| **P4** | Portföyler sayfası + Seviye Takibi kartı + Temettü & Nakit sayfası + açık mod | Excel kapsamının tamamı |
| **P5** | Aylık ekstre eşleştirme akışı (v1) | "Atladığım işlem var mı" güvencesi |

Her faz bağımsız değer taşır. P0 + P1, "dashboard'a bak" ihtiyacını tek başına karşılar.

## 15. Açık sorular ve riskler

1. ~~Fiyat/tutar sütunlarının para birimi~~ — **çözüldü:** TL enstrümanda kullanıcı TL girer,
   sistem USD karşılığını (`÷` o günün kuru) yan alana yazar; USD enstrümanda doğrudan USD.
   Excel `I` sütunu zaten USD. Bkz. Bölüm 8.3.
2. ~~Hesap/portföy ayrıştırma eşlemesi~~ — **çözüldü**, bkz. Bölüm 8 tablosu.
3. **TCMB kuru: hangi değer?** — döviz alış / satış / efektif / orta. Öneri: "döviz alış" veya
   alış-satış ortası; migration'da sabitlenir.
4. **Yahoo Finance resmi olmayan uç** kırılganlığı — kesilirse alternatif kaynak (investing.com
   scraping, Fintables) gerekebilir. Worker soyutlaması bunu izole eder.
5. **Altın enstrümanları modeli** — ATA LIRA / YARIM / XAU / gram için katsayı tablosu ve
   milyem/işçilik farkları netleşmeli.
6. **TEFAS fon fiyatları** — P4'e ertelendi; ayrı uç ve muhtemelen ayrı kaynak.
7. **Google OAuth kısıtları** — yayınlanmamış OAuth uygulaması "test" modunda 7 günde bir
   yeniden onay isteyebilir; Google Cloud Console'da "production" başvurusu veya kişisel kullanım
   istisnası gerekebilir.
8. **`drive.file` kapsamı yeterli mi** — uygulama kendi klasörünü yönetebilir; kullanıcı
   dosyaları elle taşırsa yeniden bağlama akışı gerekir.
9. **Vergi/stopaj** — temettüde brüt/net ayrımı kapsamda tutulacak mı? Şimdilik `aciklama`ya
   not; gerekirse alan eklenir.
