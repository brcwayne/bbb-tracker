# Kişisel Defter UI — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the PWA into two volumes — Yatırım and Hesaplar — and build the four read-only personal-ledger pages, so Enis can finally see his household spending as shapes instead of JSON.

**Architecture:** The investment volume is untouched. A `volume` dimension is added to the router; the bottom tab strip renders only the current volume's routes; a single top-left control links to the *other* volume. The six personal JSON files load as **optional** — missing means empty, never an error — and all figures come from one pure derivation module so no two pages can disagree.

**Tech Stack:** Svelte 5 (runes: `$props`, `$state`, `$derived`), Vite, TypeScript, Vitest, the existing hand-built SVG chart primitives (`BarChart`, `Donut`, `DataTable`). No new dependencies, no chart library.

**Spec:** `docs/superpowers/specs/2026-09-08-bbb-kisisel-defter-ui-design.md` — read it before Task 1. Decisions are referenced as U1–U8.

**Working directory:** `~/Desktop/Market/BBB/app`. Run `npm test` (Vitest) and `npm run check` (svelte-check, must stay 0/0).

## Global Constraints

- **The investment volume's behaviour does not change.** Its nine hash routes keep their exact current paths; its pages, charts and `USD ǀ ₺` toggle are untouched.
- **Adding a personal file must never break the app.** `drive.ts` currently throws `Drive: ${n}.json bulunamadı` for any missing name in `NAMES`. The personal files go in a **separate optional list**; a missing or malformed one yields `[]` for that file only. The eight investment files keep throwing — that guarantee must not be weakened.
- **No new chart library** — the existing primitives cover everything. `BarChart` takes a single series (`bars: {label, value}[]`), so one chart per currency rather than a grouped chart.
- **No currency conversion and no `USD ǀ ₺` toggle in this volume** (U5). TRY and USD totals sit side by side.
- **Read-only.** No `save()`, no form, no delete anywhere in this plan.
- **Future-dated instalment rows are excluded from every "spent" figure** (`tarih <= today`), matching the bot's `/harcama_ozet` exactly. The two must never disagree.
- **Nothing derived is computed inside a `.svelte` file** — it lives in `src/lib/data/personal.ts` and is unit-tested there.
- Turkish user-facing strings throughout, matching the existing pages' voice.
- `npm test` and `npm run check` both clean after every task.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/data/types.ts` (modify) | Six new interfaces + six optional `Dataset` fields |
| `src/lib/data/source.ts` (modify) | `PERSONAL_NAMES`, kept separate from `NAMES` |
| `src/lib/data/drive.ts`, `local.ts` (modify) | Optional loading of the personal files |
| `src/lib/data/personal.ts` (create) | Every derivation for the four pages, pure |
| `src/router.ts` (modify) | The `volume` dimension |
| `src/lib/ui/VolumeSwitch.svelte` (create) | The top-left control |
| `src/App.svelte` (modify) | Volume-aware shell and tab strip |
| `src/routes/hesaplar/{Ozet,Harcamalar,Taksitler,Borclar}.svelte` (create) | The four pages |
| `src/app.css` (modify) | `--accent-defter` in both themes |
| `src/fixtures/dataset.ts` (modify) | A realistic personal fixture |

---

### Task 1: Types, optional loading, and the fixture

**Files:**
- Modify: `src/lib/data/types.ts`, `src/lib/data/source.ts`, `src/lib/data/drive.ts`, `src/lib/data/local.ts`, `src/fixtures/dataset.ts`
- Test: `src/lib/data/drive.test.ts`, `src/lib/data/local.test.ts`

**Interfaces:**
- Produces: `PersonalTx`, `PaymentPlan`, `PersonalAccount`, `Category`, `Person`, `Debt` in `types.ts`; `PERSONAL_NAMES` in `source.ts`; six `Dataset` fields — `personalTx`, `paymentPlans`, `personalAccounts`, `categories`, `people`, `debts` — each `[]` when absent.

Field names come from the ledger spec and the bot's own output; do not rename them.

```ts
export interface PersonalTx {
  id: string; tarih: string; tur: 'GIDER' | 'GELIR'; tutar: number
  paraBirimi: 'TRY' | 'USD'; kategori: string; aciklama: string
  hesap: string; sahip: string
  taksitPlaniId: string | null; taksitNo: number | null; taksitToplam: number | null
  not: string; kaynak: string; olusturulma: string
}
export interface PaymentPlan {
  id: string; alisTarihi: string; aciklama: string; toplamTutar: number
  paraBirimi: 'TRY' | 'USD'; taksitSayisi: number
  taksitTutari: number; sonTaksitTutari: number
  kategori: string; hesap: string; sahip: string
  durum: 'AKTIF' | 'BITTI' | 'IPTAL'; kaynak: string; olusturulma: string
}
export interface PersonalAccount {
  kod: string; ad: string; tur: 'NAKIT' | 'BANKA' | 'KREDI_KARTI'
  paraBirimi: string; sahip: string; aktif: boolean
  hesapKesim?: number; sonOdeme?: number
}
export interface Category { kod: string; ad: string; tur: 'GIDER' | 'GELIR'; aktif: boolean }
export interface Person { kod: string; ad: string; haneUyesi: boolean; aktif: boolean }
export interface Debt {
  id: string; tarih: string; yon: 'VERDIM' | 'ALDIM'; kisi: string
  tutar: number; paraBirimi: 'TRY' | 'USD'; aciklama: string; hesap: string
  durum: 'ACIK' | 'KAPALI'; kapatanKayitlar: string[]; kaynak: string; olusturulma: string
}
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/data/drive.test.ts — append
it('bir kişisel dosya eksikse boş dizi döner, hata atmaz', async () => {
  // fetch mock lists only the 8 investment files
  const ds = await makeDriveSourceWithFiles(INVESTMENT_FILES_ONLY).load()
  expect(ds.personalTx).toEqual([])
  expect(ds.debts).toEqual([])
})

it('bozuk bir kişisel dosya sadece kendi alanını boşaltır', async () => {
  const ds = await makeDriveSourceWithFiles({ ...ALL_FILES, 'personal_tx.json': '{bozuk' }).load()
  expect(ds.personalTx).toEqual([])
  expect(ds.categories.length).toBeGreaterThan(0)
})

it('eksik bir YATIRIM dosyası hâlâ hata atar', async () => {
  await expect(
    makeDriveSourceWithFiles(without(ALL_FILES, 'transactions.json')).load(),
  ).rejects.toThrow(/bulunamadı/)
})
```

Mirror the first two in `local.test.ts`. Follow the existing fetch-mock helpers in `drive.test.ts` rather than inventing new ones.

- [ ] **Step 2: Run and watch them fail** — `npm test -- drive local`

- [ ] **Step 3: Implement.** In `source.ts`:

```ts
/** Optional — a missing personal file yields [] and never fails the load. */
export const PERSONAL_NAMES = [
  'personal_tx', 'payment_plans', 'personal_accounts',
  'categories', 'people', 'debts',
] as const
```

In both adapters, fetch these separately from `NAMES`, wrapping each in a try/catch that logs and returns `[]`. Map the file basenames to the camelCase `Dataset` keys (`personal_tx → personalTx`, `payment_plans → paymentPlans`, `personal_accounts → personalAccounts`).

- [ ] **Step 4: Extend the fixture.** Add to `src/fixtures/dataset.ts` a realistic personal set: six expenses across `market`, `yakit`, `kira`, `yeme-icme` spread over the last three months, one `USD` expense, one `GELIR` row (`maas`), one six-instalment plan whose rows straddle the current month (three past, three future), and two debts — one `VERDIM`, one `ALDIM`. Use the seeded categories, `NAKIT`, and `ENIS`.

- [ ] **Step 5: Tests and check pass** — `npm test && npm run check`

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/types.ts src/lib/data/source.ts src/lib/data/drive.ts src/lib/data/local.ts src/lib/data/drive.test.ts src/lib/data/local.test.ts src/fixtures/dataset.ts
git commit -m "feat(app): load the personal ledger files as optional data"
```

---

### Task 2: Monthly totals and category breakdown

**Files:** Create `src/lib/data/personal.ts`. Test: `src/lib/data/personal.test.ts`.

**Interfaces:**
- Consumes: `PersonalTx` (Task 1).
- Produces:
  - `monthlyTotals(rows: PersonalTx[], today: string, months = 12): { ay: string; para: string; toplam: number }[]` — `ay` is `YYYY-MM`, ascending, one entry per (month, currency) that has expense data, future-dated rows excluded.
  - `monthSummary(rows: PersonalTx[], year: number, month: number, today: string): { gider: Record<string, number>; gelir: Record<string, number>; adet: number }`
  - `categoryBreakdown(rows: PersonalTx[], year: number, month: number, today: string, para: string): { kod: string; toplam: number }[]` — descending.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/data/personal.test.ts
import { describe, expect, it } from 'vitest'
import { categoryBreakdown, monthlyTotals, monthSummary } from './personal'
import type { PersonalTx } from './types'

const tx = (o: Partial<PersonalTx>): PersonalTx => ({
  id: 'px_1', tarih: '2026-09-02', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY',
  kategori: 'market', aciklama: '', hesap: 'NAKIT', sahip: 'ENIS',
  taksitPlaniId: null, taksitNo: null, taksitToplam: null,
  not: '', kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z', ...o,
})

const TODAY = '2026-09-08'

it('boş defterde her şey boş döner, çökmeden', () => {
  expect(monthlyTotals([], TODAY)).toEqual([])
  expect(monthSummary([], 2026, 9, TODAY)).toEqual({ gider: {}, gelir: {}, adet: 0 })
  expect(categoryBreakdown([], 2026, 9, TODAY, 'TRY')).toEqual([])
})

it('ayları artan sırada, para birimi ayrı toplar', () => {
  const out = monthlyTotals([
    tx({ id: 'a', tarih: '2026-08-10', tutar: 300 }),
    tx({ id: 'b', tarih: '2026-09-02', tutar: 100 }),
    tx({ id: 'c', tarih: '2026-09-03', tutar: 50 }),
    tx({ id: 'd', tarih: '2026-09-04', tutar: 20, paraBirimi: 'USD' }),
  ], TODAY)
  expect(out).toEqual([
    { ay: '2026-08', para: 'TRY', toplam: 300 },
    { ay: '2026-09', para: 'TRY', toplam: 150 },
    { ay: '2026-09', para: 'USD', toplam: 20 },
  ])
})

it('gelecek tarihli taksit satırı harcamaya sayılmaz', () => {
  const rows = [
    tx({ id: 'a', tarih: '2026-09-02', tutar: 2000, taksitPlaniId: 'pp_1', taksitNo: 1, taksitToplam: 6 }),
    tx({ id: 'b', tarih: '2026-10-02', tutar: 2000, taksitPlaniId: 'pp_1', taksitNo: 2, taksitToplam: 6 }),
  ]
  expect(monthSummary(rows, 2026, 9, TODAY).gider.TRY).toBe(2000)
  expect(monthlyTotals(rows, TODAY).some((m) => m.ay === '2026-10')).toBe(false)
})

it('gelir gideri kirletmez', () => {
  const s = monthSummary([
    tx({ id: 'a', tutar: 100 }),
    tx({ id: 'b', tarih: '2026-09-03', tutar: 50000, tur: 'GELIR', kategori: 'maas' }),
  ], 2026, 9, TODAY)
  expect(s.gider.TRY).toBe(100)
  expect(s.gelir.TRY).toBe(50000)
  expect(s.adet).toBe(1)
})

it('kategori dağılımı büyükten küçüğe', () => {
  const out = categoryBreakdown([
    tx({ id: 'a', tutar: 100, kategori: 'market' }),
    tx({ id: 'b', tarih: '2026-09-03', tutar: 500, kategori: 'kira' }),
  ], 2026, 9, TODAY, 'TRY')
  expect(out.map((c) => c.kod)).toEqual(['kira', 'market'])
})

it('12 aylık pencere daha eskisini dışarıda bırakır', () => {
  const out = monthlyTotals([
    tx({ id: 'old', tarih: '2025-01-05', tutar: 999 }),
    tx({ id: 'new', tarih: '2026-09-02', tutar: 100 }),
  ], TODAY, 12)
  expect(out.map((m) => m.ay)).toEqual(['2026-09'])
})
```

- [ ] **Step 2: Run and watch them fail** — `npm test -- personal`

- [ ] **Step 3: Implement** the three functions, pure, no imports beyond `types`.

- [ ] **Step 4: Tests and check pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(app): monthly totals and category breakdown for the personal ledger"`

---

### Task 3: Instalment schedule and debt balances

**Files:** Modify `src/lib/data/personal.ts`. Test: `src/lib/data/personal.test.ts`.

**Interfaces:**
- Produces:
  - `instalmentSchedule(rows: PersonalTx[], today: string, months = 12): { ay: string; para: string; toplam: number }[]` — **future-dated instalment rows only** (`taksitPlaniId !== null && tarih > today`), ascending.
  - `activePlans(plans: PaymentPlan[], rows: PersonalTx[], today: string): { plan: PaymentPlan; odenen: number; kalan: number; ilerleme: string }[]` — `ilerleme` is `"3/6"`; `odenen` counts rows dated on or before today.
  - `debtBalances(debts: Debt[]): { kisi: string; para: string; alacak: number; borc: number; net: number }[]` — open debts only, sorted by `|net|` descending.

- [ ] **Step 1: Write the failing test**

```ts
import { activePlans, debtBalances, instalmentSchedule } from './personal'
import type { Debt, PaymentPlan } from './types'

const planRows = [1, 2, 3, 4, 5, 6].map((n) => tx({
  id: `px_${n}`, tarih: `2026-${String(6 + n).padStart(2, '0')}-07`,
  tutar: 2000, kategori: 'ev', taksitPlaniId: 'pp_1', taksitNo: n, taksitToplam: 6,
}))
// n=1 → 2026-07, n=2 → 2026-08, n=3 → 2026-09 (bugün 09-08, ödendi sayılır)
// n=4..6 → 2026-10..12 (gelecek)

const PLAN: PaymentPlan = {
  id: 'pp_1', alisTarihi: '2026-07-07', aciklama: 'Beyaz eşya', toplamTutar: 12000,
  paraBirimi: 'TRY', taksitSayisi: 6, taksitTutari: 2000, sonTaksitTutari: 2000,
  kategori: 'ev', hesap: 'NAKIT', sahip: 'ENIS', durum: 'AKTIF',
  kaynak: 'telegram', olusturulma: '2026-07-07T00:00:00Z',
}

it('takvim sadece gelecek taksitleri sayar', () => {
  const out = instalmentSchedule(planRows, TODAY)
  expect(out.map((m) => m.ay)).toEqual(['2026-10', '2026-11', '2026-12'])
  expect(out[0].toplam).toBe(2000)
})

it('sıradan bir harcama takvime girmez', () => {
  expect(instalmentSchedule([tx({ tarih: '2026-12-01', tutar: 500 })], TODAY)).toEqual([])
})

it('plan ilerlemesi ödenmiş taksitleri sayar', () => {
  const [p] = activePlans([PLAN], planRows, TODAY)
  expect(p.ilerleme).toBe('3/6')
  expect(p.odenen).toBe(6000)
  expect(p.kalan).toBe(6000)
})

it('bitmiş ve iptal planlar listelenmez', () => {
  expect(activePlans([{ ...PLAN, durum: 'BITTI' }], planRows, TODAY)).toEqual([])
  expect(activePlans([{ ...PLAN, durum: 'IPTAL' }], planRows, TODAY)).toEqual([])
})

const debt = (o: Partial<Debt>): Debt => ({
  id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'AHMET', tutar: 5000,
  paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK',
  kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z', ...o,
})

it('kişi bazında alacak ve borç netleşir', () => {
  const out = debtBalances([
    debt({ id: 'a', kisi: 'AHMET', yon: 'VERDIM', tutar: 5000 }),
    debt({ id: 'b', kisi: 'AHMET', yon: 'ALDIM', tutar: 2000 }),
    debt({ id: 'c', kisi: 'AYSE', yon: 'ALDIM', tutar: 800 }),
  ])
  const ahmet = out.find((d) => d.kisi === 'AHMET')!
  expect(ahmet).toMatchObject({ alacak: 5000, borc: 2000, net: 3000 })
  expect(out[0].kisi).toBe('AHMET')
})

it('kapanmış borç sayılmaz', () => {
  expect(debtBalances([debt({ durum: 'KAPALI' })])).toEqual([])
})

it('boş girdide boş döner', () => {
  expect(instalmentSchedule([], TODAY)).toEqual([])
  expect(activePlans([], [], TODAY)).toEqual([])
  expect(debtBalances([])).toEqual([])
})
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** `instalmentSchedule` and `activePlans` both derive from `rows`, never by recomputing the split from the plan header — the rows are the source of truth, and deriving the same number twice is how two screens start disagreeing.

- [ ] **Step 4: Tests and check pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(app): instalment schedule and debt balances"`

---

### Task 4: The volume dimension in the router

**Files:** Modify `src/router.ts`. Test: `src/router.test.ts` (create if absent).

**Interfaces:**
- Produces:
  - `export type Volume = 'yatirim' | 'hesaplar'`
  - `export type HesapRoute = 'h-ozet' | 'h-harcamalar' | 'h-taksitler' | 'h-borclar'`
  - `HESAP_ROUTES: { id: HesapRoute; path: string; label: string }[]`
  - `currentRoute(): { volume: Volume; route: Route | HesapRoute }`
  - `routesFor(volume: Volume)` — the array the tab strip maps over.
  - `FIRST_PATH: Record<Volume, string>` — `{ yatirim: '#/', hesaplar: '#/h/ozet' }`

- [ ] **Step 1: Write the failing test**

```ts
// src/router.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { currentRoute, FIRST_PATH, HESAP_ROUTES, ROUTES, routesFor } from './router'

const go = (h: string) => { location.hash = h }

it('kişisel yollar hesaplar cildine çözülür', () => {
  go('#/h/ozet'); expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-ozet' })
  go('#/h/borclar'); expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-borclar' })
})

it('mevcut yatırım yolları aynen çalışmaya devam eder', () => {
  for (const r of ROUTES) {
    go(r.path)
    expect(currentRoute()).toEqual({ volume: 'yatirim', route: r.id })
  }
})

it('bilinmeyen adres panoramaya düşer', () => {
  go('#/yok-boyle-bir-sey')
  expect(currentRoute()).toEqual({ volume: 'yatirim', route: 'panorama' })
})

it('sekme şeridi cilde göre değişir', () => {
  expect(routesFor('yatirim')).toHaveLength(9)
  expect(routesFor('hesaplar')).toHaveLength(4)
  expect(HESAP_ROUTES.map((r) => r.label)).toEqual(['Özet', 'Harcamalar', 'Taksitler', 'Borçlar'])
})

it('her cildin bir giriş sayfası var', () => {
  expect(FIRST_PATH).toEqual({ yatirim: '#/', hesaplar: '#/h/ozet' })
})
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Parse the hash: a leading `h/` selects the Hesaplar volume, everything else falls through to the existing investment matching untouched.

- [ ] **Step 4: Tests and check pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(app): two volumes in the router"`

---

### Task 5: The volume control and the shell

**Files:** Create `src/lib/ui/VolumeSwitch.svelte`. Modify `src/App.svelte`, `src/app.css`. Test: `src/lib/ui/VolumeSwitch.test.ts`.

**Interfaces:**
- Consumes: `Volume`, `FIRST_PATH`, `routesFor` (Task 4).
- Produces: `<VolumeSwitch volume={Volume} />` — a link to the *other* volume, labelled with that volume's name (U2).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ui/VolumeSwitch.test.ts
import { render, screen } from '@testing-library/svelte'
import { expect, it } from 'vitest'
import VolumeSwitch from './VolumeSwitch.svelte'

it('yatırımdayken hesaplara götürür', () => {
  render(VolumeSwitch, { volume: 'yatirim' })
  const a = screen.getByRole('link')
  expect(a).toHaveAttribute('href', '#/h/ozet')
  expect(a.textContent).toContain('Hesaplar')
})

it('hesaplardayken yatırıma götürür', () => {
  render(VolumeSwitch, { volume: 'hesaplar' })
  const a = screen.getByRole('link')
  expect(a).toHaveAttribute('href', '#/')
  expect(a.textContent).toContain('Yatırım')
})

it('gittiği yeri sesli okuyuculara da söyler', () => {
  render(VolumeSwitch, { volume: 'yatirim' })
  expect(screen.getByRole('link')).toHaveAccessibleName(/Hesaplar defterine geç/i)
})
```

If `@testing-library/svelte` is not already a dev dependency, do **not** add it — instead assert on the component's derived values through a small exported helper `otherVolume(v: Volume): { href: string; label: string }` in `router.ts`, and test that. Check `package.json` first and pick the path that adds no dependency.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement the control.** Top-left of the header, before the page title. Renders the other volume's name plus `→`, styled with `--accent-defter` when it points at Hesaplar and `--gold` when it points at Yatırım, so the colour previews the destination. Give it a visible `:focus-visible` outline.

- [ ] **Step 4: Wire the shell.** In `App.svelte`, take `{ volume, route }` from `currentRoute()`, map the four new page components alongside the nine existing ones, render `<VolumeSwitch {volume} />` in the header, and have the tab strip map `routesFor(volume)`. **The `USD ǀ ₺` toggle and the period selector render only in the Yatırım volume** (U5) — hide them in Hesaplar rather than leaving them inert.

- [ ] **Step 5: Add the accent token.** In `src/app.css`, alongside `--gold`, add `--accent-defter: #6f9a94` in the dark block and `#4a7671` in both light blocks (the `prefers-color-scheme: light` block and the explicit `[data-theme="light"]` block — check which exist and match the file's structure).

- [ ] **Step 6: Tests and check pass.**

- [ ] **Step 7: Commit** — `git commit -m "feat(app): volume switch and volume-aware shell"`

---

### Task 6: Özet

**Files:** Create `src/routes/hesaplar/Ozet.svelte`. Test: `src/routes/hesaplar/Ozet.test.ts`.

Sections top to bottom (U4): monthly trend, this month, category donut, upcoming instalment load.

- [ ] **Step 1: Write the failing test**

```ts
it('boş defterde çökmeden boş durum gösterir', () => {
  const { container } = render(Ozet, { dataset: emptyDataset })
  expect(container.textContent).toMatch(/henüz kayıt yok/i)
})

it('bu ayın toplamını ve kayıt sayısını gösterir', () => {
  const { container } = render(Ozet, { dataset: fixtureDataset })
  expect(container.textContent).toContain('Bu ay')
})

it('sadece TRY varsa tek grafik çizer', () => {
  const { container } = render(Ozet, { dataset: tryOnlyDataset })
  expect(container.querySelectorAll('[data-chart="aylik-seyir"]')).toHaveLength(1)
})

it('USD kaydı varsa ikinci grafiği ekler', () => {
  const { container } = render(Ozet, { dataset: fixtureDataset })
  expect(container.querySelectorAll('[data-chart="aylik-seyir"]')).toHaveLength(2)
})
```

Use whatever component-rendering approach the existing page tests use (check `src/routes/*.test.ts` first) — do not introduce a new testing library.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** `BarChart` per currency, tagged `data-chart="aylik-seyir"`; `Donut` for the category split with the month total in the centre; a small `BarChart` for the next three months' instalment load. Amounts use `--font-num` and `tabular-nums`, following the existing pages.

- [ ] **Step 4: Tests and check pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(app): Özet page for the personal ledger"`

---

### Task 7: Harcamalar

**Files:** Create `src/routes/hesaplar/Harcamalar.svelte`. Test: `src/routes/hesaplar/Harcamalar.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
it('kayıtları yeniden eskiye sıralar', () => { /* assert first row is the newest tarih */ })
it('kategoriye göre süzer', () => { /* pick 'kira', assert only kira rows remain */ })
it('açıklamada arar', () => { /* type 'Migros', assert the row count drops */ })
it('taksit satırını 3/6 olarak gösterir', () => { /* assert the text 3/6 */ })
it('gelecek tarihli satırı işaretler', () => { /* assert the marker element exists */ })
it('boş defterde boş durum gösterir', () => { /* assert the empty text */ })
```

Fill each body against the fixture, following the assertion style of the existing `Pozisyonlar` tests.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement** with `DataTable`, filters for category / owner / account and a description search. Cells `white-space: nowrap`; the table container scrolls horizontally, never the page body.

- [ ] **Step 4: Tests and check pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(app): Harcamalar page"`

---

### Task 8: Taksitler and Borçlar

**Files:** Create `src/routes/hesaplar/Taksitler.svelte`, `src/routes/hesaplar/Borclar.svelte`. Test: matching `.test.ts` files.

- [ ] **Step 1: Write the failing tests**

```ts
// Taksitler
it('aktif planı ilerlemesiyle listeler', () => { /* '3/6' and the remaining balance */ })
it('bitmiş planı listelemez', () => { /* durum BITTI is absent */ })
it('önümüzdeki 12 ayın yükünü çizer', () => { /* the chart element exists */ })
it('plan yoksa boş durum gösterir', () => { /* empty text */ })

// Borçlar
it('kişi başına alacak, borç ve net gösterir', () => { /* AHMET: 5000 / 2000 / 3000 */ })
it('alacak ile borcu görsel olarak ayırır', () => { /* distinct classes */ })
it('kapanmış borcu listelemez', () => { /* KAPALI absent */ })
it('borç yoksa boş durum gösterir', () => { /* empty text */ })
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Taksitler: the active-plan list plus a twelve-month `BarChart` from `instalmentSchedule`. Borçlar: per-person grouping with `--gain` for money owed to Enis and `--loss` for money he owes — the same semantic colours the investment volume already uses, not the accent.

- [ ] **Step 4: Tests and check pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(app): Taksitler and Borçlar pages"`

---

### Task 9: Empty states, README, and a look at the real thing

**Files:** Modify the four page components, `app/README.md`.

The ledger is empty today, so an empty page is the **first** thing Enis will see (spec §7).

- [ ] **Step 1: Write the failing test**

```ts
it('her sayfanın boş durumu ne yapılacağını söyler', () => {
  for (const Page of [Ozet, Harcamalar, Taksitler, Borclar]) {
    const { container } = render(Page, { dataset: emptyDataset })
    expect(container.textContent).toMatch(/Telegram/i)
  }
})

it('boş grafik eksenleriyle çizilir, yüksekliği çökmez', () => {
  const { container } = render(Ozet, { dataset: emptyDataset })
  const svg = container.querySelector('[data-chart="aylik-seyir"] svg')!
  expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Each page gets its own empty text naming the bot message that fills it — for example on Harcamalar: *"Henüz kayıt yok. Telegram'dan 'markette 340 lira' yazarak başlayabilirsin."* Charts render axes and a flat empty plot rather than collapsing.

- [ ] **Step 4: Document.** In `app/README.md`, add a short "Kişisel Defter" section: the two volumes and how to switch, the four pages, that the personal files load as optional so the app still works without them, and that this volume is read-only in Phase 1 with editing planned for Phase 2.

- [ ] **Step 5: Look at it once.** Run `npm run dev`, open the Hesaplar volume against the local `data/` folder, and check the four pages in both the empty and fixture states, light and dark. Fix what is visibly wrong — clipped columns, a collapsed chart, unreadable text — in one pass. Do not iterate beyond that; Enis judges the design himself.

- [ ] **Step 6: Tests and check pass** — `npm test && npm run check`

- [ ] **Step 7: Commit** — `git commit -m "feat(app): empty states and Kişisel Defter docs"`

---

### Closing

- [ ] `npm test && npm run check` — record the counts.
- [ ] Confirm the investment volume is untouched: every existing route still resolves (Task 4's test), its pages render, and the `USD ǀ ₺` toggle still works there.
- [ ] Confirm a missing personal file still does not break the app (Task 1's test).
- [ ] Report what changed, the test count, decisions you made alone, and anything skipped.

**Deployment is not part of this task.** The app deploys through the existing GitHub Pages workflow when `main` is pushed.

**Do not pick up without asking:** editing from the page and its concurrency protection (Phase 2 — it triggers ledger spec §5.3's expiry condition); Layer D; account/card balance views; any change to the investment volume's pages or charts.
