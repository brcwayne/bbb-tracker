# BBB Tracker — Geliştirme Planı (Dalga 2)

**Tarih:** 2026-09-11 · **Planlayan:** Opus 5 · **Uygulayan:** Gemini · **Denetleyen:** Sonnet
**Kapsam:** Enis'in 2026-09-11 tarihli geri bildirimleri + Opus'un tespit ettiği 3 gerçek hata.

---

## 0. Çalışma düzeni

| Rol | Kim | Ne yapar |
|---|---|---|
| Planlayıcı | Opus (bu dosya) | Görev tanımları, mimari kararlar, kabul kriterleri |
| Uygulayıcı | **Gemini** | G0–G10 görevlerini kodlar + testlerini yazar |
| Denetçi | **Sonnet** | D1–D4: build/test/typecheck, sayısal mutabakat, kod incelemesi |

**Kural:** Gemini görevleri **tek seferde, ara onay istemeden** uygular. Denetim en sonda, Sonnet
tarafından topluca yapılır. Enis sadece Sonnet'in raporunu okur.

### Dalgalar

```
Dalga A
  G0  ledger.ts                    ← TEMEL, önce bitmeli
  G8  Donut palet genişletme       (G3'ün ön koşulu)
  G3  nakit → varlık sınıfı dağılımı
  G4  nakit oranı (XAU hariç)
  G5  Panorama bilgi mimarisi
  G6  Panorama tipografi
  G9  types.ts FON_FON boşluğu     (küçük)

Dalga B (G0 bittikten sonra)
  G1  Pozisyonlar: işlem bazlı K/Z
  G2  Log: SAT satırlarında K/Z
  G7  Portföyler: kümülatif (geçmiş dahil) K/Z
  G10 Canlı özkaynak mutabakatı
```

**Dosya çakışması uyarısı:** G3/G4/G5/G6 dördü de `Panorama.svelte`'ye dokunur → **aynı Gemini
oturumunda, bu sırayla** yapılmalı. Önerilen oturum bölümü:

- **Oturum 1:** G0
- **Oturum 2:** G8 → G3 → G4 → G5 → G6
- **Oturum 3:** G9
- **Oturum 4** (G0 bittikten sonra): G1 → G2 → G7 → G10

### Her görev için zorunlu

- `cd app && npm test` yeşil (mevcut testler dahil, hiçbiri devre dışı bırakılmadan).
- `npm run check` (svelte-check) yeni hata üretmiyor.
- Her yeni saf fonksiyon için `*.test.ts` birim testi.
- Türkçe arayüz metni; kod tanımlayıcıları mevcut karma stile uyumlu.
- Mevcut yorum yoğunluğuna ve adlandırma alışkanlığına uyulacak.

---

## 1. Mevcut durum — doğrulanmış tespitler

Bunlar tahmin değil; kod ve `data/*.json` okunarak doğrulandı. Gemini bunlara güvenebilir.

### 1.1 İşlem bazlı kâr/zarar hiçbir yerde yok

`app/src/lib/data/derive.ts:derivePositions()` her `SAT` işleminde
`kz = (fiyat_usd − ortMaliyetUsd) × lot − komisyon_usd` hesaplıyor **ama bu sayıyı hiçbir yere
yazmıyor** — sadece `realizedTotalUsd`'e ve sembol bazlı `ClosedPosition.gerceklesmisKzUsd`
toplamına ekliyor. Yani "2026-05-12'de sattığım THYAO'dan ne kazandım?" sorusunun cevabı
**sistemde üretiliyor ama atılıyor**. → **G0 + G1 + G2.**

### 1.2 Portföyler sayfası sadece AÇIK pozisyonları gösteriyor

`Portfoyler.svelte` → `holdingsByPortfolio(view.positions.open, …)`.
Grup başlığındaki `maliyet · değer · K/Z` üçlüsü **yalnızca gerçekleşmemiş K/Z**.
Kapanan her işlem o portföyün karnesinden **tamamen siliniyor**.
Enis'in sorusunun cevabı: **Hayır, geçmişten gelecek şekilde hesaplanmıyor.** → **G7.**

### 1.3 Portföy atfı hatalı (gizli hata)

`breakdowns.ts:latestFieldByKod()` bir sembolün **tüm** pozisyonunu, o sembolün **en son**
işleminin/transferinin portföyüne atıyor. ENIS'te 500 lot, ALFA'da 100 lot EREGL varsa ve son işlem
ALFA'daysa, 600 lotun tamamı ALFA'da görünür. `allocationByPortfolio()` (Panorama pastası) aynı
hatayı yapıyor. → **G0 + G7.**

### 1.4 Nakit, varlık sınıfı dağılımında yok

`allocationByClass(positions.open, instruments)` yalnızca açık pozisyonların **maliyetini**
grupluyor. Nakit (`cashBalanceByHesap`) KPI şeridinde var, pastada yok. → **G3.**

### 1.5 Panorama "son bilinen — 10 Eyl 2026" ne işe yarıyor?

`Panorama.svelte` `headerNote` → `ds.meta.olusturulma` = **Excel'den veri göçünün yapıldığı an**.
Yani "verinin tazeliği" damgası. Ama sayfanın **ortasında**, boş bir "Panorama" başlığının yanında
duruyor; üstündeki rakamların hangi tarihe ait olduğuyla karıştırılıyor. → **G5.**

### 1.6 "Güncel Özkaynak — son ay" = 2026-08-31 kapanışı

`snapshots.json`'ın son satırı **2026-08-31**, kaynağı `excel-monthly-report`.
`monthPerf` ("BU AY" tablosu) da bu satırı kullanıyor → yani **"BU AY" aslında Ağustos**, Eylül değil.
Ay adı hiçbir yerde açıkça yazmıyor (`vm.month.ay` var ama "Ay" etiketiyle gömülü). → **G5.**

### 1.7 "14.436 TL temettü" gizemi — çözüldü

Özet'teki **Alınan Temettü = tüm zamanların toplamı** (`cashflows` içindeki 10 adet TEMETTU =
**$298,07**; TRY görünümünde ≈ 14,4 bin TL). Son ayla ilgisi yok. Üstteki satırdaki *"son ay"*
ipucu tüm bloğa yayılıyormuş gibi okunduğu için karışıyor.
→ **G5: her satıra kendi zaman kapsamı etiketi.**

### 1.8 "Özkaynak Getirisi" belirsiz adlandırma

`ozkaynakGetiri = guncelOzkaynak − yatirilanSermaye`. Finansta "özkaynak getirisi" (ROE) bir
**yüzde**dir; buradaki bir **tutar**. Terim yanlış. → **G5: "Toplam Getiri" + yanında yüzdesi.**

### 1.9 ⚠️ Ciddi mutabakat farkı (Opus tespiti — Enis bunu sormadı)

| Kaynak | Tutar |
|---|---|
| Defterden türetilen **açık pozisyon maliyeti** | **$264.826** |
| Defterden türetilen **nakit** | **$18.795** |
| **Toplam (maliyet bazlı)** | **$283.621** |
| Excel snapshot'ının "Toplam Özkaynak"ı (2026-08-31) | **$191.387** |
| **Fark** | **~$92.000** |

Panorama'daki "Güncel Özkaynak" bu $191k'yı gösteriyor — yani **defterle konuşmuyor**.
Sebep muhtemelen `meta.p0Sinirlari`'nda yazan göç sınırı (mevduatlar `TOPLU` altında toplu, alımlar
kurum bazlı) + Excel raporunun elle tutulmuş olması. Bu fark **kullanıcıya görünmez durumda** ve tüm
"özkaynak" rakamlarını şüpheli yapıyor. → **G10.**

### 1.10 Donut paleti 4 renk, sınıf sayısı 6

`Donut.svelte:25` ve `Panorama.svelte:PALETTE` → 4 renk. Sınıflar: BIST, ALTIN, FON_PARA, FON_HISSE,
USA, **FON_FON**. 5. ve 6. dilim 1. ve 2. ile **aynı renge** düşüyor. G3 nakit dilimini de ekleyince
durum kötüleşir. → **G8.**

### 1.11 Tipografi: iç içe `em` çarpımı

`body { font: 14px }`. `.mini dt { font-size: 0.82em }` → 11,5px. İçindeki `.hint { 0.78em }` →
**9,0px**. `Donut.svelte` etiketleri sabit `10px` ve **`9px`**.
Okunmamasının sebebi kontrast değil, **boyut**. → **G6.**

### 1.12 `types.ts` sınıf birliği eksik

`Instrument.sinif: 'BIST' | 'ALTIN' | 'FON_PARA' | 'FON_HISSE' | 'USA'` — ama `instruments.json`'da
**`FON_FON`** sınıfında 1 enstrüman var. Tip yalan söylüyor. → **G9.**

---

# DALGA A

## G0 — `ledger.ts`: kapsamlı ortalama maliyet defteri ⭐ TEMEL GÖREV

**Neden:** G1, G2, G7, G10'un hepsi buna dayanıyor. Bugün üç ayrı yerde üç farklı pozisyon motoru var
(`derive.ts:derivePositions`, `breakdowns.ts:derivePositionsByBroker`, `breakdowns.ts:latestFieldByKod`)
ve hiçbiri satış bazında kâr/zarar üretmiyor.

**Yeni dosya:** `app/src/lib/data/ledger.ts` + `ledger.test.ts`

### Arayüz

```ts
import type { Transaction, AssetTransfer } from './types'
import type { OpenPosition } from './derive'

/** Defterin hangi boyutta tutulacağı. 'global' = sembol bazlı (bugünkü derivePositions). */
export type ScopeKind = 'global' | 'portfoy' | 'hesap'

/** Bir SAT işleminin gerçekleşen kâr/zararı — her satış için TEK kayıt. */
export interface SaleEvent {
  /** Kaynak Transaction.id — Log sayfasından eşleme için. */
  txId: string
  tarih: string
  kod: string
  hesap: string
  portfoy: string
  /** Bu satışta çıkan lot (aşırı satış kırpılmışsa kırpılmış hali). */
  lot: number
  satisFiyatUsd: number
  /** Satış anındaki ortalama maliyet (USD/lot). */
  ortMaliyetUsd: number
  /** lot × ortMaliyetUsd */
  maliyetUsd: number
  /** lot × satisFiyatUsd − komisyonUsd */
  hasilatUsd: number
  komisyonUsd: number
  /** hasilatUsd − maliyetUsd. derive.ts'teki formülle BİREBİR aynı sonucu vermeli. */
  kzUsd: number
  /** maliyetUsd > 0 ise kzUsd / maliyetUsd, değilse null. */
  kzPct: number | null
  /** Satıştan SONRA bu kapsamda kalan lot. */
  kalanLot: number
  /** kalanLot <= EPS → pozisyon bu satışla tamamen kapandı. */
  pozisyonKapandi: boolean
  /** Bu kapsamdaki ilk AL tarihi (pozisyon kapanınca sıfırlanır). */
  ilkAlisTarih: string
  /** ilkAlisTarih → tarih arası gün sayısı; hesaplanamıyorsa null. */
  tutmaGunu: number | null
}

export interface ScopeLedger {
  /** 'global' için ''; diğerlerinde portföy/hesap kodu. */
  scope: string
  open: OpenPosition[]
  sales: SaleEvent[]
  realizedUsd: number
  /** Bu kapsamda şimdiye kadar yapılmış TÜM alımların net maliyeti (devreden sermaye ölçüsü). */
  toplamAlimMaliyetiUsd: number
  /** Açık pozisyon maliyetinin zaman-ağırlıklı ortalaması (ilk işlemden bugüne). G7 kullanır. */
  ortKullanilanSermayeUsd: number
  /** İlk işlem tarihi → bugün arası gün sayısı. */
  gunSayisi: number
}

export interface LedgerResult {
  /** scope → defter. 'global' kipinde tek anahtar: ''. */
  byScope: Map<string, ScopeLedger>
  /** Tüm kapsamlardaki satışlar, tarih sırasında. */
  allSales: SaleEvent[]
  errors: string[]
}

export function buildLedger(
  txns: Transaction[],
  transfers: AssetTransfer[],
  kind: ScopeKind,
  today?: Date,
): LedgerResult
```

### Uygulama kuralları

1. **Olay sıralaması** — `derivePositionsByBroker`'daki mevcut sıralamayı aynen kullan:
   `tarih` artan → eşitse `txn` önce / `transfer` sonra → eşitse `id` artan.
2. **AL:** `toplamMaliyetUsd += net_usd; lot += lot; ortMaliyetUsd = toplamMaliyetUsd / lot`.
   `ilkAlisTarih` boşsa doldur. `toplamAlimMaliyetiUsd += net_usd`.
3. **SAT:** `sell = min(x.lot, pos.lot)`. `sell > pos.lot + EPS` ise `errors`'a **`derive.ts`'teki
   metnin birebir aynısını** ekle (`` `${id}: aşırı satış ${kod} (istenen ${sell}, mevcut ${lot})` ``)
   ve kırp. `sell <= EPS` ise olayı atla, `SaleEvent` **üretme**.
   `kz = (fiyat_usd − ort) × sell − komisyon_usd`. Bir `SaleEvent` üret.
   `lot` sıfırlanınca `ilkAlisTarih`'i temizle (yeni pozisyon yeni tutma süresi başlatır).
4. **Transfer (`assetTransfers`):** maliyeti kapsamdan kapsama taşır, **kâr/zarar gerçekleştirmez**,
   `SaleEvent` üretmez. `kind === 'portfoy'` iken `hedefPortfoy == null` olan transfer portföyü
   değiştirmez → kaynak kapsamda bırak (mevcut `latestFieldByKod` yorumundaki kural).
   `kind === 'global'` iken transferler **hiç uygulanmaz**.
5. **`ortKullanilanSermayeUsd`:** açık pozisyon toplam maliyeti bir **basamak fonksiyonu**dur.
   Her olayda `(tarih, o andaki toplam açık maliyet)` noktasını biriktir; ardışık noktalar arası gün
   farkıyla ağırlıklandır ve `gunSayisi`'na böl. Son basamak **bugüne** kadar uzatılır.
   `gunSayisi < 1` ise 1 kabul et (sıfıra bölme yok).
6. **EPS = 1e-9**, mevcut kodla aynı.
7. **Saflık:** girdi dizileri değiştirilmeyecek (`[...txns]` kopyası şart). `today` parametresi
   enjekte edilebilir olacak — gövdeye `new Date()` gömülmeyecek.

### `derive.ts` yeniden bağlanması

`derivePositions(txns)` **imzası ve dönüş şekli aynen korunur** (mevcut testler buna bağlı), gövdesi
`buildLedger(txns, [], 'global')` üzerinden yeniden yazılır ve dönüşe **yeni bir alan eklenir**:

```ts
export interface Positions {
  open: OpenPosition[]
  closed: ClosedPosition[]
  realizedTotalUsd: number
  errors: string[]
  sales: SaleEvent[]   // YENİ
}
```

`ClosedPosition` üretimi bugünkü mantıkla aynı kalır (sembol bazlı toplam).

### Kabul kriterleri

- [ ] `npm test` — **mevcut `derive.test.ts` testleri değiştirilmeden geçiyor**.
- [ ] `buildLedger(tx, [], 'global').byScope.get('')!.realizedUsd` ≈ `derivePositions(tx).realizedTotalUsd`
      (|fark| < 0,01).
- [ ] Gerçek veriyle: `realizedUsd ≈ $113.704,47`, açık pozisyon sayısı **34**,
      açık maliyet ≈ **$264.826,36**.
- [ ] `allSales.reduce((s, e) => s + e.kzUsd, 0) ≈ realizedTotalUsd`.
- [ ] `kind: 'portfoy'` ve `kind: 'hesap'` kapsamlarındaki `realizedUsd` toplamı global ile aynı.
- [ ] Birim testleri: kısmi satış · tam kapanış · kapanıp yeniden açılma · aşırı satış ·
      portföyler arası transfer · aynı gün al+transfer · boş defter.

---

## G8 — Donut paletini genişlet *(G3'ün ön koşulu, küçük)*

**Dosyalar:** `app/src/lib/charts/Donut.svelte`, `app/src/routes/Panorama.svelte`, `app/src/app.css`,
**yeni** `app/src/lib/charts/palette.ts`

1. `app.css`'e **hem koyu hem açık** temada 8 kategorik renk ekle (ikisini de tanımla, sadece
   `@media` içine koyma — mevcut token düzenine uy): `--cat-1 … --cat-8`.
   Mevcut `--gain / --gold / --loss / --ink-soft` ilk dördün yerine geçebilir; kalan dördü için
   birbirinden ayırt edilebilir, "rafine mürekkep" paletine uyumlu tonlar seç.
   Koyu temada `--surface (#171b21)` ile kontrast ≥ 3:1 olacak.
2. `Donut.svelte:25` ve `Panorama.svelte:PALETTE` bugün **kopyala-yapıştır iki ayrı dizi**.
   İkisi de yeni `palette.ts` → `export const CATEGORICAL = ['var(--cat-1)', …]` dizisini import etsin.
3. Dilim sayısı palet uzunluğunu aşarsa modulo yerine **"Diğer"e katlama**:
   `Donut`'a `maxSlices?: number` prop'u, varsayılan 8.

**Kabul:** 7 dilimli bir donut'ta hiçbir iki dilim aynı rengi almıyor
(test: render edip `fill` değerlerini topla → `new Set(fills).size === 7`).

---

## G3 — Nakit'i varlık sınıfı dağılımına ekle, Fon Para ile birleştir

**Dosyalar:** `app/src/lib/data/derive.ts` (veya yeni `allocation.ts`), `app/src/routes/Panorama.svelte`

### Kararlar (sorgulanmadan uygulanacak)

**K1 — Sınıf birleştirme.** Yeni görünüm sınıfı: **`NAKİT & PARA PİYASASI`**.
İçerik = broker nakit bakiyeleri toplamı (`Σ cashByHesap`) **+** `sinif === 'FON_PARA'`
enstrümanların değeri. Diğer sınıflar aynen kalır. Sınıf kodu → görünen ad eşlemesi tek yerde:

```ts
export const SINIF_ETIKET: Record<string, string> = {
  BIST: 'BIST Hisse',
  FON_HISSE: 'Hisse Fonu',
  FON_FON: 'Fon Sepeti',
  ALTIN: 'Altın',
  USA: 'ABD Hisse',
  NAKIT: 'Nakit & Para Piyasası',
}
```

**K2 — Baz değişimi: maliyet → güncel değer.** Nakitin "maliyeti" yoktur; maliyet bazlı bir pastaya
nakit eklemek anlamsız. Varlık sınıfı pastası **güncel değer** bazına geçer (satır bazında
`degerUsd ?? toplamMaliyetUsd` — fiyatı gelmemiş satır maliyetine düşer).
Başlık notu `"maliyet bazlı"` → **`"güncel değer · nakit dahil"`**.
*Portföy dağılımı pastası bu görevde değişmiyor; G7'de ele alınıyor.*

**K3 — Negatif nakit koruması.** `Σ cashByHesap < 0` ise nakit dilimi **0** çizilir ve donut'un altına
`⚠ Nakit bakiyesi negatif (−$X) — kurum bazlı düzeltme gerekiyor` satırı eklenir.
(Bugün `nakitHesapBazli` içinde QNB/TEB/MIDAS negatif; toplam pozitif ama bu her an değişebilir.)

### Yeni fonksiyon

```ts
export interface ClassSlice { key: string; etiket: string; tutarUsd: number; pay: number }

export function allocationByClassWithCash(
  open: OpenPosition[],
  instruments: Instrument[],
  nakitUsd: number,
  p: PriceLookup,
): { slices: ClassSlice[]; toplamUsd: number; nakitNegatif: boolean }
```

- `FON_PARA` satırları ve `nakitUsd` tek `NAKIT` anahtarında toplanır.
- `slices` tutara göre azalan sıralı.
- Payı `< %1` olan sınıflar **birleştirilmez** (az sayıda sınıf var).

### Kabul kriterleri

- [ ] `toplamUsd === slices.reduce(...)` ve `Σ pay ≈ 1`.
- [ ] Gerçek veriyle nakit dilimi ≈ **$18.795** + (TP2/FSK/OYL/PTS fonlarının değeri).
- [ ] Hiç fiyat gelmemişken fonksiyon patlamıyor, her şey maliyetine düşüyor.
- [ ] `nakitUsd = −5000` → dilim 0, `nakitNegatif === true`.
- [ ] Panorama'da 6–7 dilimin hepsi **farklı renkte** (G8 sayesinde).

---

## G4 — "Nakit oranı (XAU hariç)" göstergesi

**Dosyalar:** G3'le aynı modül + `app/src/routes/Panorama.svelte`

Enis: *"xau hariç toplam portföyümün % kaçı nakit onu da görmek istiyorum."*

### Karar

XAU **saklama amaçlı** bir varlık — likidite tamponu sayılmamalı, ama nakit oranını suni şekilde de
düşürmemeli. Bu yüzden hem paydan hem paydadan çıkarılır:

```
xauDegerUsd  = Σ(portfoy === 'XAU' olan açık pozisyonların değeri)
               ⟵ portföy kapsamlı defterden (G0, kind:'portfoy'). G0 henüz yoksa geçici
                  olarak sinif === 'ALTIN' ile hesapla ve kodda TODO bırak.
toplamUsd    = Σ(tüm açık pozisyon değeri) + nakitUsd      (G3'ün toplamı)
paydaUsd     = toplamUsd − xauDegerUsd
nakitOrani   = (nakitUsd + fonParaDegerUsd) / paydaUsd
sadeceNakit  = nakitUsd / paydaUsd
```

### Arayüz

Panorama'nın yeni **"Nakit"** bloğunda (bkz. G5) üç satır:

| Etiket | Değer | İpucu (`.hint`) |
|---|---|---|
| Nakit & Para Piyasası | `$X` | kurum bakiyeleri + para piyasası fonları |
| **Nakit Oranı (XAU hariç)** | **`%Y`** | altın hariç portföyün likit kısmı |
| — sadece nakit | `%Z` | para piyasası fonları hariç |

`paydaUsd <= 0` ise `—` göster, bölme yapma.

### Kabul

- [ ] Birim test: XAU'suz veri setinde `nakitOrani === nakit / toplam`.
- [ ] Birim test: tüm portföy XAU ise `paydaUsd ≈ nakitUsd`, oran %100'e yakın, patlamıyor.
- [ ] `paydaUsd = 0` → `null` döner, arayüzde `—`.

---

## G5 — Panorama bilgi mimarisi: sıra, adlandırma, zaman kapsamı

**Dosya:** `app/src/routes/Panorama.svelte` (+ gerekirse `dashboard.ts`)

Enis'in üç şikâyeti tek kökene iniyor: **her rakamın hangi zaman aralığına ait olduğu belirsiz.**
"son ay" ipucu ilk satırda duruyor ama altındaki "Alınan Temettü" tüm zamanların toplamı.

### K4 — Zorunlu kural: her satır kendi kapsamını taşır

`.mini` listesindeki **her** `<dt>`'ye kapsam rozeti eklenecek:

```svelte
<dt>Alınan Temettü <span class="scope">tüm zamanlar</span></dt>
```

Rozet değerleri yalnızca şunlar: `tüm zamanlar` · `Ağu 2026` (gerçek ay adı) · `bugün` · `son 12 ay`.
Ay adı **sabit yazılmaz**, `vm.month.ay` / snapshot tarihinden türetilir.

### K5 — Yeni blok sırası

Enis'in isteği ("BU AY en başa, GERÇEKLEŞMİŞ KÂR düzgünce dağıtılsın") + mantıksal akış:

```
1. BU AY — <Ağustos 2026>          ← EN ÜSTTE (bugün en altta)
2. Özkaynak
3. Kâr / Zarar — tüm zamanlar
4. Nakit                            ← G3/G4 buraya bağlanır
5. Kapanan İşlemler — tüm zamanlar
6. KpiBand (mevcut)
7. Grafikler (mevcut sıra korunur)
```

#### Blok 1 — `BU AY — Ağustos 2026`

- Başlık **ay adını içerir**.
- Snapshot'ın ayı **içinde bulunulan takvim ayı değilse** başlık notu:
  `son kapanan ay · Eylül verisi henüz girilmedi`. (Bugün tam olarak bu durumda.)
- "Ay" satırı kaldırılır (başlıkta zaten var).
- Satır sırası **nakit akışı mantığında**: Başlangıç Sermaye → Eklenen Mevduat → Alınan Temettü →
  Net K/Z → Çekim → **Dönem Sonu** (kalın, üstünde ayırıcı çizgi).
- Net K/Z satırına yüzde eklenir: `netKz / begCapital`.

#### Blok 2 — `Özkaynak`

| Satır | Kaynak | İpucu |
|---|---|---|
| Güncel Özkaynak `<Ağu 2026>` | `lastSnap.toplamOzkaynak_usd` | aylık rapordaki son kapanış |
| Canlı Özkaynak `<bugün>` | **G10** | açık pozisyon değeri + nakit |
| Yatırılan Sermaye `<tüm zamanlar>` | `dashboard.toplamSermaye` | bugüne dek yatırdığın para |
| **Toplam Getiri** `<tüm zamanlar>` | `özkaynak − yatırılan` | "Özkaynak Getirisi" adı kaldırıldı |
| Toplam Getiri % | `getiri / yatırılan` | yatırdığın her 100 ₺ için kazancın |

> **K6 — Adlandırma:** `Özkaynak Getirisi` → **`Toplam Getiri`**.
> Sebep: ROE finansta bir orandır, buradaki bir tutardı — terim yanlış kullanılıyordu.
> İpucu metni: *"bugünkü değerin, yatırdığın toplam paranın ne kadar üstünde"*.

#### Blok 3 — `Kâr / Zarar — tüm zamanlar`

Gerçekleşmiş K/Z · Gerçekleşmemiş K/Z · Alınan Temettü · Çekimler.
Her biri `tüm zamanlar` rozetli. Çekimler 0 ise `—` (bugünkü davranış korunur).

#### Blok 4 — `Nakit`

G3/G4'ten gelen üç satır + varsa negatif nakit uyarısı.

#### Blok 5 — `Kapanan İşlemler — tüm zamanlar`

Mevcut blok; `Net` satırı kalın yapılır.

### K7 — "son bilinen — 10 Eyl 2026" notunun akıbeti

- Sayfa **ortasındaki** boş `<SectionHeader title="Panorama" note={headerNote} />` **tamamen
  kaldırılır** (sayfa başlığı zaten üstte; bu satır sadece kafa karıştırıyor).
- Yerine sayfanın **en üstüne**, ilk bloğun üzerine ince bir künye şeridi:

```
Veri: 10 Eyl 2026 · Fiyatlar: <prices güncelleme zamanı ya da "alınamadı"> · Kur: <rate> ₺/$
```

- `Veri:` ipucu (`title`): *"defterin Excel'den son alındığı tarih"*.
- Dönem filtresi `all` değilse künyeye ` · <dönem etiketi>` eklenir (bugünkü davranış).
- `prices.svelte.ts`'te güncelleme zamanı alanı yoksa **ekle**; eklemek kapsamı büyütüyorsa bu parçayı
  atla ve TODO bırak.

### Kabul

- [ ] Blok sırası yukarıdaki gibi; `Panorama.test.ts` DOM sırasını doğruluyor.
- [ ] "BU AY" başlığı `Ağustos 2026` metnini içeriyor ve `son kapanan ay` notu görünüyor.
- [ ] `grep -r "Özkaynak Getirisi" app/src/` **boş**.
- [ ] Her `.mini dt` içinde bir `.scope` rozeti var (test: `dt` sayısı === `.scope` sayısı).
- [ ] Sayfanın ortasında `Panorama` başlıklı `SectionHeader` yok.

---

## G6 — Panorama okunabilirlik / tipografi *(G5'ten SONRA, aynı oturumda)*

**Dosyalar:** `Panorama.svelte` `<style>`, `Donut.svelte`, `SectionHeader.svelte`, `app/src/app.css`

**Kök sebep:** iç içe `em` çarpımı. `body 14px` × `dt 0.82em` × `hint 0.78em` = **9,0px**.

### K8 — Kurallar (istisnasız)

1. **Hiçbir `font-size` `em` cinsinden olmayacak** — hepsi `rem`. (Çarpım zinciri kırılır.)
2. **Taban 14px → 15px:** `app.css` `body { font: 15px/1.55 … }`.
3. **Mutlak alt sınır 0.8125rem (13px).** Bundan küçük hiçbir metin kalmayacak.
4. Yeni ölçek:

| Seçici | Eski | Yeni |
|---|---|---|
| `.mini dt` | `0.82em` (11,5px) | `0.875rem` (14px) |
| `.mini dt .hint` / `.scope` | `0.78em` (**9,0px**) | `0.8125rem` (13px), **kendi satırında** (`display:block`) |
| `.mini dd` | miras | `1rem` (16px), `font-weight:600` |
| `.mini dd.strong` | `1.15em` | `1.5rem` (24px) |
| `.legend` | `0.85em` | `0.875rem` |
| `.lg-label` | miras | `0.875rem` |
| `.lg-value` | miras | `0.9375rem` (15px) |
| `Donut` merkez etiket | `10px` / `9px` | `0.8125rem` |
| `Donut` merkez tutar | `12px` | `1rem` |
| `SectionHeader` notu | (kontrol et) | min `0.8125rem` |

5. **Kapsam rozeti (`.scope`)** görsel olarak ayrışsın: `--ink-soft`, `0.8125rem`,
   `letter-spacing:.02em`, ince `--hairline` çerçeveli küçük çip
   (`border-radius:3px; padding:0 .3rem`). Değer sütunuyla karışmasın.
6. `.mini div` dikey iç boşluk `0.3rem` → `0.45rem`.
7. **Geniş ekranda iki sütun:** `.mini` → `@media (min-width:720px){ grid-template-columns: 1fr 1fr }`.
   `.mini.month` zaten iki sütun; **dar ekranda tek sütuna düşsün** (bugün mobilde sıkışıyor).
8. `.mini dd.strong` satırının üstüne belirgin ayraç: `border-top: 2px solid var(--hairline)`.

### Kabul

- [ ] `grep -nE "font-size:\s*0?\.[0-9]+em" app/src/routes/Panorama.svelte` **boş**.
- [ ] `grep -nE "font-size:\s*(9|10|11|12)px" app/src/lib/charts/Donut.svelte` **boş**.
- [ ] 390px genişlikte yatay kaydırma yok, `.mini.month` tek sütun.
- [ ] Mevcut Panorama testleri geçiyor.

---

## G9 — `types.ts`: eksik `FON_FON` sınıfı *(küçük)*

**Dosya:** `app/src/lib/data/types.ts`

```ts
sinif: 'BIST' | 'ALTIN' | 'FON_PARA' | 'FON_HISSE' | 'FON_FON' | 'USA'
```

`instruments.json` içinde `FON_FON` sınıfında 1 enstrüman var; tip birliği bunu dışarıda bırakıyordu.
Ekledikten sonra `npm run check` ile **yeni** hata çıkıp çıkmadığını kontrol et; `sinif` üzerinde
`switch`/`Record` kullanan yerlerde `FON_FON` dalını da doldur (G3'teki `SINIF_ETIKET` dahil).

---

# DALGA B *(G0 bittikten sonra)*

## G1 — Pozisyonlar: "hangi pozisyon kapandı, ondan ne kazandım?"

**Dosya:** `app/src/routes/Pozisyonlar.svelte` (+ testleri)

Enis: *"detay bakınca açılır pencerede hangi pozisyonun kapandığını anlamak daha iyi olurdu ve kapanan
pozisyonda ne kadar kar zarar yazdığımı."*

### 1. `Kapalı pozisyonlar` tablosuna iki sütun

| Yeni sütun | İçerik |
|---|---|
| `Son Satış` | `c.sonSatisTarih` → `dateShort` — hangi tarihte kapandığı |
| `Satış` | o sembol için `SaleEvent` sayısı (kısmi çıkışlar görünür olsun) |

### 2. Satır detayını (`rowTxns`) yeniden yaz

Bugün detay, **kâr/zarar içermeyen ham işlem listesi**. Yeni yapı üç katman:

**(a) Özet şeridi** — detayın en üstünde, belirgin:

```
🔴 KAPANDI · 12 May 2026 · 3 satışta 1.200 lot
Gerçekleşen K/Z: +$2.480  (+%18,4)  ·  Tutma süresi: 142 gün
```

Açık pozisyonda:

```
🟢 AÇIK · 800 lot kaldı
Şimdiye dek gerçekleşen: +$310  ·  Gerçekleşmemiş: +$1.940 (+%12,1)
```

**(b) `Satışlar (gerçekleşen kâr/zarar)` alt tablosu** — G0'ın `SaleEvent`'lerinden. **Asıl katkı budur:**

| Tarih | Lot | Satış Fiyatı | Ort. Maliyet | Maliyet | Hasılat | Komisyon | **K/Z** | **%** | Kalan | Kurum | Portföy |
|---|---|---|---|---|---|---|---|---|---|---|---|

- `K/Z` ve `%` sütunları `tone:'sign'` ile renklendirilir.
- `pozisyonKapandi === true` olan satıra sağda **`KAPANDI`** rozeti.
- Satışı olmayan pozisyonda bu blok hiç render edilmez.

**(c) `Tüm işlemler`** — mevcut tablo, `<details>` içine alınıp **varsayılan kapalı**.
SAT satırlarına, o işleme ait `SaleEvent.kzUsd` **satır içinde** eklenir (eşleme `txId === t.id`).

### 3. Açık pozisyon detayı da aynı yapıyı kullanır

Kısmi satış yapılmış açık pozisyonda (b) bloğu görünür — "bu hisseden daha önce ne kazandım" sorusu
açık pozisyonda da cevaplanır.

### Kabul

- [ ] Kapalı pozisyon satırı açılınca `Satışlar` tablosu ve `KAPANDI` rozeti görünüyor
      (testing-library testi).
- [ ] `SaleEvent.kzUsd` toplamı, o satırın `gerceklesmisKzUsd` değerine eşit (|fark| < 0,01).
- [ ] Kısmi satılmış açık pozisyonda hem gerçekleşen hem gerçekleşmemiş K/Z görünüyor.
- [ ] `Tüm işlemler` varsayılan kapalı; açılınca SAT satırlarında K/Z var.

---

## G2 — Log sayfası: SAT satırlarında gerçekleşen K/Z

**Dosya:** `app/src/routes/Log.svelte`

Enis: *"O işlemden yapılan kar yada zarar hiç bir yerde göremiyorum."* — Log, işlemlerin ana listesi;
K/Z'nin **burada** olması gerekir.

- İşlem tablosuna `K/Z` sütunu: `SaleEvent`'i `txId` ile eşle. `AL` satırlarında `—`.
- `tone:'sign'`. Yanında küçük `%` (`kzPct`).
- Tabloya bir anahtar: **`Sadece satışlar`** — tıklanınca yalnız `yon === 'SAT'` satırlar.
- `store.ts:deriveAll` zaten `positions`'ı veriyor; `positions.sales`'ten `Map<txId, SaleEvent>` kur.

### Kabul

- [ ] SAT satırında K/Z görünüyor, AL satırında `—`.
- [ ] `Sadece satışlar` filtresi doğru sayıda satır bırakıyor.
- [ ] Aşırı satış nedeniyle kırpılmış bir işlemde K/Z yine gösteriliyor (kırpılmış lota göre).

---

## G7 — Portföyler: geçmişten bugüne kümülatif kâr/zarar ⭐

**Dosyalar:** `app/src/routes/Portfoyler.svelte`, `app/src/lib/data/breakdowns.ts`

### Enis'in sorusunun cevabı

> *"bir portföy için alıp sattığım işlemlerin kar zarar durumu geçmişten gelecek şekilde sürekli
> hesaplanıyor mu? yoksa sadece açık işlemlerin kar zararı mı gösteriliyor?"*

**Şu an: sadece açık işlemlerin.** Kapanan her işlem o portföyün karnesinden siliniyor.
Ayrıca portföy atfı da hatalı (§1.3). Bu görev ikisini birden düzeltiyor.

### Karar K9 — Portföy performansının doğru tanımı

Tek bir sayı yetmez; üç ayrı soru var, üçü de gösterilmeli:

```
1) Bu portföy bana ne kazandırdı?        → Toplam K/Z   (mutlak tutar)
2) Yatırdığım paraya göre ne kadar iyi?  → Getiri %      (kullanılan sermayeye oranla)
3) Kararlarım isabetli mi?               → İsabet karnesi (kazanma oranı, ort. kazanç/kayıp)
```

**Toplam K/Z (tüm zamanlar):**

```
toplamKz = gerceklesmisKz        (G0, kind:'portfoy' → ScopeLedger.realizedUsd)
         + gerceklesmemisKz      (açık pozisyonlar, güncel fiyatla)
         + temettu               (cashflows: tur === 'TEMETTU' && portfoy === kod)
```

**Getiri % — iki ayrı ölçü, ikisi de gösterilecek:**

| Ölçü | Formül | Ne anlatır | Etiket |
|---|---|---|---|
| Yatırılan maliyete göre | `toplamKz / toplamAlimMaliyetiUsd` | "Bu portföye soktuğum her 100 ₺ ortalama ne getirdi" | `Getiri %` |
| Kullanılan sermayeye göre, yıllıklandırılmış | `toplamKz / ortKullanilanSermayeUsd × (365 / gunSayisi)` | "Bağlı tuttuğum sermaye yılda ne kazandırdı" | `Yıllık ≈ %` |

> **Dürüstlük notu (arayüzde `.hint` olarak yazılacak):**
> *"Yaklaşık ölçüdür — gerçek zaman ağırlıklı getiri (TWR/IRR) değildir; nakit bekleme süresini ve
> ara para giriş-çıkışlarını tam modellemez."*
> Bu notu **atlamayın**; abartılı bir getiri iddiası bu tablodaki en büyük risk.

**Sermaye devir hızı** (bonus, tek satır): `toplamAlimMaliyetiUsd / ortKullanilanSermayeUsd`
→ "sermayeni kaç kez döndürdün". Çok işlem yapan portföyü ayırt eder.

### Arayüz

Her portföy panelinde, `SectionHeader` notunun yerine **iki satırlık performans şeridi**:

```
ENIS                                              [Toplam K/Z  +$34.120  (+%21,4)]
açık: $128.400 maliyet · $141.900 değer · +$13.500 gerç.mmiş
kapanan: +$19.800 gerçekleşmiş · temettü $820 · 24 işlem · %62 isabet · yıllık ≈ %18
```

Ayrıca her panele **katlanabilir `Kapanan İşlemler`** bölümü (varsayılan kapalı): o portföyün
`SaleEvent` listesi — Tarih | Hisse | Lot | K/Z | % | Kurum — tarihe göre azalan.

**Genel özet:** sayfanın en üstüne tüm portföyleri karşılaştıran bir tablo:

```
Portföy | Açık Değer | Gerçekleşmiş | Gerçekleşmemiş | Temettü | Toplam K/Z | Getiri % | Yıllık ≈ %
```

`Toplam K/Z`'ye göre azalan sıralı. **Enis'in "hangi portföy başarılı?" sorusunun doğrudan cevabı budur.**

### K10 — Portföy atfı düzeltmesi

`holdingsByPortfolio` artık `latestFieldByKod` kullanmaz; `buildLedger(txns, transfers, 'portfoy')`
sonucundan beslenir. Böylece iki portföyde tutulan bir sembol **doğru şekilde bölünür**.
`allocationByPortfolio` (Panorama pastası) da aynı kaynağa bağlanır.
Mevcut `latestFieldByKod` ve `attributionEvents` **artık kullanılmıyorsa silinir** (ölü kod bırakma).

### K11 — XAU uyarısı

XAU portföyü alım-satım portföyü değil, saklama portföyü. Karşılaştırma tablosunda XAU satırına
`saklama` rozeti ve `.hint`: *"alım-satım portföyleriyle doğrudan kıyaslanmaz"*.

### Kabul kriterleri

- [ ] Σ(portföylerin `gerceklesmisKz`) ≈ `derivePositions(tx).realizedTotalUsd` ≈ **$113.704,47**
      (|fark| < 0,01).
- [ ] Σ(portföylerin açık maliyeti) ≈ **$264.826,36**.
- [ ] İki portföyde tutulan bir sembol için birim test: lotlar **bölünüyor**, tek portföye yığılmıyor.
- [ ] Hiç kapanan işlemi olmayan portföyde `gerceklesmisKz = 0`, yüzdeler patlamıyor (`0/0` → `—`).
- [ ] `gunSayisi < 30` olan portföyde `Yıllık ≈ %` gösterilmiyor (`—`) — az veriden yıllık getiri
      uydurulmaz.
- [ ] `.hint` içindeki yaklaşıklık uyarısı DOM'da mevcut (test bunu arıyor).

---

## G10 — Canlı özkaynak ve mutabakat farkı

**Dosyalar:** `app/src/lib/data/dashboard.ts`, `app/src/routes/Panorama.svelte`

**Gerekçe (§1.9):** Panorama'nın "Güncel Özkaynak"ı Excel'in **elle tutulmuş aylık raporundan** geliyor
($191.387 · 2026-08-31). Defterin kendisi ise açık pozisyon maliyeti $264.826 + nakit $18.795 diyor.
**~$92.000 fark var ve kullanıcı bunu göremiyor.** Enis "Güncel Özkaynak son ay … anlamadım" derken
aslında bu tutarsızlığa dokunuyor.

```ts
export interface LiveEquity {
  pozisyonDegeriUsd: number      // Σ(degerUsd ?? toplamMaliyetUsd)
  nakitUsd: number
  canliOzkaynakUsd: number       // ikisinin toplamı
  snapshotOzkaynakUsd: number | null
  snapshotTarih: string | null
  farkUsd: number | null         // canli − snapshot
  /** Fiyatı gelmemiş ve maliyetine düşülmüş pozisyon sayısı. */
  fiyatsizPozisyon: number
}

export function liveEquity(
  ds: Dataset,
  positions: Positions,
  p: PriceLookup,
  nakitUsd: number,
): LiveEquity
```

Panorama `Özkaynak` bloğunda:

- `Canlı Özkaynak <bugün>` satırı.
- `|farkUsd| / snapshot > %5` ise **uyarı satırı**:
  `⚠ Aylık rapor ile defter arasında $92.234 fark var — mutabakat gerekiyor`
  `.hint`: *"aylık rapor Excel'den elle geliyor; defter işlemlerden türetiliyor"*.
- `fiyatsizPozisyon > 0` ise: `N pozisyonun güncel fiyatı alınamadı, maliyetine sayıldı`.

### Kabul

- [ ] Gerçek veriyle `canliOzkaynakUsd` hesaplanıyor ve fark uyarısı görünüyor.
- [ ] Snapshot yokken (`snapshots: []`) `farkUsd === null`, uyarı yok, sayfa patlamıyor.
- [ ] Hiç fiyat gelmemişken `pozisyonDegeriUsd ≈ açık maliyet` ve `fiyatsizPozisyon === 34`.

---

# SONNET — DENETİM GÖREVLERİ

Tüm Gemini oturumları bittikten sonra **tek seferde** çalıştırılır.

## D1 — Otomatik doğrulama

```bash
cd app
npm test            # tümü yeşil; hiçbir mevcut test devre dışı bırakılmamış olmalı
npm run check       # yeni svelte-check hatası yok
npm run build       # üretim derlemesi geçiyor
```

`git diff` içinde **`.skip` / `.only` / silinmiş `expect`** aranacak — varsa rapor edilir.

## D2 — Sayısal mutabakat (asıl denetim)

Bu çapa değerler gerçek `data/*.json`'dan hesaplandı. Tek seferlik bir betikle
(`$TMPDIR` altında, repoya commit etmeden) doğrula:

| Ölçü | Beklenen |
|---|---|
| Gerçekleşmiş K/Z (tüm zamanlar, global) | **$113.704,47** |
| Açık pozisyon sayısı | **34** |
| Açık pozisyon toplam maliyeti | **$264.826,36** |
| Nakit toplamı (`Σ cashByHesap`) | **$18.795,01** |
| Temettü toplamı (tüm zamanlar) | **$298,07** |
| Son snapshot özkaynağı (2026-08-31) | **$191.386,89** |
| En büyük açık pozisyon | `ATA LIRA` 143 lot / $38.381,60 |

**Çapraz kontroller:**

- Σ(`allSales.kzUsd`) == global gerçekleşmiş K/Z
- Σ(sınıf dilimleri) == açık pozisyon değeri + nakit

Bu ikisi 0,01'den fazla sapıyorsa **görev başarısız sayılır.**

> ### ⚠️ DÜZELTME (2026-09-11, Opus) — silinen üç kriter
>
> İlk sürümde şu üç kriter vardı ve **üçü de yanlıştı**:
> ~~Σ(portföy bazlı gerçekleşmiş) == global~~ · ~~Σ(kurum bazlı gerçekleşmiş) == global~~ ·
> ~~Σ(portföy açık maliyetleri) == $264.826,36~~
>
> **Neden yanlış:** Bunlar ortalama maliyet defterinin nasıl çalıştığına dair bir yanılgıdan
> doğdu. Aynı sembol farklı kurumlarda/portföylerde **farklı fiyatlardan** alınmışsa, kapsam
> bazlı ortalama maliyet ile global ortalama maliyet **zorunlu olarak farklıdır** — dolayısıyla
> gerçekleşmiş K/Z de farklı çıkar. Bu bir hata değil, matematiğin gereği.
>
> **Ölçülen gerçek değerler** (2026-09-11, gerçek veriyle):
>
> | Kapsam | Gerçekleşmiş K/Z | Açık maliyet |
> |---|---|---|
> | global | $113.704,47 | $264.826,36 |
> | portfoy | $113.784,64 | $264.906,53 |
> | hesap | $113.433,60 | $264.555,49 |
>
> Bağımsız bir Python simülasyonu `hesap` için **birebir** $113.433,60 üretti → uygulama doğru,
> kriter yanlıştı.
>
> **Yerine geçen doğru kriter:** her kapsam, kendi içinde tutarlı olmalı —
> `Σ(scope.sales.kzUsd) == scope.realizedUsd` (her kapsam için ayrı ayrı) ve
> `Σ(scope.open maliyeti) == o kapsamın toplam açık maliyeti`.
> Kapsamlar **arası** eşitlik beklenmez.
>
> **Yan bulgu:** Bu kriteri kovalarken `ledger.ts`'te plana girmemiş bir davranış ortaya çıktı —
> portföyler arası sessiz lot "ödünç alma". G11 görevi bundan doğdu (bkz. aşağısı).

---

## G11 — Portföyler arası "ödünç alma"yı görünür kıl  *(D2 denetiminden doğdu, TAMAMLANDI)*

**Dosya:** `app/src/lib/data/ledger.ts` (+ `derive.ts`, `Portfoyler.svelte`, `Pozisyonlar.svelte`)

**Sorun:** `kind === 'portfoy'` iken bir satış o portföyün pozisyonunu aşarsa, kod diğer
portföylerden sessizce lot ödünç alıyordu — `Map` sırasına göre, `errors` boş kalarak.
Sonuç: `HDFGS` ALFA'da alınıp DELTA etiketiyle satıldığı için **ALFA'nın işlem sonucu DELTA'nın
karnesine** yazılıyordu (ALFA realized $0,00 · DELTA realized −$227,93).

**Yapılanlar:**
1. Ödünç alınan her lot için `errors`'a uyarı:
   `<txId>: <KOD> <satanPortfoy> portföyünde yok, <verenPortfoy> portföyünden <lot> lot alındı — portföy etiketi hatalı olabilir`
2. Veren portföy `Map` sırasına göre değil, **o sembolü en çok lotla tutan** portföye göre seçilir
   (eşitlikte ada göre alfabetik → deterministik).
3. `SaleEvent.oduncAlindi: boolean`; Portföyler ve Pozisyonlar'da `⚠ ödünç` rozeti.
4. `kind === 'hesap'` için ödünç alma **uygulanmaz** — kurumlar fiziksel/hukuki saklama
   kuruluşlarıdır, virmansız satış olmaz; yetersiz lot `aşırı satış` hatası olarak raporlanır.
5. `derive.ts` global + portföy defterlerinin hatalarını birleştirir ki uyarılar Pozisyonlar
   sayfasındaki şeride düşsün.

**Doğrulandı (Opus, bağımsız):** 443/443 test · check 0 hata · build temiz · gerçek veride 3 uyarı
doğru portföyleri adlandırıyor (HDFGS: DELTA←ALFA, FSK: ENIS←FON ×2) · determinizm testi PORT_B'yi
seçti · kurum kapsamında ödünç alma yok · global çapa bozulmadı.

**Kalan tek iş (kod değil, veri):** 3 işlemin portföy etiketi düzeltilmeli ya da eksik
`assetTransfers` kaydı girilmeli. Düzeltilince uyarılar kendiliğinden kaybolur.

## D3 — Kod incelemesi

- `buildLedger` gerçekten tek doğruluk kaynağı mı, yoksa 4. bir pozisyon motoru mu eklendi?
- `derivePositionsByBroker` ve `latestFieldByKod` hâlâ kullanılıyor mu? Kullanılmıyorsa **silinmiş mi?**
- Mutasyon sızıntısı: `buildLedger` girdi dizilerini değiştiriyor mu? (`[...txns]` kopyası şart.)
- `today` parametresi enjekte edilebilir mi, yoksa `new Date()` gövdeye gömülü mü?
- Sıfıra bölme: `pay`, `%`, `kzPct`, `nakitOrani`, `yillik` — hepsinde 0 paydası korunuyor mu?
- Yüzde uydurma: `gunSayisi < 30` kuralı gerçekten uygulanmış mı?
- `em` font-size kalıntısı veya `<0.8125rem` metin kaldı mı?
- Türkçe metinlerde `₺`/`$` ve binlik ayraç mevcut `format.ts` yardımcılarından mı geliyor?

## D4 — Görsel duman testi

`npm run dev`, sırayla: Panorama · Pozisyonlar · Portföyler · Log.

- 390px ve 1440px genişlik.
- Koyu **ve** açık tema.
- Bir kapalı pozisyonu aç → satış tablosu ve `KAPANDI` rozeti görünüyor mu?
- Bir portföyün `Kapanan İşlemler` bölümünü aç.
- Konsol hatası var mı?

---

# EK — Opus'un ek önerileri *(Enis onaylarsa Dalga 3)*

Bunlar **bu plana dahil değil**; ayrıca karar verilecek.

### UI

**Ö1 — "Neden değişti?" paneli.** Özkaynak eğrisindeki bir aya tıklayınca o ayın değişimini
bileşenlerine ayır: `+mevduat · +gerçekleşen · +değerleme · −çekim · −komisyon`.
Bugün eğri sadece "ne oldu"yu gösteriyor, "neden oldu"yu değil — Enis'in tüm soruları aslında
"neden" sorusu.

**Ö2 — Maliyet/değer bazı için genel anahtar.** Sayfalarda üç farklı baz karışık kullanılıyor
(Panorama maliyet, Portföyler iki ayrı pasta, Pozisyonlar ikisi bir arada). Tek bir global
`Maliyet ⇄ Güncel Değer` anahtarı (`settings.svelte.ts`'e, para birimi anahtarının yanına) tüm
sayfaları aynı dile getirir. G3'teki baz değişimi zaten bu yönde bir adım.

**Ö3 — Tutma süresi dağılımı.** `SaleEvent.tutmaGunu` G0'da zaten üretiliyor. Pozisyonlar'a küçük bir
histogram: *"kazandığın işlemleri ortalama 90 gün, kaybettiklerini 14 gün tuttun"* — klasik
"kazananı erken sat, kaybedeni tut" hatasını ortaya çıkarır. Düşük maliyet, yüksek içgörü.

**Ö4 — Kurum bazlı nakit sağlığı.** `nakitHesapBazli` bugün QNB −$56.675, TEB −$57.740,
MIDAS −$58.572 gösteriyor; sadece `TOPLU` +$184.906 olduğu için toplam pozitif. Kurumlar sayfasında
negatif bakiyeli kurumlara kırmızı rozet + "göç kaynaklı, düzeltme gerekiyor" notu.
Şu an sessizce yanlış.

**Ö5 — Panorama'da "dikkat" şeridi.** Mutabakat farkı (G10), negatif nakit (G3), fiyatı gelmeyen
pozisyonlar, aşırı satış hataları (`positions.errors`) — hepsi bugün dağınık veya görünmez.
Sayfa üstünde tek bir katlanabilir `⚠ 3 uyarı` şeridi.

### Bot

**Ö6 — `/kz` komutu.** `/kz THYAO` → o sembolün tüm satışları ve K/Z'leri; `/kz` → son 10 satış.
G0'ın `SaleEvent`'i botun JSON şemasıyla uyumlu; bot kendi `data/`'sında aynı hesabı yapabilir.
Enis'in "hiçbir yerde göremiyorum" şikâyeti mobilde de çözülür.

**Ö7 — Aylık kapanış hatırlatıcısı.** `snapshots.json`'ın son ayı içinde bulunulan aydan geriyse
(şu an: Ağustos vs Eylül) ayın ilk iş günü Telegram'dan hatırlatma:
*"Ağustos kapanışı girildi, Eylül bekleniyor."*
Bugün bu boşluk sessizce Panorama'yı eskitiyor — "son ay hangi ay?" sorusunun kökü de bu.

**Ö8 — Oracle VM'deki Ollama (`qwen2.5:7b`) hâlâ bağlanmamış.** Bağlanacaksa en düşük riskli ilk
kullanım: **serbest metin → kategori önerisi** (kişisel defter için), kural tabanlı NLP'ye
*dokunmadan*, yalnızca "emin değilim" durumunda ikinci görüş olarak. İşlem girişine AI sokmak
(bugünkü kural tabanlı davranışın açık üstünlüğü var) **önerilmez**.

**Ö9 — `rclone` köprüsü elle çalışıyor** (`~/bbb-pull.sh` / `~/bbb-push.sh`). Bir `systemd timer` ile
15 dakikada bir tek yönlü `pull` + değişiklik varsa Telegram bildirimi, "hangi veri güncel?"
belirsizliğini bitirir.
