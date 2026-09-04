# P2 — Manuel Kayıt Girişi + Google Drive'a Yazma — Tasarım

## Amaç

P1/P1.6 tüm sayfaları salt-okunurdu: veri sadece Excel'den tek seferlik göç (migration) ile geldi. P2, Enis'in yeni işlemleri (alım-satım), nakit hareketlerini (yatırma/çekme/temettü), kurumlar/portföyler arası para ve varlık transferlerini, ve yeni kurum/aracı kurumları doğrudan uygulama üzerinden girip Google Drive'daki veri dosyalarına yazabilmesini sağlar. Düzeltme (edit) ve silme (delete) bu fazın kapsamı dışındadır — bilinçli olarak ertelendi, ilerleyen bir fazda ele alınacak (bkz. Kapsam Dışı).

## Kapsam

**Dahil:**
1. Yeni işlem ekleme (AL/SAT) — Pozisyonlar sayfasını besler.
2. Yeni nakit hareketi ekleme (YATIRMA/ÇEKME/TEMETTÜ) — Banka/Temettü sayfalarını besler.
3. Kurumlar/portföyler arası **para transferi** — yeni bir nakit hareketi türü (`TRANSFER`), kaynak/hedef hesap bilgisiyle.
4. **Varlık transferi** — bir enstrümanın hangi kurum/portföy altında göründüğünü değiştiren, maliyet/kâr-zarar hesabına dokunmayan, tamamen ayrı bir kayıt türü.
5. Yeni kurum (broker) ekleme.
6. Kurum bazlı **canlı nakit bakiyesi** hesaplama ve gösterimi (Kurumlar sayfasına yeni bir "Nakit" satırı).
7. Google Drive'a yazma altyapısı: OAuth izin genişletme, oku-değiştir-yaz döngüsü, iyimser eşzamanlılık kontrolü (optimistic concurrency).
8. Tek, merkezi bir "Ekle" ekranı (8. sekme) — kayıt türü seçimi, form, özet/onay adımı, kaydetme.
9. Giriş doğrulama kuralları (zorunlu alanlar, mantıksal sınırlar — örn. olmayan lotu satamama).

**Kapsam dışı (bilinçli erteleme):**
- Var olan bir kaydı düzenleme veya silme — Enis'in isteğiyle ertelendi ("önce sadece ekleme ile başlayalım ama sonra mutlaka diğer özellikleri ekelemeliyiz"). Bu, P2'nin hemen ardından gelecek doğal bir sonraki faz olarak not edilmiştir.
- Yeni enstrüman ekleme (örn. hiç alınmamış yeni bir hisse) — bu spec'te ele alınmadı; şimdilik yalnızca `instruments.json`'da zaten var olan enstrümanlar işlem/transfer formlarında seçilebilir. Enis yeni bir enstrüman alırsa, mevcut manuel Drive-dosya-düzenleme yoluyla eklenmeye devam eder.
- Offline kuyruğa alma / taslak senkronizasyonu — Enis tek cihazdan, normal internet bağlantısıyla çalışıyor; bu karmaşıklık gerekmiyor (YAGNI).

## Global Kısıtlar

(P1/P1.6'dan devralınan, hâlâ bağlayıcı olan kurallar + P2'ye özgü yenileri)

- **Ruling P1-9** (devam ediyor): `app/svelte.config.js` asla değiştirilmez.
- **Ruling P1-10** (devam ediyor): Yeni sayfalar/bileşenler `derived` değil `view` prop adını kullanır, `$derived`/`$derived.by` rune'larını serbestçe kullanabilir.
- `verbatimModuleSyntax` açık — tüm sadece-tip importlar `import type { ... }` kullanır.
- Kullanıcıya gösterilen tüm tutarlar `money()` üzerinden formatlanır — `usd()`/`tryFmt()` doğrudan çağrılmaz.
- Finansal veri (`data/*.json`) asla repo'ya veya build çıktısına girmez — bu P2'de de geçerli; yazma işlemleri yalnızca Drive'a, tarayıcıdan doğrudan gider, hiçbir sunucu/CI adımından geçmez.
- **Ruling P2-1 (yeni, load-bearing):** Yeni eklenen her kayıt `kaynak: 'manual'` taşır (mevcut migration kayıtları `kaynak: 'migration'`). Kurum bazlı nakit bakiyesi hesaplaması bu alanla migration-sonrası hareketleri ayırt eder (bkz. Bölüm 4) — asla tarih bazlı bir kesim noktası kullanılmaz, çünkü geriye dönük tarihli manuel düzeltmeler (örn. "Mart ayında unuttuğum bir işlemi giriyorum") tarih bazlı bir kurala göre yanlış sınıflanır.
- **Ruling P2-2 (yeni, load-bearing):** Varlık transferleri `derivePositions`/`derive.ts`'nin maliyet-lot mantığına asla girmez — ayrı bir dosyada, ayrı bir tipte tutulur. Bu, P1/P1.6'da zaten test edilmiş pozisyon hesaplama mantığına sıfır regresyon riski taşımayı garanti eder.

## Bölüm 1 — Veri Modeli Değişiklikleri

### 1.1 `Cashflow.tur` — yeni değer: `'TRANSFER'`

```ts
export interface Cashflow {
  id: string
  tarih: string
  hesap: string                              // kaynak hesap (TRANSFER için: parayı gönderen)
  portfoy: string | null
  tur: 'YATIRMA' | 'CEKME' | 'TEMETTU' | 'TRANSFER'   // ← yeni değer eklendi
  enstruman: string | null
  tutar_tl: number | null
  tutar_usd: number
  kur: number | null
  aciklama: string
  kaynak: string
  hedefHesap?: string                        // ← yeni, sadece tur === 'TRANSFER' için zorunlu
}
```

`hedefHesap`, kaynak hesaptan farklı olmalıdır (aynı hesaba "transfer" anlamsızdır — doğrulama kuralı, Bölüm 8). Mevcut `bankTransfers()` (`cashmoves.ts`) zaten yalnızca `YATIRMA`/`CEKME` filtreliyor, bu yüzden `TRANSFER` kayıtları otomatik olarak yatan/çekilen toplamlarına karışmaz — hiçbir değişiklik gerekmez. Banka sayfasına (`Banka.svelte`) yeni bir "Transferler" bölümü eklenir: `cashmoves.ts`'ye yeni bir fonksiyon `transfers(cashflows: Cashflow[]): TransferMoveRow[]` eklenir (tarih, kaynak hesap, hedef hesap, tutar, açıklama).

### 1.2 Yeni tip: `AssetTransfer` — ayrı dosya `assetTransfers.json`

```ts
export interface AssetTransfer {
  id: string              // "at_" + 16 hex karakter
  tarih: string
  enstruman: string       // instruments.json'daki bir kod
  lot: number              // bilgi amaçlı; maliyet hesabını etkilemez
  kaynakHesap: string
  hedefHesap: string
  kaynakPortfoy: string | null
  hedefPortfoy: string | null
  aciklama: string
  kaynak: string           // her zaman 'manual' (P2'de migration'dan gelen yok)
}
```

**Bilinen sınırlama (P1.6'dan devralınan basitleştirme, P2'nin yeni bir kısıtı değil):** `breakdowns.ts`'nin "en son işlem hangi kurum/portföyse sahiplik odur" mantığı, bir enstrümanın aynı anda iki kurumda bölünmüş şekilde tutulmasını modellemez — P1.6'da da böyleydi. Bu yüzden **kısmi lot transferi** (örn. 100 lotun yalnızca 50'si taşınırsa) de aynı basitleştirmeye tabidir: transfer, o enstrümanın **tüm** kalan sahipliğini hedef kurum/portföye taşır; `lot` alanı yalnızca bilgi/denetim amaçlıdır ve Bölüm 5'teki "açık pozisyonu aşamaz" kuralıyla doğrulanır, ama sahiplik bölünmesi için kullanılmaz. Enis'in aynı enstrümanı gerçekten iki kurumda ayrı ayrı tutması gerekiyorsa (nadir), bu spec'in kapsamı dışındadır.

`Dataset` tipi bir alan daha kazanır: `assetTransfers: AssetTransfer[]`. `NAMES` dizisine (`source.ts`) `'assetTransfers'` eklenir — **ama** bu dosya diğer 8 dosyadan farklı olarak **yoksa hata fırlatmaz**: `DriveSource.load()` bu tek dosya için 404/"bulunamadı" durumunu `[]` olarak ele alır. İlk varlık transferi kaydedilmek istendiğinde dosya Drive'da yoksa, uygulama onu `[]` içerikle otomatik oluşturur (Enis'in elle bir dosya yaratmasına gerek kalmaz).

### 1.3 Yeni kurum ekleme

`brokers.json`'a yeni bir `Broker` objesi eklenir — mevcut tipe birebir uyar, ek alan gerekmez:
```ts
{ kod: string, ad: string, tur: string, sahip: string, aktif: true }
```

### 1.4 Attribution mantığı güncellemesi (`breakdowns.ts`)

`latestFieldByKod(txns, field)` şu an yalnızca `Transaction[]` üzerinden çalışıyor. Bu, artık `AssetTransfer` kayıtlarını da "en son sahiplik olayı" olarak saymalı. Yeni bir birleştirme fonksiyonu eklenir:

```ts
type AttrEvent = { kod: string; tarih: string; id: string; hesap: string; portfoy: string }

function attributionEvents(txns: Transaction[], transfers: AssetTransfer[]): AttrEvent[] {
  return [
    ...txns.map((t) => ({ kod: t.enstruman, tarih: t.tarih, id: t.id, hesap: t.hesap, portfoy: t.portfoy })),
    ...transfers.map((tr) => ({
      kod: tr.enstruman, tarih: tr.tarih, id: tr.id,
      hesap: tr.hedefHesap, portfoy: tr.hedefPortfoy ?? '',
    })),
  ]
}
```

`latestFieldByKod` bu birleşik listeyi alacak şekilde güncellenir; tie-break kuralı aynen korunur (`tarih` sonra `id` — mevcut, gözden geçirilmiş kural). `holdingsByPortfolio`/`holdingsByBroker` çağrıları `assetTransfers`'ı da parametre olarak alır. Bu, `derive.ts`'ye (pozisyon/maliyet hesaplama) **hiç dokunmaz**.

## Bölüm 2 — Kurum Bazlı Canlı Nakit Bakiyesi

Yeni saf modül: `app/src/lib/data/cashBalances.ts`.

```ts
export function cashBalanceByHesap(ds: Dataset): Record<string, number> {
  const bal = { ...ds.meta.nakitHesapBazli }   // başlangıç noktası — Excel'den gelen son bilinen değerler
  const bump = (hesap: string, delta: number) => { bal[hesap] = (bal[hesap] ?? 0) + delta }

  for (const t of ds.transactions) {
    if (t.kaynak === 'migration') continue          // Ruling P2-1: sadece migration-sonrası hareketler
    bump(t.hesap, t.yon === 'AL' ? -t.net_usd : t.net_usd)
  }
  for (const c of ds.cashflows) {
    if (c.kaynak === 'migration') continue
    if (c.tur === 'YATIRMA' || c.tur === 'TEMETTU') bump(c.hesap, c.tutar_usd)
    else if (c.tur === 'CEKME') bump(c.hesap, -c.tutar_usd)
    else if (c.tur === 'TRANSFER' && c.hedefHesap) { bump(c.hesap, -c.tutar_usd); bump(c.hedefHesap, c.tutar_usd) }
  }
  return bal
}
```

`Kurumlar.svelte`'e her kurum panelinin başlığına bir "Nakit: {money(bal[broker.kod] ?? 0)}" satırı eklenir (mevcut Maliyet/Değer/K-Z bilgisinin yanına).

## Bölüm 3 — Google Drive'a Yazma Mekanizması

### 3.1 OAuth izin genişletme

`DRIVE_SCOPE`, `drive.readonly`'den `https://www.googleapis.com/auth/drive`'a çıkarılır (önceki brainstorming'de onaylanan A yaklaşımı). Enis'in ilk P2 kullanımında bir kez yeniden "Google ile bağlan" akışından geçmesi gerekir (yeni izni onaylamak için) — sonrası mevcut sessiz-yenileme mekanizmasıyla aynı şekilde çalışır.

### 3.2 `DriveSource.save()`

```ts
async save(name: (typeof NAMES)[number], data: unknown): Promise<void> {
  const folderId = this.folderId ?? readStoredFolder()
  if (!folderId || !this.token) throw new NeedsAuthError()
  const headers = { Authorization: `Bearer ${this.token}` }

  let file = this.fileIds[name]
  if (!file) {
    const q = `'${folderId}' in parents and trashed = false and name = '${name}.json'`
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,md5Checksum)`, { headers })
    const { files } = await res.json()
    file = files[0]
  }

  if (!file) {
    // Dosya yok (yalnızca assetTransfers.json için beklenen durum) — oluştur.
    const meta = { name: `${name}.json`, parents: [folderId] }
    // multipartCreate: standart Drive v3 multipart/related upload helper —
    // metadata + JSON içerik parçalarını tek istekte gönderir, {id, md5Checksum} döner.
    const created = await multipartCreate(meta, data, headers)
    this.fileIds[name] = { id: created.id, md5Checksum: created.md5Checksum }
    return
  }

  // İyimser eşzamanlılık: dosya son okunduğumuzdan beri değişti mi?
  const current = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?fields=md5Checksum`, { headers }).then((r) => r.json())
  if (current.md5Checksum !== this.fileIds[name]?.md5Checksum) {
    throw new ConflictError(name)   // çağıran taraf: veriyi tazele, yeni kaydı tekrar uygula, bir kez daha dene
  }

  const updated = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`, {
    method: 'PATCH', headers, body: JSON.stringify(data),
  }).then((r) => r.json())
  this.fileIds[name] = { id: file.id, md5Checksum: updated.md5Checksum }
}
```

`ConflictError` fırlatıldığında, çağıran katman (yeni bir `store.ts` fonksiyonu, `appendRecord()`) otomatik olarak: (1) `load()` ile veriyi tazeler, (2) kullanıcının girdiği yeni kaydı taze veri üzerine tekrar ekler, (3) `save()`'i bir kez daha dener. İkinci deneme de çakışırsa, kullanıcıya "veri değişmiş, lütfen tekrar deneyin" hatası gösterilir (otomatik döngüye girilmez).

### 3.3 Kayıt ID üretimi

`crypto.getRandomValues` ile 8 byte rastgele değer, hex'e çevrilip önek eklenir: işlemler `t_`, nakit hareketleri `c_`, varlık transferleri `at_` — mevcut migration ID biçimiyle aynı şekil, çakışma riski ihmal edilebilir düzeyde.

### 3.4 Yazma akışı

Her "Kaydet" ayrı, anlık bir işlemdir (biriktirme/toplu gönderme yok). Başarısız olursa (ağ hatası, çakışma sonrası ikinci deneme de başarısız), form verisi ekranda kalır, kullanıcıya hata mesajı ve "tekrar dene" butonu gösterilir — hiçbir veri sessizce kaybolmaz.

## Bölüm 4 — Giriş Arayüzü

Yeni 8. sekme: **"Ekle"** (`#/ekle`, `EkleKaydi.svelte`). Router (`router.ts`) ve `App.svelte`'nin `pages` haritası P1.6'daki aynı desenle genişletilir.

Sayfa açıldığında 4 seçenek sunulur (İşlem / Nakit Hareketi / Varlık Transferi / Kurum Ekle); seçime göre ilgili form gösterilir. Her form:
1. Alanları doldurur (dropdown'lar `instruments.json`/`brokers.json`/`portfolios.json`'dan gelir — serbest metin girişi yok, hata riskini azaltır).
2. "İncele" butonuna basınca girilen bilgilerin bir özeti gösterilir (hesaplanan `net_usd`/`tutar_usd` dahil).
3. "Onayla ve Kaydet" ile Drive'a yazılır; başarılı olursa özet ekranı kapanır, kullanıcıya yeşil bir onay mesajı gösterilir ve form sıfırlanır (yeni bir kayıt daha girilebilir).

## Bölüm 5 — Doğrulama Kuralları

- Tüm zorunlu alanlar dolu olmalı; sayısal alanlar (lot, fiyat, tutar) pozitif olmalı.
- Enstrüman/kurum/portföy seçimleri yalnızca mevcut listelerden yapılabilir (serbest metin yok).
- **SAT işleminde**: satılan lot, o an o enstrümanda açık olan toplam lottan fazla olamaz (`derivePositions` ile mevcut açık pozisyon kontrol edilir).
- **Varlık transferinde**: transfer edilen lot, kaynak hesap+portföyde o an açık olan pozisyondan fazla olamaz; `kaynakHesap !== hedefHesap` VEYA `kaynakPortfoy !== hedefPortfoy` olmalı (en az biri değişmeli, yoksa transfer anlamsız).
- **Para transferinde**: `hesap !== hedefHesap` zorunlu.
- Tarih alanı gelecekte olamaz.

## Bölüm 6 — Test Stratejisi

Mevcut P1.6 deseniyle aynı: her yeni saf modül (`cashBalances.ts`, `cashmoves.ts`'ye eklenen `transfers()`, `breakdowns.ts`'nin `attributionEvents` güncellemesi) TDD ile, sabit fixture veri üzerinden test edilir. `DriveSource.save()`/`ConflictError` akışı, `fetch`'in mock'landığı birim testleriyle (başarılı yazma, 404→oluşturma, çakışma→otomatik tekrar deneme, ikinci çakışma→hata) doğrulanır. Form bileşenleri `@testing-library/svelte` ile: geçerli girişte kaydetme çağrısının doğru payload'la yapıldığı, geçersiz girişte doğrulama hatası gösterildiği test edilir — gerçek bir Drive çağrısı asla teste girmez (mock edilir).

## Kapsam Dışı — Notlar

Düzenleme/silme, bir sonraki doğal faz. O faz için önceden düşünülmesi gereken ek karmaşıklık: bir kaydı silmek, ona bağlı `attributionEvents`/pozisyon hesaplarını yeniden tetiklemeli; bir işlemi düzenlemek, önceden kapanmış bir pozisyonun gerçekleşmiş kâr/zararını değiştirebilir. Bu spec'in kapsamına girmiyor, sadece gelecekteki tasarımın bu riski merkeze alması gerektiğini not ediyoruz.
