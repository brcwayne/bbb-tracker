# Yatırım Kurumları Arası TL/USD Nakit Transferi — Gemini için Uçtan Uca Yönerge

**Durum:** Planlanmadı, uygulanmadı. Bu doküman, Gemini'nin bu özelliği baştan sona (kod + testler) tek başına yürütmesi için yazıldı. Enis aradan çıkacak — soru sormadan, aşağıdaki kararları nihai kabul ederek ilerle.

**Kapsam: yalnızca web (bu repo, `app/`), yalnızca Yatırımlar hacmindeki yatırım kurumları (`brokers`) arası nakit transferi.** Enis'in isteği net: "Yatırımlar bölümündeki kurumlar arasında para transferini mümkün kıl, web'den yapsam yeter, TL/USD olarak para transferi yapılacak özellikleri ekle." Kişisel Hesaplar sayfası (banka/nakit/kredi kartı) bu işin **dışında** — dokunma. `bbb-telegram-bot/` da bu işin dışında — dokunma.

---

## 0. Bugünkü durum ve boşluk

Kayıtlar sayfasında (`app/src/routes/EkleKaydi.svelte`) "Nakit Hareketi" formu (`app/src/routes/forms/NakitHareketiFormu.svelte`) zaten bir `TRANSFER` türü içeriyor — bu, iki yatırım kurumu (`dataset.brokers`) arasında nakit taşımak için var ve P2'nin kendi tanımında zaten "kurumlar arası transfer" diye adlandırılmıştı. **Ama yalnızca aynı para biriminde çalışıyor:**

- Form tek bir "Para Birimi" (TL/USD) seçtiriyor ve tek bir "Tutar" alıyor; bu tutar hem kaynak kurumdan düşülüyor hem hedef kuruma aynen ekleniyor (`NakitHareketiFormu.svelte:153-169`, tek `paraBirimi`/`tutarInput`).
- Türetme katmanında (`app/src/lib/data/cashBalances.ts:115-124`, `cashSplitByHesap`'in `TRANSFER` dalı) `isTl` tek bayrağına göre **hem kaynağın hem hedefin aynı para birimindeki** bakiyesi güncelleniyor — kaynak TL'den hedef USD'ye gibi bir ayrım yok.
- `cashBalanceByHesap` (aynı dosya, satır 20-27) de aynı şekilde tek `tutar_usd`'yi her iki tarafa da uyguluyor.

Yani örneğin "Kurum A"daki 1000 USD'yi "Kurum B"ye TL olarak (ya da tam tersi) aktarmak bugün mümkün değil — form da, türetme de tek para birimi varsayıyor.

**Bu iş, o boşluğu kapatıyor: aynı formu, kaynak ve hedefin farklı para biriminde olabileceği şekilde genişletiyor.** Yeni bir kayıt türü icat etmiyoruz — mevcut `Cashflow`/`TRANSFER` mekanizmasını genişletiyoruz, çünkü iş tamamen Yatırımlar hacminin içinde kalıyor ve mevcut alan zaten TL/USD ayrımını (`tutar_tl`/`tutar_usd`) taşıyor.

---

## 1. Kapsam kararları (verilmiş, tartışmaya kapalı)

- **Yeni tablo/dosya yok.** `Cashflow` tipi, mevcut `tutar_tl`/`tutar_usd`/`kur` alanlarına **simetrik yeni alanlar** kazanıyor (`hedefTutarTl`, `hedefTutarUsd`) — bkz. §2. Bu alanlar yoksa (eski satırlar, ya da kullanıcı aynı para biriminde transfer yaptıysa) davranış **birebir bugünküyle aynı** — geriye dönük tam uyumlu.
- **Kur elle girilir**, `settings.rate` (TCMB referansı) ile önceden doldurulur, elle değiştirilebilir — gerçek kurum kuru TCMB'den farklı olacağı için.
- Aynı para biriminde transfer davranışı **hiç değişmiyor** — bu yalnızca kaynak ve hedef para birimi **farklıyken** devreye giren bir ek yetenek (formda opsiyonel bir "Hedef para birimi farklı" anahtarı).
- Kişisel Hesaplar sayfası, bot, ve `data/*.json` dosyaları bu işten etkilenmiyor.
- Mutabakat/kimlik (`kimlik.ts`) kontrolüne dokunma — o zaten `cashSplitByHesap`/`cashBalanceByHesap`'i çağırıyor, bu iki fonksiyonu güncelleyince otomatik doğru davranacak.

---

## 2. Veri modeli

`app/src/lib/data/types.ts`, `Cashflow` arayüzüne iki opsiyonel alan ekle:

```ts
export interface Cashflow {
  id: string
  tarih: string
  hesap: string
  portfoy: string | null
  tur: 'YATIRMA' | 'CEKME' | 'TEMETTU' | 'TRANSFER' | 'DUZELTME'
  enstruman: string | null
  tutar_tl: number | null
  tutar_usd: number
  kur: number | null
  aciklama: string
  kaynak: string
  hedefHesap?: string
  /** Yalnızca tur==='TRANSFER' ve hedef kurumun para birimi kaynaktan
   *  farklıysa dolu. Kaynak taraf her zaman tutar_tl/tutar_usd'de kalır
   *  (mevcut anlam değişmedi); bu iki alan yalnızca HEDEF tarafın kendi
   *  para biriminde ne kadar aldığını taşır. İkisinden yalnızca biri
   *  dolu olur (hedef TL ise hedefTutarTl, USD ise hedefTutarUsd). Boşsa
   *  hedef, kaynakla aynı tutar+para birimini alır (bugünkü davranış). */
  hedefTutarTl?: number | null
  hedefTutarUsd?: number | null
}
```

Bot'un `Cashflow` şemasına dair bir varsayımı bozmuyoruz — yalnızca yeni, opsiyonel alanlar ekleniyor, mevcut alanların anlamı aynı kalıyor.

---

## 3. Türetme (`app/src/lib/data/cashBalances.ts`)

### 3.1 `cashSplitByHesap` — `TRANSFER` dalı (şu an satır 115-124)

Şu anki hali:

```ts
} else if (c.tur === 'TRANSFER' && c.hedefHesap) {
  const target = getEntry(c.hedefHesap)
  if (isTl) {
    e.tl -= c.tutar_tl!
    target.tl += c.tutar_tl!
  } else {
    e.usd -= c.tutar_usd
    target.usd += c.tutar_usd
  }
}
```

Yeni hali — kaynak bacağı aynı kalıyor, hedef bacağı `hedefTutarTl`/`hedefTutarUsd` varsa onu kullanıyor, yoksa eski (aynı para birimi) davranışına düşüyor:

```ts
} else if (c.tur === 'TRANSFER' && c.hedefHesap) {
  const target = getEntry(c.hedefHesap)
  if (isTl) e.tl -= c.tutar_tl!
  else e.usd -= c.tutar_usd

  if (c.hedefTutarTl != null) target.tl += c.hedefTutarTl
  else if (c.hedefTutarUsd != null) target.usd += c.hedefTutarUsd
  else if (isTl) target.tl += c.tutar_tl!
  else target.usd += c.tutar_usd
}
```

### 3.2 `cashBalanceByHesap` (şu an satır 20-27, tek USD-eşdeğeri toplam)

Şu anki hali:

```ts
else if (c.tur === 'TRANSFER' && c.hedefHesap) {
  bump(c.hesap, -c.tutar_usd)
  bump(c.hedefHesap, c.tutar_usd)
}
```

Yeni hali:

```ts
else if (c.tur === 'TRANSFER' && c.hedefHesap) {
  bump(c.hesap, -c.tutar_usd)
  bump(c.hedefHesap, c.hedefTutarUsd ?? c.tutar_usd)
}
```

`hedefTutarTl` burada kullanılmıyor çünkü bu fonksiyon tamamen USD cinsinden çalışıyor (kur parametresi almıyor) — hedef TL ise formda kaydedilirken zaten USD karşılığı da (`hedefTutarUsd`, o anki `kur` ile) hesaplanıp saklanmalı (bkz. §4, form her iki hedef alanını da yazmalı: kullanıcının seçtiği para biriminde `hedefTutarTl` **veya** `hedefTutarUsd`, VE her durumda `hedefTutarUsd`'nin dolu olması gerekiyor çünkü bu fonksiyon ona bakıyor). Yani form, hedef TL girildiğinde hem `hedefTutarTl` (gösterim/`cashSplitByHesap` için) hem `hedefTutarUsd` (kurla çevrilmiş, `cashBalanceByHesap` için) yazmalı — tıpkı bugün kaynak tarafın `tutar_tl`+`tutar_usd` ikilisini birlikte taşıdığı gibi (`NakitHareketiFormu.svelte:87-89`).

---

## 4. Form (`app/src/routes/forms/NakitHareketiFormu.svelte`)

`tur === 'TRANSFER'` iken:

- Mevcut alanlar aynen kalıyor: Hesap (kaynak kurum), Hedef Hesap, Para Birimi (kaynak), Tutar (kaynak).
- **Yeni:** "Hedef para birimi farklı" bir checkbox/toggle. Kapalıyken (varsayılan) davranış birebir bugünküyle aynı — hedef, kaynakla aynı tutar+para birimini alır, `hedefTutarTl`/`hedefTutarUsd` yazılmaz (mevcut testler bozulmaz).
- Açıkken:
  - **Hedef Para Birimi** seçici (TL/USD) görünür.
  - **Kur** alanı görünür, `settings.rate` ile önceden dolu, elle değiştirilebilir.
  - **Hedef Tutar** hesaplanır: kaynak USD ise ve hedef TL ise `hedefTutar = kaynakTutarUsd * kur`; kaynak TL ise ve hedef USD ise `hedefTutar = kaynakTutarTl / kur`; kaynak ve hedef aynı para biriminde ise (checkbox açık ama seçilen para birimi kaynakla aynıysa) kur alanı gizlenir, hedef tutar kaynakla eşitlenir. Kullanıcı hedef tutarı elle de değiştirebilir (kur alanı buna göre tersine hesaplanır) — mevcut formlardaki hiçbir yerde iki-yönlü bağlı input yok, bu yüzden basit tut: kur değişince hedef tutar yeniden hesaplanır, hedef tutar değişince kur yeniden hesaplanır (`kur = hedefTutar / kaynakTutarUsd` ya da ilgili yön), son değişen alan otoriter.
- `confirmSave()`'de `base` nesnesine, hedef para birimi kaynaktan farklıysa, `hedefTutarTl`/`hedefTutarUsd` çiftini ekle (§3.2'deki gerekliliğe göre: TL hedefse hem `hedefTutarTl` hem kurla çevrilmiş `hedefTutarUsd`; USD hedefse yalnızca `hedefTutarUsd`, `hedefTutarTl` yazılmaz/`null`).
- Özet ekranında (`step === 'confirm'`) hedef tutarı da göster: `"{hesap} → {hedefHesap} · {kaynakTutar} {kaynakParaBirimi} → {hedefTutar} {hedefParaBirimi}"` şeklinde, farklı para birimindeyse.
- Doğrulama (`review()`): hedef para birimi farklıyken kur ve hedef tutar > 0 olmalı; kaynak === hedef hesap engeli zaten var, dokunma.

---

## 5. Test gereksinimleri

Proje kuralı: **TDD, Vitest + `@testing-library/svelte`, test-first.** `npm test` (`vitest run`) ve `npm run check` (`svelte-check`) ikisi de yeşil olmadan bitmiş sayma.

**`cashBalances.test.ts`'e ekle:**
- Mevcut aynı-para-birimi `TRANSFER` testleri **hiç değişmeden** geçmeye devam ediyor (regresyon/pinning — mevcut testler zaten bunu kanıtlıyor, ekstra dokunma).
- Yeni: `hedefTutarUsd` dolu bir TRANSFER satırı → kaynak kurumun USD'si düşüyor, hedef kurumun TL'si `hedefTutarTl`'ye göre artıyor (ya da tersi kombinasyon) — `cashSplitByHesap` için.
- Yeni: aynı satır için `cashBalanceByHesap` → kaynaktan `tutar_usd` düşüyor, hedefe `hedefTutarUsd` ekleniyor (kaynak `tutar_usd`'siyle **aynı olmadığını** açıkça doğrulayan bir test — bu, iki para biriminin farklı olduğunu kanıtlayan asıl test).
- Yeni: `hedefTutarTl`/`hedefTutarUsd` her ikisi de `null`/`undefined` olan eski-şekil bir satır → davranış bugünküyle birebir aynı (geriye dönük uyumluluk pinning testi, açıkça yazılmış).

**`NakitHareketiFormu.test.ts`'e ekle:**
- "Hedef para birimi farklı" kapalıyken form ve kaydedilen satır bugünküyle birebir aynı (regresyon).
- Açıkken: hedef para birimi seçilince kur alanı görünüyor, `settings.rate` ile önceden dolu.
- Kur değişince hedef tutar otomatik güncelleniyor; hedef tutar elle değiştirilince kur güncelleniyor.
- Kaydet → `appendRecord`'a giden satırda kaynak taraf (`tutar_tl`/`tutar_usd`) bugünküyle aynı şekilde, hedef taraf (`hedefTutarTl` **veya** `hedefTutarUsd`, ve her durumda `hedefTutarUsd`) doğru dolu.
- Aynı para birimi seçilse bile (checkbox açık ama TL→TL gibi) kur alanı gizli, hedef tutar kaynakla otomatik eşit.
- Düzenleme modu (`editing` prop'u dolu bir TRANSFER satırı, `hedefTutarUsd` içeren) — form değerleri doğru önceden dolduruyor.
- Doğrulama: hedef para birimi farklıyken hedef tutar veya kur boş/≤0 ise hata.

**Regresyon:** İş bitince `npm test` içindeki **tüm** paket (yeni eklenenler dahil, mevcutların hiçbiri kırılmadan) ve `npm run check` temiz geçmeli. `EkleKaydi.test.ts`'teki mevcut `nakit` picker testleri de bozulmamalı.

**Fixtures:** `app/src/lib/data/fixtures/dataset.ts`'e (ya da eşdeğer test fixture dosyasına) en az bir farklı-para-birimi `TRANSFER` örneği ekle — local dev görünümü ve component testleri bunu okuyor.

---

## 6. Kapsam dışı (bilinçli olarak yapılmıyor)

- Kişisel Hesaplar sayfası (banka/nakit/kredi kartı) ile Yatırımlar hacmi arasında köprü — bu ayrı, daha büyük bir iş; bu yönerge onu kapsamıyor.
- Kişisel hesaplar arası farklı para birimiyle transfer — ayrı, bu yönerge onu kapsamıyor.
- Telegram bot entegrasyonu.
- Otomatik/canlı kur çekme — `settings.rate` zaten var, onu kullan.
- İki taraflı onay/bekleme durumu, kısmi transfer, iptal/geri alma akışı — tek satırlık, anlık, düzenlenebilir/silinebilir (mevcut manuel kayıt deseniyle aynı: yalnızca `kaynak==='manual'` düzenlenebilir/silinebilir, bu zaten var, dokunma).
- Görsel tasarımın ötesine geçen bir yeniden tasarım — yeni alanlar mevcut form dilinin aynen devamı olmalı.

---

## 7. Süreç kuralları (Gemini için)

- Git worktree'de çalış, `main`'e asla doğrudan yazma/force-push yapma.
- `data/` klasöründeki gerçek finansal JSON dosyalarına **asla dokunma, commit etme**.
- TDD sırası: önce `cashBalances.test.ts` eklemeleri (saf fonksiyon, en kolay doğrulanan katman) + `cashBalances.ts` değişikliği, sonra `types.ts`, sonra form + `NakitHareketiFormu.test.ts`.
- Her adımdan sonra `npm test` çalıştır — kırmızıdan yeşile TDD döngüsünü gerçekten uygula.
- Bitirmeden önce `npm run check` çalıştır, tip hatası bırakma.
- Commit mesajları bu repodaki mevcut konvansiyonla aynı (`feat(...)` küçük harf Türkçe açıklama — `git log`'a bak).

---

## 8. Bitti tanımı (kabul kriterleri)

1. Enis, Kayıtlar sayfasındaki Nakit Hareketi formundan, bir yatırım kurumundaki USD nakdini başka bir kuruma TL olarak (ya da tersi) tek bir kayıtla aktarabiliyor.
2. Her iki kurumun Kurumlar sayfasındaki nakit bakiyesi (TL ve USD ayrı ayrı) doğru güncelleniyor.
3. Aynı para biriminde transfer davranışı hiç değişmedi — mevcut testler ve mevcut kayıtlar bozulmadı.
4. `npm test` ve `npm run check` temiz.
5. Kişisel Hesaplar sayfasına, bot'a, `data/*.json`'a dokunulmadı.
