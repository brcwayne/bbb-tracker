# Hesaplar Sayfası Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Hesaplar volume a Money Manager-style account screen — a grouped account list with derived balances, and a per-account detail page with a month calendar whose days are marked with what went in and out, with that month's movements listed and editable underneath.

**Architecture:** Balances are never stored. One pure module, `src/lib/data/accounts.ts`, recomputes every balance, group subtotal, credit-card statement window and calendar bucket from `personal_tx.json` on each render, using a single sign rule that needs no branch on account type. Two new `tur` values (`TRANSFER`, already written by the Telegram bot; `DUZELTME`, new) join the ledger. Two new hash routes carry a parameter. Every write goes through the existing `appendRecord`/`updateRecord`/`deleteRecord` helpers and their `ConflictError` recovery.

**Tech Stack:** Svelte 5 (runes: `$props`, `$state`, `$derived`, `$derived.by`), Vite, TypeScript, Vitest + `@testing-library/svelte`. **No new dependencies** — no calendar library, no date library, no chart library.

**Spec:** `docs/superpowers/specs/2026-09-09-bbb-hesaplar-sayfasi-design.md` — read it before Task 1. Decisions are referenced as H1–H10 and sections as §N.

**Working directory:** `~/Desktop/Market/BBB/app`. Run `npm test` (Vitest) and `npm run check` (svelte-check, must stay 0 errors / 0 warnings).

## Global Constraints

Copied from spec §2. Every task's requirements implicitly include these.

- **The investment volume does not change.** Its nine hash routes, pages, charts and `USD ǀ ₺` toggle are untouched.
- **No new dependencies.** No calendar library, no date library, no chart library.
- **Nothing derived is computed inside a `.svelte` file.** Every balance, group total, statement period and calendar bucket lives in `src/lib/data/accounts.ts` and is unit-tested there. Standing project rule.
- **Writing `personal_accounts.json` must preserve unknown fields** (§3.2). Non-negotiable — it is how the Telegram bot keeps working.
- **The write path is the existing one.** `appendRecord` / `updateRecord` / `deleteRecord` from `store.ts`, with the `ConflictError` → reload → `'Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?'` pattern already used on Harcamalar and Borçlar. No new persistence mechanism.
- **Drive-gated editing.** When `source.save` is absent, every mutating control is disabled with the existing notice `'Düzenleme için Drive bağlantısı gerekiyor'`.
- **Balances count only `tarih <= today`** (H9).
- **Turkish user-facing strings** throughout, matching the existing pages' voice.
- `npm test` green and `npm run check` at 0/0 after every task.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/data/types.ts` (modify) | Widened `PersonalTx.tur`, `karsiHesap?`; `PersonalAccount.takmaAdlar?`, `simge?` |
| `src/lib/data/ids.ts` (create) | `newPersonalId()` — the one place a `px_…` id is minted |
| `src/lib/data/accounts.ts` (create) | Every derivation for both screens, pure |
| `src/lib/data/accounts.test.ts` (create) | Unit tests for the above |
| `src/router.ts` (modify) | `h-hesaplar`, `h-hesap/<kod>`, `h-borclar/<kisi>` |
| `src/App.svelte` (modify) | Five tabs, parameterised routes, new landing path |
| `src/routes/hesaplar/Hesaplar.svelte` (create) | The account list |
| `src/routes/hesaplar/HesapDetay.svelte` (create) | One account: header, calendar, totals, movements |
| `src/lib/ui/AyTakvimi.svelte` (create) | The month calendar, dumb and reusable |
| `src/routes/hesaplar/HesapFormu.svelte` (create) | Account add / edit / delete |
| `src/routes/hesaplar/TransferFormu.svelte` (create) | Transfer, and card payment as a preset of it |
| `src/routes/hesaplar/BakiyeDuzeltme.svelte` (create) | Balance correction → a `DUZELTME` row |
| `src/routes/hesaplar/HarcamaFormu.svelte` (modify) | `hesap` / `tarih` presets, `hesapKilitli` |
| `src/routes/hesaplar/Harcamalar.svelte` (modify) | Filter to `GIDER`/`GELIR` only (H10) |
| `src/routes/hesaplar/Borclar.svelte` (modify) | Optional `kisi` preselect |
| `src/fixtures/dataset.ts` (modify) | Accounts, a transfer, a correction, a card with a cut day |

---

### Task 1: Types, ids, fixture, and the two consequences of widening `tur`

Widening `PersonalTx.tur` has two immediate consequences that must land in the same commit as the widening, or the app briefly renders transfers as spending: Harcamalar must filter (H10), and `personal.ts`'s existing `'GIDER'` filters must be pinned by tests so a later refactor cannot quietly widen them.

**Files:**
- Modify: `src/lib/data/types.ts`, `src/routes/hesaplar/Harcamalar.svelte`, `src/routes/hesaplar/HarcamaFormu.svelte`, `src/fixtures/dataset.ts`
- Create: `src/lib/data/ids.ts`
- Test: `src/lib/data/personal.test.ts`, `src/routes/hesaplar/Harcamalar.test.ts`

**Interfaces:**
- Produces: `PersonalTx.tur: 'GIDER' | 'GELIR' | 'TRANSFER' | 'DUZELTME'`, `PersonalTx.karsiHesap?: string`, `PersonalAccount.takmaAdlar?: string[]`, `PersonalAccount.simge?: string`, and `newPersonalId(): string` from `src/lib/data/ids.ts`. Every later task depends on all four.

- [ ] **Step 1: Read the spec sections that govern this task**

Read §3.1, §3.2 and H10 of `docs/superpowers/specs/2026-09-09-bbb-hesaplar-sayfasi-design.md`. The `takmaAdlar` paragraph in §3.2 is the reason this field is being added — it is not cosmetic.

- [ ] **Step 2: Verify the Telegram bot is unaffected (read-only check)**

The app is about to write a `tur` value the bot has never seen. Confirm the bot filters rather than switches on it:

```bash
cd ~/Desktop/Market/BBB
grep -n 'tur"\] ==\|tur"\) ==' bbb-telegram-bot/src/data/personal_repository.py
```

Expected: `month_summary` filters `r["tur"] == "GIDER"` and `r["tur"] == "GELIR"`. If instead you find an `else` branch that treats every non-`GIDER` row as income, **stop and report** — the bot needs a patch first and that is outside this plan.

- [ ] **Step 3: Widen the types**

In `src/lib/data/types.ts`:

```ts
export interface PersonalTx {
  id: string
  tarih: string
  tur: 'GIDER' | 'GELIR' | 'TRANSFER' | 'DUZELTME'
  tutar: number
  paraBirimi: 'TRY' | 'USD'
  kategori: string
  aciklama: string
  hesap: string
  /** The receiving account on a TRANSFER. Written by the Telegram bot since
   *  the transfer flow shipped; declared here for the first time. */
  karsiHesap?: string
  sahip: string
  taksitPlaniId: string | null
  taksitNo: number | null
  taksitToplam: number | null
  not: string
  kaynak: string
  olusturulma: string
}

export interface PersonalAccount {
  kod: string
  ad: string
  tur: 'NAKIT' | 'BANKA' | 'KREDI_KARTI'
  paraBirimi: string
  sahip: string
  aktif: boolean
  /** The Telegram bot's NLP account matcher reads this. It is already in
   *  `personal_accounts.json`; any write of an account row must preserve it. */
  takmaAdlar?: string[]
  /** One emoji, rendered before the name. */
  simge?: string
  /** Statement cut day, 1–31. */
  hesapKesim?: number
  /** Payment due day, 1–31. */
  sonOdeme?: number
}
```

Note on `DUZELTME`: its `tutar` is **signed** and may be negative (§3.1). Every other `tur` keeps `tutar` positive.

- [ ] **Step 4: Extract the id helper**

Create `src/lib/data/ids.ts`:

```ts
/** Mints a personal-ledger row id. The `px_` prefix and 12 hex digits match
 *  the Telegram bot's `derive_entry_id`, so a file written by both stays
 *  coherent. */
export function newPersonalId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(6))
  return 'px_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
}
```

In `src/routes/hesaplar/HarcamaFormu.svelte`, delete the two inline lines that build `rand` and `id` and use the helper:

```ts
import { newPersonalId } from '../../lib/data/ids'
// …
const newRecord: PersonalTx = {
  id: newPersonalId(),
  // … unchanged
}
```

- [ ] **Step 5: Write the failing test for the `personal.ts` guarantee**

Append to `src/lib/data/personal.test.ts` (the `tx` factory and `TODAY` already exist at the top of that file):

```ts
describe('yeni tur değerleri harcama figürlerine sızmaz', () => {
  const rows = [
    tx({ id: 'g', tarih: '2026-09-02', tutar: 100 }),
    tx({ id: 't', tarih: '2026-09-03', tur: 'TRANSFER', tutar: 5000, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA', kategori: 'transfer' }),
    tx({ id: 'd', tarih: '2026-09-04', tur: 'DUZELTME', tutar: -250, kategori: 'duzeltme' }),
  ]

  it('monthlyTotals sadece GIDER toplar', () => {
    expect(monthlyTotals(rows, TODAY)).toEqual([{ ay: '2026-09', para: 'TRY', toplam: 100 }])
  })

  it('monthSummary transfer ve düzeltmeyi saymaz', () => {
    expect(monthSummary(rows, 2026, 9, TODAY)).toEqual({ gider: { TRY: 100 }, gelir: {}, adet: 1 })
  })

  it('categoryBreakdown transfer ve düzeltme kategorisi üretmez', () => {
    expect(categoryBreakdown(rows, 2026, 9, TODAY, 'TRY')).toEqual([{ kod: 'market', toplam: 100 }])
  })
})
```

- [ ] **Step 6: Run it**

```bash
cd ~/Desktop/Market/BBB/app && npx vitest run src/lib/data/personal.test.ts
```

Expected: **PASS.** These functions already filter on `'GIDER'`, so this test passes on the first run. That is the point — it is a regression pin, not a driver. If it *fails*, `personal.ts` is leakier than the spec assumed; fix `personal.ts`, not the test.

- [ ] **Step 7: Filter Harcamalar (H10)**

In `src/routes/hesaplar/Harcamalar.svelte`, the `allRows` derivation currently takes every row. Narrow it:

```ts
const allRows = $derived<PersonalTx[]>(
  (dataset?.personalTx ?? []).filter((r) => r.tur === 'GIDER' || r.tur === 'GELIR'),
)
```

Leave everything else on that page alone. Transfers and corrections are reachable from the account detail (Task 9).

- [ ] **Step 8: Write the failing test for the Harcamalar filter**

Append to `src/routes/hesaplar/Harcamalar.test.ts`, following that file's existing dataset-override style:

```ts
it('transfer ve düzeltme satırlarını harcama listesine koymaz', () => {
  const ds: Dataset = {
    ...fixture,
    personalTx: [
      { id: 'px_g', tarih: '2026-09-02', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY', kategori: 'market', aciklama: 'Market', hesap: 'NAKIT', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'telegram', olusturulma: '2026-09-02T10:00:00Z' },
      { id: 'px_t', tarih: '2026-09-03', tur: 'TRANSFER', tutar: 5000, paraBirimi: 'TRY', kategori: 'transfer', aciklama: 'Bankaya aktarım', hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'telegram', olusturulma: '2026-09-03T10:00:00Z' },
      { id: 'px_d', tarih: '2026-09-04', tur: 'DUZELTME', tutar: -250, paraBirimi: 'TRY', kategori: 'duzeltme', aciklama: 'Bakiye düzeltmesi', hesap: 'NAKIT', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '2026-09-04T10:00:00Z' },
    ],
  }
  const { container } = render(Harcamalar, { dataset: ds })
  expect(container.textContent).toContain('Market')
  expect(container.textContent).not.toContain('Bankaya aktarım')
  expect(container.textContent).not.toContain('Bakiye düzeltmesi')
  expect(container.textContent).toContain('1 kayıt')
})
```

- [ ] **Step 9: Run it**

```bash
npx vitest run src/routes/hesaplar/Harcamalar.test.ts
```

Expected: PASS with the Step 7 change in place. Revert Step 7 briefly to confirm it fails with `'Bankaya aktarım'` found — then restore it.

- [ ] **Step 10: Extend the fixture**

In `src/fixtures/dataset.ts`, replace the one-account `personalAccounts` array with:

```ts
  personalAccounts: [
    { kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true, simge: '💵', takmaAdlar: ['nakit', 'elden'] },
    { kod: 'GARANTI-BANKA', ad: 'Garanti Bankası', tur: 'BANKA', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true, simge: '🍀', takmaAdlar: ['garanti'] },
    { kod: 'GARANTI-DIJI', ad: 'Garanti Diji', tur: 'KREDI_KARTI', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true, simge: '🍀', hesapKesim: 15, sonOdeme: 25, takmaAdlar: ['diji'] },
    { kod: 'SAGLAM-KART', ad: 'Sağlam Kart', tur: 'KREDI_KARTI', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true, takmaAdlar: ['saglam'] },
    { kod: 'ESKI-HESAP', ad: 'Kapanmış Hesap', tur: 'BANKA', paraBirimi: 'TRY', sahip: 'ENIS', aktif: false },
  ],
```

`GARANTI-DIJI` carries a cut day and `SAGLAM-KART` deliberately does not — Task 3 needs both paths visible in the dev view. `ESKI-HESAP` is the inactive row Task 7's toggle hides.

Append these rows to the **end** of the existing `personalTx` array (do not reorder or edit the existing ones):

```ts
    { id: 'px_t1', tarih: '2026-09-03', tur: 'TRANSFER', tutar: 5000, paraBirimi: 'TRY', kategori: 'transfer', aciklama: 'Nakit → Garanti', hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'telegram', olusturulma: '2026-09-03T10:00:00Z' },
    { id: 'px_d1', tarih: '2026-09-06', tur: 'DUZELTME', tutar: -250, paraBirimi: 'TRY', kategori: 'duzeltme', aciklama: 'Bakiye düzeltmesi', hesap: 'NAKIT', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '2026-09-06T10:00:00Z' },
    { id: 'px_k1', tarih: '2026-09-03', tur: 'GIDER', tutar: 1800, paraBirimi: 'TRY', kategori: 'teknoloji', aciklama: 'Kulaklık', hesap: 'GARANTI-DIJI', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'telegram', olusturulma: '2026-09-03T14:00:00Z' },
    { id: 'px_k2', tarih: '2026-09-20', tur: 'GIDER', tutar: 900, paraBirimi: 'TRY', kategori: 'giyim', aciklama: 'Mont', hesap: 'GARANTI-DIJI', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'telegram', olusturulma: '2026-09-08T14:00:00Z' },
    { id: 'px_k3', tarih: '2026-09-08', tur: 'TRANSFER', tutar: 500, paraBirimi: 'TRY', kategori: 'transfer', aciklama: 'Kart ödemesi', hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '2026-09-08T15:00:00Z' },
```

Also add the two categories these rows reference to the fixture's `categories` array, or the account detail will render raw codes:

```ts
    { kod: 'teknoloji', ad: 'Teknoloji', tur: 'GIDER', aktif: true },
    { kod: 'giyim', ad: 'Giyim', tur: 'GIDER', aktif: true },
    { kod: 'transfer', ad: 'Transfer', tur: 'GIDER', aktif: true },
    { kod: 'duzeltme', ad: 'Bakiye düzeltmesi', tur: 'GIDER', aktif: true },
```

- [ ] **Step 11: Run the whole suite and repair the fallout**

```bash
npm test
```

`px_k1` and `px_k2` are new `GIDER` rows, and `monthlyTotals` / `monthSummary` / `categoryBreakdown` are account-agnostic — so **September's figures in the fixture move by ₺2.700, and assertions in `Ozet.test.ts`, `Harcamalar.test.ts` and possibly `Taksitler.test.ts` that hard-code fixture totals or row counts will fail.**

Update those assertions to the new figures. **Do not** solve this by removing the card rows from the fixture: without a credit card that has movements, Tasks 3 and 7 have nothing to render and the dev view shows an empty card group. Recompute by hand from the fixture, do not copy whatever number the test runner prints — a test updated to match a bug is worse than a failing test.

- [ ] **Step 12: Typecheck**

```bash
npm run check
```

Expected: 0 errors, 0 warnings. `karsiHesap` being optional means no existing construction site breaks.

- [ ] **Step 13: Commit**

```bash
git add src/lib/data/types.ts src/lib/data/ids.ts src/lib/data/personal.test.ts \
        src/routes/hesaplar/Harcamalar.svelte src/routes/hesaplar/Harcamalar.test.ts \
        src/routes/hesaplar/HarcamaFormu.svelte src/fixtures/dataset.ts \
        src/routes/hesaplar/Ozet.test.ts
git commit -m "feat(app): declare TRANSFER and DUZELTME rows in the personal ledger

The bot has been writing tur: TRANSFER with karsiHesap since the transfer
flow shipped; the app's type never declared it, so those rows rendered on
Harcamalar as if they were spending. Declare both new tur values, keep
Harcamalar to GIDER/GELIR, and pin the personal.ts filters with tests."
```

---

### Task 2: `accounts.ts` — the sign rule and account balances (H1, H9)

**Files:**
- Create: `src/lib/data/accounts.ts`
- Test: `src/lib/data/accounts.test.ts`

**Interfaces:**
- Consumes: `PersonalTx`, `PersonalAccount` from Task 1.
- Produces: `txDelta(row: PersonalTx, kod: string, para: string): number` and `accountBalances(rows: PersonalTx[], accounts: PersonalAccount[], today: string): Map<string, number>`. Tasks 3, 4, 5, 7, 9 and 12 all call one or both.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/accounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { accountBalances, txDelta } from './accounts'
import type { PersonalAccount, PersonalTx } from './types'

const tx = (o: Partial<PersonalTx>): PersonalTx => ({
  id: 'px_1', tarih: '2026-09-02', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY',
  kategori: 'market', aciklama: '', hesap: 'NAKIT', sahip: 'ENIS',
  taksitPlaniId: null, taksitNo: null, taksitToplam: null,
  not: '', kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z', ...o,
})

const acc = (o: Partial<PersonalAccount>): PersonalAccount => ({
  kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY',
  sahip: 'ENIS', aktif: true, ...o,
})

const TODAY = '2026-09-08'

describe('txDelta — tek işaret kuralı', () => {
  it('gider eksiltir, gelir artırır', () => {
    expect(txDelta(tx({ tur: 'GIDER', tutar: 100 }), 'NAKIT', 'TRY')).toBe(-100)
    expect(txDelta(tx({ tur: 'GELIR', tutar: 100 }), 'NAKIT', 'TRY')).toBe(100)
  })

  it('transfer gönderenden düşer, alana ekler', () => {
    const t = tx({ tur: 'TRANSFER', tutar: 500, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' })
    expect(txDelta(t, 'NAKIT', 'TRY')).toBe(-500)
    expect(txDelta(t, 'GARANTI-BANKA', 'TRY')).toBe(500)
  })

  it('ilgisiz hesap için sıfır döner', () => {
    const t = tx({ tur: 'TRANSFER', tutar: 500, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' })
    expect(txDelta(t, 'SAGLAM-KART', 'TRY')).toBe(0)
  })

  it('düzeltme işaretli toplanır', () => {
    expect(txDelta(tx({ tur: 'DUZELTME', tutar: -250 }), 'NAKIT', 'TRY')).toBe(-250)
    expect(txDelta(tx({ tur: 'DUZELTME', tutar: 250 }), 'NAKIT', 'TRY')).toBe(250)
  })

  it('farklı para birimindeki satır katkı vermez', () => {
    expect(txDelta(tx({ paraBirimi: 'USD', tutar: 45 }), 'NAKIT', 'TRY')).toBe(0)
  })

  it('hesabın kendine transferi netleşir', () => {
    const t = tx({ tur: 'TRANSFER', tutar: 500, hesap: 'NAKIT', karsiHesap: 'NAKIT' })
    expect(txDelta(t, 'NAKIT', 'TRY')).toBe(0)
  })
})

describe('accountBalances', () => {
  it('boş defterde her hesap sıfır', () => {
    const out = accountBalances([], [acc({}), acc({ kod: 'GARANTI-BANKA' })], TODAY)
    expect(out.get('NAKIT')).toBe(0)
    expect(out.get('GARANTI-BANKA')).toBe(0)
  })

  it('gelir, gider ve transferi birlikte toplar', () => {
    const out = accountBalances([
      tx({ id: 'a', tur: 'GELIR', tutar: 75000, tarih: '2026-09-01' }),
      tx({ id: 'b', tur: 'GIDER', tutar: 620, tarih: '2026-09-02' }),
      tx({ id: 'c', tur: 'TRANSFER', tutar: 5000, tarih: '2026-09-03', hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' }),
    ], [acc({}), acc({ kod: 'GARANTI-BANKA' })], TODAY)
    expect(out.get('NAKIT')).toBe(69380)
    expect(out.get('GARANTI-BANKA')).toBe(5000)
  })

  it('kredi kartı harcamayla eksiye iner, ödemeyle sıfıra yaklaşır', () => {
    const kart = acc({ kod: 'GARANTI-DIJI', tur: 'KREDI_KARTI' })
    const out = accountBalances([
      tx({ id: 'a', tur: 'GIDER', tutar: 1800, hesap: 'GARANTI-DIJI', tarih: '2026-09-03' }),
      tx({ id: 'b', tur: 'TRANSFER', tutar: 500, hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI', tarih: '2026-09-08' }),
    ], [kart], TODAY)
    expect(out.get('GARANTI-DIJI')).toBe(-1300)
  })

  it('gelecek tarihli satırı bakiyeye katmaz (H9)', () => {
    const out = accountBalances([
      tx({ id: 'a', tur: 'GIDER', tutar: 100, tarih: '2026-09-02' }),
      tx({ id: 'b', tur: 'GIDER', tutar: 2000, tarih: '2026-10-07' }),
    ], [acc({})], TODAY)
    expect(out.get('NAKIT')).toBe(-100)
  })

  it('kuruş yuvarlamasını iki basamakta tutar', () => {
    const out = accountBalances([
      tx({ id: 'a', tur: 'GIDER', tutar: 0.1 }),
      tx({ id: 'b', tur: 'GIDER', tutar: 0.2 }),
    ], [acc({})], TODAY)
    expect(out.get('NAKIT')).toBe(-0.3)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/data/accounts.test.ts
```

Expected: FAIL — `Failed to resolve import "./accounts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/data/accounts.ts`:

```ts
import type { PersonalAccount, PersonalTx } from './types'

/** Two decimals, and never `-0`. `Math.round(-0.001 * 100) / 100` yields `-0`,
 *  which `toEqual(0)` rejects — an empty statement window would fail a test
 *  that is otherwise correct. */
const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

/**
 * What one row contributes to one account's balance, in that account's own
 * currency. This is the single sign rule (spec §3.3) — a credit card needs no
 * special case: spending pushes it negative, an incoming transfer pulls it
 * back toward zero.
 *
 * Both sides are accumulated rather than returned early, so a row whose
 * `hesap` and `karsiHesap` are the same account nets to zero instead of
 * counting once.
 */
export function txDelta(row: PersonalTx, kod: string, para: string): number {
  if (row.paraBirimi !== para) return 0
  let d = 0
  if (row.hesap === kod) {
    if (row.tur === 'GIDER') d -= row.tutar
    else if (row.tur === 'GELIR') d += row.tutar
    else if (row.tur === 'TRANSFER') d -= row.tutar
    else if (row.tur === 'DUZELTME') d += row.tutar // already signed
  }
  if (row.tur === 'TRANSFER' && row.karsiHesap === kod) d += row.tutar
  return d
}

/** Balance per account code, counting only `tarih <= today` (H9). */
export function accountBalances(
  rows: PersonalTx[],
  accounts: PersonalAccount[],
  today: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of accounts) {
    let sum = 0
    for (const r of rows) {
      if (r.tarih > today) continue
      sum += txDelta(r, a.kod, a.paraBirimi)
    }
    out.set(a.kod, round2(sum))
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/data/accounts.test.ts && npm run check
```

Expected: all tests PASS, check 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/accounts.ts src/lib/data/accounts.test.ts
git commit -m "feat(app): derive account balances with one sign rule

One formula covers cash, bank and credit card: a card goes negative on
spend and back toward zero on an incoming transfer, with no branch on
account type anywhere in the balance code."
```

---

### Task 3: `accounts.ts` — credit-card statement windows (H4)

**Files:**
- Modify: `src/lib/data/accounts.ts`
- Test: `src/lib/data/accounts.test.ts`

**Interfaces:**
- Consumes: `txDelta` (Task 2).
- Produces: `cardStatement(rows: PersonalTx[], account: PersonalAccount, today: string): { buAy: number; gelecekAy: number; toplamBorc: number }`. Tasks 4, 7 and 9 render it.

Read spec §4.1 first, including the **Signs, explicitly** paragraph: `toplamBorc` stays negative, while `buAy` / `gelecekAy` are positive magnitudes of the amount to pay.

The `hesapKesim`-absent fallback is not a separate code path: a cut day of 31 clamps to the last day of every month, which makes the windows exactly the calendar months. Implement it as `const kesim = account.hesapKesim ?? 31`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/accounts.test.ts` (add `cardStatement` to the import at the top):

```ts
describe('cardStatement', () => {
  const kart = acc({ kod: 'GARANTI-DIJI', tur: 'KREDI_KARTI', hesapKesim: 15 })
  const kartSatiri = (o: Partial<PersonalTx>) =>
    tx({ hesap: 'GARANTI-DIJI', tur: 'GIDER', ...o })

  it('kesim gününe göre dönemi böler', () => {
    // TODAY = 2026-09-08 → ilk kesim 2026-09-15, önceki 2026-08-15
    const out = cardStatement([
      kartSatiri({ id: 'a', tarih: '2026-08-20', tutar: 1000 }), // bu dönem
      kartSatiri({ id: 'b', tarih: '2026-09-03', tutar: 800 }),  // bu dönem
      kartSatiri({ id: 'c', tarih: '2026-09-20', tutar: 900 }),  // gelecek dönem
      kartSatiri({ id: 'd', tarih: '2026-08-10', tutar: 500 }),  // geçmiş dönem
    ], kart, TODAY)
    expect(out.buAy).toBe(1800)
    expect(out.gelecekAy).toBe(900)
  })

  it('toplam borç negatif kalır ve geleceği saymaz', () => {
    const out = cardStatement([
      kartSatiri({ id: 'a', tarih: '2026-09-03', tutar: 1800 }),
      kartSatiri({ id: 'b', tarih: '2026-09-20', tutar: 900 }),
    ], kart, TODAY)
    expect(out.toplamBorc).toBe(-1800)
  })

  it('karta gelen ödeme dönem borcunu azaltır', () => {
    const out = cardStatement([
      kartSatiri({ id: 'a', tarih: '2026-09-03', tutar: 1800 }),
      tx({ id: 'b', tarih: '2026-09-05', tur: 'TRANSFER', tutar: 500, hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI' }),
    ], kart, TODAY)
    expect(out.buAy).toBe(1300)
  })

  it('kesim günü yoksa takvim ayına düşer', () => {
    const kesimsiz = acc({ kod: 'SAGLAM-KART', tur: 'KREDI_KARTI' })
    const out = cardStatement([
      tx({ id: 'a', hesap: 'SAGLAM-KART', tarih: '2026-09-03', tutar: 300 }),
      tx({ id: 'b', hesap: 'SAGLAM-KART', tarih: '2026-09-30', tutar: 200 }),
      tx({ id: 'c', hesap: 'SAGLAM-KART', tarih: '2026-10-02', tutar: 700 }),
      tx({ id: 'd', hesap: 'SAGLAM-KART', tarih: '2026-08-29', tutar: 400 }),
    ], kesimsiz, TODAY)
    expect(out.buAy).toBe(500)
    expect(out.gelecekAy).toBe(700)
  })

  it('kesim günü 1 ise dönem ayın başında kapanır', () => {
    const k1 = acc({ kod: 'K1', tur: 'KREDI_KARTI', hesapKesim: 1 })
    // TODAY = 2026-09-08 → bu ayın 1'i geçti, ilk kesim 2026-10-01, önceki 2026-09-01
    const out = cardStatement([
      tx({ id: 'a', hesap: 'K1', tarih: '2026-09-02', tutar: 300 }),
      tx({ id: 'b', hesap: 'K1', tarih: '2026-10-01', tutar: 400 }),
      tx({ id: 'c', hesap: 'K1', tarih: '2026-10-02', tutar: 500 }),
      tx({ id: 'd', hesap: 'K1', tarih: '2026-09-01', tutar: 900 }),
    ], k1, TODAY)
    expect(out.buAy).toBe(700)
    expect(out.gelecekAy).toBe(500)
  })

  it('kesim günü 31 ise kısa ayda ayın sonuna kırpılır', () => {
    const k31 = acc({ kod: 'K31', tur: 'KREDI_KARTI', hesapKesim: 31 })
    // 2026-11-08 → ilk kesim 2026-11-30 (Kasım 30 çeker), önceki 2026-10-31
    const out = cardStatement([
      tx({ id: 'a', hesap: 'K31', tarih: '2026-11-30', tutar: 100 }),
      tx({ id: 'b', hesap: 'K31', tarih: '2026-12-01', tutar: 200 }),
    ], k31, '2026-11-08')
    expect(out.buAy).toBe(100)
    expect(out.gelecekAy).toBe(200)
  })

  it('kesim günü 30 ise şubatta ayın sonuna kırpılır', () => {
    const k30 = acc({ kod: 'K30', tur: 'KREDI_KARTI', hesapKesim: 30 })
    // 2026-02-10 → ilk kesim 2026-02-28 (2026 artık yıl değil)
    const out = cardStatement([
      tx({ id: 'a', hesap: 'K30', tarih: '2026-02-28', tutar: 100 }),
      tx({ id: 'b', hesap: 'K30', tarih: '2026-03-01', tutar: 200 }),
    ], k30, '2026-02-10')
    expect(out.buAy).toBe(100)
    expect(out.gelecekAy).toBe(200)
  })

  it('bugün kesim gününün tam üstündeyse dönem bugün kapanır', () => {
    const out = cardStatement([
      tx({ id: 'a', hesap: 'GARANTI-DIJI', tarih: '2026-09-15', tutar: 100 }),
      tx({ id: 'b', hesap: 'GARANTI-DIJI', tarih: '2026-09-16', tutar: 200 }),
    ], kart, '2026-09-15')
    expect(out.buAy).toBe(100)
    expect(out.gelecekAy).toBe(200)
  })

  it('dönem alacaktaysa negatif döner', () => {
    const out = cardStatement([
      tx({ id: 'a', tarih: '2026-09-03', tur: 'TRANSFER', tutar: 500, hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI' }),
    ], kart, TODAY)
    expect(out.buAy).toBe(-500)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/data/accounts.test.ts -t cardStatement
```

Expected: FAIL — `cardStatement is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/data/accounts.ts`:

```ts
/** Last calendar day of a 1-based month. `Date.UTC`'s month argument is
 *  0-based, so `(y, m, 0)` is the last day of month `m`. */
function lastDayOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** An ISO date for `day` in month `m`, clamped to the month's real length —
 *  a cut day of 31 lands on the 30th in November and the 28th in February. */
function clampedDate(y: number, m: number, day: number): string {
  const d = Math.min(day, lastDayOf(y, m))
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function shiftMonth(y: number, m: number, delta: number): [number, number] {
  const i = y * 12 + (m - 1) + delta
  return [Math.floor(i / 12), (i % 12) + 1]
}

/**
 * The card's two statement windows and its overall debt (spec §4.1).
 *
 * `toplamBorc` is the raw balance and is negative when money is owed.
 * `buAy` / `gelecekAy` are positive magnitudes of the amount to pay, which is
 * why the window sums are negated.
 *
 * With no `hesapKesim`, a cut day of 31 clamps to the last day of every month,
 * making the windows the calendar months exactly — the fallback needs no
 * separate branch.
 */
export function cardStatement(
  rows: PersonalTx[],
  account: PersonalAccount,
  today: string,
): { buAy: number; gelecekAy: number; toplamBorc: number } {
  const kesim = account.hesapKesim ?? 31
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))

  // C0 — the first cut date on or after today.
  let c0 = clampedDate(y, m, kesim)
  if (c0 < today) {
    const [ny, nm] = shiftMonth(y, m, 1)
    c0 = clampedDate(ny, nm, kesim)
  }
  const [py, pm] = shiftMonth(Number(c0.slice(0, 4)), Number(c0.slice(5, 7)), -1)
  const [ny, nm] = shiftMonth(Number(c0.slice(0, 4)), Number(c0.slice(5, 7)), 1)
  const cPrev = clampedDate(py, pm, kesim)
  const cNext = clampedDate(ny, nm, kesim)

  const window = (from: string, to: string) => {
    let sum = 0
    for (const r of rows) {
      if (r.tarih <= from || r.tarih > to) continue
      sum += txDelta(r, account.kod, account.paraBirimi)
    }
    return round2(-sum)
  }

  let borc = 0
  for (const r of rows) {
    if (r.tarih > today) continue
    borc += txDelta(r, account.kod, account.paraBirimi)
  }

  return {
    buAy: window(cPrev, c0),
    gelecekAy: window(c0, cNext),
    toplamBorc: round2(borc),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/data/accounts.test.ts && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/accounts.ts src/lib/data/accounts.test.ts
git commit -m "feat(app): credit-card statement windows with cut-day clamping

A cut day of 31 clamps to the last day of each month, which makes the
missing-hesapKesim fallback the calendar month without a second code path."
```

---

### Task 4: `accounts.ts` — groups, subtotals and the net-worth band (H3, H5)

**Files:**
- Modify: `src/lib/data/accounts.ts`
- Test: `src/lib/data/accounts.test.ts`

**Interfaces:**
- Consumes: `accountBalances` (Task 2), `cardStatement` (Task 3), `debtBalances` from `./personal` (already implemented).
- Produces: `AccountRow`, `AccountGroup`, `accountGroups(rows, accounts, debts, today, opts?)`, `netWorthBand(groups)`. Task 7 renders both.

Read spec §4, §4.2 and §5. Group order is fixed: **Nakit → Banka Hesapları → Kredi Kartı → Alacak/Verecek**. Within a group: active first, then `ad` via `localeCompare(…, 'tr')`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/accounts.test.ts` (extend the import; add `import type { Debt } from './types'`):

```ts
const debt = (o: Partial<Debt>): Debt => ({
  id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 1000,
  paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK',
  kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z', ...o,
})

describe('accountGroups', () => {
  const accounts = [
    acc({ kod: 'GARANTI-BANKA', ad: 'Garanti Bankası', tur: 'BANKA' }),
    acc({ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT' }),
    acc({ kod: 'GARANTI-DIJI', ad: 'Garanti Diji', tur: 'KREDI_KARTI', hesapKesim: 15 }),
    acc({ kod: 'ESKI', ad: 'Kapanmış', tur: 'BANKA', aktif: false }),
  ]

  it('grupları sabit sırada döner', () => {
    const g = accountGroups([], accounts, [], TODAY)
    expect(g.map((x) => x.tur)).toEqual(['NAKIT', 'BANKA', 'KREDI_KARTI'])
  })

  it('pasif hesabı varsayılan olarak gizler, istenince gösterir', () => {
    const gizli = accountGroups([], accounts, [], TODAY)
    expect(gizli.find((x) => x.tur === 'BANKA')!.satirlar.map((r) => r.kod)).toEqual(['GARANTI-BANKA'])
    const acik = accountGroups([], accounts, [], TODAY, { pasifDahil: true })
    expect(acik.find((x) => x.tur === 'BANKA')!.satirlar.map((r) => r.kod)).toEqual(['GARANTI-BANKA', 'ESKI'])
  })

  it('grup içinde Türkçe sıralar', () => {
    const tr = [
      acc({ kod: 'Z', ad: 'Ziraat', tur: 'BANKA' }),
      acc({ kod: 'I', ad: 'İş Bankası', tur: 'BANKA' }),
      acc({ kod: 'S', ad: 'Şeker', tur: 'BANKA' }),
    ]
    const g = accountGroups([], tr, [], TODAY)
    expect(g.find((x) => x.tur === 'BANKA')!.satirlar.map((r) => r.ad))
      .toEqual(['İş Bankası', 'Şeker', 'Ziraat'])
  })

  it('grup toplamını para birimi bazında verir', () => {
    const g = accountGroups([
      tx({ id: 'a', tur: 'GELIR', tutar: 1000, hesap: 'NAKIT', tarih: '2026-09-01' }),
    ], accounts, [], TODAY)
    expect(g.find((x) => x.tur === 'NAKIT')!.toplam).toEqual({ TRY: 1000 })
  })

  it('kart satırına dönem bilgisini iliştirir', () => {
    const g = accountGroups([
      tx({ id: 'a', hesap: 'GARANTI-DIJI', tutar: 1800, tarih: '2026-09-03' }),
    ], accounts, [], TODAY)
    const kart = g.find((x) => x.tur === 'KREDI_KARTI')!.satirlar[0]
    expect(kart.kart).toEqual({ buAy: 1800, gelecekAy: 0, toplamBorc: -1800 })
  })

  it('hesap satırı detay adresine bağlanır', () => {
    const g = accountGroups([], accounts, [], TODAY)
    expect(g.find((x) => x.tur === 'NAKIT')!.satirlar[0].href).toBe('#/h/hesap/NAKIT')
  })

  it('açık borçlardan Alacak/Verecek grubu üretir', () => {
    const g = accountGroups([], accounts, [
      debt({ id: 'd1', kisi: 'BORA', yon: 'VERDIM', tutar: 2000 }),
      debt({ id: 'd2', kisi: 'ALPER', yon: 'ALDIM', tutar: 500 }),
      debt({ id: 'd3', kisi: 'ZEK', yon: 'VERDIM', tutar: 900, durum: 'KAPALI' }),
    ], TODAY)
    const kisiler = g.find((x) => x.tur === 'KISI')!
    expect(kisiler.satirlar.map((r) => [r.kod, r.bakiye])).toEqual([['BORA', 2000], ['ALPER', -500]])
    expect(kisiler.satirlar[0].href).toBe('#/h/borclar/BORA')
    expect(kisiler.toplam).toEqual({ TRY: 1500 })
  })

  it('borç yoksa Alacak/Verecek grubunu hiç üretmez', () => {
    expect(accountGroups([], accounts, [], TODAY).some((x) => x.tur === 'KISI')).toBe(false)
  })
})

describe('netWorthBand', () => {
  it('pozitifleri varlık, negatifleri borç olarak ayırır ve toplar', () => {
    const accounts = [
      acc({ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT' }),
      acc({ kod: 'GARANTI-DIJI', ad: 'Diji', tur: 'KREDI_KARTI', hesapKesim: 15 }),
    ]
    const g = accountGroups([
      tx({ id: 'a', tur: 'GELIR', tutar: 1000, hesap: 'NAKIT', tarih: '2026-09-01' }),
      tx({ id: 'b', tur: 'GIDER', tutar: 300, hesap: 'GARANTI-DIJI', tarih: '2026-09-03' }),
    ], accounts, [], TODAY)
    expect(netWorthBand(g)).toEqual({ TRY: { varliklar: 1000, borclar: -300, toplam: 700 } })
  })

  it('para birimlerini ayrı satırlarda tutar', () => {
    const accounts = [
      acc({ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT' }),
      acc({ kod: 'USD-HESAP', ad: 'Dolar', tur: 'BANKA', paraBirimi: 'USD' }),
    ]
    const g = accountGroups([
      tx({ id: 'a', tur: 'GELIR', tutar: 1000, hesap: 'NAKIT', tarih: '2026-09-01' }),
      tx({ id: 'b', tur: 'GELIR', tutar: 40, hesap: 'USD-HESAP', paraBirimi: 'USD', tarih: '2026-09-01' }),
    ], accounts, [], TODAY)
    expect(netWorthBand(g)).toEqual({
      TRY: { varliklar: 1000, borclar: 0, toplam: 1000 },
      USD: { varliklar: 40, borclar: 0, toplam: 40 },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/data/accounts.test.ts -t accountGroups
```

Expected: FAIL — `accountGroups is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/data/accounts.ts` (add `import type { Debt } from './types'` and `import { debtBalances } from './personal'` at the top):

```ts
export interface AccountRow {
  kod: string
  ad: string
  simge?: string
  paraBirimi: string
  bakiye: number
  /** Present only on credit cards. */
  kart?: { buAy: number; gelecekAy: number; toplamBorc: number }
  href?: string
  pasif?: boolean
}

export interface AccountGroup {
  baslik: string
  tur: 'NAKIT' | 'BANKA' | 'KREDI_KARTI' | 'KISI'
  satirlar: AccountRow[]
  /** currency → subtotal */
  toplam: Record<string, number>
}

const GRUP_SIRASI = [
  { tur: 'NAKIT', baslik: 'Nakit' },
  { tur: 'BANKA', baslik: 'Banka Hesapları' },
  { tur: 'KREDI_KARTI', baslik: 'Kredi Kartı' },
] as const

const trSort = (a: string, b: string) => a.localeCompare(b, 'tr')

function toplamla(satirlar: AccountRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of satirlar) out[r.paraBirimi] = round2((out[r.paraBirimi] ?? 0) + r.bakiye)
  return out
}

/**
 * The grouped list the page renders. Groups always come back in the order of
 * `GRUP_SIRASI`, with Alacak/Verecek last and omitted entirely when there are
 * no open debts. An empty account group is still returned so the page can
 * show it — an account with no movements is a true `₺ 0,00`, not an absence.
 */
export function accountGroups(
  rows: PersonalTx[],
  accounts: PersonalAccount[],
  debts: Debt[],
  today: string,
  opts: { pasifDahil?: boolean } = {},
): AccountGroup[] {
  const gorunen = accounts.filter((a) => a.aktif || opts.pasifDahil)
  const bakiyeler = accountBalances(rows, gorunen, today)

  const gruplar: AccountGroup[] = []
  for (const { tur, baslik } of GRUP_SIRASI) {
    const uyeler = gorunen
      .filter((a) => a.tur === tur)
      .sort((a, b) => (a.aktif === b.aktif ? trSort(a.ad, b.ad) : a.aktif ? -1 : 1))

    const satirlar: AccountRow[] = uyeler.map((a) => ({
      kod: a.kod,
      ad: a.ad,
      simge: a.simge,
      paraBirimi: a.paraBirimi,
      bakiye: bakiyeler.get(a.kod) ?? 0,
      kart: a.tur === 'KREDI_KARTI' ? cardStatement(rows, a, today) : undefined,
      href: `#/h/hesap/${a.kod}`,
      pasif: a.aktif ? undefined : true,
    }))

    gruplar.push({ baslik, tur, satirlar, toplam: toplamla(satirlar) })
  }

  const kisiler = debtBalances(debts)
  if (kisiler.length > 0) {
    const satirlar: AccountRow[] = kisiler.map((k) => ({
      kod: k.kisi,
      ad: k.kisi,
      paraBirimi: k.para,
      bakiye: k.net,
      href: `#/h/borclar/${k.kisi}`,
    }))
    gruplar.push({
      baslik: 'Alacak / Verecek',
      tur: 'KISI',
      satirlar,
      toplam: toplamla(satirlar),
    })
  }

  return gruplar
}

/**
 * Varlıklar / Borçlar / Toplam per currency (spec §5). `borclar` stays
 * negative and `toplam` is the sum, not the difference — that is what makes
 * the three figures reconcile on screen.
 */
export function netWorthBand(
  groups: AccountGroup[],
): Record<string, { varliklar: number; borclar: number; toplam: number }> {
  const out: Record<string, { varliklar: number; borclar: number; toplam: number }> = {}
  for (const g of groups) {
    for (const r of g.satirlar) {
      const cur = (out[r.paraBirimi] ??= { varliklar: 0, borclar: 0, toplam: 0 })
      if (r.bakiye >= 0) cur.varliklar = round2(cur.varliklar + r.bakiye)
      else cur.borclar = round2(cur.borclar + r.bakiye)
      cur.toplam = round2(cur.varliklar + cur.borclar)
    }
  }
  return out
}
```

Note: a card's `bakiye` (not its `buAy`) is what feeds the band, so a paid-off card contributes zero rather than its statement figure.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/data/accounts.test.ts && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/accounts.ts src/lib/data/accounts.test.ts
git commit -m "feat(app): group accounts with subtotals and a net-worth band

One AccountGroup shape covers both real accounts and the derived
Alacak/Verecek people rows, so the page renders one loop rather than two."
```

---

### Task 5: `accounts.ts` — one month of an account

**Files:**
- Modify: `src/lib/data/accounts.ts`
- Test: `src/lib/data/accounts.test.ts`

**Interfaces:**
- Consumes: `txDelta` (Task 2).
- Produces: `MonthMovements` and `monthMovements(rows, account, year, month)`. Tasks 8 and 9 render it.

Read spec §3.4 (foreign-currency rows) and §6.4. Note that `monthMovements` does **not** filter on `today` — the calendar shows a whole month including future-dated instalments; only *balances* are cut at today (H9).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/accounts.test.ts`:

```ts
describe('monthMovements', () => {
  const nakit = acc({ kod: 'NAKIT', tur: 'NAKIT', paraBirimi: 'TRY' })

  it('boş ayda sıfır döner, çökmeden', () => {
    const out = monthMovements([], nakit, 2026, 9)
    expect(out.gunler.size).toBe(0)
    expect(out.kayitlar).toEqual([])
    expect(out).toMatchObject({ giris: 0, cikis: 0, net: 0, yabanciParaAdedi: 0 })
  })

  it('günleri giriş/çıkış olarak ayırır', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-09-02', tur: 'GIDER', tutar: 620 }),
      tx({ id: 'b', tarih: '2026-09-02', tur: 'GELIR', tutar: 100 }),
      tx({ id: 'c', tarih: '2026-09-05', tur: 'GIDER', tutar: 480 }),
    ], nakit, 2026, 9)
    expect(out.gunler.get(2)).toEqual({ giris: 100, cikis: 620, adet: 2 })
    expect(out.gunler.get(5)).toEqual({ giris: 0, cikis: 480, adet: 1 })
    expect(out).toMatchObject({ giris: 100, cikis: 1100, net: -1000 })
  })

  it('başka ayın satırını almaz', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-08-31', tutar: 100 }),
      tx({ id: 'b', tarih: '2026-10-01', tutar: 200 }),
    ], nakit, 2026, 9)
    expect(out.kayitlar).toEqual([])
  })

  it('gelecek tarihli satırı aya dahil eder (bakiyeden farklı)', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-09-20', tutar: 900 }),
    ], nakit, 2026, 9)
    expect(out.cikis).toBe(900)
  })

  it('transferin her iki yönünü de doğru işaretle alır', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-09-03', tur: 'TRANSFER', tutar: 5000, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' }),
      tx({ id: 'b', tarih: '2026-09-04', tur: 'TRANSFER', tutar: 200, hesap: 'GARANTI-BANKA', karsiHesap: 'NAKIT' }),
    ], nakit, 2026, 9)
    expect(out.gunler.get(3)).toEqual({ giris: 0, cikis: 5000, adet: 1 })
    expect(out.gunler.get(4)).toEqual({ giris: 200, cikis: 0, adet: 1 })
  })

  it('ilgisiz hesabın satırını hiç listelemez', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-09-03', hesap: 'GARANTI-DIJI', tutar: 1800 }),
    ], nakit, 2026, 9)
    expect(out.kayitlar).toEqual([])
  })

  it('farklı para birimindeki satırı listeler ama toplamlara katmaz', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-09-04', tutar: 45, paraBirimi: 'USD' }),
      tx({ id: 'b', tarih: '2026-09-05', tutar: 100 }),
    ], nakit, 2026, 9)
    expect(out.kayitlar.map((r) => r.id)).toEqual(['b', 'a'])
    expect(out.cikis).toBe(100)
    expect(out.yabanciParaAdedi).toBe(1)
    expect(out.gunler.has(4)).toBe(false)
  })

  it('kayıtları tarihe göre yeniden eskiye sıralar', () => {
    const out = monthMovements([
      tx({ id: 'a', tarih: '2026-09-02' }),
      tx({ id: 'b', tarih: '2026-09-09' }),
      tx({ id: 'c', tarih: '2026-09-05' }),
    ], nakit, 2026, 9)
    expect(out.kayitlar.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/data/accounts.test.ts -t monthMovements
```

Expected: FAIL — `monthMovements is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/data/accounts.ts`:

```ts
export interface DayBucket {
  giris: number
  cikis: number
  adet: number
}

export interface MonthMovements {
  /** day-of-month (1-based) → that day's in/out */
  gunler: Map<number, DayBucket>
  /** the month's rows for this account, newest first */
  kayitlar: PersonalTx[]
  giris: number
  cikis: number
  net: number
  /** rows listed but excluded from every figure because their currency
   *  differs from the account's (spec §3.4) */
  yabanciParaAdedi: number
}

/**
 * One month of one account. Unlike a balance, this is NOT cut at today —
 * the calendar shows the whole month, future-dated instalments included.
 */
export function monthMovements(
  rows: PersonalTx[],
  account: PersonalAccount,
  year: number,
  month: number,
): MonthMovements {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const gunler = new Map<number, DayBucket>()
  const kayitlar: PersonalTx[] = []
  let giris = 0
  let cikis = 0
  let yabanciParaAdedi = 0

  for (const r of rows) {
    if (!r.tarih.startsWith(prefix)) continue
    const ilgili = r.hesap === account.kod || (r.tur === 'TRANSFER' && r.karsiHesap === account.kod)
    if (!ilgili) continue

    kayitlar.push(r)

    const d = txDelta(r, account.kod, account.paraBirimi)
    if (d === 0 && r.paraBirimi !== account.paraBirimi) {
      yabanciParaAdedi++
      continue
    }

    const gun = Number(r.tarih.slice(8, 10))
    const b = gunler.get(gun) ?? { giris: 0, cikis: 0, adet: 0 }
    if (d >= 0) b.giris = round2(b.giris + d)
    else b.cikis = round2(b.cikis - d)
    b.adet++
    gunler.set(gun, b)

    if (d >= 0) giris = round2(giris + d)
    else cikis = round2(cikis - d)
  }

  kayitlar.sort((a, b) => (a.tarih === b.tarih ? b.id.localeCompare(a.id) : b.tarih.localeCompare(a.tarih)))

  return { gunler, kayitlar, giris, cikis, net: round2(giris - cikis), yabanciParaAdedi }
}
```

Note the `d === 0 && currency differs` guard: a genuinely zero-delta row in the account's own currency (a `DUZELTME` of 0, which the form refuses) still counts as a movement, while a foreign-currency row is counted as excluded exactly once.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/data/accounts.test.ts && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/accounts.ts src/lib/data/accounts.test.ts
git commit -m "feat(app): bucket one account-month into per-day in/out totals

The calendar shows the whole month including future instalments; only
balances are cut at today."
```

---

### Task 6: Routing — two parameterised routes and a fifth tab (H6)

**Files:**
- Modify: `src/router.ts`, `src/App.svelte`, `src/routes/hesaplar/Borclar.svelte`
- Test: `src/router.test.ts`

**Interfaces:**
- Produces: `HesapRoute` gains `'h-hesaplar'` and `'h-hesap'`; `CurrentRouteResult` gains `param?: string`; `FIRST_PATH.hesaplar === '#/h/hesaplar'`. Tasks 7 and 9 are mounted by this wiring.

This task ends with a **placeholder-free but minimal** `Hesaplar.svelte` and `HesapDetay.svelte` so the app compiles and routes resolve; Tasks 7 and 9 fill them in. Read spec §8.

- [ ] **Step 1: Write the failing tests**

Append to `src/router.test.ts`, matching that file's existing style of setting `location.hash` and calling `currentRoute()`:

```ts
describe('hesap rotaları', () => {
  it('#/h/hesaplar Hesaplar listesine gider', () => {
    location.hash = '#/h/hesaplar'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-hesaplar' })
  })

  it('#/h/hesap/NAKIT parametreyi ayrıştırır', () => {
    location.hash = '#/h/hesap/NAKIT'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-hesap', param: 'NAKIT' })
  })

  it('#/h/borclar/BORA kişiyi parametre olarak taşır', () => {
    location.hash = '#/h/borclar/BORA'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-borclar', param: 'BORA' })
  })

  it('parametresiz #/h/borclar hâlâ çalışır', () => {
    location.hash = '#/h/borclar'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-borclar' })
  })

  it('kodu olmayan #/h/hesap listeye düşer', () => {
    location.hash = '#/h/hesap'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-hesaplar' })
  })

  it('Hesaplar defteri artık hesap listesinde açılır', () => {
    expect(FIRST_PATH.hesaplar).toBe('#/h/hesaplar')
  })

  it('sekme şeridinde beş sekme var, detay sekme değil', () => {
    const ids = routesFor('hesaplar').map((r) => r.id)
    expect(ids).toEqual(['h-hesaplar', 'h-ozet', 'h-harcamalar', 'h-taksitler', 'h-borclar'])
  })

  it('yatırım rotaları değişmedi', () => {
    location.hash = '#/pozisyonlar'
    expect(currentRoute()).toEqual({ volume: 'yatirim', route: 'pozisyonlar' })
    expect(FIRST_PATH.yatirim).toBe('#/')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/router.test.ts
```

Expected: FAIL on the new cases.

- [ ] **Step 3: Extend the router**

In `src/router.ts`:

```ts
export type HesapRoute = 'h-hesaplar' | 'h-ozet' | 'h-harcamalar' | 'h-taksitler' | 'h-borclar' | 'h-hesap'

export const HESAP_ROUTES: RouteEntry<HesapRoute>[] = [
  { id: 'h-hesaplar', path: '#/h/hesaplar', label: 'Hesaplar' },
  { id: 'h-ozet', path: '#/h/ozet', label: 'Özet' },
  { id: 'h-harcamalar', path: '#/h/harcamalar', label: 'Harcamalar' },
  { id: 'h-taksitler', path: '#/h/taksitler', label: 'Taksitler' },
  { id: 'h-borclar', path: '#/h/borclar', label: 'Borçlar' },
]

export const FIRST_PATH: Record<Volume, string> = {
  yatirim: '#/',
  hesaplar: '#/h/hesaplar',
}

export interface CurrentRouteResult {
  volume: Volume
  route: Route | HesapRoute
  /** The path segment after a parameterised route: an account `kod` on
   *  `h-hesap`, a person `kod` on `h-borclar`. */
  param?: string
}
```

`h-hesap` is deliberately **not** in `HESAP_ROUTES` — that array is the tab strip, and the detail page is not a tab.

In `currentRoute()`, replace the `h/` branch:

```ts
  if (h.startsWith('h/')) {
    const rest = h.slice(2).replace(/^\//, '')
    const [sub, param] = rest.split('/')
    const hesapMap: Record<string, HesapRoute> = {
      hesaplar: 'h-hesaplar',
      ozet: 'h-ozet',
      harcamalar: 'h-harcamalar',
      taksitler: 'h-taksitler',
      borclar: 'h-borclar',
      hesap: 'h-hesap',
    }
    const matched = hesapMap[sub]
    if (!matched) return { volume: 'hesaplar', route: 'h-hesaplar' }
    // The detail route is meaningless without an account code.
    if (matched === 'h-hesap' && !param) return { volume: 'hesaplar', route: 'h-hesaplar' }
    return param
      ? { volume: 'hesaplar', route: matched, param: decodeURIComponent(param) }
      : { volume: 'hesaplar', route: matched }
  }
```

- [ ] **Step 4: Create the two route stubs**

`src/routes/hesaplar/Hesaplar.svelte`:

```svelte
<script lang="ts">
  import type { Dataset } from '../../lib/data/types'
  let { dataset }: { dataset?: Dataset | null } = $props()
</script>

<p class="stub">Hesaplar listesi — Görev 7</p>

<style>
  .stub { padding: 2rem 1.25rem; color: var(--ink-soft); }
</style>
```

`src/routes/hesaplar/HesapDetay.svelte`:

```svelte
<script lang="ts">
  import type { Dataset } from '../../lib/data/types'
  let { dataset, param }: { dataset?: Dataset | null; param?: string } = $props()
</script>

<p class="stub">Hesap detayı: {param} — Görev 9</p>

<style>
  .stub { padding: 2rem 1.25rem; color: var(--ink-soft); }
</style>
```

- [ ] **Step 5: Wire App.svelte**

Register both pages and pass the parameter down. In `src/App.svelte`, add the imports, then:

```ts
  const pages: Record<string, any> = {
    // … investment pages unchanged …
    'h-hesaplar': Hesaplar,
    'h-ozet': Ozet,
    'h-harcamalar': Harcamalar,
    'h-taksitler': Taksitler,
    'h-borclar': Borclar,
    'h-hesap': HesapDetay,
  }
  const param = $derived(cur.param)
  const title = $derived(
    route === 'h-hesap'
      ? ($store.dataset?.personalAccounts?.find((a) => a.kod === param)?.ad ?? 'Hesap')
      : ([...ROUTES, ...HESAP_ROUTES].find((r) => r.id === route)?.label ?? 'BBB'),
  )
```

Pass `param` to the active page alongside the existing props:

```svelte
  <Active dataset={$store.dataset} derived={activeDerived} view={activeDerived} source={source} store={store} {param} />
```

Every existing page ignores an extra prop it does not declare, so this is safe across the volume boundary.

The tab strip highlights Hesaplar while the detail is open — `routesFor` returns the five tabs and `h-hesap` matches none of them, so add:

```svelte
  {#each routesFor(volume) as r}
    <a href={r.path} class:active={r.id === route || (route === 'h-hesap' && r.id === 'h-hesaplar')}>{r.label}</a>
  {/each}
```

- [ ] **Step 6: Add a person filter to Borçlar and seed it from the route**

`Borclar.svelte` has **no** filter today — it renders `balances` and `openDebts` in full. The `#/h/borclar/<kisi>` link from Task 4 is therefore useless until one exists, so this step adds it.

First the test. Append to `src/routes/hesaplar/Borclar.test.ts`:

```ts
it('param verilince sadece o kişinin kayıtlarını gösterir', () => {
  const ds: Dataset = {
    ...fixture,
    people: [
      { kod: 'BORA', ad: 'Bora', haneUyesi: false, aktif: true },
      { kod: 'ALPER', ad: 'Alper', haneUyesi: false, aktif: true },
    ],
    debts: [
      { id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: 'Bora borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' },
      { id: 'db_2', tarih: '2026-09-02', yon: 'ALDIM', kisi: 'ALPER', tutar: 500, paraBirimi: 'TRY', aciklama: 'Alper borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z' },
    ],
  }
  const { container } = render(Borclar, { dataset: ds, param: 'BORA' })
  expect(container.textContent).toContain('Bora borcu')
  expect(container.textContent).not.toContain('Alper borcu')
})

it('filtre rozetinden tüm kişilere dönülür', async () => {
  const ds: Dataset = { /* same as above */ } as Dataset
  const { container } = render(Borclar, { dataset: ds, param: 'BORA' })
  const rozet = container.querySelector('[data-testid="kisi-rozeti"]') as HTMLButtonElement
  expect(rozet).toBeTruthy()
  rozet.click()
  await Promise.resolve()
  expect(container.textContent).toContain('Alper borcu')
})

it('param yoksa herkesi gösterir', () => {
  const ds: Dataset = { /* same as above */ } as Dataset
  const { container } = render(Borclar, { dataset: ds })
  expect(container.textContent).toContain('Bora borcu')
  expect(container.textContent).toContain('Alper borcu')
})
```

Build the second and third cases' `ds` the same way as the first — repeat the literal rather than sharing a mutable object between tests.

Then the implementation. In `src/routes/hesaplar/Borclar.svelte`:

```ts
  let {
    dataset, source, store,
    param,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    param?: string
  } = $props()

  let fKisi = $state(param ?? '')

  const allDebts = $derived<Debt[]>(
    (dataset?.debts ?? []).filter((d) => !fKisi || d.kisi === fKisi),
  )
```

`allDebts` already feeds both `balances` and `openDebts`, so filtering it there is the whole change — do not filter the two derived lists separately.

Render a clearable chip above the first section when the filter is on:

```svelte
{#if fKisi}
  <button type="button" class="kisi-rozeti" data-testid="kisi-rozeti" onclick={() => (fKisi = '')}>
    {personName(fKisi)} ✕
  </button>
{/if}
```

A `param` matching no person yields an empty page rather than a silent full list — which is honest, and the chip is right there to clear it.

- [ ] **Step 7: Run the tests**

```bash
npx vitest run src/router.test.ts && npm test && npm run check
```

Expected: all PASS, 0/0. If `App.test.ts` asserts a tab count or the first tab's label, update it to the five-tab strip.

- [ ] **Step 8: Manual check**

```bash
npm run dev
```

Visit `#/h/hesaplar` (stub renders, Hesaplar tab active), `#/h/hesap/NAKIT` (stub shows `NAKIT`, Hesaplar tab still active), `#/h/hesap` (falls back to the list), and `#/pozisyonlar` (investment volume unchanged). Stop the server.

- [ ] **Step 9: Commit**

```bash
git add src/router.ts src/App.svelte src/router.test.ts \
        src/routes/hesaplar/Hesaplar.svelte src/routes/hesaplar/HesapDetay.svelte \
        src/routes/hesaplar/Borclar.svelte
git commit -m "feat(app): route to the account list and a single account

The detail route carries a parameter and is deliberately not a tab; it
highlights Hesaplar while open."
```

---

### Task 7: The account list page

**Files:**
- Modify: `src/routes/hesaplar/Hesaplar.svelte`
- Test: `src/routes/hesaplar/Hesaplar.test.ts` (create)

**Interfaces:**
- Consumes: `accountGroups`, `netWorthBand`, `AccountGroup`, `AccountRow` (Task 4); `tryFmt`, `usd` from `../../lib/format`.
- Produces: the rendered list. Task 13 adds the `+` / `✎` controls to it.

Read spec §5 for the layout, including the ASCII sketch.

- [ ] **Step 1: Load the design skill**

Invoke the `frontend-design` skill before writing any markup or CSS. This screen and the calendar in Task 8 are the two with real visual risk. The reference screenshots are a **layout** reference, not a style one — Money Manager's flat grey rows are not the standard this app is held to. The existing `--surface`, `--hairline`, `--ink-soft`, `--gain`, `--loss`, `--accent-defter` tokens and `--font-num` tabular figures are the vocabulary; do not introduce a parallel palette.

- [ ] **Step 2: Write the failing tests**

Create `src/routes/hesaplar/Hesaplar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Hesaplar from './Hesaplar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'

const TODAY = '2026-09-08'

describe('Hesaplar listesi', () => {
  it('hesap yoksa boş durum gösterir', () => {
    const ds: Dataset = { ...fixture, personalAccounts: [], debts: [] }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    expect(container.textContent).toMatch(/henüz hesap yok/i)
  })

  it('grupları sabit sırada başlıklarıyla yazar', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    const basliklar = [...container.querySelectorAll('[data-group]')].map((e) => e.getAttribute('data-group'))
    expect(basliklar).toEqual(['NAKIT', 'BANKA', 'KREDI_KARTI'])
  })

  it('varlıklar / borçlar / toplam bandını gösterir', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    const band = container.querySelector('[data-testid="net-worth"]')!
    expect(band.textContent).toContain('Varlıklar')
    expect(band.textContent).toContain('Borçlar')
    expect(band.textContent).toContain('Toplam')
  })

  it('USD kaydı yoksa dolar satırını hiç çizmez', () => {
    const ds: Dataset = {
      ...fixture,
      personalTx: fixture.personalTx!.filter((r) => r.paraBirimi === 'TRY'),
      personalAccounts: fixture.personalAccounts!.filter((a) => a.paraBirimi === 'TRY'),
    }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    expect(container.querySelectorAll('[data-currency]')).toHaveLength(1)
  })

  it('kredi kartı grubunda Bu Ay / Gelecek Ay sütunları var', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    const kart = container.querySelector('[data-group="KREDI_KARTI"]')!
    expect(kart.textContent).toContain('Bu Ay')
    expect(kart.textContent).toContain('Gelecek Ay')
  })

  it('pasif hesabı gizler, anahtar açılınca gösterir', async () => {
    const { container, getByLabelText } = render(Hesaplar, { dataset: fixture, today: TODAY })
    expect(container.textContent).not.toContain('Kapanmış Hesap')
    const toggle = getByLabelText(/pasif hesapları göster/i) as HTMLInputElement
    toggle.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Kapanmış Hesap')
  })

  it('hesap satırı detay adresine bağlanır', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    expect(container.querySelector('a[href="#/h/hesap/NAKIT"]')).toBeTruthy()
  })

  it('açık borç varsa Alacak / Verecek grubunu ekler', () => {
    const ds: Dataset = {
      ...fixture,
      debts: [{ id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' }],
    }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    expect(container.querySelector('[data-group="KISI"]')).toBeTruthy()
    expect(container.querySelector('a[href="#/h/borclar/BORA"]')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run src/routes/hesaplar/Hesaplar.test.ts
```

Expected: FAIL — the stub renders none of this.

- [ ] **Step 4: Write the page**

Replace `src/routes/hesaplar/Hesaplar.svelte`. The script is fully specified here; the markup structure below is required (the `data-*` hooks are what the tests bind to), and the styling is yours to design under Step 1's skill.

```svelte
<script lang="ts">
  import type { Dataset } from '../../lib/data/types'
  import { accountGroups, netWorthBand } from '../../lib/data/accounts'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    today?: string
  } = $props()

  let pasifDahil = $state(false)

  const accounts = $derived(dataset?.personalAccounts ?? [])
  const groups = $derived(
    accountGroups(dataset?.personalTx ?? [], accounts, dataset?.debts ?? [], today, { pasifDahil }),
  )
  const band = $derived(netWorthBand(groups))
  const paralar = $derived(Object.keys(band).sort())

  const fmt = (v: number, para: string) => (para === 'USD' ? usd(v) : tryFmt(v))
</script>

{#if accounts.length === 0}
  <div class="empty-container">
    <EmptyState
      title="Henüz hesap yok"
      detail="Nakit, banka ve kredi kartlarını ekleyince bakiyeler burada toplanır."
    />
  </div>
{:else}
  <div class="page-container">
    <section class="band" data-testid="net-worth">
      <div class="band-head">
        <span>Varlıklar</span><span>Borçlar</span><span>Toplam</span>
      </div>
      {#each paralar as para}
        <div class="band-row num" data-currency={para}>
          <span class="gain">{fmt(band[para].varliklar, para)}</span>
          <span class="loss">{fmt(band[para].borclar, para)}</span>
          <span>{fmt(band[para].toplam, para)}</span>
        </div>
      {/each}
    </section>

    {#each groups as g}
      <section class="group" data-group={g.tur}>
        <header class="group-head">
          <h3>{g.baslik}</h3>
          {#if g.tur === 'KREDI_KARTI'}
            <span class="col-caption">Bu Ay</span>
            <span class="col-caption">Gelecek Ay</span>
          {:else}
            <span class="group-total num">
              {#each Object.entries(g.toplam) as [para, v], i}{i > 0 ? ' · ' : ''}{fmt(v, para)}{/each}
            </span>
          {/if}
        </header>

        {#each g.satirlar as r (r.kod)}
          <a class="row" class:pasif={r.pasif} href={r.href}>
            <span class="row-name">
              {#if r.simge}<span class="simge">{r.simge}</span>{/if}{r.ad}
            </span>
            {#if r.kart}
              <span class="row-figures">
                <span class="num" class:loss={r.kart.buAy > 0} class:gain={r.kart.buAy < 0}>
                  {fmt(r.kart.buAy, r.paraBirimi)}
                </span>
                <span class="num sub">{fmt(r.kart.toplamBorc, r.paraBirimi)}</span>
              </span>
              <span class="num" class:loss={r.kart.gelecekAy > 0}>
                {fmt(r.kart.gelecekAy, r.paraBirimi)}
              </span>
            {:else}
              <span class="num" class:loss={r.bakiye < 0} class:gain={r.bakiye > 0}>
                {fmt(r.bakiye, r.paraBirimi)}
              </span>
            {/if}
          </a>
        {/each}
      </section>
    {/each}

    <label class="pasif-toggle">
      <input type="checkbox" bind:checked={pasifDahil} />
      Pasif hesapları göster
    </label>
  </div>
{/if}
```

Add the styles. Requirements the design must satisfy: group headers must read as headers rather than rows; the credit-card group's two columns must align with the caption row above them; the `.sub` total-debt line sits under `Bu Ay` at a smaller size in `--ink-soft`; every figure uses `--font-num` with `font-variant-numeric: tabular-nums`; rows are full-width tap targets of at least 44px; `.pasif` rows are dimmed.

Note on the group total when a group mixes currencies: the `{#each Object.entries(...)}` above prints them separated by `·`. Keep that — it is a rare case and hiding one of the two figures would be a lie.

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run src/routes/hesaplar/Hesaplar.test.ts && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 6: Look at it**

```bash
npm run dev
```

Open `#/h/hesaplar` in both themes and at a 390px width. Compare against spec §5's sketch. Fix what looks wrong before committing — this is the screen Enis opens the app to.

- [ ] **Step 7: Commit**

```bash
git add src/routes/hesaplar/Hesaplar.svelte src/routes/hesaplar/Hesaplar.test.ts
git commit -m "feat(app): the Hesaplar account list

Grouped accounts with balances, a per-currency assets/debts/total band,
and the credit-card group's Bu Ay / Gelecek Ay columns."
```

---

### Task 8: The month calendar component (H7)

**Files:**
- Create: `src/lib/ui/AyTakvimi.svelte`, `src/lib/ui/AyTakvimi.test.ts`

**Interfaces:**
- Consumes: `DayBucket` (Task 5).
- Produces: a dumb, presentational component:

```ts
{
  yil: number
  ay: number                                  // 1-based
  gunler: Map<number, DayBucket>
  paraBirimi: string
  secili?: number | null                      // selected day-of-month
  bugun?: string                              // ISO; defaults to today
  onSelect?: (gun: number | null) => void     // null clears the selection
  onAdd?: (gun: number) => void               // long-press or the + affordance
  onAyDegis?: (yil: number, ay: number) => void
}
```

It owns no data and no month state — the parent (Task 9) holds the visible month. Read spec §6.2 and §6.3.

- [ ] **Step 1: Load the design skill**

Invoke `frontend-design` before writing markup or CSS. A 7×6 grid of small cells each carrying two coloured figures goes muddy very easily; density, the alignment of figures under the day numbers, and how *today* and *selected* read without shouting are the things to get right.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/ui/AyTakvimi.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import AyTakvimi from './AyTakvimi.svelte'
import type { DayBucket } from '../data/accounts'

const gunler = new Map<number, DayBucket>([
  [2, { giris: 0, cikis: 620, adet: 1 }],
  [5, { giris: 75000, cikis: 0, adet: 1 }],
])

const base = { yil: 2026, ay: 9, gunler, paraBirimi: 'TRY', bugun: '2026-09-08' }

describe('AyTakvimi', () => {
  it('haftaya pazartesi ile başlar', () => {
    const { container } = render(AyTakvimi, base)
    const basliklar = [...container.querySelectorAll('[data-weekday]')].map((e) => e.textContent?.trim())
    expect(basliklar).toEqual(['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'])
  })

  it('ayın ilk gününü doğru sütuna koyar', () => {
    // 1 Eylül 2026 bir Salı — önünde tam bir boş hücre olmalı
    const { container } = render(AyTakvimi, base)
    expect(container.querySelectorAll('[data-outside]')).toHaveLength(1)
    expect(container.querySelector('[data-day="1"]')).toBeTruthy()
  })

  it('ayın gün sayısını doğru çizer', () => {
    const { container } = render(AyTakvimi, base)
    expect(container.querySelectorAll('[data-day]')).toHaveLength(30)
  })

  it('şubatı doğru çizer', () => {
    const { container } = render(AyTakvimi, { ...base, yil: 2026, ay: 2 })
    expect(container.querySelectorAll('[data-day]')).toHaveLength(28)
  })

  it('hareketli günü giriş ve çıkış olarak işaretler', () => {
    const { container } = render(AyTakvimi, base)
    expect(container.querySelector('[data-day="2"] [data-out]')).toBeTruthy()
    expect(container.querySelector('[data-day="5"] [data-in]')).toBeTruthy()
    expect(container.querySelector('[data-day="3"] [data-out]')).toBeFalsy()
  })

  it('bugünü işaretler', () => {
    const { container } = render(AyTakvimi, base)
    expect(container.querySelector('[data-day="8"]')!.getAttribute('data-today')).toBe('true')
  })

  it('güne tıklayınca onSelect çağırır', async () => {
    const onSelect = vi.fn()
    const { container } = render(AyTakvimi, { ...base, onSelect })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('seçili güne tekrar tıklayınca seçimi temizler', async () => {
    const onSelect = vi.fn()
    const { container } = render(AyTakvimi, { ...base, secili: 2, onSelect })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('seçili günde ekleme düğmesi belirir ve onAdd çağırır', async () => {
    const onAdd = vi.fn()
    const { container } = render(AyTakvimi, { ...base, secili: 2, onAdd })
    const ekle = container.querySelector('[data-day="2"] [data-add]') as HTMLButtonElement
    expect(ekle).toBeTruthy()
    ekle.click()
    expect(onAdd).toHaveBeenCalledWith(2)
  })

  it('ay okları onAyDegis çağırır ve yıl sınırını aşar', async () => {
    const onAyDegis = vi.fn()
    const { getByLabelText } = render(AyTakvimi, { ...base, yil: 2026, ay: 1, onAyDegis })
    ;(getByLabelText('Önceki ay') as HTMLButtonElement).click()
    expect(onAyDegis).toHaveBeenCalledWith(2025, 12)
  })

  it('gün hücresi ekran okuyucuya tarihi ve tutarları söyler', () => {
    const { container } = render(AyTakvimi, base)
    const label = container.querySelector('[data-day="2"]')!.getAttribute('aria-label')!
    expect(label).toContain('2 Eylül 2026')
    expect(label.toLowerCase()).toContain('çıkış')
  })

  it('ay dışı hücreler tıklanamaz', () => {
    const { container } = render(AyTakvimi, base)
    const disari = container.querySelector('[data-outside]') as HTMLElement
    expect(disari.tagName).not.toBe('BUTTON')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run src/lib/ui/AyTakvimi.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the component**

Create `src/lib/ui/AyTakvimi.svelte`. The grid maths is the part that must be exactly this — the Monday shift is where this kind of component is usually wrong:

```svelte
<script lang="ts">
  import type { DayBucket } from '../data/accounts'
  import { tryFmt, usd } from '../format'

  let {
    yil,
    ay,
    gunler,
    paraBirimi,
    secili = null,
    bugun = new Date().toISOString().slice(0, 10),
    onSelect,
    onAdd,
    onAyDegis,
  }: {
    yil: number
    ay: number
    gunler: Map<number, DayBucket>
    paraBirimi: string
    secili?: number | null
    bugun?: string
    onSelect?: (gun: number | null) => void
    onAdd?: (gun: number) => void
    onAyDegis?: (yil: number, ay: number) => void
  } = $props()

  const GUN_BASLIK = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
  const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

  /** getUTCDay() is 0=Sunday; the Turkish week starts Monday, so shift by one. */
  const oncekiBosluk = $derived((new Date(Date.UTC(yil, ay - 1, 1)).getUTCDay() + 6) % 7)
  const gunSayisi = $derived(new Date(Date.UTC(yil, ay, 0)).getUTCDate())
  const hucreler = $derived(
    Array.from({ length: oncekiBosluk }, () => null as number | null)
      .concat(Array.from({ length: gunSayisi }, (_, i) => i + 1)),
  )

  const bugunGun = $derived(
    bugun.startsWith(`${yil}-${String(ay).padStart(2, '0')}`) ? Number(bugun.slice(8, 10)) : -1,
  )

  /** 1.234,56 → "1,2B" — a full figure never fits a calendar cell. */
  function kisa(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M'
    if (v >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + 'B'
    return String(Math.round(v))
  }

  const tam = (v: number) => (paraBirimi === 'USD' ? usd(v) : tryFmt(v))

  function etiket(gun: number): string {
    const b = gunler.get(gun)
    const tarih = `${gun} ${AY_ADI[ay - 1]} ${yil}`
    if (!b) return `${tarih}, hareket yok`
    const parcalar: string[] = []
    if (b.giris > 0) parcalar.push(`giriş ${tam(b.giris)}`)
    if (b.cikis > 0) parcalar.push(`çıkış ${tam(b.cikis)}`)
    return `${tarih}, ${parcalar.join(', ')}`
  }

  function sec(gun: number) {
    onSelect?.(secili === gun ? null : gun)
  }

  function ayKaydir(delta: number) {
    const i = yil * 12 + (ay - 1) + delta
    onAyDegis?.(Math.floor(i / 12), (i % 12) + 1)
  }

  // Long-press (spec §6.3): cancelled by movement so scrolling never fires it,
  // and the click that follows is suppressed.
  let basmaZamani: ReturnType<typeof setTimeout> | null = null
  let uzunBasildi = $state(false)
  let baslangic = { x: 0, y: 0 }

  function basla(e: PointerEvent, gun: number) {
    uzunBasildi = false
    baslangic = { x: e.clientX, y: e.clientY }
    basmaZamani = setTimeout(() => {
      uzunBasildi = true
      onAdd?.(gun)
    }, 600)
  }
  function kimilda(e: PointerEvent) {
    if (!basmaZamani) return
    if (Math.abs(e.clientX - baslangic.x) > 8 || Math.abs(e.clientY - baslangic.y) > 8) iptal()
  }
  function iptal() {
    if (basmaZamani) clearTimeout(basmaZamani)
    basmaZamani = null
  }
  function tikla(gun: number) {
    iptal()
    if (uzunBasildi) {
      uzunBasildi = false
      return
    }
    sec(gun)
  }
</script>

<div class="takvim">
  <div class="ay-bar">
    <button type="button" aria-label="Önceki ay" onclick={() => ayKaydir(-1)}>‹</button>
    <button type="button" class="ay-adi" onclick={() => {
      const n = new Date()
      onAyDegis?.(n.getFullYear(), n.getMonth() + 1)
    }}>{AY_ADI[ay - 1]} {yil}</button>
    <button type="button" aria-label="Sonraki ay" onclick={() => ayKaydir(1)}>›</button>
  </div>

  <div class="grid">
    {#each GUN_BASLIK as g}
      <div class="weekday" data-weekday>{g}</div>
    {/each}

    {#each hucreler as gun, i}
      {#if gun === null}
        <div class="hucre disari" data-outside></div>
      {:else}
        {@const b = gunler.get(gun)}
        <button
          type="button"
          class="hucre"
          data-day={gun}
          data-today={gun === bugunGun ? 'true' : null}
          class:secili={gun === secili}
          aria-label={etiket(gun)}
          aria-pressed={gun === secili}
          onpointerdown={(e) => basla(e, gun)}
          onpointermove={kimilda}
          onpointerup={iptal}
          onpointercancel={iptal}
          onpointerleave={iptal}
          oncontextmenu={(e) => e.preventDefault()}
          onclick={() => tikla(gun)}
        >
          <span class="gun-no">{gun}</span>
          {#if b && b.giris > 0}<span class="tutar in" data-in>{kisa(b.giris)}</span>{/if}
          {#if b && b.cikis > 0}<span class="tutar out" data-out>{kisa(b.cikis)}</span>{/if}
        </button>
        {#if gun === secili}
          <button
            type="button"
            class="ekle"
            data-add
            aria-label={`${gun} ${AY_ADI[ay - 1]} için hareket ekle`}
            onclick={() => onAdd?.(gun)}
          >+</button>
        {/if}
      {/if}
    {/each}
  </div>
</div>
```

The `+` button as written is a grid sibling, which will disturb the 7-column flow. Position it **inside** the selected cell instead — absolutely positioned against a `position: relative` cell — or render it in the month bar as "9 Eylül'e ekle". Either satisfies the test's `[data-day="2"] [data-add]` selector only in the first form, so prefer the in-cell placement and adjust the markup accordingly. This is a real layout decision left to Step 1's design pass, not an unfinished step: the constraint is that the `+` lives inside the selected day's cell.

Styling requirements: cells at least 40px tall with `aspect-ratio` near 1; the day number small and top-aligned; the two figures beneath in `--gain` / `--loss`; below roughly 380px of grid width the figures give way to two dots (a `@container` query, with the DOM identical in both cases so the tests hold); *today* is a ring, *selected* is a filled `--accent-defter`; `[data-outside]` cells are blank and dimmed.

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run src/lib/ui/AyTakvimi.test.ts && npm run check
```

Expected: PASS, 0/0. If the ay-dışı test fails because trailing cells were added, note the spec only requires **leading** blanks; trailing ones are optional and must also carry `data-outside`, which would break the "exactly 1" assertion — so do not add trailing cells.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/AyTakvimi.svelte src/lib/ui/AyTakvimi.test.ts
git commit -m "feat(app): month calendar with per-day in/out marks

Weeks start Monday, long-press is cancelled by scrolling, and the + on
the selected day is the keyboard-reachable path to the same action."
```

---

### Task 9: The account detail page

**Files:**
- Modify: `src/routes/hesaplar/HesapDetay.svelte`
- Test: `src/routes/hesaplar/HesapDetay.test.ts` (create)

**Interfaces:**
- Consumes: `accountBalances`, `cardStatement`, `monthMovements` (Tasks 2, 3, 5); `AyTakvimi` (Task 8).
- Produces: the read path of the detail screen. Tasks 10–12 attach the forms to the action bar this task renders.

Read spec §6. This task is **read-only** — the action bar's buttons render and are wired to local `$state` flags, but the forms they open arrive in Tasks 10–12.

- [ ] **Step 1: Write the failing tests**

Create `src/routes/hesaplar/HesapDetay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import HesapDetay from './HesapDetay.svelte'
import { fixture } from '../../fixtures/dataset'

const TODAY = '2026-09-08'

describe('Hesap detayı', () => {
  it('bilinmeyen hesapta geri dönüş bağlantısıyla uyarı verir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'YOK', today: TODAY })
    expect(container.textContent).toMatch(/hesap bulunamadı/i)
    expect(container.querySelector('a[href="#/h/hesaplar"]')).toBeTruthy()
  })

  it('hesabın adını ve bakiyesini gösterir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Nakit')
    expect(container.querySelector('[data-testid="bakiye"]')).toBeTruthy()
  })

  it('kredi kartında Bu Ay / Gelecek Ay gösterir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'GARANTI-DIJI', today: TODAY })
    expect(container.textContent).toContain('Bu Ay')
    expect(container.textContent).toContain('Gelecek Ay')
  })

  it('takvimi bugünün ayıyla açar', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Eylül 2026')
  })

  it('ayın giriş / çıkış / net toplamını yazar', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const t = container.querySelector('[data-testid="ay-toplam"]')!
    expect(t.textContent).toContain('Giriş')
    expect(t.textContent).toContain('Çıkış')
    expect(t.textContent).toContain('Net')
  })

  it('ayın hareketlerini listeler', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Haftalık pazar')
  })

  it('güne tıklayınca listeyi o güne indirir, ay toplamı değişmez', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const oncekiToplam = container.querySelector('[data-testid="ay-toplam"]')!.textContent
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    expect(container.textContent).toContain('Haftalık pazar')
    expect(container.textContent).not.toContain('Akşam yemeği')
    expect(container.querySelector('[data-testid="ay-toplam"]')!.textContent).toBe(oncekiToplam)
  })

  it('seçili gün rozetinden seçim temizlenir', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    const rozet = container.querySelector('[data-testid="gun-rozeti"]') as HTMLButtonElement
    expect(rozet).toBeTruthy()
    rozet.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Akşam yemeği')
  })

  it('transfer satırını yönüyle okur', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Garanti Bankası')
  })

  it('Drive yoksa eylem düğmeleri pasif', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const butonlar = [...container.querySelectorAll('[data-action]')] as HTMLButtonElement[]
    expect(butonlar.length).toBeGreaterThan(0)
    expect(butonlar.every((b) => b.disabled)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/routes/hesaplar/HesapDetay.test.ts
```

Expected: FAIL — the stub renders none of this.

- [ ] **Step 3: Write the page**

Replace `src/routes/hesaplar/HesapDetay.svelte`. Script in full; markup structure required (the `data-testid` hooks are the test contract), styling under `frontend-design`.

```svelte
<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountBalances, cardStatement, monthMovements } from '../../lib/data/accounts'
  import { tryFmt, usd } from '../../lib/format'
  import AyTakvimi from '../../lib/ui/AyTakvimi.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    source,
    store,
    param,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    param?: string
    today?: string
  } = $props()

  const isDrive = $derived(Boolean(source?.save))

  const rows = $derived(dataset?.personalTx ?? [])
  const accounts = $derived(dataset?.personalAccounts ?? [])
  const account = $derived(accounts.find((a) => a.kod === param))
  const categories = $derived(dataset?.categories ?? [])
  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod
  const accName = (kod?: string) => accounts.find((a) => a.kod === kod)?.ad ?? kod ?? ''

  let yil = $state(Number(today.slice(0, 4)))
  let ay = $state(Number(today.slice(5, 7)))
  let seciliGun = $state<number | null>(null)

  const bakiye = $derived(
    account ? (accountBalances(rows, [account], today).get(account.kod) ?? 0) : 0,
  )
  const kart = $derived(
    account?.tur === 'KREDI_KARTI' ? cardStatement(rows, account, today) : null,
  )
  const hareket = $derived(
    account ? monthMovements(rows, account, yil, ay) : null,
  )
  const gorunenKayitlar = $derived(
    !hareket
      ? []
      : seciliGun === null
        ? hareket.kayitlar
        : hareket.kayitlar.filter((r) => Number(r.tarih.slice(8, 10)) === seciliGun),
  )

  const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

  const fmt = (v: number, para = account?.paraBirimi ?? 'TRY') =>
    para === 'USD' ? usd(v) : tryFmt(v)

  /** What this row did to THIS account — the same sign rule the balance uses. */
  function satirTutari(r: PersonalTx): { isaret: number; metin: string } {
    if (r.paraBirimi !== account?.paraBirimi) {
      return { isaret: 0, metin: `${r.paraBirimi === 'USD' ? usd(r.tutar) : tryFmt(r.tutar)} ${r.paraBirimi}` }
    }
    if (r.tur === 'TRANSFER') {
      const giden = r.hesap === account.kod
      return { isaret: giden ? -1 : 1, metin: `${giden ? '−' : '+'} ${fmt(r.tutar)}` }
    }
    if (r.tur === 'DUZELTME') {
      return { isaret: Math.sign(r.tutar), metin: `${r.tutar < 0 ? '−' : '+'} ${fmt(Math.abs(r.tutar))}` }
    }
    const gelir = r.tur === 'GELIR'
    return { isaret: gelir ? 1 : -1, metin: `${gelir ? '+' : '−'} ${fmt(r.tutar)}` }
  }

  function satirBasligi(r: PersonalTx): string {
    if (r.tur === 'TRANSFER') {
      return r.hesap === account?.kod
        ? `⇄ ${accName(account?.kod)} → ${accName(r.karsiHesap)}`
        : `⇄ ${accName(r.hesap)} → ${accName(account?.kod)}`
    }
    if (r.tur === 'DUZELTME') return '⚖ Bakiye düzeltmesi'
    return `${catName(r.kategori)}${r.aciklama ? ` · ${r.aciklama}` : ''}`
  }
</script>

{#if !account}
  <div class="empty-container">
    <EmptyState title="Hesap bulunamadı" detail="Bu hesap silinmiş olabilir." />
    <a class="geri" href="#/h/hesaplar">← Hesaplar</a>
  </div>
{:else}
  <div class="page-container">
    <header class="hesap-head">
      <a class="geri" href="#/h/hesaplar" aria-label="Hesaplar listesine dön">‹</a>
      <div class="baslik">
        <h2>{#if account.simge}<span class="simge">{account.simge}</span>{/if}{account.ad}</h2>
        <span class="tur">{account.tur === 'KREDI_KARTI' ? 'Kredi kartı' : account.tur === 'BANKA' ? 'Banka hesabı' : 'Nakit'}</span>
      </div>
      {#if kart}
        <div class="kart-figurler" data-testid="bakiye">
          <span class="kolon"><em>Bu Ay</em><span class="num loss">{fmt(kart.buAy)}</span></span>
          <span class="kolon"><em>Gelecek Ay</em><span class="num">{fmt(kart.gelecekAy)}</span></span>
          <span class="toplam num sub">{fmt(kart.toplamBorc)}</span>
        </div>
      {:else}
        <span class="bakiye num" data-testid="bakiye" class:loss={bakiye < 0}>{fmt(bakiye)}</span>
      {/if}
    </header>

    {#if hareket}
      <AyTakvimi
        {yil}
        {ay}
        gunler={hareket.gunler}
        paraBirimi={account.paraBirimi}
        secili={seciliGun}
        bugun={today}
        onSelect={(g) => (seciliGun = g)}
        onAdd={() => {}}
        onAyDegis={(y, m) => { yil = y; ay = m; seciliGun = null }}
      />

      <div class="ay-toplam" data-testid="ay-toplam">
        <span>Giriş <b class="num gain">{fmt(hareket.giris)}</b></span>
        <span>Çıkış <b class="num loss">{fmt(hareket.cikis)}</b></span>
        <span>Net <b class="num">{fmt(hareket.net)}</b></span>
      </div>

      {#if hareket.yabanciParaAdedi > 0}
        <p class="dipnot">
          Bu hesabın para biriminden farklı {hareket.yabanciParaAdedi} kayıt toplamlara katılmadı.
        </p>
      {/if}

      {#if seciliGun !== null}
        <button type="button" class="gun-rozeti" data-testid="gun-rozeti" onclick={() => (seciliGun = null)}>
          {seciliGun} {AY_ADI[ay - 1]} · {gorunenKayitlar.length} kayıt ✕
        </button>
      {/if}

      {#if gorunenKayitlar.length === 0}
        <p class="bos">Bu {seciliGun === null ? 'ayda' : 'günde'} hareket yok.</p>
      {:else}
        <ul class="hareketler">
          {#each gorunenKayitlar as r (r.id)}
            {@const t = satirTutari(r)}
            <li class="hareket">
              <span class="tarih num">{r.tarih.slice(8, 10)}.{r.tarih.slice(5, 7)}</span>
              <span class="ad">
                {satirBasligi(r)}
                {#if r.taksitNo != null && r.taksitToplam != null}
                  <span class="rozet">{r.taksitNo}/{r.taksitToplam}</span>
                {/if}
                {#if r.kaynak === 'telegram'}<span class="rozet kaynak">telegram</span>{/if}
                {#if r.paraBirimi !== account.paraBirimi}<span class="rozet" title="Farklı para birimi">≠</span>{/if}
              </span>
              <span class="tutar num" class:gain={t.isaret > 0} class:loss={t.isaret < 0}>{t.metin}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    <div class="eylemler">
      <button type="button" data-action="harcama" disabled={!isDrive}>+ Gider/Gelir</button>
      <button type="button" data-action="transfer" disabled={!isDrive}>⇄ Transfer</button>
      {#if account.tur === 'KREDI_KARTI'}
        <button type="button" data-action="odeme" disabled={!isDrive}>💳 Kart ödemesi</button>
      {/if}
      <button type="button" data-action="duzeltme" disabled={!isDrive}>⚖ Bakiye düzelt</button>
    </div>
    {#if !isDrive}
      <span class="drive-notice">Düzenleme için Drive bağlantısı gerekiyor</span>
    {/if}
  </div>
{/if}
```

Note the `data-testid="ay-toplam"` block reads `hareket`, never `gorunenKayitlar` — spec §6.4 requires the month's figures to survive a day filter, and the test asserts exactly that.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/routes/hesaplar/HesapDetay.test.ts && npm test && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 5: Look at it**

```bash
npm run dev
```

Open `#/h/hesap/NAKIT` and `#/h/hesap/GARANTI-DIJI` at 390px in both themes. Check that the calendar's marked days line up with the listed movements and that selecting a day does not move the month totals.

- [ ] **Step 6: Commit**

```bash
git add src/routes/hesaplar/HesapDetay.svelte src/routes/hesaplar/HesapDetay.test.ts
git commit -m "feat(app): account detail with a month calendar and movements

The month's totals are read from the month, not the filtered list, so
selecting a day narrows what you read without moving the figures."
```

---

### Task 10: Gider/Gelir from the account detail (H8)

**Files:**
- Modify: `src/routes/hesaplar/HarcamaFormu.svelte`, `src/routes/hesaplar/HesapDetay.svelte`
- Test: `src/routes/hesaplar/HarcamaFormu.test.ts`, `src/routes/hesaplar/HesapDetay.test.ts`

**Interfaces:**
- Consumes: `newPersonalId` (Task 1), the detail page's action bar (Task 9).
- Produces: `HarcamaFormu` props `hesap?: string`, `tarih?: string`, `hesapKilitli?: boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/routes/hesaplar/HarcamaFormu.test.ts`:

```ts
it('verilen hesap ve tarihle açılır', () => {
  const { container } = render(HarcamaFormu, {
    dataset: fixture, hesap: 'GARANTI-DIJI', tarih: '2026-09-12', hesapKilitli: true,
  })
  expect((container.querySelector('#hf-hesap') as HTMLSelectElement).value).toBe('GARANTI-DIJI')
  expect((container.querySelector('#hf-tarih') as HTMLInputElement).value).toBe('2026-09-12')
  expect((container.querySelector('#hf-hesap') as HTMLSelectElement).disabled).toBe(true)
})

it('hesap kilitli değilse seçilebilir kalır', () => {
  const { container } = render(HarcamaFormu, { dataset: fixture, hesap: 'NAKIT' })
  expect((container.querySelector('#hf-hesap') as HTMLSelectElement).disabled).toBe(false)
})
```

(`HarcamaFormu.svelte` prefixes its field ids with `hf-`; these are its real account and date fields.)

Append to `src/routes/hesaplar/HesapDetay.test.ts`:

```ts
it('takvimde ekleme isteği formu o tarihle açar', async () => {
  const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
  const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })
  ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
  await Promise.resolve()
  ;(container.querySelector('[data-day="2"] [data-add]') as HTMLButtonElement).click()
  await Promise.resolve()
  const tarih = container.querySelector('#hf-tarih') as HTMLInputElement
  expect(tarih.value).toBe('2026-09-02')
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/routes/hesaplar/HarcamaFormu.test.ts src/routes/hesaplar/HesapDetay.test.ts
```

Expected: FAIL — the props do not exist.

- [ ] **Step 3: Add the presets to the form**

In `HarcamaFormu.svelte`, extend `$props()` and seed the existing `$state` from them:

```ts
  let {
    dataset, source, store, editing, onSaved, onCancel,
    hesap: hesapOn,
    tarih: tarihOn,
    hesapKilitli = false,
  }: {
    /* … existing prop types … */
    hesap?: string
    tarih?: string
    hesapKilitli?: boolean
  } = $props()

  // Existing initialisers gain a preset fallback; `editing` still wins.
  let hesap = $state(editing?.hesap ?? hesapOn ?? '')
  let tarih = $state(editing?.tarih ?? tarihOn ?? new Date().toISOString().slice(0, 10))
```

Add `disabled={hesapKilitli && !editing}` to the account `<select>`. A disabled `<select>` submits nothing, but this form reads its value from `$state`, not from the DOM, so the locked value still saves.

- [ ] **Step 4: Wire the detail page**

In `HesapDetay.svelte`, add the state and the form:

```ts
  import HarcamaFormu from './HarcamaFormu.svelte'

  let formTarihi = $state<string | null>(null)
  let harcamaAcik = $state(false)
  let duzenlenen = $state<PersonalTx | null>(null)

  const iso = (gun: number) =>
    `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`

  function ekle(gun?: number) {
    formTarihi = gun ? iso(gun) : today
    duzenlenen = null
    harcamaAcik = true
  }
```

Point the calendar's `onAdd` at it — `onAdd={(g) => isDrive && ekle(g)}` — and the `data-action="harcama"` button at `ekle()`. Render the form above the calendar when open:

```svelte
{#if (harcamaAcik || duzenlenen) && dataset}
  <div class="form-modal">
    <HarcamaFormu
      {dataset} {source} {store}
      editing={duzenlenen ?? undefined}
      hesap={account.kod}
      tarih={formTarihi ?? today}
      hesapKilitli
      onSaved={() => { harcamaAcik = false; duzenlenen = null }}
      onCancel={() => { harcamaAcik = false; duzenlenen = null }}
    />
  </div>
{/if}
```

- [ ] **Step 5: Make movement rows editable and deletable**

Follow the pattern already in `Harcamalar.svelte` — read it and copy its structure rather than inventing one. On each `<li class="hareket">` add an edit control that sets `duzenlenen = r`, and a delete control that sets a `silinecek` target; render the same `confirm-delete` block with the same Turkish copy and the same `deleteRecord(..., 'personal_tx', (x) => x.id === target.id, { allowKaynak: ['telegram', 'manual'] })` call and `ConflictError` recovery.

Two exceptions from spec §6.4: a `TRANSFER` row opens the transfer form (Task 11), not `HarcamaFormu`; a `DUZELTME` row is deletable but **not** editable — render no edit control on it.

- [ ] **Step 6: Run the tests**

```bash
npm test && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/hesaplar/HarcamaFormu.svelte src/routes/hesaplar/HarcamaFormu.test.ts \
        src/routes/hesaplar/HesapDetay.svelte src/routes/hesaplar/HesapDetay.test.ts
git commit -m "feat(app): add and edit movements from the account detail

The calendar's + opens the form on the day you pressed, with the account
locked to the one you are looking at."
```

---

### Task 11: The transfer form (and card payment) (H8)

**Files:**
- Create: `src/routes/hesaplar/TransferFormu.svelte`, `src/routes/hesaplar/TransferFormu.test.ts`
- Modify: `src/routes/hesaplar/HesapDetay.svelte`

**Interfaces:**
- Consumes: `appendRecord`, `updateRecord` from `store.ts`; `newPersonalId` (Task 1).
- Produces: a component taking `{ dataset, source, store, editing?, kaynakHesap?, hedefHesap?, tarih?, baslik?, onSaved, onCancel }`.

- [ ] **Step 1: Write the failing tests**

Create `src/routes/hesaplar/TransferFormu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import TransferFormu from './TransferFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState } from '../../lib/data/store'

const makeStore = () => writable<AppState>({ status: 'ready', dataset: structuredClone(fixture) })

describe('TransferFormu', () => {
  it('kaynak ve hedefi önden doldurur', () => {
    const { container } = render(TransferFormu, {
      dataset: fixture, kaynakHesap: 'GARANTI-BANKA', hedefHesap: 'GARANTI-DIJI',
    })
    expect((container.querySelector('#t-kaynak') as HTMLSelectElement).value).toBe('GARANTI-BANKA')
    expect((container.querySelector('#t-hedef') as HTMLSelectElement).value).toBe('GARANTI-DIJI')
  })

  it('verilen başlığı gösterir', () => {
    const { container } = render(TransferFormu, { dataset: fixture, baslik: 'Kart Ödemesi' })
    expect(container.textContent).toContain('Kart Ödemesi')
  })

  it('aynı hesabı seçince kaydetmez ve uyarır', async () => {
    const store = makeStore()
    const save = vi.fn()
    const { container, getByText } = render(TransferFormu, {
      dataset: fixture, store, source: { id: 'drive', load: async () => fixture, save },
      kaynakHesap: 'NAKIT', hedefHesap: 'NAKIT',
    })
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/aynı hesap/i)
  })

  it('tutar sıfır veya negatifse kaydetmez', async () => {
    const save = vi.fn()
    const { container, getByText } = render(TransferFormu, {
      dataset: fixture, store: makeStore(), source: { id: 'drive', load: async () => fixture, save },
      kaynakHesap: 'NAKIT', hedefHesap: 'GARANTI-BANKA',
    })
    const tutar = container.querySelector('#t-tutar') as HTMLInputElement
    tutar.value = '0'
    tutar.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
  })

  it('geçerli transferi TRANSFER satırı olarak yazar', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_name: string, data: unknown) => { yazilan = data })
    const { container, getByText } = render(TransferFormu, {
      dataset: fixture, store: makeStore(), source: { id: 'drive', load: async () => fixture, save },
      kaynakHesap: 'NAKIT', hedefHesap: 'GARANTI-BANKA', tarih: '2026-09-08',
    })
    const tutar = container.querySelector('#t-tutar') as HTMLInputElement
    tutar.value = '1500'
    tutar.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(save).toHaveBeenCalledWith('personal_tx', expect.anything())
    const eklenen = yazilan[yazilan.length - 1]
    expect(eklenen).toMatchObject({
      tur: 'TRANSFER', tutar: 1500, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA',
      kategori: 'transfer', tarih: '2026-09-08', kaynak: 'manual',
    })
    expect(eklenen.id).toMatch(/^px_[0-9a-f]{12}$/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/routes/hesaplar/TransferFormu.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/routes/hesaplar/TransferFormu.svelte`. Mirror `HarcamaFormu.svelte`'s structure — read it first and follow its layout, its `saving` / `error` state, its confirm step and its `ConflictError` recovery verbatim. The parts specific to this form:

```ts
  import { newPersonalId } from '../../lib/data/ids'
  import { appendRecord, updateRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'

  let kaynak = $state(editing?.hesap ?? kaynakHesap ?? '')
  let hedef = $state(editing?.karsiHesap ?? hedefHesap ?? '')
  let tutarText = $state(editing ? String(editing.tutar) : '')
  let tarihText = $state(editing?.tarih ?? tarih ?? new Date().toISOString().slice(0, 10))
  let aciklama = $state(editing?.aciklama ?? '')

  function dogrula(): string | null {
    if (!kaynak || !hedef) return 'Kaynak ve hedef hesap seçilmeli.'
    if (kaynak === hedef) return 'Kaynak ve hedef aynı hesap olamaz.'
    const t = Number(tutarText)
    if (!Number.isFinite(t) || t <= 0) return 'Tutar sıfırdan büyük olmalı.'
    const k = accounts.find((a) => a.kod === kaynak)
    const h = accounts.find((a) => a.kod === hedef)
    if (k && h && k.paraBirimi !== h.paraBirimi)
      return 'İki hesabın para birimi farklı — bu transfer tek satırla yazılamaz.'
    return null
  }
```

On save, build the row:

```ts
  const satir: PersonalTx = {
    id: newPersonalId(),
    tarih: tarihText,
    tur: 'TRANSFER',
    tutar: Number(tutarText),
    paraBirimi: (accounts.find((a) => a.kod === kaynak)?.paraBirimi ?? 'TRY') as 'TRY' | 'USD',
    kategori: 'transfer',
    aciklama: aciklama.trim() || `${accName(kaynak)} → ${accName(hedef)}`,
    hesap: kaynak,
    karsiHesap: hedef,
    sahip: accounts.find((a) => a.kod === kaynak)?.sahip ?? 'ENIS',
    taksitPlaniId: null, taksitNo: null, taksitToplam: null,
    not: '',
    kaynak: 'manual',
    olusturulma: new Date().toISOString(),
  }
  await appendRecord<PersonalTx>(store, source, 'personal_tx', satir)
```

When `editing` is set, call `updateRecord` with `{ ...editing, ...changed fields }` and `{ allowKaynak: ['telegram', 'manual'] }`, matching how `HarcamaFormu` handles its edit branch.

The cross-currency guard exists because one `TRANSFER` row carries a single `tutar` and `paraBirimi`; two currencies would need two rows and a rate, which is out of scope (H5). Refusing is honest; silently writing one currency's amount into an account of another is not.

Field ids: `#t-kaynak`, `#t-hedef`, `#t-tutar`, `#t-tarih`, `#t-aciklama`. The title comes from the `baslik` prop, defaulting to `'Transfer'`.

- [ ] **Step 4: Wire it into the detail page**

```ts
  import TransferFormu from './TransferFormu.svelte'

  let transferAcik = $state(false)
  let transferHedefi = $state<string | null>(null)
  let transferBasligi = $state('Transfer')
  let duzenlenenTransfer = $state<PersonalTx | null>(null)
```

`data-action="transfer"` opens it with `kaynakHesap = account.kod`. `data-action="odeme"` (cards only) opens it with `hedefHesap = account.kod`, `kaynakHesap` empty, and `baslik = 'Kart Ödemesi'` — a card payment is a transfer *into* the card, so the presets are mirrored. Clicking a `TRANSFER` row's edit control sets `duzenlenenTransfer = r`.

- [ ] **Step 5: Run the tests**

```bash
npm test && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/hesaplar/TransferFormu.svelte src/routes/hesaplar/TransferFormu.test.ts \
        src/routes/hesaplar/HesapDetay.svelte
git commit -m "feat(app): transfers between accounts, and card payments

A card payment is the same form with mirrored presets — a transfer into
the card rather than out of it."
```

---

### Task 12: The balance correction (H2, H8)

**Files:**
- Create: `src/routes/hesaplar/BakiyeDuzeltme.svelte`, `src/routes/hesaplar/BakiyeDuzeltme.test.ts`
- Modify: `src/routes/hesaplar/HesapDetay.svelte`

**Interfaces:**
- Consumes: `accountBalances` (Task 2), `newPersonalId` (Task 1), `appendRecord`.
- Produces: a component taking `{ dataset, source, store, account, today, onSaved, onCancel }`.

Read spec §3.1's paragraph on why a correction stores the **delta** rather than the target balance.

- [ ] **Step 1: Write the failing tests**

Create `src/routes/hesaplar/BakiyeDuzeltme.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import BakiyeDuzeltme from './BakiyeDuzeltme.svelte'
import { fixture } from '../../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState, } from '../../lib/data/store'

const account = fixture.personalAccounts!.find((a) => a.kod === 'NAKIT')!
const TODAY = '2026-09-08'
const makeStore = () => writable<AppState>({ status: 'ready', dataset: structuredClone(fixture) })

const setTutar = async (container: HTMLElement, v: string) => {
  const el = container.querySelector('#b-gercek') as HTMLInputElement
  el.value = v
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await Promise.resolve()
}

describe('BakiyeDuzeltme', () => {
  it('hesaplanan bakiyeyi gösterir', () => {
    const { container } = render(BakiyeDuzeltme, { dataset: fixture, account, today: TODAY })
    expect(container.querySelector('[data-testid="hesaplanan"]')).toBeTruthy()
  })

  it('farkı ve yönünü sözle anlatır', async () => {
    const { container } = render(BakiyeDuzeltme, { dataset: fixture, account, today: TODAY })
    await setTutar(container, '999999')
    expect(container.textContent).toMatch(/artırılacak/i)
    await setTutar(container, '-999999')
    expect(container.textContent).toMatch(/azaltılacak/i)
  })

  it('fark sıfırsa kaydetmez', async () => {
    const save = vi.fn()
    const { container, getByText } = render(BakiyeDuzeltme, {
      dataset: fixture, account, today: TODAY, store: makeStore(),
      source: { id: 'drive', load: async () => fixture, save },
    })
    const hesaplanan = container.querySelector('[data-testid="hesaplanan"]')!.getAttribute('data-value')!
    await setTutar(container, hesaplanan)
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/fark yok/i)
  })

  it('farkı işaretli DUZELTME satırı olarak yazar', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => { yazilan = d })
    const { container, getByText } = render(BakiyeDuzeltme, {
      dataset: fixture, account, today: TODAY, store: makeStore(),
      source: { id: 'drive', load: async () => fixture, save },
    })
    const hesaplanan = Number(container.querySelector('[data-testid="hesaplanan"]')!.getAttribute('data-value'))
    await setTutar(container, String(hesaplanan - 250))
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    const eklenen = yazilan[yazilan.length - 1]
    expect(eklenen).toMatchObject({
      tur: 'DUZELTME', tutar: -250, hesap: 'NAKIT', kategori: 'duzeltme',
      tarih: TODAY, kaynak: 'manual', paraBirimi: 'TRY',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/routes/hesaplar/BakiyeDuzeltme.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/routes/hesaplar/BakiyeDuzeltme.svelte`:

```svelte
<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalAccount, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountBalances } from '../../lib/data/accounts'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { newPersonalId } from '../../lib/data/ids'
  import { tryFmt, usd } from '../../lib/format'

  let {
    dataset, source, store, account,
    today = new Date().toISOString().slice(0, 10),
    onSaved = () => {}, onCancel,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    account: PersonalAccount
    today?: string
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  const hesaplanan = $derived(
    accountBalances(dataset?.personalTx ?? [], [account], today).get(account.kod) ?? 0,
  )

  let gercekText = $state('')
  let saving = $state(false)
  let error = $state<string | null>(null)

  const fmt = (v: number) => (account.paraBirimi === 'USD' ? usd(v) : tryFmt(v))
  const fark = $derived(
    gercekText.trim() === '' || !Number.isFinite(Number(gercekText))
      ? null
      : Math.round((Number(gercekText) - hesaplanan) * 100) / 100,
  )

  async function kaydet() {
    if (!source || !store) return
    if (fark === null) { error = 'Gerçek bakiyeyi gir.'; return }
    if (fark === 0) { error = 'Fark yok — düzeltmeye gerek kalmadı.'; return }
    saving = true
    error = null
    try {
      const satir: PersonalTx = {
        id: newPersonalId(),
        tarih: today,
        tur: 'DUZELTME',
        tutar: fark,                       // signed — this is the delta
        paraBirimi: account.paraBirimi as 'TRY' | 'USD',
        kategori: 'duzeltme',
        aciklama: 'Bakiye düzeltmesi',
        hesap: account.kod,
        sahip: account.sahip,
        taksitPlaniId: null, taksitNo: null, taksitToplam: null,
        not: `Hesaplanan ${fmt(hesaplanan)} → gerçek ${fmt(Number(gercekText))}`,
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
      }
      await appendRecord<PersonalTx>(store, source, 'personal_tx', satir)
      onSaved()
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        try { await load(store, source) } catch {}
        error = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?'
      } else {
        error = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving = false
    }
  }
</script>

<div class="form-container">
  <div class="form-header">
    <h3>Bakiye Düzeltmesi</h3>
    {#if onCancel}<button type="button" class="btn-ghost" onclick={onCancel}>✕</button>{/if}
  </div>

  <p class="satir">
    Hesaplanan bakiye:
    <b class="num" data-testid="hesaplanan" data-value={hesaplanan}>{fmt(hesaplanan)}</b>
  </p>

  <label for="b-gercek">{account.ad} hesabında gerçekte ne var?</label>
  <input id="b-gercek" type="number" step="0.01" inputmode="decimal" bind:value={gercekText} />

  {#if fark !== null && fark !== 0}
    <p class="ozet">
      {account.ad} <b class="num">{fmt(Math.abs(fark))}</b>
      {fark > 0 ? 'artırılacak' : 'azaltılacak'}.
    </p>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}

  <div class="actions">
    {#if onCancel}<button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>Vazgeç</button>{/if}
    <button type="button" class="btn-add" onclick={kaydet} disabled={saving}>
      {saving ? 'Kaydediliyor…' : 'Kaydet'}
    </button>
  </div>
</div>
```

Reuse the class names `HarcamaFormu.svelte` uses so the two forms look like one family; copy the relevant style block rather than inventing new names.

- [ ] **Step 4: Wire it into the detail page**

`data-action="duzeltme"` sets `duzeltmeAcik = true`; render `<BakiyeDuzeltme {dataset} {source} {store} {account} {today} onSaved={() => (duzeltmeAcik = false)} onCancel={() => (duzeltmeAcik = false)} />`.

- [ ] **Step 5: Run the tests**

```bash
npm test && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/hesaplar/BakiyeDuzeltme.svelte src/routes/hesaplar/BakiyeDuzeltme.test.ts \
        src/routes/hesaplar/HesapDetay.svelte
git commit -m "feat(app): correct a balance by writing the difference

The row stores the delta, not the target, so a later backdated expense
still moves the balance instead of being silently absorbed."
```

---

### Task 13: Account add / edit / delete — and the field that must survive (H8)

**Files:**
- Create: `src/routes/hesaplar/HesapFormu.svelte`, `src/routes/hesaplar/HesapFormu.test.ts`
- Modify: `src/routes/hesaplar/Hesaplar.svelte`, `src/routes/hesaplar/Hesaplar.test.ts`

**Interfaces:**
- Consumes: `appendRecord`, `updateRecord`, `deleteRecord` with file kind `'personal_accounts'` (already in `Kind`).
- Produces: the account CRUD. This is the last task.

Read spec §3.2 and §7 before starting. **The preservation rule is the point of this task**, not a detail of it.

- [ ] **Step 1: Write the failing tests**

Create `src/routes/hesaplar/HesapFormu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import HesapFormu from './HesapFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState } from '../../lib/data/store'
import type { Dataset } from '../../lib/data/types'

const makeStore = (ds: Dataset) => writable<AppState>({ status: 'ready', dataset: structuredClone(ds) })

const driveSource = (save: any, ds: Dataset) => ({ id: 'drive' as const, load: async () => ds, save })

describe('HesapFormu', () => {
  it('düzenlemede bilinmeyen alanları korur', async () => {
    // The bot's alias list, plus a field this app has never heard of.
    const ds: Dataset = {
      ...fixture,
      personalAccounts: [
        { kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true,
          takmaAdlar: ['nakit', 'elden'], botAyari: 'gelecekte-eklenen-alan' } as any,
      ],
    }
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => { yazilan = d })
    const { container, getByText } = render(HesapFormu, {
      dataset: ds, store: makeStore(ds), source: driveSource(save, ds),
      editing: ds.personalAccounts![0],
    })
    const ad = container.querySelector('#h-ad') as HTMLInputElement
    ad.value = 'Cüzdan'
    ad.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(save).toHaveBeenCalledWith('personal_accounts', expect.anything())
    expect(yazilan[0]).toMatchObject({
      kod: 'NAKIT',
      ad: 'Cüzdan',
      takmaAdlar: ['nakit', 'elden'],
      botAyari: 'gelecekte-eklenen-alan',
    })
  })

  it('takma adları virgülle düzenletir', async () => {
    const ds: Dataset = {
      ...fixture,
      personalAccounts: [{ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true, takmaAdlar: ['nakit'] }],
    }
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => { yazilan = d })
    const { container, getByText } = render(HesapFormu, {
      dataset: ds, store: makeStore(ds), source: driveSource(save, ds), editing: ds.personalAccounts![0],
    })
    const t = container.querySelector('#h-takma') as HTMLInputElement
    expect(t.value).toBe('nakit')
    t.value = 'nakit, elden, peşin'
    t.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(yazilan[0].takmaAdlar).toEqual(['nakit', 'elden', 'peşin'])
  })

  it('yeni hesapta koddan slug üretir', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => { yazilan = d })
    const { container, getByText } = render(HesapFormu, {
      dataset: fixture, store: makeStore(fixture), source: driveSource(save, fixture),
    })
    const ad = container.querySelector('#h-ad') as HTMLInputElement
    ad.value = 'Şeker Bankası'
    ad.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(yazilan[yazilan.length - 1].kod).toBe('SEKER-BANKASI')
  })

  it('düzenlemede kod değiştirilemez', () => {
    const { container } = render(HesapFormu, {
      dataset: fixture, editing: fixture.personalAccounts![0],
    })
    expect((container.querySelector('#h-kod') as HTMLInputElement).disabled).toBe(true)
  })

  it('adı boş hesabı kaydetmez', async () => {
    const save = vi.fn()
    const { getByText, container } = render(HesapFormu, {
      dataset: fixture, store: makeStore(fixture), source: driveSource(save, fixture),
    })
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/ad girilmeli/i)
  })

  it('hareketi olan hesabı silmez, pasifleştirmeyi önerir', async () => {
    const save = vi.fn()
    const { getByText, container } = render(HesapFormu, {
      dataset: fixture, store: makeStore(fixture), source: driveSource(save, fixture),
      editing: fixture.personalAccounts!.find((a) => a.kod === 'NAKIT'),
    })
    ;(getByText(/sil/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(container.textContent).toMatch(/pasifleştir/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('hareketi olmayan hesabı siler', async () => {
    const ds: Dataset = {
      ...fixture,
      personalAccounts: [...fixture.personalAccounts!, { kod: 'BOS', ad: 'Boş Hesap', tur: 'BANKA', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true }],
    }
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => { yazilan = d })
    const { getByText } = render(HesapFormu, {
      dataset: ds, store: makeStore(ds), source: driveSource(save, ds),
      editing: ds.personalAccounts!.find((a) => a.kod === 'BOS'),
    })
    ;(getByText(/sil/i) as HTMLButtonElement).click()
    await Promise.resolve()
    ;(getByText(/evet, sil/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(yazilan.some((a: any) => a.kod === 'BOS')).toBe(false)
  })
})
```

Append to `src/routes/hesaplar/Hesaplar.test.ts`:

```ts
it('Drive yoksa ekleme düğmesi pasif', () => {
  const { getByLabelText } = render(Hesaplar, { dataset: fixture, today: TODAY })
  expect((getByLabelText(/hesap ekle/i) as HTMLButtonElement).disabled).toBe(true)
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/routes/hesaplar/HesapFormu.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the form**

Create `src/routes/hesaplar/HesapFormu.svelte`. The pieces that carry the risk:

```ts
  /** Turkish letters have no meaning to a foreign key; fold them to ASCII so
   *  `kod` stays safe in a hash route and in the bot's JSON. */
  function slug(ad: string): string {
    const tr: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'I', ö: 'o', ş: 's', ü: 'u' }
    return ad
      .replace(/[çğıİöşü]/g, (c) => tr[c] ?? c)
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const takmaListe = (s: string) =>
    s.split(',').map((x) => x.trim()).filter(Boolean)

  async function kaydet() {
    if (!ad.trim()) { error = 'Ad girilmeli.'; return }
    // …
    if (editing) {
      // THE PRESERVATION RULE (spec §3.2): spread the original first so any
      // field this app does not know about — takmaAdlar today, whatever the
      // bot adds tomorrow — survives the round-trip.
      const patch = {
        ...editing,
        ad: ad.trim(),
        tur, paraBirimi, sahip,
        simge: simge.trim() || undefined,
        takmaAdlar: takmaListe(takma),
        hesapKesim: kesim === '' ? undefined : Number(kesim),
        sonOdeme: sonOdemeText === '' ? undefined : Number(sonOdemeText),
        aktif,
      }
      await updateRecord(store, source, 'personal_accounts',
        (r: any) => r.kod === editing.kod, patch, { allowImported: true })
    } else {
      const kod = slug(ad)
      if (accounts.some((a) => a.kod === kod)) { error = 'Bu adla bir hesap zaten var.'; return }
      await appendRecord(store, source, 'personal_accounts', {
        kod, ad: ad.trim(), tur, paraBirimi, sahip, aktif: true,
        takmaAdlar: takmaListe(takma),
        ...(simge.trim() ? { simge: simge.trim() } : {}),
        ...(kesim === '' ? {} : { hesapKesim: Number(kesim) }),
        ...(sonOdemeText === '' ? {} : { sonOdeme: Number(sonOdemeText) }),
      })
    }
  }
```

`allowImported: true` is required: account rows carry no `kaynak` field, so the default `['manual']` gate would reject every edit. This is safe here — unlike a ledger row, an account is configuration, and there is no imported-from-Excel version of it to protect.

Delete guard:

```ts
  const hareketSayisi = $derived(
    !editing ? 0 : (dataset?.personalTx ?? []).filter(
      (r) => r.hesap === editing.kod || r.karsiHesap === editing.kod,
    ).length,
  )

  async function sil() {
    if (hareketSayisi > 0) {
      error = `Bu hesabın ${hareketSayisi} hareketi var — silmek yerine pasifleştirebilirsin.`
      pasiflestirTeklifi = true
      return
    }
    silOnayi = true   // then the "Evet, Sil" button calls deleteRecord
  }
```

When `pasiflestirTeklifi` is true, show a "Pasifleştir" button that saves the account with `aktif: false` through the same `updateRecord` path.

Field ids: `#h-kod` (disabled when editing), `#h-ad`, `#h-simge`, `#h-tur`, `#h-para`, `#h-sahip`, `#h-takma`, `#h-kesim`, `#h-sonodeme`, `#h-aktif`. Label `#h-takma` **"Telegram'da bu hesabı çağırdığın isimler"** with the helper text "Virgülle ayır: diji, garanti diji, dijital". Show the statement-day fields only when `tur === 'KREDI_KARTI'`.

- [ ] **Step 4: Add the controls to the list page**

In `Hesaplar.svelte`, add a header with a `+` button (`aria-label="Hesap ekle"`) and a `✎` toggle (`aria-label="Hesapları düzenle"`), both `disabled={!isDrive}` — take `source` and `store` as props and derive `isDrive` exactly as `Harcamalar.svelte` does. When edit mode is on, each account row gains an edit control that opens `HesapFormu` with that account; person rows in the Alacak/Verecek group never do — they are not accounts.

- [ ] **Step 5: Run the full suite**

```bash
npm test && npm run check
```

Expected: PASS, 0/0.

- [ ] **Step 6: Verify the bot still matches accounts**

The preservation test proves the field survives the code path. Confirm the file on disk is intact after a real edit:

```bash
cd ~/Desktop/Market/BBB
python3 -c "
import json
rows = json.load(open('data/personal_accounts.json'))
missing = [r['kod'] for r in rows if 'takmaAdlar' not in r]
print('takmaAdlar eksik:', missing or 'yok')
"
```

Expected: `takmaAdlar eksik: yok` for the accounts that had it. Run this again after editing an account through the app against a real Drive folder.

- [ ] **Step 7: Manual pass over the whole feature**

```bash
cd ~/Desktop/Market/BBB/app && npm run dev
```

Walk the flow: list → tap Nakit → select a day → `+` → add an expense → back → confirm the balance moved by that amount → transfer to the bank → confirm both balances moved → pay a card → correct a balance → add an account → try to delete an account with movements → check both themes at 390px.

- [ ] **Step 8: Commit**

```bash
git add src/routes/hesaplar/HesapFormu.svelte src/routes/hesaplar/HesapFormu.test.ts \
        src/routes/hesaplar/Hesaplar.svelte src/routes/hesaplar/Hesaplar.test.ts
git commit -m "feat(app): add, edit and deactivate accounts

Every account write spreads the original row first, so takmaAdlar — the
Telegram bot's account matcher — survives a round-trip through the app.
An account with movements cannot be deleted, only deactivated."
```

---

## Done means

- `npm test` green, `npm run check` at 0/0.
- The Hesaplar volume opens on the account list; the investment volume is unchanged.
- Every figure on both screens comes from `accounts.ts` and is unit-tested there.
- `takmaAdlar` survives an account edit — proved by a test and checked on disk.
- Enis can add, edit and delete accounts, expenses, income, transfers, card payments and balance corrections from the app.
