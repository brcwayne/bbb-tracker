# Tekrarlayan İşlemler — App (BBB PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Enis define recurring Kişisel Defter rules (salary, subscriptions) in a new "Tekrarlayanlar" tab, see a 12-month faded-orange preview of future occurrences everywhere the ledger is shown, and edit a future occurrence's amount with a choice between "just this one" and "this and every later occurrence" — all client-side, no bot dependency.

**Architecture:** One new file type (`RecurringRule`) stored in `data/recurring_rules.json`, following the exact `PERSONAL_NAMES`/`PERSONAL_KEY_MAP` pattern already used for `personal_tx.json` etc. A pure `materialize()` function expands active rules into placeholder `PersonalTx` rows (`durum: 'planlandi'`) for the next 12 months; it runs whenever a rule is saved. Existing aggregation functions in `personal.ts` are extended to ignore `durum: 'planlandi'` rows so forecast rows never inflate real totals. This plan is fully independent of the bot — Task 8 (Telegram confirm flow) is a separate plan in `bbb-telegram-bot/`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-09-15-tekrarlayan-islemler-design.md`

## Global Constraints

- Ufuk (materialization horizon): **12 ay**, idempotent — aynı `(kural.id, tarih)` çifti için ikinci satır asla açılmaz.
- `gunOfMonth` bir ayın gün sayısını aşarsa (örn. 31, Şubat'ta) o ayın **son gününe** sabitlenir.
- Kural CRUD'u **sadece app'ten** yapılır; bot bu dosyaya hiç yazmaz.
- `durum: 'planlandi'` satırlar `personal.ts`'deki `monthlyTotals`, `monthSummary`, `categoryBreakdown`'dan **hariç tutulur**. `instalmentSchedule` ve `activePlans` bu alandan etkilenmez.
- Yeni id'ler `newPersonalId()`/`newRecurringRuleId()` ile üretilir (rastgele, `px_`/`rr_` + 12 hex) — bot tarafının içerik-türevli hash id'leriyle çakışmaz (aynı dosyada iki farklı üretici kabul edilebilir, mevcut sistemde zaten böyle).
- Türkçe kullanıcı metinleri, mevcut sayfaların üslubunda (bkz. `Borclar.svelte`, `HarcamaFormu.svelte`).
- `npm test` ve `npm run check` (app/ içinde) temiz kalmalı.

---

### Task 1: Veri modeli ve dosya kaydı

**Files:**
- Modify: `app/src/lib/data/types.ts` (`RecurringRule` interface eklenir, `PersonalTx`'e `tekrarKuralId`/`durum` alanları, `Dataset`'e `recurringRules?: RecurringRule[]`)
- Modify: `app/src/lib/data/source.ts` (`PERSONAL_NAMES`, `PERSONAL_KEY_MAP`)
- Modify: `app/src/lib/data/store.ts` (`Kind` union'a `'recurring_rules'`)
- Modify: `app/src/lib/data/ids.ts` (`newRecurringRuleId`)
- Test: `app/src/lib/data/store.datasetKey.test.ts` (mevcut dosyaya yeni bir vaka eklenir)

**Interfaces:**
- Produces: `RecurringRule` type, `newRecurringRuleId(): string`, `Dataset.recurringRules?: RecurringRule[]`, `Kind` artık `'recurring_rules'` değerini kabul ediyor.

- [ ] **Step 1: Mevcut dataset-key testini oku ve yeni vakayı yaz (failing)**

`app/src/lib/data/store.datasetKey.test.ts` dosyasını aç, mevcut testlerin şeklini kopyalayarak şu vakayı ekle (dosyanın üstündeki importları ve yardımcı fonksiyonları koru, sadece yeni bir `it(...)` bloğu ekleniyor):

```ts
it('recurring_rules dosya adı recurringRules dataset alanına yazılır', async () => {
  const { store, source } = makeHarness({ recurringRules: [] })
  await appendRecord(store, source, 'recurring_rules', {
    id: 'rr_abc123abc123',
    tur: 'GIDER',
    aciklama: 'Netflix',
    kategori: 'eglence',
    hesap: 'nakit',
    sahip: 'enis',
    paraBirimi: 'TRY',
    tutar: 229.9,
    gunOfMonth: 5,
    baslangicTarihi: '2026-09-01',
    bitisTarihi: null,
    aktif: true,
    olusturulma: new Date().toISOString(),
    kaynak: 'manual',
  })
  const state = get(store)
  expect(state.dataset?.recurringRules).toHaveLength(1)
  expect(state.dataset?.recurringRules?.[0].aciklama).toBe('Netflix')
})
```

Bu dosyadaki `makeHarness` yardımcı fonksiyonunun imzasını incele (zaten `personalTx`/`paymentPlans` gibi alanlarla çağrılan bir örnek var) ve aynı şekilde `recurringRules: []` geçir.

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd app && npx vitest run src/lib/data/store.datasetKey.test.ts`
Expected: FAIL — `'recurring_rules'` `Kind` tipine uymuyor / `recurringRules` `Dataset`'te yok.

- [ ] **Step 3: `types.ts`'e veri modelini ekle**

`app/src/lib/data/types.ts` içinde `PersonalTx` interface'inin hemen üstüne:

```ts
export interface RecurringRule {
  id: string
  tur: 'GIDER' | 'GELIR'
  aciklama: string
  kategori: string
  hesap: string
  sahip: string
  paraBirimi: 'TRY' | 'USD'
  tutar: number
  /** 1-31; ayın gerçek gün sayısından fazlaysa o ayın son gününe sabitlenir. */
  gunOfMonth: number
  baslangicTarihi: string
  bitisTarihi: string | null
  aktif: boolean
  olusturulma: string
  kaynak: 'manual'
}
```

`PersonalTx` interface'inin sonuna (mevcut `olusturulma: string` satırından hemen sonra):

```ts
  /** Bir RecurringRule'dan üretilmişse o kuralın id'si. */
  tekrarKuralId?: string | null
  /** 'planlandi' = henüz gerçekleşmemiş önizleme satırı; yoksa normal/gerçekleşmiş kayıt. */
  durum?: 'planlandi'
```

`Dataset` interface'inde `debts?: Debt[]` satırının altına:

```ts
  recurringRules?: RecurringRule[]
```

- [ ] **Step 4: `source.ts`'e dosya kaydını ekle**

`app/src/lib/data/source.ts` içinde:

```ts
export const PERSONAL_NAMES = [
  'personal_tx', 'payment_plans', 'personal_accounts',
  'categories', 'people', 'debts', 'recurring_rules',
] as const
```

```ts
export const PERSONAL_KEY_MAP = {
  personal_tx: 'personalTx',
  payment_plans: 'paymentPlans',
  personal_accounts: 'personalAccounts',
  categories: 'categories',
  people: 'people',
  debts: 'debts',
  recurring_rules: 'recurringRules',
} as const satisfies Record<typeof PERSONAL_NAMES[number], keyof Dataset>
```

- [ ] **Step 5: `store.ts`'in `Kind` union'ına ekle**

`app/src/lib/data/store.ts` içinde:

```ts
export type Kind =
  | 'transactions'
  | 'cashflows'
  | 'assetTransfers'
  | 'brokers'
  | 'portfolios'
  | 'instruments'
  | 'personal_tx'
  | 'payment_plans'
  | 'personal_accounts'
  | 'categories'
  | 'people'
  | 'debts'
  | 'recurring_rules'
```

- [ ] **Step 6: `ids.ts`'e id üreticisini ekle**

`app/src/lib/data/ids.ts` sonuna:

```ts
/** Mints a recurring-rule id: `rr_` + 12 hex, same shape as `newPersonalId`. */
export function newRecurringRuleId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(6))
  return 'rr_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 7: Testi çalıştır, geçtiğini doğrula**

Run: `cd app && npx vitest run src/lib/data/store.datasetKey.test.ts`
Expected: PASS

- [ ] **Step 8: Tüm test paketini ve type-check'i çalıştır**

Run: `cd app && npm test -- --run && npm run check`
Expected: Her ikisi de temiz (mevcut testler kırılmamış olmalı).

- [ ] **Step 9: Commit**

```bash
cd app && git add src/lib/data/types.ts src/lib/data/source.ts src/lib/data/store.ts src/lib/data/ids.ts src/lib/data/store.datasetKey.test.ts
git commit -m "feat(recurring): RecurringRule veri modeli ve dosya kaydı"
```

---

### Task 2: `updateRecords` (çoklu satır güncelleme) primitive'i

**Files:**
- Modify: `app/src/lib/data/store.ts`
- Test: `app/src/lib/data/store.updateRecords.test.ts` (yeni dosya)

**Interfaces:**
- Consumes: `writeAndCommit` (Task 1'den önce zaten var, değişmedi), `MutateOpts` (var olan tip).
- Produces: `updateRecords<T extends { kaynak?: string }>(store, source, file, matches, patch, opts?): Promise<void>` — `matches` ile eşleşen **her** satırı `patch(satır)` ile değiştirir, tek bir dosya yazımında (Task 7'nin "bundan sonraki tüm tekrarlar" akışı bunu kullanacak).

- [ ] **Step 1: Failing testi yaz**

`app/src/lib/data/store.updateRecords.test.ts` (mevcut `store.datasetKey.test.ts`'deki `makeHarness` desenini kopyala/uyarlar veya oradan import et — dosyayı önce oku):

```ts
import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { updateRecords } from './store'
import { makeHarness } from './store.datasetKey.test' // yoksa aynı yardımcıyı bu dosyaya da kopyala

describe('updateRecords', () => {
  it('eşleşen tüm satırları tek seferde günceller', async () => {
    const { store, source } = makeHarness({
      personalTx: [
        { id: 'px_1', tarih: '2026-10-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' },
        { id: 'px_2', tarih: '2026-11-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' },
        { id: 'px_3', tarih: '2026-09-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1', durum: undefined },
      ],
    })
    await updateRecords(
      store, source, 'personal_tx',
      (r: any) => r.tekrarKuralId === 'rr_1' && r.durum === 'planlandi' && r.tarih >= '2026-10-05',
      (r: any) => ({ ...r, tutar: 259.9 }),
    )
    const rows = get(store).dataset?.personalTx ?? []
    expect(rows.find((r) => r.id === 'px_1')!.tutar).toBe(259.9)
    expect(rows.find((r) => r.id === 'px_2')!.tutar).toBe(259.9)
    expect(rows.find((r) => r.id === 'px_3')!.tutar).toBe(229.9) // geçmiş satır dokunulmadı
  })
})
```

Not: `store.datasetKey.test.ts`'i önce Read ile aç, `makeHarness`'in gerçek imzasını ve export edilip edilmediğini gör; export edilmiyorsa aynı yardımcıyı bu yeni test dosyasına da (kopyalayarak) ekle — iki test dosyası arasında dolaylı bağımlılık kurma.

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd app && npx vitest run src/lib/data/store.updateRecords.test.ts`
Expected: FAIL — `updateRecords` tanımlı değil.

- [ ] **Step 3: `updateRecords`'u ekle**

`app/src/lib/data/store.ts` içinde `updateRecord`'un (tekil) hemen altına:

```ts
/** `updateRecord`'un çoğulu: `matches` ile eşleşen her satırı `patch(satır)` ile
 *  değiştirir, tek bir dosya yazımında. Bir RecurringRule'un tutarını "bundan
 *  sonraki tüm tekrarlar" seçeneğiyle değiştirmek için kullanılır. */
export async function updateRecords<T extends { kaynak?: string }>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  matches: (r: T) => boolean,
  patch: (r: T) => T,
  opts: MutateOpts = {},
): Promise<void> {
  return writeAndCommit(store, source, file, (current) => {
    const arr = current as T[]
    const allowed = opts.allowKaynak ?? ['manual']
    return arr.map((r) => {
      if (!matches(r)) return r
      if (!opts.allowImported && !allowed.includes(r.kaynak ?? '')) {
        throw new Error('Sadece manuel kayıtlar düzenlenebilir.')
      }
      return patch(r)
    })
  })
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd app && npx vitest run src/lib/data/store.updateRecords.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd app && git add src/lib/data/store.ts src/lib/data/store.updateRecords.test.ts
git commit -m "feat(recurring): çoklu satır güncellemesi için updateRecords"
```

---

### Task 3: `materialize()` — saf materialization fonksiyonu

**Files:**
- Create: `app/src/lib/data/recurring.ts`
- Test: `app/src/lib/data/recurring.test.ts`

**Interfaces:**
- Consumes: `RecurringRule`, `PersonalTx` (Task 1), `newPersonalId` (`./ids`).
- Produces: `materialize(rules: RecurringRule[], existing: PersonalTx[], today: string, horizonMonths = 12): PersonalTx[]` — sadece **eklenecek yeni** satırları döner (var olanları döndürmez, mevcutları değiştirmez).

- [ ] **Step 1: Failing testleri yaz**

`app/src/lib/data/recurring.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { materialize } from './recurring'
import type { RecurringRule, PersonalTx } from './types'

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'rr_1',
  tur: 'GIDER',
  aciklama: 'Netflix',
  kategori: 'eglence',
  hesap: 'nakit',
  sahip: 'enis',
  paraBirimi: 'TRY',
  tutar: 229.9,
  gunOfMonth: 5,
  baslangicTarihi: '2026-01-01',
  bitisTarihi: null,
  aktif: true,
  olusturulma: '2026-09-15T00:00:00.000Z',
  kaynak: 'manual',
  ...over,
})

describe('materialize', () => {
  it('12 aylık ufuk için planlandi satırları üretir', () => {
    const rows = materialize([rule()], [], '2026-09-15')
    expect(rows).toHaveLength(12)
    expect(rows[0].tarih).toBe('2026-10-05') // bu ayın 5'i geçti, ilk oluşum ekim
    expect(rows[0].durum).toBe('planlandi')
    expect(rows[0].tekrarKuralId).toBe('rr_1')
    expect(rows[0].tutar).toBe(229.9)
    expect(rows.at(-1)!.tarih).toBe('2027-09-05')
  })

  it('bugünün günü henüz geçmediyse bu ayı da üretir', () => {
    const rows = materialize([rule({ gunOfMonth: 20 })], [], '2026-09-15')
    expect(rows[0].tarih).toBe('2026-09-20')
  })

  it('ay sonu kısa aylarda gün sabitlenir (31 -> Şubat 28)', () => {
    const rows = materialize([rule({ gunOfMonth: 31, baslangicTarihi: '2027-01-01' })], [], '2027-01-15', 3)
    const subat = rows.find((r) => r.tarih.startsWith('2027-02'))
    expect(subat?.tarih).toBe('2027-02-28')
  })

  it('idempotent: var olan (kural, tarih) çifti için ikinci satır açmaz', () => {
    const existing: PersonalTx[] = [{
      id: 'px_x', tarih: '2026-10-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY',
      kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi',
    }]
    const rows = materialize([rule()], existing, '2026-09-15')
    expect(rows.find((r) => r.tarih === '2026-10-05')).toBeUndefined()
    expect(rows).toHaveLength(11)
  })

  it('bitisTarihi sonrasını üretmez', () => {
    const rows = materialize([rule({ bitisTarihi: '2026-11-10' })], [], '2026-09-15', 12)
    expect(rows.every((r) => r.tarih <= '2026-11-10')).toBe(true)
    expect(rows).toHaveLength(2) // ekim + kasım
  })

  it('pasif kural için hiçbir satır üretmez', () => {
    expect(materialize([rule({ aktif: false })], [], '2026-09-15')).toEqual([])
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd app && npx vitest run src/lib/data/recurring.test.ts`
Expected: FAIL — `./recurring` modülü yok.

- [ ] **Step 3: `recurring.ts`'i yaz**

`app/src/lib/data/recurring.ts`:

```ts
import type { PersonalTx, RecurringRule } from './types'
import { newPersonalId } from './ids'

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

function occurrenceDate(year: number, month1to12: number, gunOfMonth: number): string {
  const gun = Math.min(gunOfMonth, daysInMonth(year, month1to12))
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(gun).padStart(2, '0')}`
}

/**
 * Aktif kuralları, önümüzdeki `horizonMonths` ay için `durum: 'planlandi'`
 * PersonalTx satırlarına genişletir. Sadece EKLENECEK yeni satırları döner —
 * `existing` içinde zaten (kural, tarih) eşleşmesi varsa o ay atlanır
 * (idempotent), böylece kural kaydında da bot'un günlük top-up'ında da
 * güvenle çağrılabilir.
 */
export function materialize(
  rules: RecurringRule[],
  existing: PersonalTx[],
  today: string,
  horizonMonths = 12,
): PersonalTx[] {
  const existingKeys = new Set(
    existing
      .filter((r) => r.tekrarKuralId)
      .map((r) => `${r.tekrarKuralId}|${r.tarih}`),
  )
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const out: PersonalTx[] = []

  for (const rule of rules) {
    if (!rule.aktif) continue

    for (let m = 0; m < horizonMonths; m++) {
      const idx = todayYear * 12 + (todayMonth - 1) + m
      const year = Math.floor(idx / 12)
      const month = (idx % 12) + 1
      const tarih = occurrenceDate(year, month, rule.gunOfMonth)

      if (tarih < today || tarih < rule.baslangicTarihi) continue
      if (rule.bitisTarihi != null && tarih > rule.bitisTarihi) continue
      if (existingKeys.has(`${rule.id}|${tarih}`)) continue

      out.push({
        id: newPersonalId(),
        tarih,
        tur: rule.tur,
        tutar: rule.tutar,
        paraBirimi: rule.paraBirimi,
        kategori: rule.kategori,
        aciklama: rule.aciklama,
        hesap: rule.hesap,
        sahip: rule.sahip,
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: '',
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
        tekrarKuralId: rule.id,
        durum: 'planlandi',
      })
      existingKeys.add(`${rule.id}|${tarih}`)
    }
  }

  return out
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd app && npx vitest run src/lib/data/recurring.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
cd app && git add src/lib/data/recurring.ts src/lib/data/recurring.test.ts
git commit -m "feat(recurring): materialize() ile 12 aylık önizleme üretimi"
```

---

### Task 4: `personal.ts` toplamlarından planlı satırları hariç tut

**Files:**
- Modify: `app/src/lib/data/personal.ts` (`monthlyTotals`, `monthSummary`, `categoryBreakdown`)
- Test: `app/src/lib/data/personal.test.ts` (mevcut dosyaya vaka eklenir — dosyayı önce Read ile aç, mevcut `describe` bloklarının adlarını kullan)

**Interfaces:**
- Consumes: `PersonalTx.durum` (Task 1).
- Produces: davranış değişikliği — imzalar aynı kalır.

- [ ] **Step 1: Failing testleri yaz**

`app/src/lib/data/personal.test.ts` içine, ilgili `describe('monthlyTotals', ...)` / `describe('monthSummary', ...)` / `describe('categoryBreakdown', ...)` bloklarının içine (dosyayı Read ile açıp gerçek yapıyı görerek) şu üç vakayı ekle:

```ts
it('planlandi satırları toplama dahil etmez', () => {
  const rows = [
    { tarih: '2026-09-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', durum: 'planlandi' } as any,
    { tarih: '2026-09-10', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY' } as any,
  ]
  const result = monthlyTotals(rows, '2026-09-15', 1)
  expect(result.find((r) => r.ay === '2026-09')?.toplam).toBe(100)
})
```

Aynı örnek satırlarla `monthSummary(rows, 2026, 9, '2026-09-15').gider['TRY']` için `100` ve `categoryBreakdown` için planlı satırın kategori toplamına girmediğini doğrulayan birer test daha ekle (mevcut dosyadaki `kategori` alanını kullanan örnek satır formatını taklit et).

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

Run: `cd app && npx vitest run src/lib/data/personal.test.ts`
Expected: FAIL (yeni 3 test) — planlı satır şu an toplama giriyor.

- [ ] **Step 3: Filtreleri ekle**

`app/src/lib/data/personal.ts` içinde üç fonksiyonun `for (const row of rows) {` satırının hemen altına, her birine aynı satırı ekle:

```ts
    if (row.durum === 'planlandi') continue
```

(`monthlyTotals`'da mevcut `if (row.tur !== 'GIDER') continue` satırının üstüne/altına; `monthSummary` ve `categoryBreakdown`'da mevcut `if (row.tarih > today) continue` satırının hemen altına.)

- [ ] **Step 4: Testleri çalıştır, geçtiklerini doğrula**

Run: `cd app && npx vitest run src/lib/data/personal.test.ts`
Expected: PASS (tüm dosya, eskiler + yeni 3 test)

- [ ] **Step 5: Commit**

```bash
cd app && git add src/lib/data/personal.ts src/lib/data/personal.test.ts
git commit -m "fix(recurring): planlandi satırları ay/kategori toplamlarından hariç tut"
```

---

### Task 5: Harcamalar listesinde soluk turuncu görsel

**Files:**
- Modify: `app/src/routes/hesaplar/Harcamalar.svelte`
- Test: `app/src/routes/hesaplar/Harcamalar.test.ts` (mevcut dosyaya vaka eklenir)

**Interfaces:**
- Consumes: `PersonalTx.durum` (Task 1).

- [ ] **Step 1: Failing testi yaz**

`Harcamalar.test.ts`'i Read ile aç, mevcut render kurulumunu (`dataset.personalTx` ile nasıl mock veri veriliyor) kopyala ve şu vakayı ekle:

```ts
it('planlandi satırı planned-row sınıfıyla ve "Planlandı" rozetiyle gösterilir', () => {
  const { container, getByText } = render(Harcamalar, {
    props: {
      dataset: {
        ...baseDataset, // dosyadaki mevcut temel dataset sabitini kullan
        personalTx: [
          { id: 'px_1', tarih: '2026-10-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' },
        ],
      },
    },
  })
  expect(getByText('Planlandı')).toBeInTheDocument()
  expect(container.querySelector('tr.planned-row')).not.toBeNull()
})
```

(`baseDataset` yerine dosyadaki gerçek yardımcı/sabit adını kullan — Read ile kontrol et.)

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd app && npx vitest run src/routes/hesaplar/Harcamalar.test.ts`
Expected: FAIL — "Planlandı" metni yok.

- [ ] **Step 3: Şablonu ve stili güncelle**

`Harcamalar.svelte` içinde (satır ~282-290 civarı) mevcut:

```svelte
              {#each filteredRows as r (r.id)}
                {@const isFuture = r.tarih > today}
                <tr class:editing-row={editing?.id === r.id}>
                  <td data-col="tarih" class="nowrap">
                    {r.tarih}
                    {#if isFuture}
                      <span class="future-marker" title="Gelecek taksit">Gelecek</span>
                    {/if}
                  </td>
```

şu şekilde değiştir:

```svelte
              {#each filteredRows as r (r.id)}
                {@const isFuture = r.tarih > today}
                {@const isPlanned = r.durum === 'planlandi'}
                <tr class:editing-row={editing?.id === r.id} class:planned-row={isPlanned}>
                  <td data-col="tarih" class="nowrap">
                    {r.tarih}
                    {#if isPlanned}
                      <span class="future-marker" title="Tekrarlayan işlemden otomatik üretildi, henüz onaylanmadı">Planlandı</span>
                    {:else if isFuture}
                      <span class="future-marker" title="Gelecek taksit">Gelecek</span>
                    {/if}
                  </td>
```

`<style>` bloğunda, `tr.editing-row { ... }` kuralının altına:

```css
  tr.planned-row {
    opacity: 0.6;
  }
  tr.planned-row td[data-col='tutar'] {
    color: var(--gold);
  }
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd app && npx vitest run src/routes/hesaplar/Harcamalar.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd app && git add src/routes/hesaplar/Harcamalar.svelte src/routes/hesaplar/Harcamalar.test.ts
git commit -m "feat(recurring): Harcamalar'da planlı satırlar soluk turuncu gösterilir"
```

---

### Task 6: Router — `Tekrarlayanlar` sekmesi kaydı

**Files:**
- Modify: `app/src/router.ts`
- Test: `app/src/router.test.ts` (dosya yoksa oluştur; varsa Read ile açıp mevcut desene uy)

**Interfaces:**
- Produces: `HesapRoute` artık `'h-tekrarlar'` içeriyor; `#/h/tekrarlar` → `{ volume: 'hesaplar', route: 'h-tekrarlar' }`.

- [ ] **Step 1: Failing testi yaz**

`app/src/router.test.ts` içinde (dosya yoksa aşağıdaki gibi minimal bir dosya oluştur; varsa mevcut `describe('currentRoute', ...)` bloğuna ekle):

```ts
import { describe, it, expect } from 'vitest'
import { currentRoute, HESAP_ROUTES } from './router'

describe('currentRoute — tekrarlayanlar', () => {
  it('#/h/tekrarlar h-tekrarlar rotasına eşlenir', () => {
    location.hash = '#/h/tekrarlar'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-tekrarlar' })
  })

  it('HESAP_ROUTES listesinde Tekrarlayanlar sekmesi var', () => {
    expect(HESAP_ROUTES.some((r) => r.id === 'h-tekrarlar' && r.label === 'Tekrarlayanlar')).toBe(true)
  })
})
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd app && npx vitest run src/router.test.ts`
Expected: FAIL — `h-tekrarlar` tanımlı değil.

- [ ] **Step 3: `router.ts`'i güncelle**

```ts
export type HesapRoute = 'h-hesaplar' | 'h-ozet' | 'h-harcamalar' | 'h-taksitler' | 'h-tekrarlar' | 'h-borclar' | 'h-hesap'
```

```ts
export const HESAP_ROUTES: RouteEntry<HesapRoute>[] = [
  { id: 'h-hesaplar', path: '#/h/hesaplar', label: 'Hesaplar' },
  { id: 'h-ozet', path: '#/h/ozet', label: 'Özet' },
  { id: 'h-harcamalar', path: '#/h/harcamalar', label: 'Harcamalar' },
  { id: 'h-taksitler', path: '#/h/taksitler', label: 'Taksitler' },
  { id: 'h-tekrarlar', path: '#/h/tekrarlar', label: 'Tekrarlayanlar' },
  { id: 'h-borclar', path: '#/h/borclar', label: 'Borçlar' },
]
```

`currentRoute()` içindeki `hesapMap`'e ekle:

```ts
    const hesapMap: Record<string, HesapRoute> = {
      hesaplar: 'h-hesaplar',
      ozet: 'h-ozet',
      harcamalar: 'h-harcamalar',
      taksitler: 'h-taksitler',
      tekrarlar: 'h-tekrarlar',
      borclar: 'h-borclar',
      hesap: 'h-hesap',
    }
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd app && npx vitest run src/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd app && git add src/router.ts src/router.test.ts
git commit -m "feat(recurring): Tekrarlayanlar sekmesi için rota kaydı"
```

---

### Task 7: `Tekrarlayanlar.svelte` — liste + ekleme formu

**Files:**
- Create: `app/src/routes/hesaplar/Tekrarlayanlar.svelte`
- Modify: `app/src/App.svelte` (import + `pages` map)
- Test: `app/src/routes/hesaplar/Tekrarlayanlar.test.ts`

**Interfaces:**
- Consumes: `RecurringRule`, `materialize` (Task 3), `appendRecord`/`appendRecords`/`updateRecord` (Task 1-2), `newRecurringRuleId` (Task 1), `Borclar.svelte`'deki prop/`isDrive` deseni.
- Produces: kural listesi + "Yeni Ekle" formu; kural kaydedilince `materialize` çağrılıp fark `personal_tx`'e `appendRecords` ile yazılır.

- [ ] **Step 1: Failing testleri yaz**

`app/src/routes/hesaplar/Tekrarlayanlar.test.ts` (mevcut `Borclar.test.ts`'i Read ile açıp render/harness deseninden ilham al):

```ts
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Tekrarlayanlar from './Tekrarlayanlar.svelte'
import type { Dataset } from '../../lib/data/types'

const dataset: Dataset = {
  transactions: [], cashflows: [], snapshots: [], instruments: [], brokers: [],
  portfolios: [], meta: {} as any, fxrates: {}, assetTransfers: [],
  personalTx: [],
  recurringRules: [
    { id: 'rr_1', tur: 'GIDER', aciklama: 'Netflix', kategori: 'eglence', hesap: 'nakit', sahip: 'enis', paraBirimi: 'TRY', tutar: 229.9, gunOfMonth: 5, baslangicTarihi: '2026-01-01', bitisTarihi: null, aktif: true, olusturulma: '', kaynak: 'manual' },
  ],
  categories: [{ kod: 'eglence', ad: 'Eğlence', tur: 'GIDER', aktif: true } as any],
  personalAccounts: [{ kod: 'nakit', ad: 'Nakit', aktif: true } as any],
  people: [{ kod: 'enis', ad: 'Enis', aktif: true } as any],
}

describe('Tekrarlayanlar', () => {
  it('mevcut kuralları listeler', () => {
    const { getByText } = render(Tekrarlayanlar, { props: { dataset } })
    expect(getByText('Netflix')).toBeInTheDocument()
  })

  it('kural durdurulunca aktif=false olarak güncellenir', async () => {
    const store = { subscribe: vi.fn(), set: vi.fn() } as any
    const source = { id: 'local', save: vi.fn().mockResolvedValue(undefined), load: vi.fn() } as any
    const { getByTitle } = render(Tekrarlayanlar, { props: { dataset, source, store } })
    await fireEvent.click(getByTitle('Durdur'))
    expect(source.save).toHaveBeenCalled()
  })
})
```

Not: `store`'un gerçek `Writable<AppState>` davranışını taklit etmesi gerekiyorsa (çünkü `writeAndCommit` içinde `get(store)` çağrılıyor), `svelte/store`'un gerçek `writable(...)`'ını kullan — mock yerine `writable({ status: 'ready', dataset, derived: undefined as any, sourceText: '' })` ver. Bu, `store.ts`'deki `writeAndCommit`'in `get(store)` ve `store.set(...)` çağırdığını gördüğün için gerekli (Task 1-2'de o dosyayı zaten okudun).

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

Run: `cd app && npx vitest run src/routes/hesaplar/Tekrarlayanlar.test.ts`
Expected: FAIL — dosya yok.

- [ ] **Step 3: `Tekrarlayanlar.svelte`'i yaz**

```svelte
<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, RecurringRule } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, appendRecords, updateRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { materialize } from '../../lib/data/recurring'
  import { newRecurringRuleId } from '../../lib/data/ids'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    source,
    store,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
  } = $props()

  function todayIso() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const isDrive = $derived(Boolean(source?.save))
  const rules = $derived<RecurringRule[]>(dataset?.recurringRules ?? [])
  const categories = $derived(dataset?.categories ?? [])
  const accounts = $derived((dataset?.personalAccounts ?? []).filter((a) => a.aktif !== false))
  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))
  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod

  let showAdd = $state(false)
  let tur = $state<'GIDER' | 'GELIR'>('GIDER')
  let aciklama = $state('')
  let tutar = $state('')
  let paraBirimi = $state<'TRY' | 'USD'>('TRY')
  let kategori = $state('')
  let hesap = $state('')
  let sahip = $state('')
  let gunOfMonth = $state('1')
  let baslangicTarihi = $state(todayIso())

  let saving = $state(false)
  let error = $state<string | null>(null)
  let actionError = $state<string | null>(null)

  async function addRule() {
    if (!store || !source || !dataset) return
    error = null
    const num = Number(tutar)
    const gun = Number(gunOfMonth)
    if (!tutar || isNaN(num) || num <= 0) {
      error = 'Geçerli bir tutar girilmeli.'
      return
    }
    if (!aciklama.trim()) {
      error = 'Açıklama girilmeli.'
      return
    }
    if (!gun || gun < 1 || gun > 31) {
      error = 'Ayın günü 1-31 arasında olmalı.'
      return
    }
    saving = true
    try {
      const rule: RecurringRule = {
        id: newRecurringRuleId(),
        tur,
        aciklama: aciklama.trim(),
        kategori,
        hesap,
        sahip,
        paraBirimi,
        tutar: num,
        gunOfMonth: gun,
        baslangicTarihi,
        bitisTarihi: null,
        aktif: true,
        olusturulma: new Date().toISOString(),
        kaynak: 'manual',
      }
      await appendRecord<RecurringRule>(store, source, 'recurring_rules', rule)
      const newRows = materialize([rule], dataset.personalTx ?? [], todayIso())
      await appendRecords(store, source, 'personal_tx', newRows)
      showAdd = false
      aciklama = ''
      tutar = ''
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
        error = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — tekrar dene.'
      } else {
        error = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving = false
    }
  }

  async function toggleAktif(rule: RecurringRule) {
    if (!store || !source) return
    actionError = null
    try {
      await updateRecord<RecurringRule>(
        store, source, 'recurring_rules',
        (r) => r.id === rule.id,
        { ...rule, aktif: !rule.aktif },
      )
    } catch (e: any) {
      actionError = e instanceof Error ? e.message : String(e)
    }
  }
</script>

<div class="tekrarlar-container">
  {#if error}
    <div class="alert-error">{error}</div>
  {/if}
  {#if actionError}
    <div class="alert-error">{actionError}</div>
  {/if}

  <div class="header-row">
    <h2>Tekrarlayan İşlemler</h2>
    <button type="button" class="btn-primary" disabled={!isDrive} onclick={() => (showAdd = !showAdd)}>
      {showAdd ? 'Vazgeç' : '+ Yeni Ekle'}
    </button>
  </div>

  {#if showAdd}
    <form class="add-form" onsubmit={(e) => { e.preventDefault(); addRule(); }}>
      <div class="row">
        <div class="field">
          <label for="tk-tur">Tür</label>
          <select id="tk-tur" bind:value={tur}>
            <option value="GIDER">Gider</option>
            <option value="GELIR">Gelir</option>
          </select>
        </div>
        <div class="field flex-2">
          <label for="tk-aciklama">Açıklama</label>
          <input id="tk-aciklama" type="text" placeholder="Örn: Netflix" bind:value={aciklama} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="tk-tutar">Tutar</label>
          <input id="tk-tutar" type="number" step="0.01" bind:value={tutar} />
        </div>
        <div class="field">
          <label for="tk-para">Para Birimi</label>
          <select id="tk-para" bind:value={paraBirimi}>
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div class="field">
          <label for="tk-gun">Ayın Günü</label>
          <input id="tk-gun" type="number" min="1" max="31" bind:value={gunOfMonth} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="tk-kategori">Kategori</label>
          <select id="tk-kategori" bind:value={kategori}>
            {#each categories.filter((c) => c.tur === tur) as c}
              <option value={c.kod}>{c.ad}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="tk-hesap">Hesap</label>
          <select id="tk-hesap" bind:value={hesap}>
            {#each accounts as a}
              <option value={a.kod}>{a.ad}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="tk-sahip">Sahip</label>
          <select id="tk-sahip" bind:value={sahip}>
            {#each people as p}
              <option value={p.kod}>{p.ad}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="tk-baslangic">Başlangıç Tarihi</label>
          <input id="tk-baslangic" type="date" bind:value={baslangicTarihi} />
        </div>
      </div>
      <div class="actions">
        <button type="submit" class="btn-primary" disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </form>
  {/if}

  {#if rules.length === 0}
    <EmptyState title="Henüz tekrarlayan işlem yok" detail="Maaş veya abonelik gibi her ay tekrar eden kayıtları buradan tanımlayın." />
  {:else}
    <ul class="rule-list">
      {#each rules as r (r.id)}
        <li class="rule-row" class:pasif={!r.aktif}>
          <div class="rule-main">
            <strong>{r.aciklama}</strong>
            <span class="rule-sub">{catName(r.kategori)} · her ayın {r.gunOfMonth}'i</span>
          </div>
          <div class="rule-amount num">
            {r.paraBirimi === 'USD' ? usd(r.tutar) : tryFmt(r.tutar)}
          </div>
          <button
            type="button"
            class="btn-icon"
            title={r.aktif ? 'Durdur' : 'Devam Ettir'}
            disabled={!isDrive}
            onclick={() => toggleAktif(r)}
          >
            {r.aktif ? '⏸' : '▶'}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tekrarlar-container {
    padding: 1rem 1.25rem;
    max-width: 700px;
    margin: 0 auto;
  }
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .add-form {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 120px;
  }
  .flex-2 {
    flex: 2;
  }
  .rule-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .rule-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.6rem 0.9rem;
  }
  .rule-row.pasif {
    opacity: 0.5;
  }
  .rule-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .rule-sub {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .rule-amount {
    font-weight: 600;
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
  .alert-error {
    background: rgba(224, 86, 96, 0.12);
    color: var(--loss);
    border: 1px solid var(--loss);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
  }
</style>
```

- [ ] **Step 4: `App.svelte`'e kaydet**

`app/src/App.svelte` içinde, `import Borclar from './routes/hesaplar/Borclar.svelte'` satırının altına:

```ts
  import Tekrarlayanlar from './routes/hesaplar/Tekrarlayanlar.svelte'
```

`pages` map'inde `'h-borclar': Borclar,` satırının üstüne:

```ts
    'h-tekrarlar': Tekrarlayanlar,
```

- [ ] **Step 5: Testleri çalıştır, geçtiklerini doğrula**

Run: `cd app && npx vitest run src/routes/hesaplar/Tekrarlayanlar.test.ts`
Expected: PASS

- [ ] **Step 6: Tüm paketi çalıştır**

Run: `cd app && npm test -- --run && npm run check`
Expected: Temiz.

- [ ] **Step 7: Commit**

```bash
cd app && git add src/routes/hesaplar/Tekrarlayanlar.svelte src/routes/hesaplar/Tekrarlayanlar.test.ts src/App.svelte
git commit -m "feat(recurring): Tekrarlayanlar sekmesi — liste, ekleme, durdur/devam ettir"
```

---

### Task 8: `HarcamaFormu` — "sadece bu kayıt / bundan sonraki tüm tekrarlar"

**Files:**
- Modify: `app/src/routes/hesaplar/HarcamaFormu.svelte`
- Test: `app/src/routes/hesaplar/HarcamaFormu.test.ts` (mevcut dosyaya vaka eklenir)

**Interfaces:**
- Consumes: `updateRecords` (Task 2), `PersonalTx.tekrarKuralId`/`durum` (Task 1).

- [ ] **Step 1: Failing testi yaz**

`HarcamaFormu.test.ts`'i Read ile aç (mevcut `editing` prop'lu render deseni ve `confirmSave` tetikleme akışı için). Şu vakayı ekle:

```ts
it('planlı bir kaydın tutarı "bundan sonraki tüm tekrarlar" ile değişince kural + sonraki satırlar güncellenir', async () => {
  const editing = {
    id: 'px_2', tarih: '2026-11-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY',
    kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis',
    taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
    olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi',
  }
  const dataset = {
    /* ... mevcut testteki temel dataset alanları ... */
    personalTx: [editing],
    recurringRules: [{ id: 'rr_1', tur: 'GIDER', aciklama: 'Netflix', kategori: 'eglence', hesap: 'nakit', sahip: 'enis', paraBirimi: 'TRY', tutar: 229.9, gunOfMonth: 5, baslangicTarihi: '2026-01-01', bitisTarihi: null, aktif: true, olusturulma: '', kaynak: 'manual' }],
    categories: [{ kod: 'eglence', ad: 'Eğlence', tur: 'GIDER', aktif: true }],
    personalAccounts: [{ kod: 'nakit', ad: 'Nakit', aktif: true }],
    people: [{ kod: 'enis', ad: 'Enis', aktif: true }],
  }
  // mevcut testteki store/source mock kurulumunu kopyala
  const { getByLabelText, getByText } = render(HarcamaFormu, {
    props: { dataset, source, store, editing, onSaved: vi.fn() },
  })
  await fireEvent.input(getByLabelText('Tutar'), { target: { value: '259.90' } })
  await fireEvent.click(getByText('İncele'))
  await fireEvent.click(getByLabelText('Bundan sonraki tüm tekrarlar'))
  await fireEvent.click(getByText('Onayla ve Güncelle'))
  expect(source.save).toHaveBeenCalled()
  // dosyanın `store.datasetKey.test.ts`'teki gibi gerçek writable(store) kullanıldığı varsayımıyla:
  const saved = get(store).dataset.personalTx
  expect(saved.find((r: any) => r.id === 'px_2').tutar).toBe(259.9)
})
```

(Mevcut dosyadaki gerçek mock/harness'e göre bu iskeleti uyarla — dosyayı Read etmeden bu adımı yazma.)

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd app && npx vitest run src/routes/hesaplar/HarcamaFormu.test.ts`
Expected: FAIL — "Bundan sonraki tüm tekrarlar" etiketi yok.

- [ ] **Step 3: Formu genişlet**

`HarcamaFormu.svelte`'in `<script>` bloğuna, `let step = $state<'form' | 'confirm'>('form')` satırının altına:

```ts
  type ApplyScope = 'single' | 'future'
  let applyScope = $state<ApplyScope>('single')

  const isPlannedEdit = $derived(
    Boolean(editing?.tekrarKuralId) && editing?.durum === 'planlandi',
  )
  const plannedFieldsChanged = $derived(
    isPlannedEdit &&
      (Number(tutar) !== editing!.tutar || kategori !== editing!.kategori || hesap !== editing!.hesap),
  )
```

`confirmSave()` içindeki `if (editing) { ... }` bloğunu şu şekilde değiştir (mevcut `updateRecord` çağrısının yerini alacak şekilde):

```ts
      if (editing) {
        const patch: PersonalTx = {
          ...editing,
          tarih,
          tur,
          tutar: Number(tutar),
          paraBirimi,
          kategori,
          aciklama: aciklama.trim(),
          hesap,
          sahip,
          not: notText.trim(),
        }
        await updateRecord<PersonalTx>(store, source, 'personal_tx', (r) => r.id === editing!.id, patch, {
          allowKaynak: ['telegram', 'manual'],
        })
        if (plannedFieldsChanged && applyScope === 'future' && dataset) {
          const rule = (dataset.recurringRules ?? []).find((r) => r.id === editing!.tekrarKuralId)
          if (rule) {
            await updateRecord(
              store, source, 'recurring_rules',
              (r: any) => r.id === rule.id,
              { ...rule, tutar: Number(tutar), kategori, hesap },
            )
          }
          await updateRecords<PersonalTx>(
            store, source, 'personal_tx',
            (r) => r.tekrarKuralId === editing!.tekrarKuralId && r.durum === 'planlandi' && r.tarih >= editing!.tarih,
            (r) => ({ ...r, tutar: Number(tutar), kategori, hesap }),
          )
        }
      } else {
```

İmportlara ekle (dosyanın en üstündeki `import { appendRecord, updateRecord, load } from '../../lib/data/store'` satırını değiştir):

```ts
  import { appendRecord, updateRecord, updateRecords, load } from '../../lib/data/store'
```

Confirm-box şablonuna (`{#if isInstalment}` bloğunun altına, `<div class="actions">`'dan önce):

```svelte
      {#if plannedFieldsChanged}
        <div class="field">
          <label>
            <input type="radio" name="applyScope" value="single" bind:group={applyScope} />
            Sadece bu kayıt
          </label>
          <label>
            <input type="radio" name="applyScope" value="future" bind:group={applyScope} />
            Bundan sonraki tüm tekrarlar
          </label>
        </div>
      {/if}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd app && npx vitest run src/routes/hesaplar/HarcamaFormu.test.ts`
Expected: PASS (tüm dosya, eskiler dahil)

- [ ] **Step 5: Tüm paketi ve type-check'i çalıştır**

Run: `cd app && npm test -- --run && npm run check`
Expected: Temiz.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/routes/hesaplar/HarcamaFormu.svelte src/routes/hesaplar/HarcamaFormu.test.ts
git commit -m "feat(recurring): planlı kayıt düzenlemesinde 'bu / bundan sonrası' seçimi"
```

---

## Self-review notu (plan yazarı için, uygulayıcı bunu okumaz)

- Spec §5'teki tüm app maddeleri kapsandı: veri modeli (T1), materialize (T3), Tekrarlayanlar sekmesi (T6-T7), toplamlardan hariç tutma (T4), HarcamaFormu genişlemesi (T8), görsel stil (T5).
- Spec §4 (bot) bu plana dahil değil — ayrı plan: `2026-09-15-tekrarlayan-islemler-bot.md`.
