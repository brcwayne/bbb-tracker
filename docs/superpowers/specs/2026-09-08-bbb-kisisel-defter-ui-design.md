# Kişisel Defter UI — Two Volumes — Design

**Date:** 2026-09-08
**Scope:** Phase 1 — split the PWA into two "volumes" (Yatırım / Hesaplar) and build the four read-only personal-ledger pages.
**Phase 2 (own spec later):** editing from the page, and the concurrency protection that editing requires.

---

## 0. Where this starts

The personal ledger has shipped end to end: the Telegram bot records expenses, income, instalments, debts and transfers; the investment bridge writes `cashflows.json`; six JSON files sync to Drive. What is missing is the half Enis actually looks at. He is explicitly a visual reader ("sayı değil şekil okurum"), and today his personal data is only reachable as raw JSON or through bot commands.

The PWA already has nine pages on an Excel-style sheet-tab strip pinned bottom-left (`Panorama, Portföyler, Kurumlar, Pozisyonlar, Aylık, Banka, Temettü, Ekle, Log`). Appending four more would put thirteen tabs in that strip, which is unusable on the phone where Enis mostly reads it. The split into two volumes is therefore not decoration — it is what keeps either strip legible.

**`personal_tx.json` is currently empty.** These pages will be built against an empty ledger, so empty states are a first-class requirement, not an afterthought.

---

## 1. Decisions

Made by Enis on 2026-09-08 unless noted.

| # | Decision | Rationale |
|---|---|---|
| U1 | **Two volumes, never both at once.** | Enis's own framing: "2 cilt gibi olsun, birinde işim bitince diğerine gideyim." |
| U2 | **The volume control names the destination, not the location.** In Yatırım it reads `Hesaplar →`; in Hesaplar, `Yatırım →`. | Enis originally proposed a hover-reveal. Hover does not exist on iOS, where he reads this most, so the label would have been a dead end on his phone. Naming the destination keeps his bookmark-ribbon idea and works on touch and pointer alike. |
| U3 | **Four pages: Özet, Harcamalar, Taksitler, Borçlar.** | All four chosen. |
| U4 | **Özet opens with the monthly trend chart**, above the current month's figures. | Enis's answer to "what do you want to see first": aylık seyir — grafik. |
| U5 | **No currency conversion in this volume**, and therefore no `USD ǀ ₺` toggle. TRY and USD totals sit side by side. | Consistent with spec D4. The investment volume keeps its toggle; the difference is deliberate and must be visible as a choice, not read as a missing feature. |
| U6 | **Same book, different ink.** Identical type, grid and chart language; one distinct accent per volume. | Enis chose this over "identical" (risk of losing your place) and "strongly different" (risk of two apps). |
| U7 | **Phase 1 is read-only.** Editing and its concurrency protection are Phase 2. | Enis asked for editing, then agreed to sequence it: the visual half lands sooner and he can steer the design early, while the risky write path gets its own spec and review. |
| U8 | **The six personal files load as optional.** A missing file yields an empty array, never an error. | See §5 — the current loader throws on any missing file, which would take the whole app down. |

---

## 2. Global constraints

- **The investment volume's behaviour does not change.** Its nine routes keep their current hash paths, so existing bookmarks and the service worker's cached entry points keep working. Its pages, charts and the `USD ǀ ₺` toggle are untouched.
- **No new chart library.** The existing hand-built primitives (`LineChart`, `BarChart`, `Donut`, `Histogram`, `d3-scale`/`d3-shape`) cover everything here. This is a standing project rule.
- **No data in the repo or the bundle.** Dev reads local `data/`; production reads the user's Drive folder. Unchanged.
- **Read-only.** Phase 1 adds no `save()` call, no form, no delete. The `DataSource.save` path stays exactly as the investment side uses it.
- **Turkish throughout**, matching the existing pages' voice.
- Existing app tests stay green (`npm test`, `svelte-check` 0/0).

---

## 3. Navigation — the two volumes

### 3.1 Routes

The investment routes are unchanged: `#/`, `#/portfoyler`, `#/kurumlar`, `#/pozisyonlar`, `#/aylik`, `#/banka`, `#/temettu`, `#/ekle`, `#/log`.

The personal routes take an `h/` prefix so the volume is legible in the URL and survives a reload:

```
#/h/ozet         Özet
#/h/harcamalar   Harcamalar
#/h/taksitler    Taksitler
#/h/borclar      Borçlar
```

`currentRoute()` grows to return `{ volume: 'yatirim' | 'hesaplar', route: Route }`. An unknown hash resolves to `#/` (Panorama) as today.

### 3.2 The control

A single element at the top-left of the header, in place of nothing that exists today (the header currently starts with the page title). It reads the **other** volume's name with a rightward arrow, is a real link (`<a href>` to that volume's first page), and carries an accessible label spelling out the action (`"Hesaplar defterine geç"`).

Switching volumes lands on that volume's first page — `#/` for Yatırım, `#/h/ozet` for Hesaplar. The app does not remember where you were in the other volume; the volumes are entered at their front page, like opening a book at the first chapter. This is a deliberate simplification: per-volume history adds state for a gesture that happens a few times a day.

### 3.3 The tab strip

The bottom sheet-tab strip renders only the current volume's routes — nine in Yatırım, four in Hesaplar. Its markup and styling are unchanged; only the array it maps over changes.

---

## 4. The four pages

All four read from the same derived store, so a figure means the same thing on every page.

### 4.1 Özet

In order down the page:

1. **Aylık seyir** (U4) — monthly expense totals over the last 12 months as bars. Bars rather than a line, because monthly totals are discrete amounts, not a continuous series. The existing `BarChart` takes a single series (`bars: {label, value}[]`), so **one chart per currency, stacked vertically**, and the USD chart renders only when USD rows exist — which keeps the common TRY-only case to a single chart and avoids changing a primitive the investment pages depend on. This is the first thing on the page because it is the first thing Enis asked for.
2. **Bu ay** — total spent this month per currency, the count of records, and the change against last month as an absolute figure and a percentage.
3. **Kategori dağılımı** — a donut of this month's expenses by category, with the total in the centre, matching the investment volume's donut treatment.
4. **Yaklaşan taksit yükü** — the next three months' instalment totals, so "what am I committed to" is answerable without leaving the page.

Future-dated instalment rows are excluded from every "spent" figure (`tarih <= today`), exactly as `/harcama_ozet` does in the bot. The two must never disagree.

### 4.2 Harcamalar

A date-ordered table, newest first, of `personal_tx.json`: date, category, description, account, owner, amount. Filters for category, owner and account, plus a free-text search over the description. An instalment row shows its position as `3/6` and is visually marked when its date is in the future.

Rows are not editable in Phase 1. The table reuses `DataTable` and follows the existing column conventions — `white-space: nowrap` on cells, the container scrolling horizontally rather than the page.

### 4.3 Taksitler

Active plans from `payment_plans.json`: description, total, instalment amount, progress (`3/6`), account, and the remaining balance. Below them, a month-by-month bar of the committed load for the next twelve months, built from the future-dated rows in `personal_tx.json` rather than recomputed from the plans — the rows are the source of truth, and deriving twice is how two screens start disagreeing.

### 4.4 Borçlar

Rows from `debts.json` grouped by person, split into *alacak* (money lent) and *borç* (money owed), each with its running balance and open/closed state. A person with both shows a net line.

`debts.json` may be empty for a long time; its empty state should read as "henüz kayıt yok", not as an error.

---

## 5. Data loading — the part that can break the app

`app/src/lib/data/drive.ts` builds the dataset from a fixed list of eight names and **throws** when any is absent:

```ts
if (!file) throw new Error(`Drive: ${n}.json bulunamadı`)
```

Adding the six personal files to that list would make the whole app — including the investment volume — fail to load for anyone whose Drive lacks them. That includes any earlier state of Enis's own folder, and any future user.

Therefore the two lists are kept separate and behave differently:

```ts
export const NAMES = [...]            // the 8 required investment files — unchanged, still throw
export const PERSONAL_NAMES = [
  'personal_tx', 'payment_plans', 'personal_accounts',
  'categories', 'people', 'debts',
] as const                            // optional: missing ⇒ [] , never throws
```

Both the Drive adapter and the local adapter resolve a missing personal file to `[]`. A read error on one personal file is logged and yields `[]` for that file only; it never fails the load. `Dataset` grows six optional fields typed as arrays, defaulting to `[]`, so every consumer can treat "absent" and "empty" identically and no page needs a null check.

New TypeScript interfaces mirror the JSON schemas already fixed in the ledger spec (`PersonalTx`, `PaymentPlan`, `PersonalAccount`, `Category`, `Person`, `Debt`). Field names stay exactly as the bot writes them — Turkish, unchanged.

Derivation for the four pages lives in one new pure module, `src/lib/data/personal.ts`, testable without any component: monthly totals, category breakdown, instalment schedule, debt balances. Nothing derived is computed inside a `.svelte` file.

---

## 6. Visual language

The volumes share everything structural: `--bg`, `--surface`, `--ink`, `--ink-soft`, `--hairline`, `--ink-num`, `--font-num`, the type scale, the tab strip, the table conventions and the chart primitives, in both the dark and light palettes already defined in `app/src/app.css`.

One token differs. The investment volume keeps `--gold` (`#c9a86a` dark / `#a9863f` light) as its accent. The personal volume introduces `--accent-defter`, a muted verdigris from the same aged-ink family — starting values `#6f9a94` (dark) and `#4a7671` (light) — used for the volume control, the active tab underline, and the primary chart series. `--gain` and `--loss` keep their present meanings in both volumes and are never repurposed as the accent.

The accent is a starting value, not a finished decision: Enis judges it on the live page and it is cheap to change, being a single token.

---

## 7. Empty states

The ledger is empty today, so an empty page is the **first** thing Enis will see, and it must not look broken.

Each page gets a purpose-written empty state, not a shared placeholder: what the page will show, and the one bot message that starts filling it (for example, on Harcamalar: *"Henüz kayıt yok. Telegram'dan 'markette 340 lira' yazarak başlayabilirsin."*). Charts render their axes and a flat empty plot rather than collapsing to zero height, so the layout does not jump when the first record arrives.

A page with one or two records must also look composed — the sparse case is the realistic case for the first weeks, not an edge case.

---

## 8. Testing

Following the existing app conventions (Vitest, `svelte-check`):

- `personal.ts` derivation: monthly totals per currency; future-dated instalments excluded from "spent"; category breakdown ordering; instalment schedule from rows not plans; debt balances net out; every function correct on an empty dataset.
- Adapters: a missing personal file yields `[]` and does **not** throw; a missing *investment* file still throws (the existing guarantee must not be weakened); a malformed personal file yields `[]` for that file alone.
- Router: `#/h/ozet` resolves to the Hesaplar volume; an unknown hash falls back to Panorama; every existing investment path still resolves to its current page.
- Volume control: in Yatırım it links to `#/h/ozet` and reads "Hesaplar"; in Hesaplar it links to `#/` and reads "Yatırım".
- Tab strip: exactly nine tabs in Yatırım, four in Hesaplar.
- Each page renders without error against both an empty dataset and the fixture dataset.

The fixture (`src/fixtures/dataset.ts`) gains a small, realistic personal set: a handful of expenses across categories and both currencies, one six-instalment plan straddling the current month, one income row, and one open debt in each direction.

---

## 9. Phase 2 — deferred, and why it is separate

Editing from the page (add, correct, delete) is what Enis asked for and it is not dropped. It is separated because it changes the system's shape rather than adding a screen.

Until now the bot has been the **only** writer of the personal files, which is the entire reason the single-copy model in the ledger spec §5.3 is safe. A second writer voids that argument: the PWA writes to Drive directly, the bot writes locally and pushes by rclone, and with an `--update` pull a local write can mask a newer Drive edit — losing it silently. The investment ledger already solved this shape with a merge base and a dashboard-wins rule; the personal files need an equivalent before any write path from the page ships.

**Spec §5.3's expiry condition is hereby triggered. Phase 2 must open by revisiting it.**

---

## 10. Out of scope

Layer D (PDF statement ingestion) — deferred indefinitely by Enis. Account and card balances as a first-class view, which cannot be accurate before D. Cross-volume combined net worth. Per-volume navigation history. Any change to the investment volume's pages, charts or currency toggle.
