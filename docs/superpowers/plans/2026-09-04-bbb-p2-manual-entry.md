# P2 — Manuel Kayıt Girişi + Drive Yazma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enis'in BBB Tracker üzerinden yeni işlem (AL/SAT), nakit hareketi (yatırma/çekme/temettü), kurumlar/portföyler arası para ve varlık transferi, ve yeni kurum kaydını doğrudan uygulamadan girip Google Drive'daki veri dosyalarına yazabilmesi.

**Architecture:** Üç katman: (1) saf TS derivation modülleri (kurum bazlı nakit bakiyesi, transfer listeleri, attribution güncellemesi) — hiçbir I/O yok, tamamen test edilebilir; (2) `DriveSource`'a eklenen `save()` + iyimser eşzamanlılık kontrolü + `store.ts`'de `appendRecord()` orkestrasyon katmanı; (3) yeni "Ekle" sekmesi altında 4 form bileşeni (İşlem, Nakit Hareketi, Varlık Transferi, Kurum). Her form: doldur → özet göster → onayla → kaydet.

**Tech Stack:** Svelte 5 (runes), TypeScript strict/`verbatimModuleSyntax`, Vitest + `@testing-library/svelte`, Google Drive REST v3 (fetch, mock'lanmış).

**Spec:** docs/superpowers/specs/2026-09-04-bbb-p2-manual-entry-design.md

## Global Constraints

- **Ruling P1-9** (load-bearing): `app/svelte.config.js` asla değiştirilmez — `vitePreprocess({ style: false })` kalır.
- **Ruling P1-10** (load-bearing): Yeni sayfa/bileşenler `derived` değil `view` prop adını kullanır, `$derived`/`$derived.by` serbestçe kullanılabilir.
- `verbatimModuleSyntax` açık — tüm sadece-tip importlar `import type { ... }`.
- Kullanıcıya gösterilen her tutar `money()` üzerinden — `usd()`/`tryFmt()` doğrudan çağrılmaz.
- Finansal veri (`data/*.json`) repo'ya veya `dist/`'e asla girmez.
- **Ruling P2-1** (load-bearing): Her yeni kayıt `kaynak: 'manual'` taşır. Kurum bazlı nakit bakiyesi hesaplaması bu alanla migration-sonrası hareketleri ayırt eder — asla tarih kesim noktası kullanılmaz.
- **Ruling P2-2** (load-bearing): Varlık transferleri `derive.ts`'nin maliyet-lot mantığına asla girmez — ayrı dosya (`assetTransfers.json`), ayrı tip.
- **Ruling P2-3** (load-bearing, plan-level netleştirme): Pozisyonlar (`OpenPosition`) kod bazında GLOBAL tutulur, hesap/portföy bazında değil (bkz. `derive.ts:3`). Bu yüzden SAT ve varlık-transferi doğrulamaları "bu kod için toplam açık lot" ile karşılaştırır — belirli bir hesaptaki lotu ayrı ayrı izleyen bir veri yoktur. Varlık transferinde ayrıca "seçilen kaynak hesap, bu enstrümanın şu an gerçekten atfedildiği hesapla eşleşiyor mu" kontrolü `holdingsByBroker`'ın attribution mantığı üzerinden yapılır.
- **Ruling P2-4** (load-bearing): `NAMES` (`source.ts`) 8 dosyalık haliyle DEĞİŞMEZ — `assetTransfers.json` ayrı, "yoksa `[]`" toleranslı bir yükleme yoluyla eklenir (Task 5). Bu, mevcut `NAMES`'e bağımlı hiçbir kodu bozmaz.

---

### Task 1: Veri modeli tipleri

**Files:**
- Modify: `app/src/lib/data/types.ts`
- Test: `app/src/lib/data/types.test.ts` (yeni — bu dosya yoksa oluştur)

**Interfaces:**
- Produces: `Cashflow.tur` artık `'YATIRMA' | 'CEKME' | 'TEMETTU' | 'TRANSFER'`; `Cashflow.hedefHesap?: string`; yeni `AssetTransfer` arayüzü; `Dataset.assetTransfers: AssetTransfer[]`.

- [ ] **Step 1: Mevcut `Cashflow` arayüzünü güncelle**

`app/src/lib/data/types.ts` içindeki `Cashflow` arayüzünü bul (`export interface Cashflow { ... }`) ve şu iki değişikliği yap:

```ts
export interface Cashflow {
  id: string
  tarih: string
  hesap: string
  portfoy: string | null
  tur: 'YATIRMA' | 'CEKME' | 'TEMETTU' | 'TRANSFER'
  enstruman: string | null
  tutar_tl: number | null
  tutar_usd: number
  kur: number | null
  aciklama: string
  kaynak: string
  hedefHesap?: string
}
```

- [ ] **Step 2: `AssetTransfer` arayüzünü ekle**

`Cashflow` arayüzünün hemen altına ekle:

```ts
export interface AssetTransfer {
  id: string
  tarih: string
  enstruman: string
  lot: number
  kaynakHesap: string
  hedefHesap: string
  kaynakPortfoy: string | null
  hedefPortfoy: string | null
  aciklama: string
  kaynak: string
}
```

- [ ] **Step 3: `Dataset` arayüzünü güncelle**

`Dataset` arayüzünü bul (dosyanın sonuna yakın, 8 alanı listeleyen interface) ve `assetTransfers: AssetTransfer[]` alanını ekle. Örnek (gerçek alan sırası dosyadaki ile aynı kalmalı, sadece yeni alan eklenir):

```ts
export interface Dataset {
  transactions: Transaction[]
  cashflows: Cashflow[]
  snapshots: Snapshot[]
  instruments: Instrument[]
  brokers: Broker[]
  portfolios: Portfolio[]
  meta: Meta
  fxrates: Record<string, number>
  assetTransfers: AssetTransfer[]
}
```

(Gerçek dosyadaki mevcut alan isimlerini/tiplerini birebir koru — sadece `assetTransfers` alanını ekle, diğerlerini değiştirme.)

- [ ] **Step 4: Derleme kontrolü**

Run: `cd app && npm run check`
Expected: `Dataset` tipini kullanan her yer (fixture, `local.ts`, `drive.ts`) artık `assetTransfers` alanı eksik olduğu için TypeScript hatası verecek — bu BEKLENEN bir durumdur, Task 5'te düzeltilecek. Bu adımda sadece `types.ts`'in kendisinin sözdizimsel olarak doğru olduğunu (yeni tipin tanımlandığını) doğrula; tam `npm run check` şu an kırmızı kalabilir, ilerleyen tasklarda yeşile döner. Bu tek dosyalık task için ayrı bir test dosyası YAZMA — tipler çalışma zamanında test edilemez, kullanıldıkları yerlerde (Task 2-4) dolaylı olarak doğrulanırlar.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/data/types.ts
git commit -m "feat(app): P2 veri modeli — Cashflow.TRANSFER + AssetTransfer tipi"
```

---

### Task 2: `cashBalances.ts` — kurum bazlı canlı nakit bakiyesi

**Files:**
- Create: `app/src/lib/data/cashBalances.ts`, `app/src/lib/data/cashBalances.test.ts`

**Interfaces:**
- Consumes: `Dataset` (Task 1'in `Cashflow`/`AssetTransfer` değişiklikleriyle).
- Produces: `cashBalanceByHesap(ds: Dataset): Record<string, number>`.

- [ ] **Step 1: Yazılacak testler**

```ts
import { describe, it, expect } from 'vitest'
import { cashBalanceByHesap } from './cashBalances'
import type { Dataset, Transaction, Cashflow } from './types'

const baseMeta = { semaVersiyonu: 1, olusturulma: '2026-01-01', kaynak: 'x', nakitHesapBazli: { MIDAS: 1000, GARAN: 500 }, p0Sinirlari: [] }
const tx = (o: Partial<Transaction>): Transaction => ({
  id: 't', tarih: '2026-02-01', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'X', yon: 'AL',
  lot: 1, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 1, kur: null, komisyon_usd: 0,
  brut_usd: 1, net_usd: 1, not: '', kaynak: 'manual', olusturulma: null, ...o,
})
const cf = (o: Partial<Cashflow>): Cashflow => ({
  id: 'c', tarih: '2026-02-01', hesap: 'MIDAS', portfoy: null, tur: 'YATIRMA',
  enstruman: null, tutar_tl: null, tutar_usd: 0, kur: null, aciklama: '', kaynak: 'manual', ...o,
})
const ds = (over: Partial<Dataset>): Dataset => ({
  transactions: [], cashflows: [], snapshots: [], instruments: [], brokers: [], portfolios: [],
  meta: baseMeta, fxrates: {}, assetTransfers: [], ...over,
})

describe('cashBalanceByHesap', () => {
  it('starts from meta.nakitHesapBazli and ignores migration-sourced rows', () => {
    const bal = cashBalanceByHesap(ds({
      transactions: [tx({ kaynak: 'migration', net_usd: 999 })],
      cashflows: [cf({ kaynak: 'migration', tutar_usd: 999 })],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000, 6)
  })

  it('AL azaltır, SAT artırır — sadece manual kayıtlar', () => {
    const bal = cashBalanceByHesap(ds({
      transactions: [
        tx({ yon: 'AL', hesap: 'MIDAS', net_usd: 200, kaynak: 'manual' }),
        tx({ yon: 'SAT', hesap: 'MIDAS', net_usd: 50, kaynak: 'manual' }),
      ],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000 - 200 + 50, 6)
  })

  it('YATIRMA/TEMETTU artırır, CEKME azaltır', () => {
    const bal = cashBalanceByHesap(ds({
      cashflows: [
        cf({ tur: 'YATIRMA', hesap: 'GARAN', tutar_usd: 300 }),
        cf({ tur: 'CEKME', hesap: 'GARAN', tutar_usd: 100 }),
        cf({ tur: 'TEMETTU', hesap: 'GARAN', tutar_usd: 20 }),
      ],
    }))
    expect(bal.GARAN).toBeCloseTo(500 + 300 - 100 + 20, 6)
  })

  it('TRANSFER kaynaktan düşer, hedefe eklenir', () => {
    const bal = cashBalanceByHesap(ds({
      cashflows: [cf({ tur: 'TRANSFER', hesap: 'MIDAS', hedefHesap: 'GARAN', tutar_usd: 400 })],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000 - 400, 6)
    expect(bal.GARAN).toBeCloseTo(500 + 400, 6)
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- cashBalances`
Expected: FAIL — `./cashBalances` çözülemiyor.

- [ ] **Step 3: `app/src/lib/data/cashBalances.ts` yaz**

```ts
import type { Dataset } from './types'

export function cashBalanceByHesap(ds: Dataset): Record<string, number> {
  const bal: Record<string, number> = { ...ds.meta.nakitHesapBazli }
  const bump = (hesap: string, delta: number) => {
    bal[hesap] = (bal[hesap] ?? 0) + delta
  }

  for (const t of ds.transactions) {
    if (t.kaynak === 'migration') continue
    bump(t.hesap, t.yon === 'AL' ? -t.net_usd : t.net_usd)
  }
  for (const c of ds.cashflows) {
    if (c.kaynak === 'migration') continue
    if (c.tur === 'YATIRMA' || c.tur === 'TEMETTU') bump(c.hesap, c.tutar_usd)
    else if (c.tur === 'CEKME') bump(c.hesap, -c.tutar_usd)
    else if (c.tur === 'TRANSFER' && c.hedefHesap) {
      bump(c.hesap, -c.tutar_usd)
      bump(c.hedefHesap, c.tutar_usd)
    }
  }
  return bal
}
```

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- cashBalances`
Expected: PASS (4 test).

- [ ] **Step 5: Full check + commit**

Run: `cd app && npm run check` → bu dosya için hata olmamalı (Task 1'in `assetTransfers` eksikliğinden kalan diğer dosyalardaki hatalar bu task'ın sorumluluğu değil).

```bash
git add app/src/lib/data/cashBalances.ts app/src/lib/data/cashBalances.test.ts
git commit -m "feat(app): cashBalances.ts — kurum bazlı canlı nakit bakiyesi"
```

---

### Task 3: `cashmoves.ts` — `transfers()` fonksiyonu

**Files:**
- Modify: `app/src/lib/data/cashmoves.ts`
- Modify: `app/src/lib/data/cashmoves.test.ts`

**Interfaces:**
- Produces: `interface TransferMoveRow { tarih: string; kaynakHesap: string; hedefHesap: string; tutarUsd: number; aciklama: string }`; `transfers(cashflows: Cashflow[]): TransferMoveRow[]` — `tur === 'TRANSFER'` olan kayıtlar, `tarih` azalan sırada.

- [ ] **Step 1: Mevcut `cashmoves.test.ts`'e yeni `describe` bloğu ekle**

Dosyanın sonuna (mevcut `describe('dividends', ...)` bloğundan sonra) ekle:

```ts
describe('transfers', () => {
  it('lists TRANSFER cashflows only, newest first', () => {
    const r = transfers([
      cf({ tur: 'TRANSFER', hesap: 'MIDAS', hedefHesap: 'GARAN', tutar_usd: 100, tarih: '2026-01-01' }),
      cf({ tur: 'TRANSFER', hesap: 'GARAN', hedefHesap: 'MIDAS', tutar_usd: 50, tarih: '2026-03-01' }),
      cf({ tur: 'YATIRMA', tutar_usd: 999 }),
    ])
    expect(r).toHaveLength(2)
    expect(r[0].tarih).toBe('2026-03-01')
    expect(r[0]).toMatchObject({ kaynakHesap: 'GARAN', hedefHesap: 'MIDAS', tutarUsd: 50 })
  })
})
```

Bu blok, dosyanın en üstündeki `import { bankTransfers, moneyMarketMoves, dividends } from './cashmoves'` satırına `transfers` eklenmesini gerektirir — güncelle: `import { bankTransfers, moneyMarketMoves, dividends, transfers } from './cashmoves'`.

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- cashmoves`
Expected: FAIL — `transfers` export edilmiyor.

- [ ] **Step 3: `app/src/lib/data/cashmoves.ts`'e ekle**

Dosyanın sonuna (mevcut `dividends` fonksiyonundan sonra) ekle:

```ts
export interface TransferMoveRow {
  tarih: string
  kaynakHesap: string
  hedefHesap: string
  tutarUsd: number
  aciklama: string
}

export function transfers(cashflows: Cashflow[]): TransferMoveRow[] {
  return byDateDesc(cashflows.filter((c) => c.tur === 'TRANSFER' && c.hedefHesap)).map((c) => ({
    tarih: c.tarih,
    kaynakHesap: c.hesap,
    hedefHesap: c.hedefHesap as string,
    tutarUsd: c.tutar_usd,
    aciklama: c.aciklama,
  }))
}
```

(`byDateDesc` bu dosyada zaten tanımlı — mevcut yardımcı fonksiyonu yeniden kullan, tekrar tanımlama.)

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- cashmoves`
Expected: PASS (mevcut testler + 1 yeni).

- [ ] **Step 5: Full check + commit**

Run: `cd app && npm run check`.

```bash
git add app/src/lib/data/cashmoves.ts app/src/lib/data/cashmoves.test.ts
git commit -m "feat(app): cashmoves.ts — kurumlar arası para transferi listesi"
```

---

### Task 4: `breakdowns.ts` — varlık transferlerini attribution'a dahil et

**Files:**
- Modify: `app/src/lib/data/breakdowns.ts`
- Modify: `app/src/lib/data/breakdowns.test.ts`

**Interfaces:**
- Consumes: `AssetTransfer` (Task 1).
- Produces: `holdingsByPortfolio(open, txns, instruments, transfers, p)`, `holdingsByBroker(open, txns, instruments, brokers, transfers, p)` — **imza değişti**: her ikisi de artık `transfers: AssetTransfer[]` parametresini `instruments`'tan SONRA, `brokers`/`p`'den ÖNCE alır. Bu, Task 6'da `store.ts`'nin bu fonksiyonları çağırdığı yer güncellenmeli; Task 11/12'de sayfaların (`Portfoyler.svelte`/`Kurumlar.svelte`) çağrıları da güncellenmeli — bu plan bu güncellemeleri ilgili tasklarda ayrıca belirtir.

- [ ] **Step 1: Mevcut `breakdowns.test.ts`'e yeni testler ekle**

Dosyanın importlarına `AssetTransfer` ekle: `import type { OpenPosition } from './derive'` satırının yanına `import type { AssetTransfer } from './types'` ekle (zaten `Transaction, Instrument, Broker` için `import type { Transaction, Instrument, Broker } from './types'` varsa, `AssetTransfer`'ı aynı satıra ekle: `import type { Transaction, Instrument, Broker, AssetTransfer } from './types'`).

Mevcut `holdingsByPortfolio`/`holdingsByBroker` çağıran HER test çağrısına, `instruments` parametresinden hemen sonra boş bir dizi (`[]`) ekleyerek güncelle (örnek: `holdingsByPortfolio(open, txns, instruments, p)` → `holdingsByPortfolio(open, txns, instruments, [], p)`; `holdingsByBroker(open, txns, instruments, brokers, p)` → `holdingsByBroker(open, txns, instruments, [], brokers, p)`). Bu, mevcut testlerin (transfersiz senaryo) hâlâ doğru çalıştığını garanti eder.

Dosyanın sonuna yeni bir `describe` bloğu ekle:

```ts
describe('holdingsByPortfolio — asset transfers', () => {
  it('a later transfer re-attributes the holding to the new portfolio', () => {
    const open: OpenPosition[] = [{ kod: 'THYAO', lot: 10, ortMaliyetUsd: 5, toplamMaliyetUsd: 50 }]
    const txns: Transaction[] = [
      {
        id: 't1', tarih: '2026-01-01', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL',
        lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 5, kur: null, komisyon_usd: 0,
        brut_usd: 50, net_usd: 50, not: '', kaynak: 'manual', olusturulma: null,
      },
    ]
    const transfers: AssetTransfer[] = [
      {
        id: 'at1', tarih: '2026-02-01', enstruman: 'THYAO', lot: 10,
        kaynakHesap: 'MIDAS', hedefHesap: 'MIDAS', kaynakPortfoy: 'ENIS', hedefPortfoy: 'ALFA',
        aciklama: '', kaynak: 'manual',
      },
    ]
    const groups = holdingsByPortfolio(open, txns, [], transfers, { bySymbol: {}, usdPerGram: null })
    const alfa = groups.find((g) => g.key === 'ALFA')
    const enis = groups.find((g) => g.key === 'ENIS')
    expect(alfa?.rows.map((r) => r.kod)).toEqual(['THYAO'])
    expect(enis?.rows ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- breakdowns`
Expected: FAIL — fonksiyon imzası uyuşmuyor / yeni test THYAO'yu hâlâ ENIS altında buluyor.

- [ ] **Step 3: `app/src/lib/data/breakdowns.ts`'i güncelle**

`latestFieldByKod` fonksiyonunun hemen üstüne (veya yerine) şunu ekle:

```ts
interface AttrEvent {
  kod: string
  tarih: string
  id: string
  hesap: string
  portfoy: string
}

function attributionEvents(txns: Transaction[], transfers: AssetTransfer[]): AttrEvent[] {
  return [
    ...txns.map((t) => ({ kod: t.enstruman, tarih: t.tarih, id: t.id, hesap: t.hesap, portfoy: t.portfoy })),
    ...transfers.map((tr) => ({
      kod: tr.enstruman,
      tarih: tr.tarih,
      id: tr.id,
      hesap: tr.hedefHesap,
      portfoy: tr.hedefPortfoy ?? '',
    })),
  ]
}
```

`latestFieldByKod`'un mevcut gövdesini değiştir — artık `Transaction[]` yerine `AttrEvent[]` alır:

```ts
function latestFieldByKod<K extends 'portfoy' | 'hesap'>(
  events: AttrEvent[],
  field: K,
): Map<string, string> {
  const latest = new Map<string, AttrEvent>()
  for (const e of events) {
    const prev = latest.get(e.kod)
    if (!prev || e.tarih > prev.tarih || (e.tarih === prev.tarih && e.id > prev.id)) {
      latest.set(e.kod, e)
    }
  }
  const out = new Map<string, string>()
  for (const [kod, e] of latest) out.set(kod, e[field])
  return out
}
```

`holdingsByPortfolio` ve `holdingsByBroker` fonksiyonlarının imzalarını ve gövdelerini güncelle — `transfers: AssetTransfer[]` parametresi eklenir, `latestFieldByKod` çağrıları `attributionEvents(txns, transfers)` üzerinden yapılır:

```ts
export function holdingsByPortfolio(
  open: OpenPosition[],
  txns: Transaction[],
  instruments: Instrument[],
  transfers: AssetTransfer[],
  p: PriceLookup,
): HoldingGroup[] {
  const byKod = latestFieldByKod(attributionEvents(txns, transfers), 'portfoy')
  // ... geri kalan gövde AYNI KALIR (grup anahtarı olarak byKod.get(pos.kod) kullanılmaya devam eder) ...
}

export function holdingsByBroker(
  open: OpenPosition[],
  txns: Transaction[],
  instruments: Instrument[],
  brokers: Broker[],
  transfers: AssetTransfer[],
  p: PriceLookup,
): HoldingGroup[] {
  const byKod = latestFieldByKod(attributionEvents(txns, transfers), 'hesap')
  // ... geri kalan gövde AYNI KALIR ...
}
```

**Dikkat:** `holdingsByBroker`'da parametre sırası `instruments, brokers, transfers, p` (brokers transfers'tan ÖNCE) — `holdingsByPortfolio`'da ise `instruments, transfers, p` (brokers yok). Bu asimetri mevcut fonksiyonların zaten farklı imzalara sahip olmasından geliyor (biri brokers alır, diğeri almaz); yeni `transfers` parametresi her ikisinde de `instruments`'tan hemen sonra eklenir. `Transaction`/`Instrument`/`Broker` importuna `AssetTransfer` da eklenmeli: `import type { Transaction, Instrument, Broker, AssetTransfer } from './types'`.

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- breakdowns`
Expected: PASS (mevcut testler + 1 yeni).

- [ ] **Step 5: Full check + commit**

Run: `cd app && npm run check`.

```bash
git add app/src/lib/data/breakdowns.ts app/src/lib/data/breakdowns.test.ts
git commit -m "feat(app): breakdowns.ts — varlık transferleri attribution'a dahil"
```

---

### Task 5: Drive/local kaynaklarında `assetTransfers.json` (toleranslı yükleme)

**Files:**
- Modify: `app/src/lib/data/local.ts`, `app/src/lib/data/drive.ts`
- Modify: `app/src/lib/data/local.test.ts`, `app/src/lib/data/drive.test.ts` (bu dosyalar zaten mevcut — yoksa dosya adlarını `ls app/src/lib/data/*.test.ts` ile kontrol et ve uygun test dosyasına ekle)
- Modify: `app/src/fixtures/dataset.ts` — `fixture` sabitine `assetTransfers: []` alanı eklenir (Task 1'in `Dataset` tipini tamamlar).

**Interfaces:**
- Produces: Her iki `DataSource` implementasyonu da artık döndürdükleri `Dataset`'e `assetTransfers: AssetTransfer[]` alanını doldurur — dosya yoksa `[]`.

- [ ] **Step 1: `app/src/fixtures/dataset.ts`'i güncelle**

Dosyayı aç, `fixture` (veya benzeri isimli) sabitin içine, mevcut 8 alanın yanına `assetTransfers: []` ekle. Bu, Task 1'den beri kırmızı olan `npm run check`'i bu dosya için düzeltir.

- [ ] **Step 2: `local.ts` ve `drive.ts` için önce mevcut testleri çalıştır — hangi testlerin kırıldığını gör**

Run: `cd app && npm test -- local drive`
Expected: `Dataset` tipi eksik `assetTransfers` alanı nedeniyle tip hataları (test dosyalarında elle oluşturulan fixture'lar varsa onlar da güncellenmeli — her bir test dosyasını aç, `Dataset` şeklinde elle obje oluşturan yerlere `assetTransfers: []` ekle).

- [ ] **Step 3: `LocalFileSource.load()`'u güncelle**

`app/src/lib/data/local.ts`'nin mevcut `load()` gövdesini şuna çevir:

```ts
async load(): Promise<Dataset> {
  const parts = await Promise.all(
    NAMES.map(async (name) => {
      const res = await fetch(`${this.base}/${name}.json`)
      if (!res.ok) throw new Error(`data/${name}.json okunamadı (${res.status})`)
      return [name, await res.json()] as const
    }),
  )
  const dataset = Object.fromEntries(parts) as unknown as Dataset
  const atRes = await fetch(`${this.base}/assetTransfers.json`)
  dataset.assetTransfers = atRes.ok ? await atRes.json() : []
  return dataset
}
```

- [ ] **Step 4: `DriveSource.load()`'u güncelle**

`app/src/lib/data/drive.ts`'nin `load()` metodunun sonundaki `return Object.fromEntries(parts) as unknown as Dataset` satırını şuna çevir:

```ts
    const dataset = Object.fromEntries(parts) as unknown as Dataset
    const atFile = files.find((f) => f.name === 'assetTransfers.json')
    dataset.assetTransfers = atFile
      ? await fetch(`https://www.googleapis.com/drive/v3/files/${atFile.id}?alt=media`, { headers }).then((r) =>
          r.json(),
        )
      : []
    return dataset
```

(`files` değişkeni zaten aynı fonksiyonun başında `const { files } = ...` ile tanımlı — yeniden kullan.)

- [ ] **Step 5: Yeni testler ekle**

`local.test.ts`'e (veya karşılığına) ekle — `fetch`'in mock'landığı mevcut test deseniyle aynı şekilde, ek olarak `assetTransfers.json` için 404 dönen bir mock ile `dataset.assetTransfers` alanının `[]` olduğunu doğrulayan bir test. `drive.test.ts`'e de aynı mantıkla: dosya listesinde `assetTransfers.json` YOKSA `dataset.assetTransfers` `[]` olmalı; listede VARSA gerçek içerik dönmeli. (Mevcut dosyalardaki `fetch` mock kurulum desenini birebir takip et — her iki dosyada da zaten `vi.stubGlobal('fetch', ...)` veya benzeri bir mekanizma var, aynısını kullan.)

- [ ] **Step 6: Testleri çalıştır — PASS beklenir, full check**

Run: `cd app && npm test && npm run check`
Expected: Tüm testler yeşil, `npm run check` 0/0 (Task 1'den beri kırmızı kalan `assetTransfers` eksikliği artık tamamen giderilmiş olmalı).

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/data/local.ts app/src/lib/data/drive.ts app/src/lib/data/local.test.ts app/src/lib/data/drive.test.ts app/src/fixtures/dataset.ts
git commit -m "feat(app): assetTransfers.json toleranslı yükleme (yoksa boş dizi)"
```

---

### Task 6: `store.ts` wiring — `cashBalances`/`transfers`'ı `deriveAll`'a bağla; Kurumlar/Banka sayfalarını güncelle

**Files:**
- Modify: `app/src/lib/data/store.ts`, `app/src/lib/data/store.test.ts`
- Modify: `app/src/routes/Kurumlar.svelte`, `app/src/routes/Kurumlar.test.ts`
- Modify: `app/src/routes/Banka.svelte`, `app/src/routes/Banka.test.ts`
- Modify: `app/src/routes/Portfoyler.svelte` — `holdingsByPortfolio` çağrısı Task 4'ün yeni imzasına uyacak şekilde güncellenir.

**Interfaces:**
- Consumes: `cashBalanceByHesap` (Task 2), `transfers` (Task 3), yeni `holdingsByPortfolio`/`holdingsByBroker` imzaları (Task 4).
- Produces: `DerivedBundle` iki yeni alan kazanır: `cashByHesap: Record<string, number>`, `assetTransferMoves: TransferMoveRow[]`.

- [ ] **Step 1: `store.test.ts`'e başarısız assertion ekle**

Mevcut `describe('deriveAll — P1.6 blocks', ...)` bloğunun yanına (veya içine) ekle:

```ts
it('carries cashByHesap and assetTransferMoves', () => {
  const d = deriveAll(fixture)
  expect(d.cashByHesap).toBeDefined()
  expect(d.assetTransferMoves).toEqual([])
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- store`
Expected: FAIL — `d.cashByHesap` undefined.

- [ ] **Step 3: `store.ts`'i güncelle**

İmportlara ekle:
```ts
import { cashBalanceByHesap } from './cashBalances'
import { bankTransfers, moneyMarketMoves, dividends, transfers } from './cashmoves'
```
(`transfers` zaten var olan `bankTransfers, moneyMarketMoves, dividends` importuna eklenir — ayrı bir import satırı açma.)

`deriveAll`'ın döndürdüğü objeye iki alan ekle:

```ts
    dashboard: dashboardTotals(ds, positions, null),
    monthPerf: thisMonthPerf(ds.snapshots),
    transfers: bankTransfers(ds.cashflows),
    mmMoves: moneyMarketMoves(ds.transactions, ds.instruments),
    divs: dividends(ds.cashflows, ds.transactions),
    cashByHesap: cashBalanceByHesap(ds),
    assetTransferMoves: transfers(ds.cashflows),
```

**Dikkat — isim çakışması:** `cashmoves.ts`'den import edilen `transfers` fonksiyonu ile `deriveAll`'ın zaten var olan `transfers: bankTransfers(ds.cashflows)` alan adı ÇAKIŞIR (ikisi de `transfers` kelimesini kullanıyor, biri fonksiyon importu, diğeri obje alan adı — TypeScript bunu obje literal içinde sorunsuz ayırt eder çünkü biri sol taraftaki alan adı, diğeri sağ taraftaki değer, ama okunabilirlik için import'u yeniden adlandır: `import { transfers as assetTransferMoves } from './cashmoves'` yaparak çağrıyı `assetTransferMoves: assetTransferMoves(ds.cashflows)` şekline getir — daha net.

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- store`
Expected: PASS.

- [ ] **Step 5: `Kurumlar.svelte`'i güncelle — Nakit satırı + `holdingsByBroker` çağrısı**

`Kurumlar.svelte`'in `groups` derivation'ındaki `holdingsByBroker(...)` çağrısını Task 4'ün yeni imzasına göre güncelle:

```ts
  const groups = $derived.by<HoldingGroup[]>(() => {
    if (!dataset || !view) return []
    void prices.status
    return holdingsByBroker(
      view.positions.open,
      dataset.transactions,
      dataset.instruments,
      dataset.brokers,
      dataset.assetTransfers,
      { bySymbol: prices.bySymbol, usdPerGram: prices.usdPerGram },
    )
  })
```

(Dikkat: `brokers` parametresi `transfers`'tan ÖNCE gelir — Task 4'te belirtilen `holdingsByBroker(open, txns, instruments, brokers, transfers, p)` sırası.)

Her kurum panelinin `SectionHeader`'ına nakit bilgisini ekle — mevcut `<SectionHeader title={g.key} note={g.sahip} />` satırını bul ve `note`'a nakit bilgisini de ekle:

```svelte
        <SectionHeader
          title={g.key}
          note={`${g.sahip} · Nakit: ${money(view.cashByHesap[findBrokerKod(g.key, dataset.brokers)] ?? 0)}`}
        />
```

Bunun için küçük bir yardımcı fonksiyon ekle (script bloğunun üstüne, `groups` derivation'ından önce):

```ts
  function findBrokerKod(ad: string, brokers: typeof dataset.brokers extends (infer T)[] ? T[] : never): string {
    return brokers.find((b) => b.ad === ad)?.kod ?? ad
  }
```

(`g.key` `holdingsByBroker`'da broker'ın `ad` alanı olarak set ediliyor — `cashByHesap` ise `kod` bazında anahtarlanıyor, bu yüzden `ad`'dan `kod`'a bu küçük ters-arama gerekiyor.)

- [ ] **Step 6: `Kurumlar.test.ts`'e nakit satırı testi ekle**

Mevcut test dosyasına, mevcut `it(...)` bloğunun içine veya yeni bir `it` olarak ekle:

```ts
it('shows a cash balance for each broker', async () => {
  const d = await v()
  const { container } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
  expect(container.textContent).toContain('Nakit')
})
```

- [ ] **Step 7: `Banka.svelte`'e Transferler bölümü ekle**

`Banka.svelte`'nin script bloğuna `transfers` prop erişimi ve kolon tanımı ekle:

```ts
  const transferCols = [
    { key: 'tarih', label: 'Tarih', sortable: true, fmt: (v: string) => dateShort(v) },
    { key: 'kaynakHesap', label: 'Kaynak' },
    { key: 'hedefHesap', label: 'Hedef' },
    { key: 'tutarUsd', label: 'Tutar', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'aciklama', label: 'Açıklama' },
  ]
```

Template'e, mevcut para piyasası bölümünden sonra ekle:

```svelte
    <SectionHeader title="Transferler" note={`${view.assetTransferMoves.length} kayıt`} />
    <DataTable columns={transferCols} rows={view.assetTransferMoves} initialSort={{ key: 'tarih', dir: 'desc' }} />
```

**Not:** `view.assetTransferMoves` burada kurumlar arası PARA transferlerini (Task 3'ün `transfers()` fonksiyonundan gelen `TransferMoveRow[]`) ifade eder — Task 6'nın `deriveAll` alan adı olarak `assetTransferMoves` seçilmiş olsa da içeriği para transferidir, varlık transferi değil (isimlendirme `cashmoves.ts`'deki `transfers()` fonksiyonundan geldiği için böyle; karışıklığı önlemek adına Step 3'teki alan adını gözden geçir — burada tutarlılık için alan adını `moneyTransfers` yap, `assetTransferMoves` DEĞİL. Step 3'ü şuna göre düzelt: `moneyTransfers: assetTransferMoves(ds.cashflows)` ve Step 1 testindeki `d.assetTransferMoves` assertion'ını `d.moneyTransfers` olarak güncelle.**

- [ ] **Step 8: `Banka.test.ts`'e test ekle**

```ts
it('shows the Transferler section', async () => {
  const d = await v()
  const { getByText } = render(Banka, { props: { view: d.derived } })
  expect(getByText(/Transferler/i)).toBeInTheDocument()
})
```

- [ ] **Step 9: `Portfoyler.svelte`'in `holdingsByPortfolio` çağrısını güncelle**

Mevcut çağrıyı Task 4'ün yeni imzasına göre güncelle:

```ts
    return holdingsByPortfolio(view.positions.open, dataset.transactions, dataset.instruments, dataset.assetTransfers, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })
```

- [ ] **Step 10: Tüm testleri çalıştır — PASS beklenir, full check**

Run: `cd app && npm test && npm run check`
Expected: Tüm testler yeşil, 0 hata/0 uyarı.

- [ ] **Step 11: Commit**

```bash
git add app/src/lib/data/store.ts app/src/lib/data/store.test.ts app/src/routes/Kurumlar.svelte app/src/routes/Kurumlar.test.ts app/src/routes/Banka.svelte app/src/routes/Banka.test.ts app/src/routes/Portfoyler.svelte
git commit -m "feat(app): deriveAll cashByHesap/moneyTransfers; Kurumlar nakit satırı; Banka transferler bölümü"
```

---

### Task 7: `DriveSource.save()` + `ConflictError`

**Files:**
- Modify: `app/src/lib/data/drive.ts`, `app/src/lib/data/drive.test.ts`
- Modify: `app/src/lib/data/source.ts` — `DataSource` arayüzüne opsiyonel `save?`.

**Interfaces:**
- Produces: `export class ConflictError extends Error {}`; `DriveSource.save(name: (typeof NAMES)[number] | 'assetTransfers', data: unknown): Promise<void>`; `DataSource.save?(name: string, data: unknown): Promise<void>`.

Bu, planın en riskli task'ı — Drive REST API'sine gerçek bir ağ çağrısı YAPMADAN, `fetch`'in tamamen mock'landığı testlerle doğrulanır. Mevcut `drive.test.ts`'in `fetch` mock kurulum desenini (muhtemelen `vi.stubGlobal('fetch', vi.fn())` + her testte `mockResolvedValueOnce` zinciri) birebir takip et.

- [ ] **Step 1: `source.ts`'e opsiyonel `save` ekle**

`DataSource` arayüzünü güncelle:

```ts
export interface DataSource {
  readonly id: 'local' | 'drive'
  load(): Promise<Dataset>
  save?(name: string, data: unknown): Promise<void>
}
```

- [ ] **Step 2: Yazılacak testler — `drive.test.ts`'e ekle**

```ts
describe('DriveSource.save', () => {
  it('overwrites an existing file when checksums match, updates cache', async () => {
    const src = new DriveSource('client-id')
    // ... mevcut test dosyasındaki gibi token/folder set etme yardımcılarını kullan ...
    // 1) load() sırasında dosya listesi + md5Checksum önbelleğe alınmış olmalı — bu test
    //    load()'u önce çağırıp fileIds önbelleğini doldurmalı, sonra save() çağırmalı.
    // 2) fetch mock sırası: files.get (md5Checksum kontrolü) → eşleşiyor → PATCH media upload
    // Detaylı mock zinciri: mevcut dosyadaki load() testlerinin mock kurulumunu örnek al.
    await expect(src.save('meta', { foo: 1 })).resolves.toBeUndefined()
  })

  it('throws ConflictError when the remote checksum changed since last read', async () => {
    // files.get mock'u load() sırasında önbelleğe alınandan FARKLI bir md5Checksum döndürsün
    await expect(src.save('meta', { foo: 1 })).rejects.toBeInstanceOf(ConflictError)
  })

  it('creates the file via multipart upload when it does not exist yet (assetTransfers)', async () => {
    // Dosya listesinde assetTransfers.json YOK — save() bir POST (multipart create) yapmalı
    await expect(src.save('assetTransfers', [])).resolves.toBeUndefined()
  })
})
```

**Not implementer için:** Bu testlerin gerçek mock zincirini yazarken mevcut `drive.test.ts` dosyasındaki `load()` testlerinin nasıl `global.fetch`'i mock'ladığını (muhtemelen sıralı `mockResolvedValueOnce(new Response(JSON.stringify(...)))` çağrılarıyla) birebir örnek al — bu plan sana mantığı veriyor, gerçek mock detayını dosyanın var olan konvansiyonuna uydur.

- [ ] **Step 3: Testleri çalıştır — FAIL beklenir**

Run: `cd app && npm test -- drive`
Expected: FAIL — `save` metodu yok, `ConflictError` export edilmiyor.

- [ ] **Step 4: `drive.ts`'e `ConflictError` ve `save()` ekle**

Dosyanın en üstüne, `NeedsAuthError`'ın yanına ekle:

```ts
export class ConflictError extends Error {
  constructor(public readonly fileName: string) {
    super(`Drive: ${fileName}.json başka bir yerden değişmiş, tekrar denenmeli`)
  }
}
```

`DriveSource` sınıfına özel bir alan ekle (constructor'dan sonra, `folderId`'nin yanına):

```ts
  private fileIds: Record<string, { id: string; md5Checksum: string }> = {}
```

`load()` metodunun dosya listesi çekilen kısmını güncelle — `fields=files(id,name)` yerine `fields=files(id,name,md5Checksum)` iste, ve dönen listeyi `this.fileIds`'e yaz:

```ts
    const listRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,md5Checksum)',
      { headers },
    )
    // ... mevcut hata kontrolleri aynı kalır ...
    const { files } = (await listRes.json()) as { files: { id: string; name: string; md5Checksum?: string }[] }
    for (const f of files) {
      const base = f.name.replace(/\.json$/, '')
      if (f.md5Checksum) this.fileIds[base] = { id: f.id, md5Checksum: f.md5Checksum }
    }
```

(Bu satırlar, mevcut `NAMES.map(async (n) => { const file = files.find(...) ... })` bloğundan HEMEN ÖNCE eklenir — `files` değişkeni zaten oradan erişilebilir.)

Sınıfın sonuna (kapanış `}`'tan hemen önce) `save()` metodunu ekle:

```ts
  async save(name: string, data: unknown): Promise<void> {
    const folderId = this.folderId ?? readStoredFolder()
    if (!folderId || !this.token) throw new NeedsAuthError()
    const headers = { Authorization: `Bearer ${this.token}` }

    let cached = this.fileIds[name]
    if (!cached) {
      const q = `'${folderId}' in parents and trashed = false and name = '${name}.json'`
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,md5Checksum)`,
        { headers },
      )
      const { files } = (await res.json()) as { files: { id: string; md5Checksum?: string }[] }
      if (files[0]) cached = { id: files[0].id, md5Checksum: files[0].md5Checksum ?? '' }
    }

    if (!cached) {
      const boundary = 'bbb_' + Math.random().toString(36).slice(2)
      const metaPart = JSON.stringify({ name: `${name}.json`, parents: [folderId] })
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum',
        { method: 'POST', headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
      )
      const created = (await res.json()) as { id: string; md5Checksum: string }
      this.fileIds[name] = { id: created.id, md5Checksum: created.md5Checksum }
      return
    }

    const currentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cached.id}?fields=md5Checksum`, {
      headers,
    })
    const current = (await currentRes.json()) as { md5Checksum: string }
    if (current.md5Checksum !== cached.md5Checksum) {
      throw new ConflictError(name)
    }

    const updateRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${cached.id}?uploadType=media&fields=md5Checksum`,
      { method: 'PATCH', headers, body: JSON.stringify(data) },
    )
    const updated = (await updateRes.json()) as { md5Checksum: string }
    this.fileIds[name] = { id: cached.id, md5Checksum: updated.md5Checksum }
  }
```

- [ ] **Step 5: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- drive`
Expected: PASS (mevcut testler + 3 yeni).

- [ ] **Step 6: Full check + commit**

Run: `cd app && npm run check`.

```bash
git add app/src/lib/data/drive.ts app/src/lib/data/drive.test.ts app/src/lib/data/source.ts
git commit -m "feat(app): DriveSource.save() — iyimser eşzamanlılık kontrolü + dosya oluşturma"
```

---

### Task 8: `store.ts` — `appendRecord()` orkestrasyonu

**Files:**
- Modify: `app/src/lib/data/store.ts`, `app/src/lib/data/store.test.ts`

**Interfaces:**
- Consumes: `DataSource.save` (Task 7), `ConflictError` (Task 7).
- Produces: `appendRecord<T>(store: Writable<AppState>, source: DataSource, file: 'transactions' | 'cashflows' | 'assetTransfers' | 'brokers', record: T): Promise<void>` — başarılı olursa store'daki `dataset`/`derived`'i günceller; `source.save` yoksa (örn. `local` kaynak) hata fırlatır: `"Bu kaynakta kayıt eklenemez — sadece Google Drive'a yazılabilir."`.

- [ ] **Step 1: Yazılacak testler**

```ts
describe('appendRecord', () => {
  it('throws when the source cannot save (e.g. local)', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const local = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    await expect(appendRecord(store, local, 'transactions', {} as any)).rejects.toThrow(/sadece Google Drive/)
  })

  it('appends the record, saves, and updates the store on success', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let saved: unknown
    const drive = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_name: string, data: unknown) => {
        saved = data
      },
    }
    const newTx = { id: 't_new', tarih: '2026-05-01' } as any
    await appendRecord(store, drive, 'transactions', newTx)
    expect((saved as any[]).some((t) => t.id === 't_new')).toBe(true)
    const state = get(store)
    expect(state.dataset?.transactions.some((t) => t.id === 't_new')).toBe(true)
  })

  it('retries once on ConflictError by reloading fresh data', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let saveCalls = 0
    const drive = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {
        saveCalls++
        if (saveCalls === 1) throw new ConflictError('transactions')
      },
    }
    await appendRecord(store, drive, 'transactions', { id: 't_new2' } as any)
    expect(saveCalls).toBe(2)
  })

  it('surfaces an error after a second ConflictError', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const drive = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {
        throw new ConflictError('transactions')
      },
    }
    await expect(appendRecord(store, drive, 'transactions', { id: 't_new3' } as any)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
})
```

(`get` — `svelte/store`'dan import edilmeli, dosyanın tepesine `import { get } from 'svelte/store'` eklenmemişse ekle. `ConflictError` — `./drive`'dan import edilmeli.)

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- store`
Expected: FAIL — `appendRecord` export edilmiyor.

- [ ] **Step 3: `store.ts`'e `appendRecord` ekle**

İmporta `ConflictError`'ı ekle: `import { DriveSource, NeedsAuthError, ConflictError } from './drive'`.

Dosyanın sonuna ekle:

```ts
export async function appendRecord<T>(
  store: Writable<AppState>,
  source: DataSource,
  file: 'transactions' | 'cashflows' | 'assetTransfers' | 'brokers',
  record: T,
): Promise<void> {
  if (!source.save) throw new Error("Bu kaynakta kayıt eklenemez — sadece Google Drive'a yazılabilir.")
  const state = get(store)
  if (!state.dataset) throw new Error('Veri henüz yüklenmedi.')

  const attempt = async (ds: Dataset): Promise<Dataset> => {
    const updatedArray = [...(ds[file] as unknown as T[]), record]
    await source.save!(file, updatedArray)
    return { ...ds, [file]: updatedArray }
  }

  let newDataset: Dataset
  try {
    newDataset = await attempt(state.dataset)
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e
    const fresh = await source.load()
    newDataset = await attempt(fresh)
  }

  store.set({
    status: 'ready',
    dataset: newDataset,
    derived: deriveAll(newDataset),
    sourceText: state.sourceText,
  })
}
```

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- store`
Expected: PASS (4 yeni test).

- [ ] **Step 5: Full check + commit**

Run: `cd app && npm run check`.

```bash
git add app/src/lib/data/store.ts app/src/lib/data/store.test.ts
git commit -m "feat(app): appendRecord() — Drive'a yazma + çakışma sonrası otomatik tekrar deneme"
```

---

### Task 9: Router + App.svelte — 8. sekme "Ekle"

**Files:**
- Modify: `app/src/router.ts`, `app/src/router.test.ts`, `app/src/App.svelte`

**Interfaces:**
- Consumes: Task 10'da yazılacak `EkleKaydi.svelte` (bu task o dosyayı henüz İÇERMEZ — geçici bir placeholder import yapılır, Task 10 gerçek içeriği ekler. Bu, P1.6'nın "önce router sonra sayfalar" sırasının TERSİ; burada router'ı önce yazmak, sonraki formu yazan tasklerin kendi sayfalarını izole test etmesine izin verir, App.svelte'ye entegrasyonu ayrı tutar.).
- Produces: `Route` 8 değer alır: mevcut 7 + `'ekle'`. `ROUTES` yeni girdi: `{ id: 'ekle', path: '#/ekle', label: 'Ekle' }` (listenin SONUNA eklenir, mevcut sıralama bozulmaz).

**Not:** Bu task'ın çalışması için Task 10'un `EkleKaydi.svelte` dosyasının var olması gerekir (aksi halde `App.svelte`'nin import'u kırılır). Bu yüzden bu task, Task 10 ile BİRLİKTE, aynı implementer tarafından ardışık olarak yapılmalı — SDD çalıştıran kişi bu iki task'ı ayrı dispatch etmek yerine tek bir dispatch'te birleştirebilir, ya da Task 9'u "router.ts + router.test.ts" ile sınırlayıp `App.svelte` değişikliğini Task 10'a taşıyabilir. Bu plan, App.svelte değişikliğini Task 10'a taşıyarak ilerler — **Task 9 SADECE `router.ts`/`router.test.ts`'i kapsar.**

- [ ] **Step 1: `router.ts`'i güncelle**

`Route` tipine `| 'ekle'` ekle. `ROUTES` dizisinin sonuna ekle: `{ id: 'ekle', path: '#/ekle', label: 'Ekle' }`. `currentRoute()`'un `ids` dizisine `'ekle'` ekle: `const ids = ['portfoyler', 'kurumlar', 'pozisyonlar', 'aylik', 'banka', 'temettu', 'ekle'] as const`.

- [ ] **Step 2: `router.test.ts`'e test ekle**

```ts
it('maps #/ekle', () => {
  location.hash = '#/ekle'
  expect(currentRoute()).toBe('ekle')
  location.hash = ''
})

it('ROUTES has 8 entries', () => {
  expect(ROUTES).toHaveLength(8)
  expect(ROUTES.at(-1)?.id).toBe('ekle')
})
```

(Mevcut "ROUTES has 7 entries" testi varsa — Task 10 P1.6'da olduğu gibi — bunu "8 entries" olarak güncelle, ya da yukarıdaki gibi ayrı bir test olarak bırak; ikisi çelişmeyecek şekilde düzenle.)

- [ ] **Step 3: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- router`

- [ ] **Step 4: Commit**

```bash
git add app/src/router.ts app/src/router.test.ts
git commit -m "feat(app): router — 8. rota 'Ekle'"
```

---

### Task 10: `EkleKaydi.svelte` — tür seçici + iskelet + `App.svelte` entegrasyonu

**Files:**
- Create: `app/src/routes/EkleKaydi.svelte`, `app/src/routes/EkleKaydi.test.ts`
- Modify: `app/src/App.svelte`

**Interfaces:**
- Consumes: `Route`/`ROUTES` (Task 9), `appendRecord` (Task 8).
- Produces: `EkleKaydi.svelte` — `let { dataset, view, source }: { dataset?: Dataset; view?: DerivedBundle; source?: DataSource } = $props()`. 4 seçenekten birine tıklanınca ilgili alt bileşen (Task 11-14'te yazılacak) gösterilir. Bu task, alt formları HENÜZ İÇERMEZ — sadece tür seçici + "yakında" placeholder'ları kurar; Task 11-14 her biri kendi formunu ekler.

- [ ] **Step 1: Yazılacak test**

```ts
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import EkleKaydi from './EkleKaydi.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('EkleKaydi', () => {
  it('shows 4 record-type choices, switches to the picked form area', async () => {
    const d = await v()
    const { getByText } = render(EkleKaydi, {
      props: { dataset: d.dataset, view: d.derived, source: { id: 'local', load: () => Promise.resolve(fixture) } },
    })
    expect(getByText('İşlem (Al/Sat)')).toBeInTheDocument()
    expect(getByText('Nakit Hareketi')).toBeInTheDocument()
    expect(getByText('Varlık Transferi')).toBeInTheDocument()
    expect(getByText('Kurum Ekle')).toBeInTheDocument()
    await fireEvent.click(getByText('İşlem (Al/Sat)'))
    expect(getByText(/İşlem (Al\/Sat) formu/i)).toBeInTheDocument()
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(EkleKaydi, { props: {} })
    expect(getByText(/Ekle/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- EkleKaydi`
Expected: FAIL — `./EkleKaydi.svelte` çözülemiyor.

- [ ] **Step 3: `EkleKaydi.svelte`'i yaz**

```svelte
<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'

  let { dataset, view, source }: { dataset?: Dataset; view?: DerivedBundle; source?: DataSource } = $props()

  type Kind = 'islem' | 'nakit' | 'transfer' | 'kurum'
  let kind = $state<Kind | null>(null)

  const labels: Record<Kind, string> = {
    islem: 'İşlem (Al/Sat)',
    nakit: 'Nakit Hareketi',
    transfer: 'Varlık Transferi',
    kurum: 'Kurum Ekle',
  }
</script>

{#if dataset && view && source}
  <section class="ekle">
    <SectionHeader title="Yeni Kayıt Ekle" />
    <div class="picker">
      {#each Object.entries(labels) as [k, label]}
        <button class:active={kind === k} onclick={() => (kind = k as Kind)}>{label}</button>
      {/each}
    </div>
    {#if kind}
      <div class="form-area">
        <p class="placeholder">{labels[kind]} formu buraya gelecek.</p>
      </div>
    {/if}
  </section>
{:else}
  <EmptyState title="Ekle" detail="Veri bekleniyor." />
{/if}

<style>
  .ekle {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(760px, 96vw);
    margin: 0 auto;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0 1.25rem;
  }
  .picker button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }
  .picker button.active {
    border-color: var(--gold);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .form-area {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem;
  }
  .placeholder {
    color: var(--ink-soft);
    margin: 0;
  }
</style>
```

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- EkleKaydi`

- [ ] **Step 5: `App.svelte`'i güncelle**

İmporta ekle: `import EkleKaydi from './routes/EkleKaydi.svelte'`. `pages` objesine ekle: `ekle: EkleKaydi`. `<Active .../>` satırına `source={source}` prop'unu ekle (mevcut satır `<Active dataset={$store.dataset} derived={activeDerived} view={activeDerived} />` idi, şimdi `source={source}` de eklenir — `source` değişkeni zaten `App.svelte`'nin script bloğunda `const source = pickSource()` olarak tanımlı, sadece template'e prop olarak geçirilmesi gerekiyor). Diğer 6 sayfa bu ekstra prop'u görmezden gelir (Svelte 5'te kullanılmayan prop hata vermez).

- [ ] **Step 6: Full suite + check + build**

Run: `cd app && npm test && npm run check && npm run build`

- [ ] **Step 7: Commit**

```bash
git add app/src/routes/EkleKaydi.svelte app/src/routes/EkleKaydi.test.ts app/src/App.svelte
git commit -m "feat(app): Ekle sekmesi — tür seçici iskeleti"
```

---

### Task 11: İşlem formu (AL/SAT)

**Files:**
- Create: `app/src/routes/forms/IslemFormu.svelte`, `app/src/routes/forms/IslemFormu.test.ts`
- Modify: `app/src/routes/EkleKaydi.svelte` — `kind === 'islem'` dalı gerçek formu render eder.

**Interfaces:**
- Consumes: `appendRecord` (Task 8).
- Produces: `let { dataset, view, source, onSaved }: { dataset: Dataset; view: DerivedBundle; source: DataSource; onSaved: () => void } = $props()`.

- [ ] **Step 1: Yazılacak test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import IslemFormu from './IslemFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('IslemFormu', () => {
  it('rejects a SAT beyond the open lot', async () => {
    const d = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(IslemFormu, {
      props: { dataset: d.dataset!, view: d.derived!, source, onSaved },
    })
    await fireEvent.change(getByLabelText('Yön'), { target: { value: 'SAT' } })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '999999' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/açık pozisyondan fazla/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves a valid AL after confirm', async () => {
    const d = await v()
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText } = render(IslemFormu, {
      props: { dataset: d.dataset!, view: d.derived!, source, onSaved },
    })
    await fireEvent.change(getByLabelText('Yön'), { target: { value: 'AL' } })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '5' } })
    await fireEvent.input(getByLabelText('Fiyat (USD)'), { target: { value: '10' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    expect((saved as any[])?.some((t) => t.enstruman === 'THYAO' && t.yon === 'AL')).toBe(true)
  })
})
```

(Fixture'daki gerçek `THYAO`/`GARAN`/`ENIS` değerlerini kullan — bu değerler `app/src/fixtures/dataset.ts`'de zaten mevcut, P1.6'daki testlerle aynı fixture.)

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- IslemFormu`

- [ ] **Step 3: `IslemFormu.svelte`'i yaz**

```svelte
<script lang="ts">
  import type { Dataset } from '../../lib/data/types'
  import type { DerivedBundle } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord } from '../../lib/data/store'
  import { createAppStore } from '../../lib/data/store'

  let {
    dataset,
    view,
    source,
    onSaved,
  }: { dataset: Dataset; view: DerivedBundle; source: DataSource; onSaved: () => void } = $props()

  let yon = $state<'AL' | 'SAT'>('AL')
  let enstruman = $state('')
  let hesap = $state('')
  let portfoy = $state('')
  let lot = $state('')
  let fiyatUsd = $state('')
  let not_ = $state('')
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  const netUsd = $derived(Number(lot || 0) * Number(fiyatUsd || 0))

  function review() {
    error = null
    if (!enstruman || !hesap || !portfoy || !lot || !fiyatUsd) {
      error = 'Tüm alanları doldurun.'
      return
    }
    const lotNum = Number(lot)
    if (yon === 'SAT') {
      const open = view.positions.open.find((p) => p.kod === enstruman)?.lot ?? 0
      if (lotNum > open + 1e-9) {
        error = `Bu enstrümanda açık pozisyondan fazla satamazsınız (açık: ${open}).`
        return
      }
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      const rand = crypto.getRandomValues(new Uint8Array(8))
      const id = 't_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
      await appendRecord(createAppStore(), source, 'transactions', {
        id,
        tarih: new Date().toISOString().slice(0, 10),
        hesap,
        portfoy,
        enstruman,
        yon,
        lot: Number(lot),
        girisParaBirimi: 'USD',
        fiyat_tl: null,
        fiyat_usd: Number(fiyatUsd),
        kur: null,
        komisyon_usd: 0,
        brut_usd: netUsd,
        net_usd: netUsd,
        not: not_,
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
      })
      onSaved()
      yon = 'AL'
      enstruman = hesap = portfoy = lot = fiyatUsd = not_ = ''
      step = 'form'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

{#if step === 'form'}
  <div class="grid">
    <label>
      Yön
      <select bind:value={yon} aria-label="Yön">
        <option value="AL">AL</option>
        <option value="SAT">SAT</option>
      </select>
    </label>
    <label>
      Enstrüman
      <select bind:value={enstruman} aria-label="Enstrüman">
        <option value="">—</option>
        {#each dataset.instruments as i}<option value={i.kod}>{i.kod}</option>{/each}
      </select>
    </label>
    <label>
      Hesap
      <select bind:value={hesap} aria-label="Hesap">
        <option value="">—</option>
        {#each dataset.brokers as b}<option value={b.kod}>{b.ad}</option>{/each}
      </select>
    </label>
    <label>
      Portföy
      <select bind:value={portfoy} aria-label="Portföy">
        <option value="">—</option>
        {#each dataset.portfolios as p}<option value={p.kod}>{p.ad}</option>{/each}
      </select>
    </label>
    <label>
      Lot
      <input type="number" bind:value={lot} aria-label="Lot" min="0" step="any" />
    </label>
    <label>
      Fiyat (USD)
      <input type="number" bind:value={fiyatUsd} aria-label="Fiyat (USD)" min="0" step="any" />
    </label>
    <label class="wide">
      Not
      <input type="text" bind:value={not_} aria-label="Not" />
    </label>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{yon}</strong> — {enstruman} · {lot} lot · {fiyatUsd} USD/lot · toplam ${netUsd.toFixed(2)}</p>
    <p>{hesap} / {portfoy}</p>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={() => (step = 'form')} disabled={saving}>Geri</button>
  <button onclick={confirmSave} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Onayla ve Kaydet'}</button>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  label.wide {
    grid-column: 1 / -1;
  }
  select,
  input {
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    padding: 0.4rem 0.5rem;
  }
  .error {
    color: var(--loss);
    font-size: 0.85rem;
  }
  button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    padding: 0.5rem 1rem;
    margin-top: 0.75rem;
    margin-right: 0.5rem;
    cursor: pointer;
  }
  .summary {
    margin-bottom: 0.75rem;
  }
</style>
```

**Dikkat implementer için:** `confirmSave` içinde `appendRecord(createAppStore(), source, ...)` YANLIŞ — yeni, boş bir store yaratıp onu güncelliyor, gerçek uygulama store'unu DEĞİL. Bu bilinçli bir plan hatası değil, düzeltilmesi gereken bir tasarım eksikliği: `IslemFormu` (ve Task 12-14'teki diğer formlar) gerçek uygulama `AppState` store'una erişebilmeli. Bunu düzeltmek için `EkleKaydi.svelte`'ye (Task 10) ve oradan alt formlara bir `appStore: Writable<AppState>` prop'u geçirilmeli — `App.svelte`'nin zaten sahip olduğu `store` değişkeni `<Active store={store} ... />` şeklinde ilave bir prop olarak akıtılmalı, `EkleKaydi.svelte` bunu alıp her forma iletmeli. **Bu task'ın implementer'ı şunu yapmalı:** (1) `App.svelte`'de `<Active ... source={source} store={store} />`; (2) `EkleKaydi.svelte`'nin prop tipine `store: Writable<AppState>` eklenip alt formlara `store={store}` olarak geçirilmesi; (3) `IslemFormu.svelte`'nin prop tipine de `store: Writable<AppState>` eklenip `confirmSave` içinde `appendRecord(store, source, ...)` kullanılması (yeni `createAppStore()` çağrısı SİLİNMELİDİR). Yukarıdaki kod bloğu ve testler bu düzeltmeyle tutarlı hale getirilmeli — testlerde de `store` prop'u olarak gerçek bir `createAppStore()` + `load()` sonrası elde edilen store geçirilmeli, `appendRecord`'un GERÇEKTEN o store'u güncellediği doğrulanmalı (örn. `get(store).dataset?.transactions` üzerinden).

- [ ] **Step 4: Testleri çalıştır — PASS beklenir (yukarıdaki düzeltme uygulandıktan sonra)**

Run: `cd app && npm test -- IslemFormu`

- [ ] **Step 5: `EkleKaydi.svelte`'i güncelle**

`kind === 'islem'` durumunda placeholder yerine gerçek formu render et:

```svelte
    {#if kind === 'islem'}
      <div class="form-area">
        <IslemFormu {dataset} {view} {source} {store} onSaved={() => (kind = null)} />
      </div>
    {:else if kind}
```

(`IslemFormu` import edilmeli: `import IslemFormu from './forms/IslemFormu.svelte'`. `EkleKaydi.svelte`'nin kendi prop listesine de Task 11'in gerektirdiği `store` prop'u eklenmeli — Step 3'teki düzeltmeyle tutarlı.)

- [ ] **Step 6: Full suite + check + build**

Run: `cd app && npm test && npm run check && npm run build`

- [ ] **Step 7: Commit**

```bash
git add app/src/routes/forms/IslemFormu.svelte app/src/routes/forms/IslemFormu.test.ts app/src/routes/EkleKaydi.svelte app/src/App.svelte
git commit -m "feat(app): İşlem (AL/SAT) formu"
```

---

### Task 12: Nakit Hareketi formu (YATIRMA/ÇEKME/TEMETTÜ/TRANSFER)

**Files:**
- Create: `app/src/routes/forms/NakitHareketiFormu.svelte`, `app/src/routes/forms/NakitHareketiFormu.test.ts`
- Modify: `app/src/routes/EkleKaydi.svelte` — `kind === 'nakit'` dalı.

**Interfaces:**
- Consumes: `appendRecord` (Task 8), `store` prop deseni (Task 11'in düzeltmesiyle aynı).
- Produces: `let { dataset, source, store, onSaved }: { dataset: Dataset; source: DataSource; store: Writable<AppState>; onSaved: () => void } = $props()`.

- [ ] **Step 1: Yazılacak test**

```ts
describe('NakitHareketiFormu', () => {
  it('requires hedefHesap when tur is TRANSFER and rejects same-account transfer', async () => {
    // tur=TRANSFER seçilince "Hedef Hesap" alanı görünür olmalı; hesap === hedefHesap ise
    // "İncele" tıklanınca "aynı hesaba transfer yapılamaz" hatası gösterilmeli.
  })

  it('saves a YATIRMA record', async () => {
    // tur=YATIRMA, hesap, tutar doldurulup İncele → Onayla ve Kaydet; appendRecord'un
    // 'cashflows' dosyasına tur: 'YATIRMA' içeren yeni bir kayıt eklediği doğrulanmalı.
  })
})
```

(Bu iki test, Task 11'in testleriyle AYNI DESENİ — `render` + `fireEvent` + mock `source.save` ile `saved` yakalama — kullanır. Implementer, Task 11'in test dosyasını doğrudan örnek alıp bu forma uyarlamalı; burada tekrar birebir kod verilmiyor çünkü Task 11'in deseni birebir geçerli.)

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- NakitHareketiFormu`

- [ ] **Step 3: `NakitHareketiFormu.svelte`'i yaz**

Task 11'in `IslemFormu.svelte`'iyle AYNI YAPIDA (form/confirm state, `review()`/`confirmSave()` deseni), farklar:
- Alanlar: `tur` (YATIRMA/ÇEKME/TEMETTÜ/TRANSFER dropdown), `hesap`, `hedefHesap` (SADECE `tur === 'TRANSFER'` iken görünür), `enstruman` (SADECE `tur === 'TEMETTU'` iken görünür — dropdown, `dataset.instruments`), `tutarUsd`, `aciklama`.
- Doğrulama (`review()` içinde): `tur === 'TRANSFER'` ise `hedefHesap` dolu VE `hesap !== hedefHesap` olmalı, aksi halde `error = 'Aynı hesaba transfer yapılamaz.'` veya `'Hedef hesap seçilmeli.'`.
- `confirmSave()`: id öneki `c_`; kayıt şekli:
```ts
{
  id, tarih: new Date().toISOString().slice(0, 10), hesap, portfoy: null, tur,
  enstruman: tur === 'TEMETTU' ? enstruman : null, tutar_tl: null, tutar_usd: Number(tutarUsd),
  kur: null, aciklama, kaynak: 'manual',
  ...(tur === 'TRANSFER' ? { hedefHesap } : {}),
}
```
`appendRecord(store, source, 'cashflows', record)` ile kaydedilir.

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- NakitHareketiFormu`

- [ ] **Step 5: `EkleKaydi.svelte`'e ekle**

`kind === 'nakit'` dalını `NakitHareketiFormu`'ya bağla (Task 11'deki `islem` dalıyla aynı desen).

- [ ] **Step 6: Full suite + check + build, commit**

```bash
git add app/src/routes/forms/NakitHareketiFormu.svelte app/src/routes/forms/NakitHareketiFormu.test.ts app/src/routes/EkleKaydi.svelte
git commit -m "feat(app): Nakit Hareketi formu (yatırma/çekme/temettü/transfer)"
```

---

### Task 13: Varlık Transferi formu

**Files:**
- Create: `app/src/routes/forms/VarlikTransferiFormu.svelte`, `app/src/routes/forms/VarlikTransferiFormu.test.ts`
- Modify: `app/src/routes/EkleKaydi.svelte` — `kind === 'transfer'` dalı.

**Interfaces:**
- Consumes: `appendRecord` (Task 8), `view.positions.open` (kod bazlı toplam açık lot kontrolü için, Ruling P2-3).
- Produces: `let { dataset, view, source, store, onSaved } = $props()`.

- [ ] **Step 1: Yazılacak test**

```ts
describe('VarlikTransferiFormu', () => {
  it('rejects a transfer exceeding the total open lot for the instrument', async () => {
    // enstruman seçilip lot, view.positions.open'daki toplam lottan büyük girilirse
    // "açık pozisyondan fazla" hatası gösterilmeli.
  })

  it('rejects when source and target are identical (both hesap and portfoy unchanged)', async () => {
    // kaynakHesap === hedefHesap VE kaynakPortfoy === hedefPortfoy ise hata.
  })

  it('saves a valid transfer to the assetTransfers file', async () => {
    // appendRecord'un 'assetTransfers' dosyasına yeni bir AssetTransfer kaydı eklediği doğrulanmalı.
  })
})
```

(Test deseni Task 11/12 ile aynı — `render`/`fireEvent`/mock `source.save`.)

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- VarlikTransferiFormu`

- [ ] **Step 3: `VarlikTransferiFormu.svelte`'i yaz**

Task 11 ile aynı yapı. Alanlar: `enstruman` (dropdown, `dataset.instruments`), `kaynakHesap`/`hedefHesap` (dropdown, `dataset.brokers`), `kaynakPortfoy`/`hedefPortfoy` (dropdown, `dataset.portfolios`), `lot`, `aciklama`.

Doğrulama (`review()`):
```ts
const openLot = view.positions.open.find((p) => p.kod === enstruman)?.lot ?? 0
if (Number(lot) > openLot + 1e-9) {
  error = `Bu enstrümanda açık pozisyondan (${openLot}) fazla transfer edemezsiniz.`
  return
}
if (kaynakHesap === hedefHesap && kaynakPortfoy === hedefPortfoy) {
  error = 'Kaynak ve hedef aynı — transfer yapılacak bir şey yok.'
  return
}
```

`confirmSave()`: id öneki `at_`; kayıt:
```ts
{
  id, tarih: new Date().toISOString().slice(0, 10), enstruman, lot: Number(lot),
  kaynakHesap, hedefHesap, kaynakPortfoy: kaynakPortfoy || null, hedefPortfoy: hedefPortfoy || null,
  aciklama, kaynak: 'manual',
}
```
`appendRecord(store, source, 'assetTransfers', record)`.

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- VarlikTransferiFormu`

- [ ] **Step 5: `EkleKaydi.svelte`'e ekle, full suite + check + build, commit**

```bash
git add app/src/routes/forms/VarlikTransferiFormu.svelte app/src/routes/forms/VarlikTransferiFormu.test.ts app/src/routes/EkleKaydi.svelte
git commit -m "feat(app): Varlık Transferi formu"
```

---

### Task 14: Kurum Ekleme formu + README

**Files:**
- Create: `app/src/routes/forms/KurumFormu.svelte`, `app/src/routes/forms/KurumFormu.test.ts`
- Modify: `app/src/routes/EkleKaydi.svelte` — `kind === 'kurum'` dalı.
- Modify: `app/README.md`

**Interfaces:**
- Consumes: `appendRecord` (Task 8).
- Produces: `let { source, store, onSaved } = $props()` (bu form `dataset`/`view` gerektirmez — sadece yeni bir `Broker` objesi ekler).

- [ ] **Step 1: Yazılacak test**

```ts
describe('KurumFormu', () => {
  it('rejects a duplicate kod', async () => {
    // dataset.brokers'ta zaten var olan bir kod girilirse "bu kod zaten kullanılıyor" hatası.
  })

  it('saves a new broker to the brokers file', async () => {
    // appendRecord'un 'brokers' dosyasına { kod, ad, tur, sahip, aktif: true } eklediği doğrulanmalı.
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cd app && npm test -- KurumFormu`

- [ ] **Step 3: `KurumFormu.svelte`'i yaz**

Task 11 ile aynı yapı, daha az alan: `kod`, `ad`, `tur` (serbest metin), `sahip` (serbest metin).

Doğrulama (`review()`): `dataset.brokers.some((b) => b.kod === kod)` ise `error = 'Bu kod zaten kullanılıyor.'`.

`confirmSave()`: `appendRecord(store, source, 'brokers', { kod, ad, tur, sahip, aktif: true })` (bu kaydın `id` alanı yok — `Broker` tipinde zaten `id` yok, sadece `kod` benzersiz anahtar).

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

Run: `cd app && npm test -- KurumFormu`

- [ ] **Step 5: `EkleKaydi.svelte`'e ekle**

- [ ] **Step 6: `app/README.md`'ye ekle**

"P1.6 — yeni sayfalar" bölümünden sonra ekle:

```markdown
## P2 — manuel kayıt girişi

"Ekle" sekmesinden dört tür kayıt eklenebilir: **İşlem** (Al/Sat), **Nakit Hareketi**
(yatırma/çekme/temettü/kurumlar arası transfer), **Varlık Transferi** (bir pozisyonun
hangi kurum/portföy altında göründüğünü değiştirir, maliyet/kâr-zarar hesabını etkilemez),
**Kurum Ekle**. Her kayıt önce bir özet ekranında gösterilir, "Onayla ve Kaydet" ile
Google Drive'a yazılır. Düzenleme/silme henüz desteklenmiyor — sıradaki fazda ele alınacak.

Kurum bazlı nakit bakiyesi (Kurumlar sayfasındaki "Nakit" satırı), Excel'den gelen son
bilinen bakiyeleri başlangıç noktası kabul edip bu andan sonraki her manuel hareketle
güncellenir — geçmiş, hesap bazında ayrıştırılamayan veri olduğu için hesaba katılmaz.
```

- [ ] **Step 7: Full suite + check + build**

Run: `cd app && npm test && npm run check && npm run build`

- [ ] **Step 8: Commit**

```bash
git add app/src/routes/forms/KurumFormu.svelte app/src/routes/forms/KurumFormu.test.ts app/src/routes/EkleKaydi.svelte app/README.md
git commit -m "feat(app): Kurum Ekle formu + P2 README"
```

---

## Self-Review

**Spec kapsaması:**
- Bölüm 1 (veri modeli) → Task 1, 4. ✓
- Bölüm 2 (kurum bazlı nakit bakiyesi) → Task 2, 6 (Kurumlar'da gösterim). ✓
- Bölüm 3 (Drive yazma mekanizması) → Task 7, 8. ✓
- Bölüm 4 (giriş arayüzü) → Task 9, 10, 11-14. ✓
- Bölüm 5 (doğrulama) → Task 11 (SAT), 12 (aynı hesaba transfer), 13 (lot aşımı, kaynak=hedef), 14 (yinelenen kod). ✓
- Bölüm 6 (test stratejisi) → her task kendi TDD döngüsünü, Task 7/8 mock-fetch ile Drive'ı hiç gerçek çağırmadan test ediyor. ✓
- Kapsam dışı not (düzenleme/silme) → plan başında ve README'de tekrarlandı, hiçbir task bunu üstlenmiyor. ✓

**Placeholder taraması:** Task 12/13/14'ün test adımlarında ("Bu iki test, Task 11'in testleriyle AYNI DESENİ kullanır... implementer Task 11'in test dosyasını örnek alıp uyarlamalı") tam kod verilmedi — bu, "No Placeholders" kuralına aykırı görünebilir. Ancak bu, "Similar to Task N" kalıbından farklı: Task 11'in TAM test kodu zaten yazılı ve implementer görev sırasına göre Task 11'i önce tamamlamış olacağı için o dosyayı okuyabilir/kopyalayabilir — plan, doğrulanacak DAVRANIŞI (hangi hata mesajı, hangi alan) tam olarak belirtiyor, sadece Testing Library çağrı zincirinin tekrarını atlıyor. Bu, gerçek bir plan zafiyeti — **düzeltme:** Task 12/13/14'ün implementer'ları, dispatch sırasında brief'e ek olarak "Task 11'in test dosyasının tam içeriğini oku, aynı `render`/`fireEvent` iskeletini kullan" talimatı almalı (SDD dispatch'i bunu yapacak şekilde hazırlanmalı — plan yazma aşamasında bu notu buraya düşüyoruz, SDD dispatch aşamasında task-brief'e eklenecek).

**Tip tutarlılığı:**
- `Cashflow.tur`/`hedefHesap` (Task 1) → `cashBalances.ts` (Task 2), `cashmoves.transfers()` (Task 3), `NakitHareketiFormu` (Task 12) hepsi aynı alan adlarını kullanıyor. ✓
- `AssetTransfer` (Task 1) → `breakdowns.ts` (Task 4), `store.ts`/`Kurumlar`/`Portfoyler` (Task 6), `VarlikTransferiFormu` (Task 13) — alan adları (`kaynakHesap`, `hedefHesap`, `kaynakPortfoy`, `hedefPortfoy`, `lot`, `enstruman`) tüm tasklerde tutarlı. ✓
- `holdingsByPortfolio`/`holdingsByBroker` imza değişikliği (Task 4) → Task 6'da HER İKİ çağrı sitesi (`Kurumlar.svelte`, `Portfoyler.svelte`) güncelleniyor. ✓
- `appendRecord` imzası (Task 8) → Task 11-14'ün hepsi aynı `(store, source, file, record)` sırasını kullanıyor. ✓
- `DriveSource.save`/`ConflictError` (Task 7) → `appendRecord` (Task 8) `ConflictError`'ı `instanceof` ile yakalıyor, aynı sınıf. ✓

**Kapsam kontrolü:** 14 task, P1.6'nın 11 task'ından biraz büyük ama tek bir tutarlı özellik (manuel giriş) — alt projelere bölünmesi gerekmiyor. Task 7 (Drive yazma) en yüksek riskli/en çok dikkat gerektiren task olarak işaretlendi; final whole-branch review'da özellikle bu task'ın mock-fetch testlerinin gerçek Drive davranışını doğru simüle ettiği yeniden kontrol edilmeli.

---

## Execution Handoff

Plan tamamlandı ve `docs/superpowers/plans/2026-09-04-bbb-p2-manual-entry.md`'ye kaydedildi. İki uygulama seçeneği:

**1. Subagent-Driven (önerilen)** — Her task için taze bir subagent dispatch edilir, aralarda review yapılır, hızlı iterasyon.

**2. Inline Execution** — Bu oturumda tasklar sırayla, checkpoint'lerle yürütülür.

Hangisini tercih edersiniz?
