# BBB Tracker — Geliştirme Planı (Dalga 3)

**Tarih:** 2026-09-12 · **Planlayan:** Opus 5 · **Uygulayan:** Gemini · **Denetleyen:** Sonnet
**Öncülü:** [Dalga 2](./2026-09-11-gelistirme-plani-dalga2.md) (G0–G11, tamamlandı ve doğrulandı)

---

## 0. Bu dalganın tezi

Dalga 2 **"ne oldu?"** sorusunu çözdü: işlem bazlı K/Z artık görünür, portföyler kümülatif hesaplanıyor,
nakit dağılıma girdi. Geriye iki boşluk kaldı ve ikisi de aynı cinsten:

1. **"Neden oldu?"** — Özkaynak eğrisi bir ayda $21.717 artıyor; bunun ne kadarı piyasa, ne kadarı
   yeni para, ne kadarı gerçekleşen kâr? Bugün hiçbir yerde yok.
2. **"Hangi sayıya güveneyim?"** — Defter $283.621 diyor, Excel raporu $191.387. Aralarında
   **$92.234** fark var, sebebi bilinmiyor. Bunun üstüne repodaki `data/` ile canlı Drive verisi
   de ayrışmış durumda.

İkincisi birincisinden önce gelir: **güvenilmeyen bir sayıyı açıklamanın anlamı yok.**
Bu yüzden sıralama, gösterişli grafiklerle değil, mutabakatla başlıyor.

### Görev sırası ve ağırlık

| # | Görev | Neden bu sırada | Boyut |
|---|---|---|---|
| **H0** | İkiz alan temizliği | 5 dakikalık borç, hemen kapansın | XS |
| **H1** | Mutabakat farkını **açıkla** ($92k) | Diğer her sayının güvenilirliği buna bağlı | L (araştırma) |
| **H2** | Veri kaynağı tazeliği (repo `data/` ⇄ Drive) | Bu oturumda fiilen sorun çıkardı | M |
| **H3** | Uyarı merkezi | Dalga 2'de 5 ayrı uyarı üretildi, hepsi dağınık | M |
| **H4** | "Neden değişti?" ay ayrıştırması | Enis'in asıl sorusu | L |
| **H5** | Portföy etiketi doğrulaması (giriş anında) | G11 uyarısının bir daha hiç doğmaması için | M |
| **H6** | Tutma süresi dağılımı | `tutmaGunu` zaten üretiliyor — bedava içgörü | S |
| **H7** | Kurum nakit sağlığı | Sessizce yanlış duran gerçek veri sorunu | S |
| **H8** | Global maliyet ⇄ değer anahtarı | Tutarlılık borcu | M |
| **H9** | Bot: `/kz` komutu | Mobilde aynı cevap | M |
| **H10** | Bot: aylık kapanış hatırlatıcısı | "Son ay hangi ay?" sorununun kökü | S |

**Ertelenenler ve gerekçeleri** — bu dalgaya alınmadı:
- **Ollama (`qwen2.5:7b`) bağlama.** Bot bugün tamamen kural tabanlı ve *bu onun en güçlü yanı*:
  anlamadığında tahmin etmiyor, soruyor. Araya LLM sokmanın getirisi, sessiz yanlış kayıt riskini
  karşılamıyor. Bağlanacaksa H9/H10'dan sonra, sadece kişisel defterde **kategori önerisi** olarak.
- **`rclone` için `systemd timer`.** H2 kaynak tazeliğini görünür kılınca bu sorunun yarısı zaten
  çözülüyor; otomatik senkron ondan sonra değerlendirilmeli (yanlış yönde otomatik senkron,
  elle senkrondan kötüdür).

### Dalgalar

```
Oturum 1:  H0 → H1            (H1 çıktısı diğerlerini etkileyebilir, önce bitmeli)
Oturum 2:  H2 → H3            (ikisi de uyarı/künye şeridine dokunur)
Oturum 3:  H4 → H6 → H8       (hepsi Panorama + Pozisyonlar)
Oturum 4:  H5 → H7            (formlar + Kurumlar sayfası)
Oturum 5:  H9 → H10           (bbb-telegram-bot, ayrı repo)
```

### Her görevde zorunlu
`cd app && npm test` yeşil · `npm run check` yeni hata yok · yeni saf fonksiyona birim testi ·
Türkçe arayüz · mevcut stile uyum. **Bot görevleri için:** `BBB_DIR` set edilerek `pytest`.

---

## H0 — İkiz `odunçAlindi` alanını kaldır  *(XS)*

G11'de `SaleEvent`'e iki alan eklendi: `oduncAlindi: boolean` ve `odunçAlindi?: boolean`.
İkisi her zaman aynı değeri taşıyor. Tek bir gerçeğin iki adı olması, ileride ayrışma davetiyesidir.

**ASCII olanı (`oduncAlindi`) kalsın, `odunçAlindi` tamamen silinsin.** Dokunulacak yerler:

```
app/src/lib/data/ledger.ts:39      → `odunçAlindi?: boolean` satırını sil
app/src/lib/data/ledger.ts:291     → `odunçAlindi: wasBorrowed,` satırını sil
app/src/lib/data/derive.ts:23      → `.filter((s) => s.oduncAlindi)`
app/src/lib/data/derive.ts:28      → `s.odunçAlindi = true` satırını sil
app/src/routes/Pozisyonlar.svelte:355,405 → koşulu `s.oduncAlindi` / `sale.oduncAlindi` yap
app/src/routes/Portfoyler.svelte:474      → koşulu `s.oduncAlindi` yap
```

**Kabul:** `grep -rn "odunçAlindi" app/src` **boş** · 443 test yeşil · `⚠ ödünç` rozeti hâlâ düşüyor.

---

## H1 — $92.234'lük mutabakat farkını açıkla  ⭐ *(L, araştırma görevi)*

G10 farkı **gösteriyor** ama **açıklamıyor**. Bir uyarı şeridi, sebebi bilinmedikçe sadece kaygı üretir.

### Bilinenler (2026-09-11 ölçümü)

```
Defterden:  açık pozisyon maliyeti   $264.826,36
            nakit                    $ 18.795,01
            toplam                   $283.621,37
Excel aylık raporu (2026-08-31):     $191.386,89
FARK                                 $ 92.234,48
```

Yan veriler: yatırılan sermaye $184.608,62 · gerçekleşmiş K/Z $113.704,47 · temettü $298,07 ·
çekim $0 · açık pozisyon 34 adet · en eski işlem 2016-07-01.

### Görev: bir araştırma, bir de çıktı

**Çıktı:** `docs/2026-09-12-mutabakat-raporu.md` — farkın **kalem kalem** dökümü.
Kod değişikliği ancak araştırma sonucunda gerekiyorsa yapılacak.

**Sınanacak hipotezler** (her biri için sayısal kanıt üret, "muhtemelen" yazma):

1. **Zaman farkı.** Snapshot 2026-08-31, defter "bugün". Aradaki işlemlerin net etkisi ne?
   `tarih > '2026-08-31'` olan işlemleri ayrıştır.
2. **Maliyet ≠ piyasa değeri.** Snapshot piyasa değeri, defter toplamı maliyet.
   Canlı fiyatlarla açık pozisyonların **güncel değerini** hesapla ve farkın ne kadarını
   açıkladığını ölç. *(Bu tek başına farkın büyük kısmını açıklıyor olabilir — önce buna bak.)*
3. **Göç sınırı.** `meta.p0Sinirlari`: mevduatlar `TOPLU` altında toplu, alımlar kurum bazlı.
   `nakitHesapBazli`'da QNB −$56.675 · TEB −$57.740 · MIDAS −$58.572 · TOPLU +$184.907.
   Bu negatiflerin toplamı farkla ilişkili mi?
4. **Eksik satışlar.** Excel'de kapanmış ama `transactions.json`'a geçmemiş pozisyon var mı?
   Açık pozisyonların en eskilerini (2016–2020 tarihli alımlar) tek tek gözden geçir.
5. **Kur.** `net_usd` alanları hangi kurla hesaplanmış, Excel hangi kuru kullanmış?
   `fxrates.json` ile snapshot serisini karşılaştır.

**Kabul kriterleri**
- [ ] Rapor, $92.234'ün **en az %90'ını** adlandırılmış kalemlere bağlıyor; kalan "açıklanamayan"
      kısım açıkça o isimle yazılıyor.
- [ ] Her kalem için, tekrar üretilebilir bir hesap (betik veya adım adım sorgu) raporda yer alıyor.
- [ ] Sonuç "Excel mi defter mi doğru?" sorusuna **net bir cevap** veriyor.
- [ ] G10'un uyarı metni bulguya göre güncelleniyor: eğer fark açıklanabilir ve normalse, uyarı
      **açıklayıcı bir nota dönüşüyor** (kaygı üretmemeli); gerçekten bir hata varsa uyarı kalıyor
      ve ne yapılması gerektiğini söylüyor.

> **Not:** Bu görev "kod yaz"dan çok "anla ve yaz". Gemini emin olamadığı yerde uydurmasın,
> "şu hipotez şu veriyle sınandı, şu kadarını açıklıyor" desin. Açıklanamayan kalan, dürüstçe
> açıklanamayan olarak raporlansın.

---

## H2 — Veri kaynağı tazeliği: repo `data/` ⇄ Drive ayrışması  *(M)*

**Bu oturumda fiilen sorun çıkardı:** Enis 3 işlemin portföy etiketini canlı uygulamada düzeltti;
uygulama Drive'a yazdı; repodaki `data/*.json` ise 11 Eyl 21:03'te donmuş hâlde kaldı.
Sonuç: düzeltmenin yapılıp yapılmadığı yerelden **doğrulanamadı**.

Bugün üç ayrı "gerçek" var ve hangisinin güncel olduğunu söyleyen hiçbir şey yok:

```
BBB/data/*.json                     ← repo kopyası (göç anı + elle güncellemeler)
Google Drive                         ← canlı uygulamanın yazdığı yer
bbb-telegram-bot/data/*.json         ← botun kendi izole kopyası
```

### Yapılacaklar

1. **Künye şeridini genişlet** (G5'te eklendi). Şu an `Veri: 10 Eyl 2026` yazıyor — bu
   `meta.olusturulma`, yani göç tarihi; **verinin tazeliği değil.** Şuna dönüşsün:
   ```
   Kaynak: Google Drive · son yazma: 12 Eyl 2026 14:20 · 189 işlem
   ```
   `DriveSource` için dosyanın `modifiedTime`'ı, `LocalFileSource` için dosya `mtime`'ı kullanılsın.
2. **Kaynak rozeti.** Drive mi yerel mi olduğu her sayfada görünsün (küçük, kalıcı).
   Yerel kaynaktayken `⚠ yerel kopya — canlı veri olmayabilir` tonunda uyarı.
3. **Kayıt sayısı parmak izi.** Künyede işlem/nakit akışı sayısı yazsın; iki kaynağı gözle
   karşılaştırmayı mümkün kılar.
4. **`docs/veri-senkronizasyonu.md`** — hangi dosya nerede yaşar, hangi yön güvenli, `bbb-pull.sh` /
   `bbb-push.sh` ne yapar, repo kopyası ne zaman güncellenmeli. Tek sayfa, net.

**Kabul**
- [ ] Drive kaynağındayken künye gerçek son yazma zamanını gösteriyor (göç tarihini değil).
- [ ] Yerel kaynakta uyarı rozeti görünüyor.
- [ ] `docs/veri-senkronizasyonu.md` mevcut ve üç kopyayı da adlandırıyor.

---

## H3 — Uyarı merkezi  *(M)*

Dalga 2 beş ayrı uyarı üretti ve hepsi farklı yerlerde duruyor:

| Uyarı | Nerede | Kaynak |
|---|---|---|
| Mutabakat farkı | Panorama · Özkaynak bloğu | G10 |
| Negatif nakit | Panorama · donut altı | G3 |
| Fiyatı alınamayan pozisyon | Panorama | G10 |
| Portföy ödünç alma | Pozisyonlar · sayfa dibi | G11 |
| Aşırı satış | Pozisyonlar · sayfa dibi | G0 |

**Yapılacak:** `app/src/lib/ui/UyariSeridi.svelte` — her sayfanın üstünde tek, katlanabilir şerit.

```
⚠ 3 uyarı                                                              [göster ▾]
   • Aylık rapor ile defter arasında $92.234 fark var            → Panorama'ya git
   • HDFGS DELTA portföyünde yok, ALFA'dan 34.365 lot alındı     → Pozisyonlar'a git
   • 2 pozisyonun güncel fiyatı alınamadı                        → —
```

- Uyarılar tek bir yerde toplansın: `app/src/lib/data/uyarilar.ts` → `collectWarnings(ds, derived, prices)`
  → `{ id, seviye: 'bilgi'|'uyari'|'hata', mesaj: string, sayfa?: string }[]`.
- Sıfır uyarıda şerit **hiç render edilmesin** (boş bir "0 uyarı" kutusu gürültüdür).
- Açık/kapalı durumu `localStorage`'da hatırlansın.
- Mevcut dağınık uyarılar **kaldırılsın** — iki yerde görünmesin.

**Kabul**
- [ ] `collectWarnings` birim testi: her uyarı tipini üreten fixture ile doğrulanıyor.
- [ ] Uyarısız veri setinde şerit DOM'da yok.
- [ ] Eski uyarı render'ları silinmiş (`grep` ile doğrulanabilir).

---

## H4 — "Neden değişti?" ay ayrıştırması  ⭐ *(L)*

Enis'in bütün sorularının altında yatan soru bu. Özkaynak eğrisi Ağustos'ta $169.669 → $191.387
gidiyor; **$21.718 nereden geldi?**

`snapshots.json` bunu zaten kısmen taşıyor: `netMevduatCekim_usd`, `nakitTemettu_usd`, `netKZ_usd`,
`cekim_usd`, `vergiKomisyon_usd`. Yani veri var, gösterim yok.

### Yapılacaklar

1. **Eğri tıklanabilir olsun.** `LineChart.svelte`'e `onPointClick` prop'u.
2. Tıklanan ay için **şelale (waterfall) dökümü**:
   ```
   Ağustos 2026
   Başlangıç                        $169.669
   + Yeni mevduat                   $      0
   + Gerçekleşen kâr                $ 21.766      ← o ayın SaleEvent'lerinden
   + Temettü                        $      0
   − Vergi & komisyon               $     48
   + Değerleme (bakiye)             $      0
   = Dönem sonu                     $191.387
   ```
3. **"Değerleme (bakiye)" kalemi dürüst olsun:** snapshot'tan türetilemeyen kısım bu satıra
   düşer ve `.hint` olarak *"aylık rapordan doğrudan gelmeyen, kapanış farkından hesaplanan kalan"*
   yazar. Uydurma bir dağıtım yapılmaz.
4. O ayın **gerçekleşen kârı** artık `SaleEvent`'lerden **gerçekten** hesaplanabiliyor
   (`sales.filter(s => s.tarih.slice(0,7) === ay)`). Snapshot'ın `netKZ_usd`'si ile
   karşılaştır; farklıysa ikisini de göster — bu, H1'in mutabakatına da veri sağlar.
5. Aynı ayın **işlem listesi** döküm altında açılabilsin.

**Kabul**
- [ ] Şelale kalemlerinin toplamı, başlangıç + kalemler = dönem sonu eşitliğini **tam** sağlıyor.
- [ ] Snapshot'ı olmayan ay tıklanınca çökmüyor.
- [ ] `netKZ_usd` ile `SaleEvent` toplamı farklıysa ikisi de görünüyor, hangisinin hangisi olduğu belli.

---

## H5 — Portföy etiketi doğrulaması (giriş anında)  *(M)*

G11 uyarısı **sonradan** yakalıyor. Asıl çözüm, yanlış etiketin **hiç girilmemesi**.

`EkleKaydi.svelte` (ve botun onay kartı) bir `SAT` işlemi kaydedilirken:

- Seçilen portföyde o sembolden yeterli lot **yoksa**, kaydetmeden önce uyar:
  ```
  ⚠ ENIS portföyünde FSK yok. FON portföyünde 11.419 lot var.
     [FON'u seç]  [Yine de ENIS ile kaydet]  [İptal]
  ```
- Aynı kontrol **kurum** için de yapılsın (orada ödünç alma hiç yok, doğrudan hata olur).
- Kontrol `buildLedger(..., 'portfoy')` ve `'hesap'` sonuçlarından beslensin — yeni mantık yazma.

**Bot tarafı (`bbb-telegram-bot`):** onay kartında aynı uyarı satırı; kural tabanlı akışı bozmadan,
sadece bir uyarı satırı + `Yine de kaydet` butonu.

**Kabul**
- [ ] Yetersiz lotlu portföyle SAT kaydedilmeye çalışılınca uyarı çıkıyor ve alternatif öneriliyor.
- [ ] "Yine de kaydet" çalışıyor (kullanıcıyı kilitlemiyor).
- [ ] Yeterli lot varken hiçbir uyarı çıkmıyor (yanlış pozitif yok).
- [ ] Bot testleri `BBB_DIR` set edilerek geçiyor.

---

## H6 — Tutma süresi dağılımı  *(S — düşük maliyet, yüksek içgörü)*

`SaleEvent.tutmaGunu` G0'da zaten üretiliyor ve **hiç kullanılmıyor**.

Pozisyonlar sayfasına küçük bir panel:

```
Tutma süresi
Kazanan işlemler   ortalama  94 gün   (medyan 61)
Kaybeden işlemler  ortalama  17 gün   (medyan  9)
```

+ basit bir histogram (0–7 · 8–30 · 31–90 · 91–365 · 365+ gün), kazanan/kaybeden ayrı renkte.

Altına tek cümlelik yorum — **sadece veri destekliyorsa**:
*"Kaybeden işlemleri kazananlardan daha kısa tutuyorsun."* / tersi ise tersi.
Veri belirsizse (fark %20'den az) yorum **yazılmaz**.

**Kabul**
- [ ] Ortalama/medyan birim testle doğrulanıyor.
- [ ] `tutmaGunu === null` olan satışlar hesaptan dışlanıyor, sayıları belirtiliyor.
- [ ] Fark küçükken yorum cümlesi render edilmiyor.

---

## H7 — Kurum nakit sağlığı  *(S)*

`meta.nakitHesapBazli` bugün şunu diyor:

```
KASA  +26.365   QNB −56.675   TEB −57.741   OYAK-E −17.949
GARAN −1.539    MIDAS −58.573  TOPLU +184.907          → toplam +18.795
```

Dört kurum negatif; toplam sadece `TOPLU` sayesinde pozitif. Bu, `meta.p0Sinirlari`'nda yazan
bilinen bir göç sınırı — ama **arayüzde hiçbir iz yok**, sessizce yanlış duruyor.

- Kurumlar sayfasında negatif bakiyeli kuruma kırmızı rozet + `.hint`:
  *"göç kaynaklı: mevduatlar TOPLU altında toplu kaydedilmiş, alımlar kurum bazlı — kurum bazlı
  bakiye tek başına anlamlı değil"*.
- Sayfa üstünde bir kez: toplam nakit ve "kurum bazlı dağılım güvenilir değil" notu.
- `KurumNakitDuzelt.svelte` zaten var — rozetten oraya doğrudan bağlantı.

**Kabul**
- [ ] Negatif bakiyeli her kurumda rozet var, pozitiflerde yok.
- [ ] Nakit toplamı değişmiyor (bu görev sadece görünürlük, hesap değiştirmiyor).

---

## H8 — Global maliyet ⇄ güncel değer anahtarı  *(M)*

Bugün üç sayfa üç farklı baz kullanıyor: Panorama'nın sınıf pastası **değer** (G3'te değişti),
portföy pastası **maliyet**, Portföyler'de **iki ayrı pasta**, Pozisyonlar'da ikisi yan yana.
Aynı kavram için üç dil.

`settings.svelte.ts`'e para birimi anahtarının yanına `basis: 'maliyet' | 'deger'` eklensin;
tüm dağılım görünümleri buna bağlansın. Portföyler'deki iki ayrı pasta satırı tek satıra insin.
Tercih `localStorage`'da kalıcı olsun.

**Kabul**
- [ ] Anahtarı çevirince Panorama ve Portföyler **aynı anda** baz değiştiriyor.
- [ ] Yenilemede tercih korunuyor.
- [ ] Fiyatı gelmemiş satır, `deger` modunda maliyetine düşüyor ve bu bir `.hint` ile belirtiliyor.

---

## H9 — Bot: `/kz` komutu  *(M)*

Enis'in "o işlemden ne kazandım göremiyorum" şikâyeti masaüstünde çözüldü; mobilde çözülmedi.

```
/kz            → son 10 satış: tarih · sembol · lot · K/Z · %
/kz THYAO      → o sembolün tüm satışları + toplam
/kz ENIS       → o portföyün kapanan işlemleri + toplam    (sembol değilse portföy dene)
```

- Hesap mantığı **botun kendi `data/` kopyasında**, BBB'nin `ledger.ts` mantığının Python karşılığı
  olarak yazılsın. Kural tabanlı kalsın, AI çağrısı **yok**.
- Çıktıda kâr 🟢, zarar 🔴.
- `oduncAlindi` karşılığı bir uyarı satırı: portföy etiketi şüpheliyse `⚠` ile işaretle.

**Kabul**
- [ ] `pytest` (BBB_DIR set) yeşil; senaryo testi üç kullanım biçimini de kapsıyor.
- [ ] Toplam gerçekleşmiş K/Z, BBB'nin ürettiği değerle **aynı** (aynı veri üstünde karşılaştır).
- [ ] Bilinmeyen sembolde bot tahmin etmiyor, soruyor (mevcut davranışa uyum).

---

## H10 — Bot: aylık kapanış hatırlatıcısı  *(S)*

`snapshots.json`'ın son ayı, içinde bulunulan aydan geriyse — şu an tam olarak bu durumda
(son snapshot Ağustos, takvim Eylül) — Panorama sessizce eskiyor. "BU AY hangi ay?" karışıklığının
kökü de buydu.

- Ayın ilk iş günü, Oracle VM'deki bot Telegram'dan hatırlatsın:
  *"Ağustos kapanışı girildi, Eylül bekleniyor. Aylık raporu girmek için: …"*
- Zaten kurulu `cron`/`systemd` altyapısını kullan; yeni servis ekleme.
- Hatırlatma **bir kez** gitsin (gönderildi bayrağı dosyada tutulsun), her gün tekrarlamasın.

**Kabul**
- [ ] Son snapshot güncel aya aitse hatırlatma **gitmiyor**.
- [ ] Geriyse tam bir kez gidiyor; ikinci çalıştırmada tekrar gitmiyor.
- [ ] Test, sistem saatini enjekte ederek (gerçek tarihe bağlı olmadan) çalışıyor.

---

# SONNET — DENETİM (E1–E4)

## E1 — Otomatik
`npm test` · `npm run check` · `npm run build` · `.skip`/`.only` taraması ·
bot için `BBB_DIR=... pytest`.

## E2 — Sayısal mutabakat
Dalga 2'nin çapa değerleri **değişmemiş** olmalı (H1 bilinçli bir düzeltme getirmediyse):

| Ölçü | Beklenen |
|---|---|
| Gerçekleşmiş K/Z (global) | $113.704,47 |
| Açık pozisyon sayısı | 34 |
| Açık maliyet | $264.826,36 |
| Nakit | $18.795,01 |

**Doğru çapraz kontroller** (Dalga 2'deki hatalı olanların yerine):
- her kapsam için `Σ(scope.sales.kzUsd) == scope.realizedUsd`
- her kapsam için `Σ(scope.open maliyeti) == o kapsamın toplam açık maliyeti`
- **Kapsamlar arası eşitlik beklenmez** — farklı ortalama maliyet tabanları farklı sonuç verir.

H4 için ek: her ayın şelale kalemleri `başlangıç + Σkalemler == dönem sonu` eşitliğini sağlamalı.

## E3 — Kod incelemesi
- H0 gerçekten temizlemiş mi (`grep -rn "odunçAlindi"` boş mu)?
- H3 eski dağınık uyarıları **silmiş** mi, yoksa ikinci bir yere mi eklemiş?
- H4'teki "değerleme (bakiye)" kalemi gerçekten bakiye mi, yoksa gizli bir uydurma dağıtım mı?
- H6'daki yorum cümlesi veri zayıfken susuyor mu?
- Sıfıra bölme, `null` fiyat, boş veri seti korumaları.

## E4 — Görsel
390px ve 1440px · açık/koyu tema · uyarı şeridi aç/kapa · eğride ay tıklama ·
baz anahtarının iki sayfayı birden çevirmesi · konsol hatası yok.

---

## Ek — Dalga 4 adayları (şimdilik kayıtta)

- **Ollama kategori önerisi** (yukarıdaki gerekçeyle ertelendi).
- **`rclone` otomatik senkron** (H2'den sonra değerlendirilecek).
- **Vergi raporu.** `SaleEvent` artık tarih + maliyet + hasılat taşıyor; yıllık stopaj/beyan özeti
  üretmek için gereken her şey mevcut.
- **Hedef/seviye takibi.** `Instrument.seviyeler` (destek/direnç/hedef) veride var, Pozisyonlar'da
  sadece metin olarak gösteriliyor — fiyat seviyeye gelince bot bildirimi.
