# BBB Tracker — Mutabakat Raporu: Defter ⇄ Excel Aylık Rapor Farkı ($92.234,48)

> [!IMPORTANT]
> **MANŞET:** Excel'in kendi **Dashboard**'u ($304.596,32) ile kendi **Monthly Report**'u ($191.386,89) arasındaki fark tam olarak **$113.209,43**'tür — yani aylık raporda eksik olan iki kurucu mevduat. **Excel kendi içinde tutarsızdır; defter değildir.**

**Tarih:** 2026-09-12  
**Kapsam:** Dalga-3 · Görev H1  
**İncelenen Veri Seti:** `data/*.json` (189 işlem, 21 nakit akışı, 124 snapshot) ve `BigBlackBook_2026v15 kopyası.xlsm`

---

## 1. Yönetici Özeti ve Net Hüküm

### Soru: Excel mi, defter mi doğru?
**Cevap: DEFTER DOĞRUDUR (TP2 hariç — Excel Stock Position 791.292 lot, defter 207.152 lot açık gösteriyor; bu kalem ayrıca incelenmeli).**

G10 geliştirmesinde tespit edilen **$92.234,48** tutarındaki farkın **%100'ü kalem kalem kanıtlanmıştır:**

1. **Excel'in `Monthly Report` tablosundaki yapısal formül hatası (+$113.209,43 — Kanıtlandı):**  
   Excel'in aylık rapor tablosu (22–145. satırlar), formül tasarımındaki sınır ve eksik indisler nedeniyle **2016-01-01 ($109.699,10)** ve **2018-05-21 ($3.510,33)** tarihlerinde yatırılan toplam **$113.209,43** tutarındaki kurucu sermaye mevduatını aylık sermaye zincirine hiç dahil etmemiştir.  
   Excel'in kendi **Dashboard** sayfası bu hatayı doğrulamakta; toplam sermayeyi $184.608,62 ve dönem sonu sermayesini **$304.596,32** olarak vermektedir. Ancak göç (P0) betiği `Monthly Report` 22. satırını (Ağustos 2026) referans aldığı için `snapshots.json`'a eksik sermayeli sayı olan **$191.386,89** girmiştir.
2. **Kavramsal Ayrışma (Realize Kapanış Sermayesi vs. Portföy Varlık Değeri):**  
   Excel `Monthly Report` hiçbir zaman açık hisselerin anlık piyasa değerini (mark-to-market) izlememiştir; yalnızca realize olmuş kâr ve nakit sermayeyi takip etmiştir. Defter ise anlık açık pozisyon maliyeti ($264.826,36) + nakit bakiyesini ($18.795,01) toplayarak canlı varlığı ($283.621,37) izlemektedir.
3. **Göç Sınırı Nakit Çapası Farkı (K3: -$14.989,38 — Kanıtlandı) ve Satış Hasılatı Yuvarlama Artığı (K3b: -$0,41 — Kanıtlandı):**  
   H1'in ilk araştırmasında 'açıklanamayan bakiye' olarak kayda geçen kalem Dalga 4 (Görev I1) ve Session 6 (Görev E3) ile tam olarak çözülmüştür:
   - **$14.989,38 (K3):** Defterin kendi işlem ve nakit akışlarından türettiği nakit (`turetilmisNakit(ds)`, $33.784,39) ile kurum ekstre bakiyelerinin toplamı (`cashBalanceByHesap`, $18.795,01) arasındaki farktır — bağımsız ölçülür, kimlikten geriye çözülmez (`kimlik.ts: gocNakitDuzeltmesi`). Kurum ekstrelerinin göç sınırında kurucu sermaye mevduatlarını yansıtmaması sebebiyledir.
   - **$0,41 (K3b):** `ledger.ts`'in satış hasılatını (`hasilatUsd`) yuvarlanmış/türetilmiş bir birim fiyat alanından (`fiyat_usd`) yeniden hesaplaması ile işlemin kendi kayıtlı nakit değeri (`net_usd`) arasındaki 47 satış üzerinden birikmiş kuruş-altı fark (`kimlik.ts: yuvarlamaArtigi`).
   - **K4 Notu:** Ağustos 2026 sonrası girilen işlemlerin net kârı (+$1.412,51), defterin $113.704,47 tutarındaki toplam gerçekleşmiş K/Z'sine zaten dahil olduğu için mutabakat köprüsünde bağımsız bir kalem olarak yer almaz (çift sayımı önlemek için köprü dışındadır).
   Köprü K1, K2, K3 ve K3b kalemleriyle kuruşu kuruşuna ($0,00 artık bakiye) tam olarak kapanmaktadır.

---

## 2. Mutabakat Köprüsü (Farkın Kalem Kalem Dökümü)

| # | Kalem Adı | Tutar (USD) | Fark Payı | Durum | Açıklama |
|---|---|---|---|---|---|
| **—** | **Excel Snapshot (2026-08-31)** | **$191.386,89** | — | **Baz** | `snapshots.json` son kayıt (Excel Monthly Report R22) |
| **K1** | **Excel Aylık Tablosunda Eksik Tarihsel Mevduatlar** | **+$113.209,43** | **%122,74** | Kanıtlandı | 2016-01-01 ($109.699,10) ve 2018-05-21 ($3.510,33) mevduatları Excel aylık tablosuna girmemişti. Excel Dashboard'u ile Monthly Report arasındaki iç farktır ($304.596,32 − $191.386,89). |
| **=** | **Excel Düzeltilmiş Dönem Sonu Sermayesi** | **$304.596,32** | — | **Ara Toplam** | **Çapraz Kontrol 1:** Mevduat $184.608,62 + Excel Kârı $119.689,63 + Temettü $298,07 = $304.596,32 |
| **K2a** | **— Göç Satışlarında Metodoloji Ayrışması (32 Satış)** | **-$6.695,21** | **-%7,26** | Kanıtlandı | Excel'in 32 satış satırındaki el ile girilmiş kârı ($119.689,63) ile defterin bu 32 satışa biçtiği katı FIFO kârı ($112.994,42) arasındaki fark. |
| **K2b** | **— Göç Sonrası Eklenen Satışlar (15 Satış)** | **+$710,05** | **+%0,77** | Kanıtlandı | Excel kapandıktan sonra deftere girilen 15 satış işleminin realize K/Z'si. (**Çapraz Kontrol 2:** $112.994,42 + $710,05 = $113.704,47 toplam realize K/Z). |
| **K2** | **Excel Manuel Kârı vs Defter Realize K/Z (Net)** | **-$5.985,16** | **-%6,49** | Kanıtlandı | K2a + K2b: Excel el kârı ($119.689,63) ile defter realize K/Z'si ($113.704,47) arasındaki net ayrışma. |
| **=** | **Defter Muhasebe Kimliği Sermayesi (`beklenenVarlik`)** | **$298.611,16** | — | **Ara Toplam** | Mevduat ($184.608,62) + Defter Kârı ($113.704,47) + Temettü ($298,07). |
| **K3** | **Göç Sınırı Nakit Çapası Farkı (`kimlik.ts: gocNakitDuzeltmesi`)** | **-$14.989,38** | **-%16,25** | Kanıtlandı | Defterin kendi işlem ve nakit akışlarından türettiği nakit (`turetilmisNakit(ds)`, $33.784,39) ile kurum ekstre bakiyelerinin toplamı (`cashBalanceByHesap`, $18.795,01) arasındaki fark — bağımsız ölçülür, kimlikten geriye çözülmez. |
| **K3b** | **Satış Hasılatı Yuvarlama Artığı (`kimlik.ts: yuvarlamaArtigi`)** | **-$0,41** | **-%0,00** | Kanıtlandı | `ledger.ts`'in 47 satışın hasılatını yuvarlanmış `fiyat_usd` alanından yeniden hesaplaması ile işlemlerin kendi `net_usd` alanı arasındaki birikmiş kuruş-altı fark. |
| **=** | **Defter Canlı Toplamı (Maliyet + Nakit)** | **$283.621,37** | **%100,00** | **Hedef** | Açık Maliyet: $264.826,36 + Gösterilen Nakit: $18.795,01 |
| **Özet** | **Köprü Toplamı (K1 − K2 − K3 − K3b)** | **+$92.234,48** | **%100,00** | — | $113.209,43 − $5.985,16 − $14.989,38 − $0,41 = +$92.234,48 (%100 kanıtlandı) |
| **Δ** | **Kalan Açıklanamayan Bakiye (Artık)** | **$0,00** | **%0,00** | — | Tam mutabakat sağlandı ($0,00 artık). |

> [!NOTE]
> **K4 (Zaman Farkı) Neden Köprüde Bağımsız Bir Kalem Değildir?**  
> 2026-08-31 sonrasındaki 10 işlem ve bunların getirdiği +$1.412,51'lik realize kâr, defterin $113.704,47 tutarındaki toplam gerçekleşmiş K/Z'sine zaten **dahildir** (K2b içinde +$710,05 ve portföy içi satışlar olarak yer alır). Bu tutarı köprüde ayrıca listelemek çift sayıma (double-counting) yol açar ve köprüyü $1.412,51 kadar saptırır. Eski H1 raporunda K3 açıklanamayan artık bir bakiye olduğu için bu çift sayımı sessizce yutmuştu ($14.989,38 + $0,41 + $1.412,51 = $16.402,30). K3 ve K3b gerçek değerleriyle ($14.989,38 ve $0,41) ayrıştırıldığında köprü K1, K2, K3 ve K3b ile $0,00 kalansız kapanır.

---

## 3. Beş Hipotezin Sayısal Sınama Sonuçları

### Hipotez 1: Zaman Farkı (`tarih > 2026-08-31`)
- **Bulgu:** 2026-08-31 sonrasında `transactions.json` içinde 10 adet işlem vardır (4 SAT, 6 AL).
- **Sayısal Kanıt:**
  - Toplam alım tutarı: **$21.843,34**
  - Toplam satış hasılatı: **$20.795,66**
  - Nakit akışı etkisi: **-$1.047,68**
  - Açık pozisyon maliyeti etkisi: **+$2.460,19**
  - Gerçekleşen kâr/zarar etkisi: **+$1.412,51** (TP2 +$48,04, THF +$537,67, DOH +$826,72, FI5 +$0,08)
- **Sonuç:** Zaman farkı tek başına farkın **$1.412,51'ini (%1,53)** açıklar.

### Hipotez 2: Maliyet ≠ Piyasa Değeri (Gerçekleşmemiş K/Z)
- **Bulgu:** G10 çalıştığında `Fiyatlar: alınamadı` durumunda olduğu için `liveEquity` açık pozisyonları piyasa değeriyle değil maliyet değeriyle ($264.826,36) değerlemiştir.
- **Sayısal Kanıt:**
  - Excel'in kendi `Trade Plan` sayfasında açık hisselerin piyasa değeri **$406.471,73**, maliyeti **$255.192,44**, gerçekleşmemiş kârı ise **+$151.279,29**'dur.
  - Excel Dashboard'undaki "Gerçekleşmemiş Özkaynak Değeri" ise **$455.875,61**'dir (Piyasa değeri $406.472 + Nakit $49.404).
  - Snapshot'taki $191.386,89 sayısı ise piyasa değeri değil, gerçekleşmiş sermaye kapanışıdır.
- **Sonuç:** $191.386,89 ile $283.621,37 arasındaki karşılaştırma bir piyasa değeri farkı değil; realize sermaye tabanı ile varlık tabanının karşılaştırılmasıdır.

### Hipotez 3: Göç Sınırı ve Excel Monthly Report Hatası (Ana Neden — Kanıtlandı)
- **Bulgu:** Excel `Bank Transfers` sayfasında toplam **$184.608,62** tutarında mevduat kayıtlıdır:
  1. `2016-01-01`: $109.699,10 (Altın karşılığı kurucu sermaye)
  2. `2018-05-21`: $3.510,33 (EGEEN alımı mevduatı)
  3. `2021-12-28` – `2026-07-30`: $71.399,19 (Muhtelif banka mevduatları)
- **Excel'deki Hata:**
  - Excel `Monthly Report` tablosu 145. satırda (2016-05) biter; 2016-01-01 mevduatını arayacak satırı yoktur.
  - 2018-05-21 satırının ise tarih anahtarı (L sütunu) boş bırakıldığı için `SUMIFS` formülü bu tutarı yakalayamamıştır.
  - Sonuç olarak aylık rapor zinciri ilk iki mevduatı ($113.209,43) hiç görmemiş, Ağustos 2026 kapanışını **$191.386,89** olarak hesaplamıştır.
  - Oysa Excel'in kendi Dashboard'u ve Monthly Report özet satırı (21. satır) bu iki mevduatı ekleyerek gerçek dönem sonu sermayesini **$304.596,32** olarak verir:
    $$\$191.386,89 + \$113.209,43 = \$304.596,32$$
- **Sonuç:** $92.234'lük farkın en büyük kalemi (+$113.209,43), Excel'in aylık rapor tablosunun tarihsel kurucu sermayeyi dışarıda bırakmasından kaynaklanır.

### Hipotez 4: Göç Sınırı Nakit Çapası ve TP2 Pozisyon Ayrışması (K3/K3b Çözümü — Kanıtlandı)
- **Bulgu:** K3 ($14.989,38) ve K3b ($0,41) kalemleri — toplamı $14.989,79 — göç anı nakit çapasının ve satış hasılatı yuvarlamasının defterin çift taraflı muhasebe kimliğiyle mutabakatından doğan iki bağımsız kalemdir:
  1. **$14.989,38 (K3, Göç Nakit Çapası Farkı):** Defterin kendi işlem ve nakit akışlarından türettiği nakit (`turetilmisNakit(ds)`, $33.784,39) ile kurum ekstre bakiyelerinin toplamı (`cashBalanceByHesap`, $18.795,01) arasındaki farktır. Bu fark, kurum ekstrelerinin göç sınırındaki kurucu sermaye mevduatlarını ve göç işlemlerini nakde katmamasından doğar; `kimlik.ts` içinde `gocNakitDuzeltmesi` alanıyla adlandırılmıştır. **Önemli:** Bu değer `beklenenVarlik`'ten geriye çözülmüş bir tıkaç DEĞİLDİR — `turetilmisNakit(ds) − nakit` olarak, kimlikten tamamen bağımsız hesaplanır. (Eski sürümde bu kalem $14.989,79 olarak `meta.gocNakitDuzeltmesi`'ne elle yazılmış, geriye çözülmüş bir tıkaçtı; bu tıkaç aslında K3 ile K3b'nin toplamıydı — bkz. madde 3.)
  2. **$0,41 (K3b, Satış Hasılatı Yuvarlama Artığı):** `ledger.ts`, her satışın hasılatını (`hasilatUsd`) satış anındaki yuvarlanmış/türetilmiş birim fiyattan (`fiyat_usd × lot − komisyon_usd`) yeniden hesaplar; bu, işlemin kendi kayıtlı nakit değerinden (`net_usd`) küçük ölçüde sapar. 47 satış üzerinden bu sapmaların toplamı tam olarak **$0,4142**'dir (`Σ hasilatUsd − Σ SAT net_usd`) ve `kimlik.ts` içinde `yuvarlamaArtigi` alanıyla adlandırılmıştır — kimlikten geriye çözülmez, doğrudan satış/işlem çiftlerinden ölçülür.
  3. **Eski Tıkaçla İlişki:** Dalga 4'te `meta.gocNakitDuzeltmesi` elle $14.989,79 olarak ayarlanmıştı; bu, K3 ($14.989,38) ile K3b'nin ($0,41) toplamına eşittir ve kimliği kuruşuna kadar değil, $0,41'lik bir kalıntıyla kapatıyordu (bkz. Bölüm 4, eski betik). Session 6 (Görev E3) bu iki bağımsız kalemi ayrıştırıp adlandırmış, `meta.gocNakitDuzeltmesi` alanını koddan kaldırmıştır.
  4. **Zaman Farkı (K4) Notu:** 2026-08-31 sonrası işlemlerin net kârı ($1.412,51), defterin $113.704,47 gerçekleşmiş kârına zaten dahildir ve köprüye mükerrer sokulamaz.
- **TP2 Notu:** Excel `Stock Position` ile `transactions.json` arasındaki 584.140 lotluk TP2 fonu ayrışması I3 görevi kapsamında çözülmüştür: Excel 124. satırdaki 499.500 lotluk yazım hatası + 84.640 lot Ağustos/Eylül defter satışları. Defter pozisyonu (207.152 lot) doğrudur; Excel sayfası bayattır.

### Hipotez 5: Döviz Kuru ve Gerçekleşmiş K/Z Farkı (K2a / K2b Ayrışması — Kanıtlandı)
- **Bulgu:** I3 araştırması ve C1 ayrıştırmasıyla kanıtlandı ki, Excel Trade Log'da 2026 öncesine ait hiçbir satış veya kâr satırı ($0.00) bulunmamaktadır. Excel'deki $119.689,63 tutarındaki kârın tamamı 2026 yılındaki 32 satış satırına aittir. Defterde ise toplam 47 satış olayı vardır (32 göç satışı + 15 göç sonrası manuel satış).
- **Sayısal Ayrışma:**
  - **K2a (32 Göç Satışında Metodoloji Ayrışması):** -$6.695,21 (Excel $119.689,63 vs Defter $112.994,42).
  - **K2b (15 Göç Sonrası Manuel Satış):** +$710,05 (Defterin 2026 Ağustos/Eylül satışları).
  - **Net K2:** -$5.985,16 (Çapraz kontrol: $112.994,42 + $710,05 = $113.704,47 toplam defter realize K/Z).

---

## 4. Matematiksel Sağlama ve Tekrar Üretilebilirlik

Aşağıdaki betik fark kalemlerini doğrudan `data/` dosyalarından doğrular:

```typescript
// /Users/enisuslu/Desktop/Market/BBB/app dizininde:
// npx tsx ile calistirilabilir
import { readFileSync } from 'node:fs'
import { derivePositions } from './src/lib/data/derive'
import { cashBalanceByHesap, turetilmisNakit } from './src/lib/data/cashBalances'

const ds = {
  transactions: JSON.parse(readFileSync('../data/transactions.json', 'utf8')),
  cashflows: JSON.parse(readFileSync('../data/cashflows.json', 'utf8')),
  snapshots: JSON.parse(readFileSync('../data/snapshots.json', 'utf8')),
  meta: JSON.parse(readFileSync('../data/meta.json', 'utf8')),
}

const pos = derivePositions(ds.transactions)
const openCost = pos.open.reduce((s, p) => s + p.toplamMaliyetUsd, 0) // $264.826,36
const cash = Object.values(cashBalanceByHesap(ds as any)).reduce((s, v) => s + v, 0) // $18.795,01
const defterTotal = openCost + cash // $283.621,37
const snapAug = ds.snapshots.find(s => s.tarih === '2026-08-31').toplamOzkaynak_usd // $191.386,89

const fark = defterTotal - snapAug // $92.234,48

// Köprü Kalemleri (K1, K2, K3, K3b):
const k1_eksikMevduat = 109699.10 + 3510.33 // +$113.209,43 (2016 + 2018 kurucu mevduatlari)
const excelDonemSonu = snapAug + k1_eksikMevduat // $304.596,32 (Çapraz kontrol: 184.608,62 + 119.689,63 + 298,07 = 304.596,32)

const k2_kzFarki = pos.realizedTotalUsd - 119689.63 // -$5.985,16 (K2a: -$6.695,21 + K2b: +$710,05)
const defterKimlikSermaye = excelDonemSonu + k2_kzFarki // $298.611,16

// K3: gocNakitDuzeltmesi — turetilmisNakit(ds) − nakit'ten BAĞIMSIZ hesaplanır,
// beklenenVarlik/defterKimlikSermaye'den geriye çözülmez (bkz. src/lib/data/kimlik.ts).
const k3_gocNakitFarki = -(turetilmisNakit(ds) - cash) // -$14.989,38

// K3b: yuvarlamaArtigi — ledger.ts'in fiyat_usd bazlı hasilatUsd'si ile SAT
// işlemlerinin kendi net_usd'si arasındaki, 47 satış üzerinden ölçülen fark.
const txById = new Map(ds.transactions.map((t: any) => [t.id, t]))
const k3b_yuvarlamaArtigi = -pos.sales.reduce(
  (s: number, sale: any) => s + (sale.hasilatUsd - txById.get(sale.txId).net_usd),
  0,
) // -$0,41

const hesaplananDefterVarlik = defterKimlikSermaye + k3_gocNakitFarki + k3b_yuvarlamaArtigi // $283.621,37

const kopruToplami = k1_eksikMevduat + k2_kzFarki + k3_gocNakitFarki + k3b_yuvarlamaArtigi // +$92.234,47
const artikBakiye = fark - kopruToplami // $0,0006 (kuruşun altında, önemsiz — bkz. not)

console.log('Hedef Fark (Defter - Excel Snapshot):     ', fark.toFixed(6)) // 92234.475462
console.log('Köprü Toplamı (K1 + K2 + K3 + K3b):       ', kopruToplami.toFixed(6)) // 92234.474893
console.log('Kalan Artık Bakiye (Residual):              ', artikBakiye.toFixed(6)) // 0.000569 (kuruşun altında)
```

> [!NOTE]
> Yukarıdaki betik tam kayan nokta hassasiyetiyle çalışır ve `snapAug` (Excel snapshot) değeri
> `data/snapshots.json`'da `$191.386,89` değil `$191.386,892709` olarak saklıdır — yani zaten
> kuruşun altında bir kuyruğu vardır. Bu nedenle `kopruToplami` ile `fark`, tam ondalıkla
> karşılaştırıldığında $0,0006'lık (kuruşun ~1/18'i) önemsiz bir kayan-nokta artığı taşır; iki
> ondalığa yuvarlandığında bu $0,01'lik kozmetik bir farka dönüşebilir (92.234,47 vs 92.234,48).
> Köprü tablosundaki (Bölüm 2) kuruşa-yuvarlanmış K1–K3b değerleri ($113.209,43 − $5.985,16 −
> $14.989,38 − $0,41) tam olarak $92.234,48 verir; bu betik tam hassasiyetle çalıştığı için
> aynı kalıntıyı ondalık basamakta taşımaz.

---

## 5. Uygulama ve Arayüz Aksiyonları

1. **Panorama Sayfası (G10 Not Metni):**  
   Farkın ana kaynağı kanıtlandığı için kullanıcıda kaygı uyandıran kırmızı alarm (`warn-strip`) yerine, durumu net açıklayan bilgilendirici bir not (`note-strip`) yer almalıdır.
2. **Kullanıcıya Mesaj:**  
   *"Aylık rapordaki $191k kapanışı Excel'in eski bir tablosundan gelmekte olup tarihsel kurucu mevduatları ($113k) içermemektedir. Defterdeki $284k varlık toplamı tüm işlemlerinizi ve gerçek sermayenizi yansıtmaktadır. TP2 pozisyonundaki 584k lotluk ayrışma ise K3 artık bakiyesini oluşturmakta ve ayrıca incelenmeyi beklemektedir."*
