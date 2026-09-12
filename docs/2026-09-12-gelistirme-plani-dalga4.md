# BBB Tracker — Geliştirme Planı (Dalga 4)

**Tarih:** 2026-09-12 · **Planlayan:** Opus 5 · **Uygulayan:** Gemini · **Denetleyen:** Sonnet
**Öncülü:** [Dalga 3](./2026-09-12-gelistirme-plani-dalga3.md) (H0–H10) — **kodu yazıldı, testleri yeşil, ama commit edilmedi ve denetlenmedi.**

**Ölçülen durum (2026-09-12 14:45):**
`app` → 64 dosya / **489 test yeşil**, `npm run check` → **0 hata**, 68 uyarı ·
`bbb-telegram-bot` → **589 test yeşil** ·
`git status` → BBB'de **57**, botta **8** commit'lenmemiş dosya.

---

## 0. Bu dalganın tezi

Dalga 3'ün H1 görevi mutabakat farkını açıklamakla görevlendirilmişti. Açıkladı — ve açıklarken
asıl meseleyi ortaya çıkardı: **fark bir hata değil, bir belirti.** Defterin bütün çapaları
Excel'den geliyor ve üç çapanın üçü de kırık:

| # | Çapa | Nereden geliyor | Kırık olan |
|---|---|---|---|
| 1 | Özkaynak eğrisi (124 snapshot) | Excel `Monthly Report` | Kurucu sermayenin **$113.209,43**'ünü hiç görmüyor (H1'de kanıtlandı) |
| 2 | Nakit | Excel'in göç anı bakiyesi **$49.403,89** + sonrasının deltaları | Defterden **türetilmiyor**; `meta.nakitHesapBazli`'ya çakılı |
| 3 | İşlem geçmişi | Excel `Trade Log` | **2026 öncesi hiç satış yok**: 2016–2024 arası 43 alım, **0 satış** |

### Ve bu üçünün bileşik sonucu tek bir sayıyla ölçülebiliyor

Her çift taraflı defterin sağlaması gereken bir kimlik var:

```
Σmevduat − Σçekim + gerçekleşen K/Z + temettü  ==  açık pozisyon maliyeti + nakit
```

Bu kimlik, nakit defterden türetildiği sürece **cebirsel olarak zorunludur**
(nakit = mevduat − çekim + satış hasılatı − alım bedeli + temettü; açık maliyet = alımlar − satılan lotların maliyeti;
toplayınca alımlar sadeleşir). Bugün sağlanmıyor:

```
184.608,62 − 0 + 113.704,47 + 298,07   =  $298.611,16     (defterin kendi kayıtlarından)
264.826,36 + 18.795,01                 =  $283.621,37     (defterin gösterdiği varlık)
                                          ───────────────
                                   FARK     $ 14.989,79
```

Ve H1'in "açıklanamayan artık bakiye" dediği kalem tam olarak buydu:

```
14.989,79  +  1.412,51 (K4, Ağustos sonrası işlemler)  =  $16.402,30  ==  H1'in K3 kalemi
```

**K3 bir gizem değil, bir kimlik ihlali.** H1 onu "muhtemelen TP2 ayrışması" diye kayda geçirdi;
aslında göç sınırında nakit çapasının defterle tutmamasının ölçüsü. Bu, tahmin etmeden
kapatılabilecek bir borç.

### Dalga 4'ün işi

> Çapaları Excel'den kopar, kimliği teste bağla.

Dalga 3 "hangi sayıya güveneyim?" sorusuna *"deftere"* cevabını verdi. Bu dalga o cevabı
**hak ediyor** hâle getiriyor. Gösterişli hiçbir şey yok; sonunda eğri doğru, nakit türetilmiş,
kimlik bir birim testi olacak.

### Görev sırası ve ağırlık

| # | Görev | Neden bu sırada | Boyut |
|---|---|---|---|
| **I0** | Dalga 3'ü yere indir (commit, iki repo) | 65 dosya tek `git checkout`'la uçabilir | XS |
| **I1** | Muhasebe kimliğini invariant'a çevir — **$14.989,79** | Diğer her sayı buna yaslanıyor | L |
| **I2** | Özkaynak eğrisini **defterden** türet — **$113.209,43** | Eğri, KPI ve H4 şelalesi hepsi yanlış bazda | L |
| **I3** | Göç bütünlüğü: 2026 öncesi satışlar nerede? | I1/I2'nin kalan artığını bu belirler | M (araştırma) |
| **I4** | Ölü snapshot alanlarını kapat (`nakit_usd`, `gerceklesmemisKZ_usd`) | 124 satırda ikisi de `null` — tip yalan söylüyor | S |
| **I5** | `deger` bazının sessiz çöküşü | Fiyat gelmeyince değer = maliyet oluyor, kimse bilmiyor | M |
| **I6** | `DUZELTME` → `TOPLU` mahsup heuristiğini adlandır | Gizli fudge; I1'in kanıtını kirletiyor | M |
| **I7** | Vergi raporu (yıllık özet) | `SaleEvent` artık bunu taşıyabiliyor | M |
| **I8** | Seviye girişi + bot seviye bildirimi | `seviyeler` 53 enstrümanda **0 dolu** — önce giriş | M |
| **I9** | `rclone` otomatik senkronun durumu görünür olsun | Altyapı **var**, açık mı bilinmiyor | S |
| **I10** | Bot: kişisel defterde Ollama kategori önerisi | İki dalga ertelendi, ön koşulu artık bitti | M |

**Ertelenenler ve gerekçeleri**

- **Tarihsel mark-to-market eğrisi.** Ay sonu piyasa değeri için tarihsel fiyat serisi gerekiyor;
  elimizde sadece `fxrates.json` var. I2 bu yüzden **realize sermaye** eğrisi üretiyor, varlık değeri
  eğrisi değil — ve bunu adıyla söylüyor. Fiyat geçmişi biriktikçe (I5'in yan ürünü) yeniden bakılır.
- **TP2'nin 584.140 lotluk ayrışmasını Excel'de tek tek kovalamak.** I1 kimliği kapatırsa bu soru
  kendiliğinden dar bir alana sıkışır; I3 onu ölçer. Excel'i satır satır taramak son seçenek.

### Oturumlar

```
Oturum 1:  I0 → I1            (I1 çıktısı I2'nin bazını belirler, önce bitmeli)
Oturum 2:  I2 → I4            (ikisi de snapshot/eğri tarafı)
Oturum 3:  I3 → I6            (ikisi de göç sınırı araştırması)
Oturum 4:  I5 → I7            (Panorama/Pozisyonlar + yeni sayfa)
Oturum 5:  I8 → I9 → I10      (bbb-telegram-bot, ayrı repo)
```

### Her görevde zorunlu

`cd app && npm test` yeşil · `npm run check` **yeni hata yok** · yeni saf fonksiyona birim testi ·
Türkçe arayüz · mevcut stile uyum.

> **Bot testleri için düzeltme:** Dalga 3 "`BBB_DIR` set edilerek `pytest`" diyordu; bu **yanlış**.
> `BBB_DIR` gerçek `data/`'ya işaret edince `tests/test_repository.py::test_repository_never_mutates_the_bbb_folder`
> kırılıyor (kendi fixture dizinini kuruyor). Doğrusu: **`cd bbb-telegram-bot && .venv/bin/pytest -q`**,
> ortam değişkeni vermeden. (589 test bu şekilde yeşil.)

---

## I0 — Dalga 3'ü yere indir  *(XS, ama ilk)*

Dalga 3'ün tamamı commit'lenmemiş hâlde duruyor. Tek bir `git checkout .` bir dalgayı siler;
ayrıca denetim (E1–E4) commit olmayan bir ağaç üzerinde anlamlı şekilde yapılamaz.

**BBB deposu** (`main`, 57 dosya) — mantıksal commit'lere böl, tek dev commit yapma:

```
feat(ledger): ikiz odunçAlindi alanini kaldir                      → H0
docs: mutabakat raporu — $92.234 farkin kalem kalem dokumu          → H1
feat(source): kaynak tazeligi, kunye ve yerel kopya uyarisi         → H2  + docs/veri-senkronizasyonu.md
feat(ui): tek uyari seridi ve collectWarnings                       → H3
feat(panorama): aylik ozkaynak selalesi ve tiklanabilir egri        → H4
feat(forms): SAT icin portfoy/kurum lot dogrulamasi                 → H5
feat(pozisyonlar): tutma suresi dagilimi                            → H6
feat(kurumlar): negatif bakiye rozeti ve goc notu                   → H7
feat(settings): global maliyet/deger bazi anahtari                  → H8
docs: dalga-4 gelistirme plani                                      → bu dosya
```

**Bot deposu** (`main`, remote **yok**): `feat(query): /kz komutu` (H9) + `feat(sync): aylik kapanis hatirlaticisi` (H10).

**Kabul**
- [ ] `git status` her iki depoda da temiz (`Ekstreler/`, `*.xlsm`, `.venv` gibi izlenmemesi gerekenler `.gitignore`'da).
- [ ] BBB'de commit'ler `origin/main`'e **push** edilmiş.
- [ ] Bot deposu için: remote olmadığı not edilmiş; commit'ler yerelde duruyor (push denenmeyecek).
- [ ] Her commit'in mesajı hangi H görevine karşılık geldiğini söylüyor.

---

## I1 — Muhasebe kimliğini invariant'a çevir: $14.989,79  ⭐ *(L)*

### Bugünkü durum

`app/src/lib/data/cashBalances.ts:11` nakdi şöyle kuruyor:

```ts
const bal: Record<string, number> = { ...ds.meta.nakitHesapBazli }   // ← Excel'in göç anı bakiyesi
for (const t of ds.transactions) {
  if (t.kaynak === 'migration') continue                            // ← göç işlemleri nakde hiç dokunmuyor
  bump(t.hesap, t.yon === 'AL' ? -t.net_usd : t.net_usd)
}
```

Yani nakit = **Excel'in $49.403,89'u** + göç sonrası 35 işlemin deltası (−$30.608,88) = $18.795,01.
Defterin kendi 154 göç işlemi ve 21 nakit akışı nakdin oluşumuna **hiç katılmıyor**.

Bu tasarım P0'da bilinçliydi (`meta.p0Sinirlari` bunu yazıyor) ama bedeli artık ölçülebilir:
kimlik **$14.989,79** açıkla bozuk ve bu açık, H1'in "açıklanamayan" K3'ünün tamamı.

### Yapılacaklar

1. **Kimliği bir fonksiyon yap.** `app/src/lib/data/kimlik.ts`:
   ```ts
   export interface KimlikKontrol {
     mevduat: number; cekim: number; temettu: number; gerceklesenKz: number
     beklenenVarlik: number      // mevduat − cekim + gerceklesenKz + temettu
     acikMaliyet: number; nakit: number
     gercekVarlik: number        // acikMaliyet + nakit
     fark: number                // gercekVarlik − beklenenVarlik
     farkOrani: number           // |fark| / beklenenVarlik
   }
   export function kimlikKontrol(ds: Dataset, sales: SaleEvent[], positions: ..., nakit: number): KimlikKontrol
   ```
2. **Türetilmiş nakdi hesapla ve karşılaştır.** `cashBalanceByHesap`'ın yanına
   `turetilmisNakit(ds)`: `kaynak` ayrımı **yapmadan**, bütün işlem ve nakit akışlarından nakdi kur.
   Bu **toplam** seviyesinde anlamlıdır; hesap bazlı kırılım `p0Sinirlari` yüzünden hâlâ anlamsız,
   o yüzden sadece toplam döndürülsün.
3. **Farkı tek bir adlandırılmış kaleme bağla.** Beklenen sonuç: `turetilmisNakit` ile
   `cashBalanceByHesap` toplamı arasındaki fark **$14.989,79**'a çok yakın çıkar. Çıkarsa bu kalem
   `meta.gocNakitDuzeltmesi` olarak **veriye yazılsın** (uydurma bir dağıtım değil, adı konmuş bir
   göç artığı) ve kimlik bu kalem dâhil edilerek **sıfırlansın**.
   Çıkmazsa fark olduğu gibi raporlansın — zorlama yapılmayacak.
4. **Uyarı merkezine bağla.** `collectWarnings`'e yeni uyarı: kimlik %0,5'ten fazla sapıyorsa
   `seviye: 'hata'`. Bu, bundan sonra her veri girişi hatasını **aynı gün** yakalayan tek kontrol olur.
5. **H1 raporunu güncelle.** `docs/2026-09-12-mutabakat-raporu.md`'deki K3 kalemi
   "açıklanamayan artık bakiye" olmaktan çıkıp "göç sınırı nakit çapası farkı ($14.989,79) +
   zaman farkı ($1.412,51)" olarak yazılsın. H1'in %82'lik kanıt oranı böylece **%100'e** çıkar.

### Kabul kriterleri
- [ ] `kimlikKontrol` birim testi: elde kurulmuş küçük bir veri setinde kimlik **tam** sağlanıyor
      (alım, satış, mevduat, temettü, çekim içeren fixture).
- [ ] Gerçek `data/` üstünde kimlik farkı, adlandırılmış kalemler sonrası **$1'in altında**;
      değilse kalan fark raporda adıyla yazılı.
- [ ] `turetilmisNakit` yalnızca toplam döndürüyor; hesap bazlı kırılım iddia etmiyor.
- [ ] Kimlik sapmasında uyarı şeridinde `hata` seviyesinde satır görünüyor, sağlamken görünmüyor.
- [ ] Dalga 2/3 çapaları **değişmedi**: gerçekleşmiş K/Z $113.704,47 · açık maliyet $264.826,36 ·
      açık pozisyon 34 · nakit $18.795,01.

> **Not:** Bu görev nakdin **gösterilen** değerini değiştirmiyor. $18.795,01 yerinde kalıyor;
> değişen tek şey, o sayının artık **neden** o olduğunun defterden gösterilebilmesi.

---

## I2 — Özkaynak eğrisini defterden türet: $113.209,43  ⭐ *(L)*

### Bugünkü durum

`snapshots.json` 124 satır, `kaynak: "excel-monthly-report"`, **2016-05-31 → 2026-08-31**.
H1 kanıtladı: Excel'in aylık rapor tablosu 2016-01-01 ($109.699,10) ve 2018-05-21 ($3.510,33)
mevduatlarını formül sınırı ve boş tarih anahtarı yüzünden zincire hiç katmamış. Excel'in **kendi
Dashboard'u** doğrusunu veriyor: $304.596,32 = $191.386,89 + $113.209,43.

Sonuç: eğrinin **ilk satırı bile 0,0** ve eğrinin tamamı $113.209,43 eksik. Panorama'nın özkaynak
bloğu, H4'ün şelalesi, G10'un mutabakat notu — hepsi bu bazı miras alıyor.

Kanıt (veriden doğrulandı): `snapshots.json`'ın ilk üç satırı `toplamOzkaynak_usd: 0.0`,
oysa `cashflows.json` 2016-01-01'de $109.699,10 mevduat taşıyor.

### Karar: eğri Excel'den değil **defterden** gelsin

Defter bu seriyi doğru üretebilir, çünkü gereken her şey elinde: 21 nakit akışı (mevduat + temettü)
ve 189 işlemden çıkan `SaleEvent`'ler.

`app/src/lib/data/equityCurve.ts`:

```ts
export interface AylikSermaye {
  ay: string                   // 'YYYY-MM'
  mevduatKumulatif: number
  cekimKumulatif: number
  gerceklesenKzKumulatif: number
  temettuKumulatif: number
  sermaye: number              // mevduat − cekim + gerceklesenKz + temettu
  /** Excel Monthly Report'un aynı ay için dediği — karşılaştırma çizgisi. */
  excelSermaye: number | null
  /** sermaye − excelSermaye; beklenen ≈ 113.209,43 (+ o aya kadarki K/Z ayrışması). */
  excelFarki: number | null
}
export function buildEquityCurve(ds: Dataset, sales: SaleEvent[]): AylikSermaye[]
```

- Seri **ilk nakit akışının ayından** başlasın (2016-01), Excel'in 2016-05'inden değil.
- Panorama'da **iki çizgi**: kalın olan defter serisi, soluk/kesikli olan Excel serisi.
  Altında tek cümle: *"Excel aylık raporu kurucu sermayenin $113.209'unu içermiyor (bkz. mutabakat raporu)."*
- **Adlandırma dürüst olsun.** Bu seri **realize sermaye**dir; açık pozisyonların piyasa değerini
  içermez. Başlık `Özkaynak` değil **`Realize Sermaye`** olsun, `.hint` ile: *"yatırılan para +
  gerçekleşen kâr + temettü; açık pozisyonların güncel değeri bu eğride yok"*.
- H4'ün şelalesi bu seriye bağlansın. Şelalenin "Değerleme (bakiye)" kalemi — bugün
  `donemSonu − araToplam` artığı — **ortadan kalkar**, çünkü defter serisinde kalemler toplamı
  dönem sonuna zaten **tam** eşit. Artık kalem varsa o bir **hatadır**, gösterim değil.
- G10/`collectWarnings`'teki mutabakat uyarısı artık bir **not**: iki seri arasındaki farkın
  sebebi adlandırılmış durumda, kaygı üretmemeli.

### Kabul kriterleri
- [ ] Serinin ilk ayı 2016-01 ve o ayın `sermaye`si $109.699,10.
- [ ] Son ayın `sermaye`si, I1'in `beklenenVarlik`ıyla **birebir** aynı ($298.611,16).
- [ ] Her ay için `sermaye == mevduat − cekim + gerceklesenKz + temettu` birim testiyle doğrulanıyor.
- [ ] Excel serisi olmayan aylarda (`excelSermaye === null`) grafik çökmüyor, soluk çizgi kesiliyor.
- [ ] H4 şelalesinde "Değerleme (bakiye)" kalemi **sıfır** (veya hiç render edilmiyor); sıfır değilse
      test kırmızı.
- [ ] Panorama'daki başlık `Realize Sermaye`, yanında `.hint` mevcut.

---

## I3 — Göç bütünlüğü: 2026 öncesi satışlar nerede?  *(M, araştırma)*

### Doğrulanmış tespit

`transactions.json`'ın yön × yıl dağılımı:

```
2016 AL 5   2017 AL 2   2018 AL 6   2019 AL 3   2021 AL 4
2022 AL 5   2023 AL 11  2024 AL 7   2026 AL 99   2026 SAT 47
```

**2026 öncesinde tek bir SAT satırı yok.** İlk satış `2026-02-03`. Yani defterin gerçekleşmiş
K/Z'sinin tamamı ($113.704,47) 2026'nın 47 satışından geliyor; 2016–2024 arası 43 alımın hepsi
ya hâlâ açık, ya 2026'da kapandı.

Göç betiği bunu **sessizce yapmadı**: `migration/bbb_migration/transform.py:46` çözülemeyen yönde
`TransformError` atıyor, yani satır düşürülmüyor. Demek ki **Excel `Trade Log`'un kendisinde**
2026 öncesi satış satırı yok. H1'in "Excel Trade Log manuel kâr toplamı $119.689,63" ifadesi de
bunu destekliyor: o kâr bir **elle girilmiş kolondan** geliyor, satış satırlarından türetilmiyor.

Bu, H1'in K2 kalemini ("10 yıllık katı defter ile Excel'in manuel toplamı arasında $5.985,16 fark")
**farklı bir ışığa** sokuyor: iki sayı aynı şeyi ölçmüyor olabilir ve $5.985'lik yakınlık kısmen
tesadüf olabilir.

### Görev

**Çıktı:** `docs/2026-09-13-goc-butunlugu-raporu.md`. Kod değişikliği ancak bulgu gerektirirse.

Sınanacak sorular — her birine **sayısal** cevap:

1. Excel `Trade Log`'da `yon` kolonu (G) `SAT`/`S` olan satırların **yıl dağılımı** nedir?
   (`migration/bbb_migration/xlsx_extract.py:extract_trades` zaten okuyor; küçük bir betikle dök.)
2. Excel'in elle girilmiş kâr kolonunun (H/I) **yıl bazlı** toplamı nedir? 2026 öncesi kısmı
   ne kadar? O kısım defterde **hiç temsil edilmiyor** mu?
3. 2016–2024 alımlarından kaçı bugün hâlâ açık, kaçı 2026'da kapandı? Kapananların
   `tutmaGunu` değerleri makul mü (ör. 3.000+ gün)?
4. Excel `Stock Position`'ın TP2 satırı (791.292 lot / $34.437,23) ile defterin 207.152 lotu
   arasındaki **584.140 lotluk** fark, 2026 öncesi eksik satışlarla açıklanıyor mu, yoksa
   `Stock Position` sayfası bayat mı?
5. I1'in `meta.gocNakitDuzeltmesi` kalemi ($14.989,79 beklentisi) bu eksik geçmişle **aynı
   hikâyenin** parçası mı?

**Kabul**
- [ ] Rapor, 2026 öncesi satışların Excel'de var olup olmadığını **kesin** söylüyor.
- [ ] Varsa: göç betiğinin neden almadığı gösteriliyor ve bir düzeltme önerisi var.
- [ ] Yoksa: defterin gerçekleşmiş K/Z'sinin **kapsamı** açıkça yazılıyor ("2026-02'den bu yana")
      ve Panorama'daki "tüm zamanlar" ifadesi buna göre düzeltiliyor.
- [ ] H1 raporunun K2 kalemi bu bulguya göre güncelleniyor.

> Gemini burada uydurmayacak. "Excel'de şu kadar satır şu yönde" gibi **sayılabilir** ifadeler
> kullanacak; emin olmadığı yerde "ölçülemedi" yazacak.

---

## I4 — Ölü snapshot alanlarını kapat  *(S)*

`Snapshot` tipi `nakit_usd` ve `gerceklesmemisKZ_usd` alanlarını taşıyor. Veride ölçüldü:
**124 satırın 124'ünde ikisi de `null`.** `hesapBazli` / `portfoyBazli` / `sinifBazli` de
`p0Sinirlari`'na göre boş.

Tip var olmayan bir şeyi vaat ediyor; bir geliştirici (veya Gemini) bu alana güvenip sessiz
`null` hatası yazabilir — H4'ün şelalesi tam bu alanların yanından geçiyor.

**İki seçenekten biri, ikisi arası değil:**

- **(a) Doldur.** `nakit_usd` için: o ayın sonundaki türetilmiş nakit (I1'in `turetilmisNakit`'i
  tarih parametresi alacak şekilde genişletilir). `gerceklesmemisKZ_usd` için tarihsel fiyat
  gerektiği için **doldurulamaz** → (b) uygulanır.
- **(b) Tipten çıkar.** `gerceklesmemisKZ_usd`, `hesapBazli`, `portfoyBazli`, `sinifBazli`
  `Snapshot` tipinden silinir; `data/snapshots.json`'daki `null` alanlar kalabilir (şema ileri
  uyumlu), ama kod artık onları tanımaz.

**Önerilen:** `nakit_usd` → (a), diğerleri → (b).

**Kabul**
- [ ] `grep -rn "gerceklesmemisKZ_usd\|hesapBazli\|portfoyBazli\|sinifBazli" app/src` yalnızca
      göç/okuma katmanında geçiyor, hesaplamada geçmiyor.
- [ ] `nakit_usd` her snapshot satırında dolu ve son satırı $18.795,01'e yakınsıyor
      *(2026-08-31 itibarıyla; Eylül işlemleri hariç)*.
- [ ] `npm run check` yeni hata üretmiyor.

---

## I5 — `deger` bazının sessiz çöküşü  *(M)*

H8 global bir `maliyet | deger` anahtarı getirdi ve varsayılanı `deger`. Ama fiyat gelmezse
`deger` sessizce **maliyete** düşüyor. H1 ölçümü tam bu tuzağa düştü: `Fiyatlar: alınamadı`
durumunda `liveEquity` açık pozisyonları maliyetle değerledi ve $283.621,37 **maliyet toplamı**,
piyasa değeri sanılarak Excel'in $191.386,89'uyla karşılaştırıldı. Bir dalganın en önemli
araştırma görevi bu yüzden yanlış soruyla başladı.

Bugün 53 enstrümanın fiyat kaynağı: `yahoo` 39 · `tefas` 10 · `altin-turev` 3 · `tradingview` 1 —
dördü ayrı servis, dördü ayrı ayrı düşebilir.

### Yapılacaklar

1. **Kapsama oranını göster.** Künye şeridine (H2'de eklendi): `Fiyatlar: 31/34 pozisyon · 14:32`.
2. **`deger` modunda fiyatı olmayan satır maliyetine düştüğünde** satırda görünür bir işaret
   (`≈` öneki + `.hint`: *"güncel fiyat alınamadı, maliyet gösteriliyor"*). H8 bunu kabul
   kriterine koymuştu; I5 bunu **toplamlara** da taşıyor: kapsama %100 değilken KPI'ın yanında `≈`.
3. **Kısmi başarıyı hata sayma.** `prices.status` bugün `'error'` ikili; `'kismi'` durumu eklensin
   (bazı semboller geldi). Uyarı metni hangi **kaynağın** düştüğünü söylesin
   (*"TEFAS'tan 10 fonun 7'si alınamadı"*), "2 pozisyon alınamadı" demekle yetinmesin.
4. **Fiyat anlık görüntüsünü sakla.** Başarılı her çekimde `{ tarih, sembol, fiyatUsd }` satırları
   `data/price-history.json`'a eklensin (gün başına bir satır, aynı güne ikinci yazma üzerine yazar).
   Bu, I2'nin ertelediği mark-to-market eğrisinin **tek eksik girdisi**; bugün başlanmazsa
   geçmiş hiç birikmez.

**Kabul**
- [ ] Fiyat API'si tamamen kapalıyken (`VITE_PRICE_API` boş) Panorama çöküyor değil, `maliyet`
      bazına düşüyor **ve bunu söylüyor**.
- [ ] Bir sembol gelmediğinde `status === 'kismi'`, hepsi gelmediğinde `'error'`.
- [ ] `price-history.json` bir çekimden sonra o günün satırlarını içeriyor; ikinci çekim satır
      **çoğaltmıyor**.
- [ ] Kapsama %100'ken hiçbir `≈` işareti yok (yanlış pozitif yok).

---

## I6 — `DUZELTME` → `TOPLU` mahsup heuristiğini adlandır  *(M)*

`cashBalances.ts:36-42` şunu yapıyor:

```ts
else if (c.tur === 'DUZELTME') {
  bump(c.hesap, c.tutar_usd)
  if (c.tutar_usd > 0 && c.hesap !== 'TOPLU' && (bal['TOPLU'] ?? 0) > 0) {
    bal['TOPLU'] = Math.max(0, bal['TOPLU'] - c.tutar_usd)    // ← gizli dağıtım
  }
}
```

Bir kurumun bakiyesi düzeltilince aynı tutar `TOPLU`'dan **sessizce** düşülüyor. Niyet doğru
(toplam nakdi çift saymamak), ama bu bir **gizli muhasebe kaydı**: kullanıcı QNB'yi düzeltti,
defter arkada TOPLU'yu da değiştirdi ve hiçbir yerde iz yok. I1'in kimlik kanıtını da kirletiyor.

**Yapılacak:** mahsup **açık bir satıra** dönüşsün. `DUZELTME` kaydedilirken, gerekiyorsa
`TOPLU` için ikinci bir `DUZELTME` satırı (`aciklama: "QNB düzeltmesinin TOPLU mahsubu"`,
`kaynak: 'otomatik-mahsup'`) **veriye yazılsın**; okuma katmanındaki `Math.max(0, ...)` hilesi
kalksın. Log sayfasında iki satır da görünür.

**Kabul**
- [ ] `cashBalanceByHesap` içinde `bal['TOPLU']`'yu mutasyona uğratan kod **yok**.
- [ ] Bir kurum düzeltmesi kaydedildiğinde `cashflows`'a iki satır yazılıyor ve toplam nakit
      **değişmiyor** (birim test).
- [ ] Mevcut `data/`'daki düzeltmeler için tek seferlik bir taşıma betiği var ve koştuktan sonra
      nakit toplamı $18.795,01'de kalıyor.
- [ ] `Math.max(0, ...)` kırpması kalktığı için negatif `TOPLU` mümkün hâle gelirse, bu I1'in
      kimlik uyarısıyla yakalanıyor.

---

## I7 — Vergi raporu (yıllık özet)  *(M)*

`SaleEvent` artık tarih, maliyet, hasılat, komisyon ve `tutmaGunu` taşıyor — yıllık bir özet için
gereken her şey var ve hiçbiri henüz kullanılmıyor.

Yeni sayfa `app/src/routes/Vergi.svelte`:

```
2026
  Satış sayısı                 47
  Toplam hasılat        $ ...
  Toplam maliyet        $ ...
  Gerçekleşen K/Z       $ 113.704,47
  Komisyon              $ 92,97
  Temettü               $ 298,07
  ── sınıf bazında ──
  BIST          kâr $ ...   zarar $ ...
  FON_PARA      kâr $ ...   zarar $ ...
  ALTIN         kâr $ ...   zarar $ ...
```

- Yıl seçici; varsayılan içinde bulunulan yıl.
- Sınıf kırılımı, çünkü Türkiye'de **enstrüman sınıfı vergi muamelesini değiştirir**.
- Kâr ve zarar **ayrı** gösterilsin (netleştirme kullanıcının/muhasebecinin kararı).
- CSV indirme: satış başına bir satır (tarih, kod, sınıf, lot, maliyet, hasılat, K/Z, tutmaGunu).

> **Sınır açıkça yazılacak.** Sayfanın üstünde kalıcı bir not: *"Bu sayfa bir vergi beyanı değil,
> defterden çıkarılmış bir özettir. Stopaj, istisna ve mahsup kuralları hesaplanmaz."*
> Oran, istisna veya stopaj **hesaplanmayacak** — defterde o veri yok, uydurulması zarar verir.

**Kabul**
- [ ] Yıl toplamları `SaleEvent` toplamlarıyla birebir (birim test).
- [ ] Satışı olmayan yıl seçilince boş durum metni çıkıyor, çökmüyor.
- [ ] CSV satır sayısı = o yılın satış sayısı.
- [ ] Vergi oranı, stopaj veya "ödenecek vergi" ifadesi **hiçbir yerde yok**.

---

## I8 — Seviye girişi, sonra bot bildirimi  *(M)*

Dalga 3'ün "Dalga 4 adayları" listesi *"`Instrument.seviyeler` veride var, Pozisyonlar'da sadece
metin olarak gösteriliyor"* diyordu. **Veride ölçüldü: 53 enstrümanın 53'ünde `seviyeler: null`.**
Yani gösterilecek bir şey yok; önce **giriş** gerekiyor. Sıra bu yüzden ters çevriliyor.

1. **Giriş.** Pozisyonlar'da bir satıra tıklayınca açılan detayda seviye alanları:
   `destek`, `direnc`, `hedef` (USD veya TL — enstrümanın `girisParaBirimi`'ne göre).
   `instruments.json`'a yazılır (mevcut yazma yolu kullanılır, yeni kanal açılmaz).
2. **Gösterim.** Seviye girilmiş pozisyonda, güncel fiyatın seviyeye uzaklığı (`%`) satırda görünsün.
   Fiyat seviyeyi geçtiyse renkli rozet.
3. **Bot bildirimi.** `bbb-telegram-bot`'ta mevcut `bbb-sync.timer` döngüsüne takılan bir kontrol:
   fiyat bir seviyeyi **geçtiği ilk seferde** tek bir Telegram mesajı. Durum dosyasında
   "bildirildi" bayrağı (I10'un değil, H10'un `reminder.py` desenini izler) — her döngüde tekrar etmez.
   Fiyat seviyenin diğer tarafına geçince bayrak temizlenir.

**Kabul**
- [ ] Seviye girilip kaydedildikten sonra yenilemede duruyor.
- [ ] Seviyesi olmayan pozisyonda hiçbir ek kolon/rozet yok.
- [ ] Bot: bir seviye geçişi **tam bir kez** bildiriliyor; ikinci döngüde tekrar etmiyor;
      ters yöne geçip geri dönünce yeniden bildiriliyor (test, fiyatı enjekte ederek).
- [ ] Fiyat alınamadığında bildirim **gitmiyor** (eksik veri sessiz kalır, yanlış alarm üretmez).

---

## I9 — `rclone` otomatik senkronun durumu görünür olsun  *(S)*

Dalga 3 bunu "H2'den sonra değerlendirilecek" diye erteledi. **Ölçüldü: altyapı zaten var.**
`bbb-telegram-bot/deploy/` içinde `bbb-sync.service`, `bbb-sync.timer`, `bbb-sync.path`;
`src/sync/once.py` kilit korumalı, idempotent, `.sync-paused` kill switch'li bir yakınsama
döngüsü çalıştırıyor.

Eksik olan kod değil, **görünürlük**: Oracle VM'de bu timer açık mı, son ne zaman koştu,
son koşu hata mı verdi? Bugün bunu söyleyen hiçbir şey yok.

- `once.py` her koşuda `data/sync-state.json` yazsın: `{ sonKosu, sonucu, degisenDosya, hata }`.
- Bu dosya Drive'a da gittiği için **uygulama okuyabilir**: H2'nin künye şeridine
  `Senkron: 12 Eyl 14:20 · başarılı` satırı düşsün. 2 saatten eski veya `hata` ise uyarı şeridinde
  `uyari` seviyesinde satır.
- Bot tarafında `/senkron` komutu: son durumu ve `.sync-paused` var mı yok mu söylesin.
- `deploy/README.md`'ye timer'ın **kurulu olup olmadığını** doğrulayan komut yazılsın
  (`systemctl --user status bbb-sync.timer`), kurulum adımlarıyla.

**Kabul**
- [ ] `once.py`'ın hiçbir şey yapmadığı bir koşu da `sync-state.json`'ı güncelliyor (sessiz başarı da bilgidir).
- [ ] Uygulama künyesinde senkron zamanı görünüyor; dosya yoksa künye çökmüyor, "bilinmiyor" diyor.
- [ ] `.sync-paused` varken `/senkron` bunu açıkça söylüyor.
- [ ] Botun 589 testi yeşil kalıyor.

---

## I10 — Bot: kişisel defterde Ollama kategori önerisi  *(M)*

İki dalga ertelendi. Ön koşul (H9/H10) artık bitti, sıra geldi. **Kapsam dar tutulacak:**

- Yalnızca **kişisel defter** (`personal_tx`) kategorisi önerilir. Yatırım işlemlerine, tutara,
  tarihe, kuruma, portföye **dokunmaz**.
- Model: yerel `ollama` / `qwen2.5:7b`. Ağ çağrısı yok, anahtar yok.
- **Öneri, karar değil.** Onay kartında kategori alanı önceden seçili gelir ve yanında
  `🤖 öneri` işareti durur; kullanıcı değiştirebilir. Kullanıcı onaylamadan hiçbir şey yazılmaz.
- Model yoksa, yavaşsa (>3 sn) veya geçersiz kategori döndürürse: **sessizce** bugünkü kural
  tabanlı akışa düşer. Botun "anlamadığında sormak" davranışı hiçbir koşulda bozulmaz.
- `BBB_OLLAMA=0` ile tamamen kapatılabilir; varsayılan **kapalı** olsun, Enis açsın.

**Kabul**
- [ ] Ollama kurulu değilken bütün testler yeşil ve bot bugünkü gibi davranıyor (çağrı mock'lanır).
- [ ] Önerilen kategori `categories.json`'da **yok** ise öneri atılıyor, uydurma kategori yazılmıyor.
- [ ] Zaman aşımı testi: 3 sn'yi geçen yanıt kural tabanlı akışa düşüyor.
- [ ] Hiçbir yatırım işlemi akışında model çağrısı **yok** (`needs_llm` kapısı testle doğrulanıyor).
- [ ] `BBB_OLLAMA=0` varsayılanıyla hiçbir model çağrısı yapılmıyor.

---

# SONNET — DENETİM (E1–E4)

## E1 — Otomatik
`cd app && npm test` · `npm run check` · `npm run build` · `.skip`/`.only` taraması ·
`cd bbb-telegram-bot && .venv/bin/pytest -q` (**`BBB_DIR` verilmeden** — yukarıdaki düzeltmeye bakın).

## E2 — Sayısal mutabakat

Dalga 2/3 çapaları korunmalı:

| Ölçü | Beklenen |
|---|---|
| Gerçekleşmiş K/Z (global) | $113.704,47 |
| Açık pozisyon sayısı | 34 |
| Açık maliyet | $264.826,36 |
| Nakit (gösterilen) | $18.795,01 |

Dalga 4'ün yeni çapaları:

| Ölçü | Beklenen |
|---|---|
| Mevduat toplamı | $184.608,62 |
| Temettü toplamı | $298,07 |
| Beklenen varlık (kimlik sol taraf) | $298.611,16 |
| Kimlik farkı (I1 öncesi) | $14.989,79 |
| Kimlik farkı (I1 sonrası, adlandırılmış kalemlerle) | **< $1** |
| Realize sermaye serisi — ilk ay (2016-01) | $109.699,10 |
| Realize sermaye serisi — son ay | $298.611,16 |
| H4 şelalesi "Değerleme (bakiye)" kalemi | **$0** |

Zorunlu çapraz kontroller:
- her kapsam için `Σ(scope.sales.kzUsd) == scope.realizedUsd`
- her ay için `sermaye == mevduat − cekim + gerceklesenKz + temettu`
- kimlik: `acikMaliyet + nakit == mevduat − cekim + gerceklesenKz + temettu + gocNakitDuzeltmesi`
- **Kapsamlar arası eşitlik beklenmez** (farklı ortalama maliyet tabanları farklı sonuç verir).

## E3 — Kod incelemesi
- I1'in `gocNakitDuzeltmesi` kalemi gerçek bir artık mı, yoksa kimliği kapatmak için **geriye
  doğru hesaplanmış** bir fudge mı? Değeri bağımsız olarak türetilebiliyor mu?
- I2'nin serisi gerçekten defterden mi geliyor, yoksa Excel serisine $113.209,43 eklenerek mi üretildi?
  (İkincisi kabul edilmez — aynı hatayı sabitler.)
- I6 sonrası `cashBalanceByHesap` içinde hâlâ bir yan etki (başka hesabın bakiyesini değiştirme) var mı?
- I5'in `price-history.json` yazması, aynı gün içinde çoğaltma yapıyor mu?
- I7'de hiçbir yerde vergi **oranı** veya "ödenecek" ifadesi geçmiyor, değil mi?
- I10'da yatırım akışına sızmış bir model çağrısı var mı?
- Sıfıra bölme, `null` fiyat, boş veri seti, snapshot'ı olmayan ay korumaları.

## E4 — Görsel
390px ve 1440px · açık/koyu tema · iki çizgili realize sermaye grafiği (soluk Excel çizgisi
okunabiliyor mu?) · şelalede artık kalem yok · kapsama %100 değilken `≈` işaretleri ·
Vergi sayfası yıl seçici · konsol hatası yok.

---

## Ek — Dalga 5 adayları (şimdilik kayıtta)

- **Tarihsel mark-to-market eğrisi.** I5'in `price-history.json`'ı birkaç ay biriktikten sonra
  gerçek varlık değeri eğrisi çizilebilir. I2'nin "realize sermaye" eğrisi o zaman ikinci çizgi olur.
- **TP2 ve diğer fonların Excel `Stock Position` ile satır satır mutabakatı** — I3 bunu gerektirirse.
- **Çoklu para birimi raporlaması.** Bugün her şey USD'ye çevrilip öyle yaşıyor; TL bazlı
  getiri Enis'in vergi ve gerçek alım gücü sorusuna daha yakın olabilir.
- **`data/` repo kopyasının otomatik tazelenmesi.** H2 tazeliği görünür kıldı, I9 senkron durumunu
  görünür kılıyor; üçüncü adım repo kopyasının da kendiliğinden tazelenmesi.
