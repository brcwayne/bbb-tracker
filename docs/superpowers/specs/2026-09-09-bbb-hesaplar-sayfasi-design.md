# Hesaplar Sayfası — Account List, Balances and the Account Detail Calendar — Design

**Date:** 2026-09-09
**Scope:** A Money Manager-style account screen for the Hesaplar volume: a grouped account list with balances, a per-account detail page with a month calendar and that month's movements, and full add/edit/delete for both accounts and movements.
**Reference:** Realbyte "Money Manager" iOS app, Hesaplar tab (two screenshots supplied by Enis on 2026-09-09).

---

## 0. Where this starts

The Hesaplar volume shipped in three steps: the read-only pages (Özet, Harcamalar, Taksitler, Borçlar), then editing on Harcamalar / Taksitler / Borçlar with `ConflictError` handling. What it still has no concept of is **an account balance**. `personal_accounts.json` holds eight accounts with a name, a type, a currency and an owner — and nothing that would let the app answer "how much is in Nakit right now".

Enis reads Money Manager daily and wants that screen: accounts grouped by type, a balance on every row, an assets/debts/total band at the top, and — tapping an account — a month calendar where each day is marked with what went in and out, with that month's movements listed underneath and editable in place.

Two facts from the codebase shape everything below.

**The bot already writes transfers the app does not understand.** `personal_repository.add_transfer` writes rows with `tur: "TRANSFER"` and a `karsiHesap` field into `personal_tx.json`. The app's `PersonalTx` type declares `tur: 'GIDER' | 'GELIR'` and has no `karsiHesap`. Today those rows are silently mis-rendered on Harcamalar (they appear as if they were spending) and would make any balance wrong in both directions at once.

**`personal_accounts.json` carries a field the app's type does not.** Every account has `takmaAdlar` — the alias list the bot's NLP uses to match "diji", "sanal", "kuveyt turk" to an account (`src/nlp/personal_parser.py`, `src/bot/handlers/personal_flow.py`). `PersonalAccount` in `types.ts` has no such field. An account form built naively off the TypeScript type would write the file back without it and silently break the bot's account matching. This is the single highest-consequence risk in this phase.

---

## 1. Decisions

Made by Enis on 2026-09-09 unless noted.

| # | Decision | Rationale |
|---|---|---|
| H1 | **Balances are derived, never stored.** A pure module recomputes every balance from `personal_tx.json` on each render. | The bot writes rows without ever seeing the app. A stored `bakiye` field would drift the moment a Telegram message landed. The dataset is a few hundred rows; there is nothing to optimise yet. |
| H2 | **Manual balance corrections, not opening balances.** Enis states the real balance ("Nakit'te bugün 400₺ var") and the difference is written as a `DUZELTME` row. | Chosen over an `acilisBakiye` field on the account. The first correction on an account is in effect its opening balance, and reconciling against a bank app later costs one tap instead of an edit to a settings field. |
| H3 | **Four groups: Nakit, Banka Hesapları, Kredi Kartı, Alacak/Verecek.** Yatırımlar (brokers) and Fiziki are explicitly out of scope. | Enis's selection. The investment volume already answers the brokers question on its own pages; folding it in here would mean cross-volume currency conversion, which H5 rules out. |
| H4 | **Credit cards show two columns: `Bu Ay` and `Gelecek Ay`.** | Enis's selection, matching the reference screenshot. The instalment load sitting in a future statement is the thing he cannot see anywhere today. |
| H5 | **No currency conversion. ₺ and $ totals sit side by side.** | Upholds ruling U5 from the Kişisel Defter UI spec. `fxrates.json` exists, but converting would make yesterday's figures move when the rate moves. |
| H6 | **A fifth tab, and the volume's landing page.** `#/h/hesaplar` becomes `FIRST_PATH.hesaplar`; Özet stays as the chart page. | Enis's selection, matching Money Manager, where the account list is where the app opens. |
| H7 | **Calendar day: tap filters, long-press adds.** Tapping a day narrows the list below to that day; long-pressing (or the `+` that appears on the selected day) opens the add form with that date prefilled. | Enis's selection. The `+` affordance is not decoration — long-press has no keyboard or pointer equivalent, so it is the accessible path to the same action (§6.3). |
| H8 | **The app can create Gider/Gelir, transfers, credit-card payments and balance corrections.** | Enis's selection — all four. Without transfers, paying a card from a bank account would corrupt two balances at once. |
| H9 | **Balances count only `tarih <= today`.** Future-dated instalment rows land in the card's `Gelecek Ay` column and on Taksitler, never in a balance. | Consistent with every existing figure in this volume and with the bot's `/harcama_ozet`. The two must never disagree. |
| H10 | **Harcamalar lists only `GIDER` and `GELIR`.** Transfers and corrections live on the account detail. | Consequence of adding two new `tur` values. Without this, a transfer between two of Enis's own accounts would read as spending on the page he uses to check spending. |

---

## 2. Global constraints

- **The investment volume does not change.** Its nine hash routes, pages, charts and `USD ǀ ₺` toggle are untouched.
- **No new dependencies.** No calendar library, no date library, no chart library. The calendar is ~40 lines of date arithmetic against the existing `Date` primitives.
- **Nothing derived is computed inside a `.svelte` file.** Every balance, group total, statement period and calendar bucket lives in `src/lib/data/accounts.ts` and is unit-tested there. This is a standing project rule.
- **Writing `personal_accounts.json` must preserve unknown fields.** See §3.2. Non-negotiable — it is how the bot keeps working.
- **The write path is the existing one.** `appendRecord` / `updateRecord` / `deleteRecord` from `store.ts`, with the `ConflictError` → reload → "Bu dosya başka bir yerden değişti…" pattern already used on Harcamalar and Borçlar. No new persistence mechanism.
- **Drive-gated editing.** When `source.save` is absent (local dev source), every mutating control is disabled with the existing "Düzenleme için Drive bağlantısı gerekiyor" notice.
- **Turkish user-facing strings** throughout, matching the existing pages' voice.
- `npm test` green and `npm run check` at 0 errors / 0 warnings after every task.

---

## 3. Data model

### 3.1 `PersonalTx` — two new `tur` values

```ts
export interface PersonalTx {
  id: string
  tarih: string
  tur: 'GIDER' | 'GELIR' | 'TRANSFER' | 'DUZELTME'   // widened
  tutar: number
  paraBirimi: 'TRY' | 'USD'
  kategori: string
  aciklama: string
  hesap: string
  karsiHesap?: string            // new — the receiving account on a TRANSFER
  sahip: string
  taksitPlaniId: string | null
  taksitNo: number | null
  taksitToplam: number | null
  not: string
  kaynak: string
  olusturulma: string
}
```

`TRANSFER` is **not new data** — the bot has been writing it since the transfer flow shipped. This declares what is already on disk.

`DUZELTME` is new and written only by the app. Its `tutar` **is signed**: it is the delta applied to the balance and may be negative. Every other `tur` keeps `tutar` positive with the sign implied by the type. `kategori` on a `DUZELTME` row is `"duzeltme"`; on a `TRANSFER` the bot writes `"transfer"` and the app matches that.

**A correction stores the delta, not the target balance.** If Enis later adds a forgotten expense dated before the correction, the correction still applies its own delta and the balance moves accordingly — which is correct, because the money really was missing. Storing the target balance instead would silently swallow the newly-entered expense.

**Bot safety, verified:** `personal_repository.month_summary` filters `r["tur"] == "GIDER"` and `== "GELIR"` explicitly, so `DUZELTME` rows are ignored by `/harcama_ozet` and every other bot aggregation. No bot change is required for this phase. The plan re-verifies this rather than trusting this paragraph.

### 3.2 `PersonalAccount` — aliases, icon, statement day

```ts
export interface PersonalAccount {
  kod: string
  ad: string
  tur: 'NAKIT' | 'BANKA' | 'KREDI_KARTI'
  paraBirimi: string
  sahip: string
  aktif: boolean
  takmaAdlar?: string[]   // new to the type; ALREADY IN THE DATA — the bot's matcher
  simge?: string          // new — one emoji, shown before the name
  hesapKesim?: number     // existing in the type, unused until now — statement cut day 1–31
  sonOdeme?: number       // existing in the type, unused until now — payment due day 1–31
}
```

**The preservation rule.** Every write of an account row spreads the original object first:

```ts
const patch: PersonalAccount = { ...existing, ad, tur, paraBirimi, /* … */ }
```

Never construct an account row field-by-field from form state. A future field added by the bot must survive a round-trip through the app untouched. On a *new* account the object is built from the form, and `takmaAdlar` defaults to `[]`.

`takmaAdlar` is additionally **editable in the account form** as a comma-separated input, labelled "Telegram'da bu hesabı çağırdığın isimler". Making it visible is what stops it being silently dropped: a field on screen cannot be forgotten by the next person editing the form.

### 3.3 The sign rule — one formula for every account type

For an account `kod`, each row contributes:

| `tur` | when `row.hesap === kod` | when `row.karsiHesap === kod` |
|---|---|---|
| `GIDER` | `− tutar` | — |
| `GELIR` | `+ tutar` | — |
| `TRANSFER` | `− tutar` | `+ tutar` |
| `DUZELTME` | `+ tutar` (signed) | — |

```
bakiye(kod) = Σ contribution(row, kod)   for rows where row.tarih <= today
                                          and row.paraBirimi === account.paraBirimi
```

A credit card falls out of this without a special case: spending pushes it negative (a debt), a payment from the bank arrives as `karsiHesap` and pulls it toward zero. `NAKIT` and `BANKA` sit positive. **One formula, three account types** — no branch on `tur` of the account anywhere in the balance code.

The list renders a card's balance as a debt (red, and grouped under Borçlar in the top band); the underlying number stays negative so no display concern leaks into the arithmetic.

### 3.4 Foreign-currency rows

An account declares one `paraBirimi`. A row on that account in another currency is not summed into the balance or into any day/month total — it is listed in the movement list with its own currency and a small `≠` marker, and the detail page shows a one-line footnote: "Bu hesabın para biriminden farklı N kayıt toplamlara katılmadı." This should be rare-to-never; the alternative (silently dropping it, or silently adding TRY to USD) is worse in both directions.

---

## 4. Derivation module — `src/lib/data/accounts.ts`

Pure, no Svelte import, fully unit-tested. Signatures are indicative, not binding, but the boundaries are:

```ts
/** Balance per account code, in that account's own currency. */
export function accountBalances(
  rows: PersonalTx[], accounts: PersonalAccount[], today: string,
): Map<string, number>

/** The grouped list the page renders, with per-group subtotals per currency. */
export function accountGroups(
  rows: PersonalTx[], accounts: PersonalAccount[], debts: Debt[],
  today: string, opts?: { pasifDahil?: boolean },
): AccountGroup[]

/** Varlıklar / Borçlar / Toplam, per currency. */
export function netWorthBand(groups: AccountGroup[]): Record<string, {
  varliklar: number; borclar: number; toplam: number
}>

/** Bu Ay / Gelecek Ay / total debt for one credit card. */
export function cardStatement(
  rows: PersonalTx[], account: PersonalAccount, today: string,
): { buAy: number; gelecekAy: number; toplamBorc: number }

/** One month of an account: per-day in/out buckets plus the month's rows. */
export function monthMovements(
  rows: PersonalTx[], account: PersonalAccount, year: number, month: number,
): {
  gunler: Map<number, { giris: number; cikis: number; adet: number }>
  kayitlar: PersonalTx[]
  giris: number; cikis: number; net: number
  yabanciParaAdedi: number
}
```

`AccountGroup` covers both shapes the list renders — real accounts and the derived Alacak/Verecek people rows — so the page has one loop, not two:

```ts
export interface AccountRow {
  kod: string; ad: string; simge?: string; paraBirimi: string
  bakiye: number
  kart?: { buAy: number; gelecekAy: number; toplamBorc: number }
  href?: string          // '#/h/hesap/NAKIT' or '#/h/borclar/BORA'
  pasif?: boolean
}
export interface AccountGroup {
  baslik: string                              // 'Nakit' | 'Banka Hesapları' | …
  tur: 'NAKIT' | 'BANKA' | 'KREDI_KARTI' | 'KISI'
  satirlar: AccountRow[]
  toplam: Record<string, number>              // currency → subtotal
}
```

### 4.1 The statement period (`cardStatement`)

Given a cut day `D` (`hesapKesim`), let `C0` be the first cut date on or after today and `C₋1` the one before it:

- **Bu Ay** = Σ contributions to the card for `C₋1 < tarih <= C0`
- **Gelecek Ay** = Σ for `C0 < tarih <= C1`
- **toplamBorc** = the account's balance from §3.3 (so `tarih <= today` only)

**Signs, explicitly.** `toplamBorc` is the raw balance and is therefore **negative** when money is owed. `buAy` and `gelecekAy` are **positive magnitudes of the amount to be paid** — a statement window whose contributions sum to `−879,29` yields `buAy: 879.29`. This matches the reference screenshot, which prints the card's statement figures as positive red numbers and the overall balance as a negative one. A statement window in credit (a refund exceeding the period's spend) yields a negative `buAy`, and the page renders it in `--gain`.

Both columns include future-dated instalment rows falling in their window — that is the entire point of the second column.

**When `hesapKesim` is absent, fall back to the calendar month:** Bu Ay = the current month, Gelecek Ay = the next. Today no account in `personal_accounts.json` has the field set, so the fallback is what Enis sees until he fills the cut days in; it must be correct, not a placeholder.

Cut-day edge case: `D = 31` in a 30-day month clamps to the last day of that month. February with `D = 30` clamps to the 28th/29th.

### 4.2 Ordering

Groups always render in this order: **Nakit → Banka Hesapları → Kredi Kartı → Alacak/Verecek**. Within a group: active accounts first, then by `ad` with `localeCompare('tr')` so İ/ı/ş/ğ sort the way a Turkish reader expects. Inactive accounts are excluded unless `pasifDahil`.

Zero-balance accounts are shown, not hidden — the reference screenshot shows `₺ 0,00` rows and their absence would read as data loss.

---

## 5. Screen 1 — the account list (`#/h/hesaplar`)

```
┌──────────────────────────────────────────────┐
│ Hesaplar                            ✎    +   │
├──────────────────────────────────────────────┤
│   Varlıklar      Borçlar        Toplam       │
│   ₺ 25.776,00   ₺ -141.897,97  ₺ -116.121,97 │
│   $ 7.924,62    $ 0,00          $ 7.924,62   │   ← only if USD rows exist
├──────────────────────────────────────────────┤
│ Nakit                              ₺ 685,00  │
│   💵 Nakit                         ₺ 400,00  │
│   Papel                            ₺ 285,00  │
│                                              │
│ Banka Hesapları                 ₺ 21.325,00  │
│   🍀 Garanti Maaş               ₺ 25.091,00  │
│   🇶🇦 Qnb                        ₺ 3.766,00  │
│                                              │
│                        Bu Ay    Gelecek Ay   │
│ Kredi Kartı        ₺ 141.018,68    ₺ 879,29  │
│   🍀 Diji              ₺ 879,29    ₺ 879,29  │
│      ₺ -139.870,89                           │
│                                              │
│ Alacak / Verecek               ₺ 456.352,60  │
│   Bora                          $ 2.061,62   │
├──────────────────────────────────────────────┤
│  Pasif hesapları göster  ○                   │
└──────────────────────────────────────────────┘
```

- **Top band.** Per currency: `Varlıklar` = Σ of the row balances that are positive; `Borçlar` = Σ of the ones that are negative, **kept negative** (cards, and people you owe); `Toplam` = `Varlıklar + Borçlar`. Adding — not subtracting — is what makes the figures reconcile, and it is why `Borçlar` prints with its minus sign as in the reference. One line per currency present in the data; the `$` line is omitted entirely when there are no USD rows rather than showing `$ 0,00`.
- **Group headers** carry the group subtotal on the right and read as headers, not rows — the reference uses a dimmer weight and a slightly inset background.
- **Credit-card group** gets the two-column treatment (H4): the group header carries the column captions `Bu Ay` / `Gelecek Ay`, and each card row shows its two figures with the total debt as a smaller grey line beneath — exactly as the screenshot does for Diji.
- **Alacak/Verecek rows** come from `debtBalances(dataset.debts)` (already implemented in `personal.ts`); each row links to `#/h/borclar/<kisi>`.
- **`+`** opens the account form. **`✎`** toggles an edit mode that reveals per-row edit/delete controls, rather than putting two icons on every row permanently.
- Account rows link to `#/h/hesap/<kod>`.

**Empty state.** With no accounts at all: the existing `EmptyState` with "Henüz hesap yok" and a "+ Hesap Ekle" action. With accounts but no movements, the list renders normally with `₺ 0,00` balances — that is a true statement about the data, not an empty state.

---

## 6. Screen 2 — the account detail (`#/h/hesap/<kod>`)

```
┌──────────────────────────────────────────────┐
│ ‹ Hesaplar          💵 Nakit             ✎   │
│                     Nakit hesabı             │
│                     ₺ 400,00                 │
├──────────────────────────────────────────────┤
│           ‹      Eylül 2026      ›           │
│   Pt   Sa   Ça   Pe   Cu   Ct   Pz           │
│    1    2    3    4    5    6    7           │
│              -340      +85K                  │
│    8    9   10   11   12   13   14           │
│        -120                                  │
│   …                                          │
├──────────────────────────────────────────────┤
│   Giriş ₺ 85.000   Çıkış ₺ 460   Net ₺ 84.540│
├──────────────────────────────────────────────┤
│ 09 Eyl  Market · Migros          − ₺ 340,00 🗑│
│ 05 Eyl  Maaş                   + ₺ 85.000,00 🗑│
├──────────────────────────────────────────────┤
│  + Gider/Gelir   ⇄ Transfer   ⚖ Bakiye düzelt│
└──────────────────────────────────────────────┘
```

### 6.1 Header

Emoji + name, the account type as a subtitle, and the balance large. For a credit card, the balance is replaced by the `Bu Ay` / `Gelecek Ay` pair with the total debt beneath, matching the list.

### 6.2 The month calendar

- Weeks start **Monday** (`Pt Sa Ça Pe Cu Ct Pz`) — Turkish convention, not the JS `getDay()` default. Getting this wrong shifts every mark by a day, so it gets its own test.
- Leading/trailing cells from the adjacent months are rendered dimmed and are **not** interactive.
- Each cell shows the day number and, beneath it, that day's inflow in `--gain` and outflow in `--loss`, abbreviated (`85B`, `1,2B`). Below a cell width where two figures fit legibly, the figures are replaced by up to two coloured dots. Both branches are a `@container`/media decision in CSS; the data is identical.
- **Today** carries a ring. The **selected day** is filled with the volume accent.
- Month navigation: `‹` / `›`, and the month label itself is a button that jumps back to the current month.
- Every day cell is a `<button>` — keyboard reachable, with an `aria-label` reading the full date and totals ("9 Eylül 2026, çıkış 340 lira").

### 6.3 Interaction (H7)

| Gesture | Result |
|---|---|
| Tap / Enter / Space on a day | The list below narrows to that day; the day fills. Tapping the same day again clears the filter. |
| Long-press (600 ms) on a day | Opens the add form with `tarih` = that day and `hesap` = this account. |
| `+` button, revealed on the selected day | Identical to long-press. **This is the accessible path** — long-press has no keyboard equivalent, and it is also how the action is discoverable on a pointer device. |

Long-press implementation notes: start a timer on `pointerdown`, cancel on `pointermove` beyond a few pixels (so scrolling never fires it), cancel on `pointerup` before the threshold, and `preventDefault` on `contextmenu` for the cell so iOS Safari does not raise its own menu. Fire once, and suppress the click that follows.

### 6.4 Month totals and the movement list

The totals row (`Giriş` / `Çıkış` / `Net`) always describes the **whole visible month**, even when a day filter is active — otherwise selecting a day makes the month's figures vanish, which is the opposite of what the calendar is for. When a day is selected, a chip above the list reads "9 Eylül · 2 kayıt ✕".

List rows: date, category name + description, signed and coloured amount, an instalment badge (`3/12`) where present, and a source badge for `telegram` rows. Tapping a row opens it for editing in place; a trash icon opens the existing confirm-then-delete block. `TRANSFER` rows read as "⇄ Garanti Maaş → Nakit" and are editable only through the transfer form; `DUZELTME` rows read as "⚖ Bakiye düzeltmesi" and are deletable but not editable (edit it by making another correction — the ledger stays an append-only story of what you believed and when).

---

## 7. Forms

All four use the existing store helpers and the existing `ConflictError` recovery. All four are disabled without Drive.

| Form | File | Notes |
|---|---|---|
| Gider/Gelir | `HarcamaFormu.svelte` *(extend)* | Gains optional `hesap` and `tarih` presets and a `hesapKilitli` flag. Existing behaviour on Harcamalar unchanged. |
| Transfer | `TransferFormu.svelte` *(new)* | Kaynak hesap → hedef hesap, tutar, tarih, açıklama. Writes one row: `tur: 'TRANSFER'`, `hesap` = source, `karsiHesap` = target, `kategori: 'transfer'`. Rejects source === target. |
| Kart ödemesi | *(same form)* | Not a separate form — the transfer form opened with the target preset to this card and the title "Kart Ödemesi". |
| Bakiye düzeltme | `BakiyeDuzeltme.svelte` *(new)* | Shows the computed balance, takes the real balance, writes `tur: 'DUZELTME'` with `tutar` = real − computed. Refuses a zero delta. Confirms in words: "Nakit ₺340,00 artırılacak." |
| Hesap ekle/düzenle/sil | `HesapFormu.svelte` *(new)* | §3.2's spread rule. Fields: simge, ad, tür, para birimi, sahip, takma adlar, hesap kesim günü, son ödeme günü, aktif. `kod` is generated from `ad` on create (ASCII slug, uppercased) and is **immutable afterwards** — it is the foreign key every `personalTx.hesap` points at. |

**Deleting an account.** If any `personalTx` row references it (as `hesap` or `karsiHesap`), deletion is refused with "Bu hesabın N hareketi var — silmek yerine pasifleştirebilirsin." and a button that sets `aktif: false`. Only an account with no movements is genuinely deleted. Orphaning rows would corrupt every figure on the page that they still feed.

**IDs.** `HarcamaFormu` currently builds `px_<12 hex>` inline. That moves to `src/lib/data/ids.ts` as `newPersonalId()` and all four writers use it. The shape matches the bot's `derive_entry_id` prefix, so a mixed file stays coherent.

---

## 8. Routing

```
#/h/hesaplar        Hesaplar   (new — FIRST_PATH.hesaplar)
#/h/ozet            Özet
#/h/harcamalar      Harcamalar
#/h/taksitler       Taksitler
#/h/borclar         Borçlar
#/h/hesap/<kod>     account detail (not a tab; highlights Hesaplar)
#/h/borclar/<kisi>  Borçlar, preselected to one person
```

`HesapRoute` gains `'h-hesaplar'` and `'h-hesap'`. `currentRoute()` returns the parsed parameter alongside the route id, so `App.svelte` can pass `hesapKod` / `kisi` down without a second parse. An unknown `<kod>` renders "Hesap bulunamadı" with a link back, never a blank page. The tab strip shows five tabs; the detail route is not one of them and highlights the Hesaplar tab while open.

The investment volume's nine routes are untouched.

---

## 9. Changes to existing code

| File | Change | Why |
|---|---|---|
| `types.ts` | `PersonalTx.tur` widened, `karsiHesap?`; `PersonalAccount.takmaAdlar?`, `simge?` | §3 |
| `Harcamalar.svelte` | Filter to `tur === 'GIDER' \|\| tur === 'GELIR'` | H10 — otherwise transfers read as spending on the spending page |
| `personal.ts` | No logic change; add tests pinning that the new `tur` values are excluded from `monthlyTotals`, `monthSummary`, `categoryBreakdown` | These already filter on `'GIDER'`; the tests stop a future refactor from quietly widening them |
| `HarcamaFormu.svelte` | `hesap`/`tarih` presets, `hesapKilitli`, use `newPersonalId()` | §7 |
| `router.ts`, `App.svelte` | Two routes with a parameter, five tabs, new landing path | §8 |
| `fixtures/dataset.ts` | Accounts with balances, a transfer, a correction, a card with a cut day | Every test and the local dev view read this |
| `app.css` | Calendar tokens only if the existing ones do not cover it | Prefer existing `--gain` / `--loss` / `--hairline` / `--accent-defter` |

---

## 10. Testing

Vitest + `@testing-library/svelte`, TDD per the project's standing rule — `accounts.ts` is written test-first.

**`accounts.test.ts` must cover:** the sign rule for all four `tur` values on both sides of a transfer; a credit card going negative on spend and back toward zero on payment; `tarih > today` excluded (H9); a signed negative `DUZELTME`; foreign-currency rows excluded from balance and counted in `yabanciParaAdedi`; statement windows with `hesapKesim` = 1, 15 and 31 (including the 31-in-a-30-day-month clamp and February); the calendar-month fallback when `hesapKesim` is absent; group ordering and Turkish collation; `netWorthBand` splitting positive and negative across two currencies; a month's per-day buckets including a day with both an inflow and an outflow.

**Component tests:** the calendar starts its weeks on Monday; a tap filters the list and a second tap clears it; the totals row keeps showing the month while a day is filtered; the `+` affordance opens the form with the date prefilled; every mutating control is disabled without Drive.

**The preservation test, explicitly:** load an account carrying `takmaAdlar` and an unknown extra field, edit its name through `HesapFormu`, and assert both survive in the saved payload. This is the test that protects the bot.

---

## 11. Visual direction

The volume's existing language holds — same type scale, same `--hairline` rules, same tabular figures — with `--accent-defter` as the only accent. The reference screenshots are a *layout* reference, not a style one: Money Manager's flat grey rows are not the standard the rest of this app is held to.

The implementing agent must load the `frontend-design` skill before styling the list and the calendar. The calendar in particular is the one screen here with real visual risk: a 7×6 grid of small cells carrying two coloured figures each goes muddy very easily. Density, alignment of the figures under the day numbers, and how the selected/today states read without shouting are the things to get right.

---

## 12. Out of scope

- Yatırımlar and Fiziki groups (H3).
- Any currency conversion or a `USD ǀ ₺` toggle in this volume (H5).
- Editing a `DUZELTME` row in place (§6.4).
- Reordering accounts by hand — ordering is derived (§4.2).
- Any change to the Telegram bot. The bot is *verified* unaffected (§3.1); it is not modified.
- Recurring/scheduled transactions, budgets, account-level notes.
