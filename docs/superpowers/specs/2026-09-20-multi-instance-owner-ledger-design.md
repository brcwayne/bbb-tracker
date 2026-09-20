# Multi-Instance Deployment + Owner Ledger — Design

**Date:** 2026-09-20
**Scope:** Let a second person (Enis's friend) run the same system on his own data, and give him the one thing his money situation needs that the ledger lacks: a per-owner balance across mixed accounts.
**Classification:** Architectural (new deployment model, new ledger concept, new web page).

---

## 0. Where this starts

The friend runs a café, manages his own investments, and holds money for several older relatives. All of it sits in a **mixed** pool of bank accounts and cash: relatives' money is moved into his account, their bills are paid out of it, and he forgets how much is whose. The café's daily sales already live in a Google Sheet (owned by Enis, entered from a phone) and stay there for now. He is comfortable on a phone, not on a PC: **Telegram is how he enters, the web page is how he looks.** Enis owns the infrastructure (Oracle VM, GitHub) and a fresh Google account that will be handed to the friend at the end.

Facts in the code that shape the design:

- **The web app is already multi-tenant.** `DriveSource` lets the signed-in user pick any folder in *their* Drive (`drive.ts`, Picker). A second user needs no code change to see *their* data — only to be added as an OAuth test user.
- **The bot is already env-driven** for token, data dir, allowed user IDs (`src/config.py`). What blocks a second instance is a handful of constants: `DEFAULT_BROKER=QNB`, `DEFAULT_PORTFOLIO=ENIS`, a hard-coded `"sahip": "ENIS"` in `personal_flow.py`, the rclone remote name `gdrive:` and `~/BBB` paths in `sync/once.py`, and — biggest — the **trade flow** (`parser.py`, `keyboards.py`, `entity_extractor.py`), which hard-codes Enis's brokers and portfolios.
- **Half the owner concept exists.** `PersonalTx.sahip`, `PersonalAccount.sahip`, `people.json`, `TRANSFER`, `DUZELTME`, derived account balances. Missing: a way to move money *between owners* without moving it between accounts, and any per-owner balance.
- **Gemini is not used.** The bot is rules-first with a local Qwen fallback; `GEMINI_ENABLED` defaults off. No Gemini key is needed for this work.
- Baseline before any change: bot suite **625 passed**.

---

## 1. Decisions

| # | Decision | Rationale |
|---|---|---|
| M1 | **One codebase, two deployments.** No fork. Instances differ by `.env`, data dir and Drive folder only. | A fork drifts: every investment improvement Enis makes would have to be ported by hand. The friend needs those improvements too. |
| M2 | **An instance owns everything it touches:** its own Telegram bot token, its own VM directory + venv + `.env`, its own systemd units, its own Google account and Drive folder, its own rclone remote. Nothing is shared but the code and the local Ollama. | Enis: "my data and his must be completely separate." |
| M3 | **Enis's existing units and paths are not touched.** The friend's instance gets new, differently-named units (`bbb-friend-*`) and directories. | Enis's production bot must not be at risk from this work. |
| M4 | **Owner = an entry in `people.json`.** Owners are: the friend himself, the café, each relative. No new file. | `sahip` already points at `people.json`; `haneUyesi` distinguishes household from non-household. |
| M5 | **New `tur: 'SAHIP_AKTARIM'`** moves money between owners inside one account: `sahip` is the giver, new field `karsiSahip` the receiver. It changes owner balances, never an account balance. | The most-forgotten movement ("took 5,000 of Mom's money into mine") needs its own row type, or it gets mis-entered as a bank transfer. |
| M6 | **Owner balances are derived, never stored** (same rule as H1 in the Hesaplar spec). | The bot writes rows the app never sees; a stored field drifts. |
| M7 | **Invariant:** per currency, Σ owner balances = Σ account balances (cash + bank + card liabilities). A gap is shown as a warning banner ("Fark: X ₺ — bir kayıt eksik"), never silently absorbed. | This is how a forgotten entry becomes visible. |
| M8 | **Trade flow is disabled on the friend's instance** (`TRADE_FLOW_ENABLED=false`) in v1. He enters investments in the web app. Making the flow data-driven is a later phase. | The flow's aliases and keyboards are Enis's brokers. Generalising them is a separate refactor with its own risk. |
| M9 | **Café income = a `GELIR` row with `sahip` = the café owner**, entered by hand (monthly total) in v1. Reading the Sheet automatically is out of scope. | Without the income the café's owner balance is wrong, but automating it is not needed to be useful. |
| M10 | **Backward compatible by default.** Absent `karsiSahip` = none; unknown `tur` values already render safely; Enis's data files are not migrated. | Enis's dataset must come out of this untouched. |
| M11 | **Secrets never enter git, specs or memory.** Bot token and Telegram IDs go straight into the VM `.env`. | The token was pasted into a chat during this work; it is treated as sensitive from here on. |
| M12 | **Account handover at the end:** password, 2-step verification, **recovery email and phone** move to the friend. The service-account share and one working sync cycle are verified *before* handover. | If recovery stays with Enis, Enis is still the real owner of the account. |

---

## 2. Global constraints

- **Enis's behaviour does not change.** Every existing bot and web test stays green; new behaviour is additive.
- **No new dependencies** on either side.
- Owner arithmetic lives in **one pure module per language** (`app/src/lib/data/owners.ts`, `src/data/owners.py`), driven by **shared JSON fixtures** so the two implementations are held to identical outputs. Nothing derived is computed inside a `.svelte` file (standing project rule).
- Writing `personal_accounts.json` / `people.json` **preserves unknown fields** (`takmaAdlar` etc.), as in the Hesaplar spec.
- The write path is the existing one (`appendRecord`/`updateRecord`, `ConflictError` handling; bot 3-way merge).
- Turkish user-facing strings, matching the existing voice.
- **Deploy order is fixed:** tests green → Enis's instance unchanged and verified → friend's instance.

---

## 3. Data model

### 3.1 `PersonalTx`

```ts
tur: 'GIDER' | 'GELIR' | 'TRANSFER' | 'DUZELTME' | 'SAHIP_AKTARIM'
karsiSahip?: string   // receiver on SAHIP_AKTARIM
```

### 3.2 Owner balance (per owner, per currency, rows with `tarih <= today`)

| Row | Effect on owner balances |
|---|---|
| `GELIR`, sahip o | o: +tutar |
| `GIDER`, sahip o | o: −tutar |
| `SAHIP_AKTARIM` | sahip: −tutar, karsiSahip: +tutar |
| `DUZELTME`, sahip o | o: += the row's signed delta (same sign rule as `txDelta`) |
| `TRANSFER` between accounts | none |
| future-dated instalment rows | excluded (H9) |

Rows with an empty or unknown `sahip` fall into a visible **"Sahipsiz"** bucket so the invariant still holds and the gap is *attributable*, not hidden.

Balance corrections (`DUZELTME`) already carry `sahip`; the form defaults it to the account's `sahip` and lets the user change it. **Opening balances are set this way** — one correction per account per owner, once, when the friend starts.

`debts.json` (loans to third parties) is unchanged and separate from owner balances.

---

## 4. Components

### 4.1 Web (`app/`)
- `lib/data/owners.ts` — `ownerBalances(ds, today)`, `ownerInvariant(ds, today)`; unit-tested against the shared fixtures.
- New tab **Kişiler** in the Hesaplar volume (`#/h/kisiler`): a balance per owner (₺ and $ side by side, no conversion — H5), the invariant banner, tap an owner for their movements.
- `SahipAktarimFormu.svelte` — giver, receiver, amount, date, note.
- Existing entry forms gain a **sahip picker** where they lack one.
- The tab is visible only when `people.json` has ≥ 2 active owners, so a single-owner dataset looks exactly as it does today.

### 4.2 Bot (`src/`)
- `data/owners.py` — port of §3.2, same fixtures.
- `/bakiye` — one line per owner + the invariant status.
- Personal flow understands the owner-to-owner phrasing ("annemin parasından 5000 aldım", "anneye 3000 verdim") and produces a `SAHIP_AKTARIM` draft that is **always confirmed** before writing. Expense phrasing with an owner ("anne için elektrik 800") sets `sahip`.
- Instance config in `config.py`: `INSTANCE_NAME`, `TRADE_FLOW_ENABLED` (default `true`), `DEFAULT_OWNER`, `RCLONE_REMOTE` (default `gdrive`). Hard-coded `"ENIS"` in `personal_flow.py` becomes `DEFAULT_OWNER`.
- `sync/once.py` reads the remote name and paths from config.

### 4.3 Deployment (`deploy/`)
- `deploy/instances/friend/` — unit files, `.env.example`, empty seed data (`people.json`, `personal_accounts.json`, `categories.json`, empty ledgers) and a short Turkish **KULLANIM.md** for the friend.
- `deploy/deploy.sh <instance>` — rsync with **anchored** excludes (`/data/`, not `data/` — the trap that once dropped `src/data/`), runs the test suite first, restarts only that instance's units.
- VM layout: `/home/ubuntu/bbb-friend/` (code, own `.venv`, own `.env`), `/home/ubuntu/BBB-friend/data/` (working copy), rclone remote `gdrive-friend`.
- Ollama stays shared on localhost.

### 4.4 Google side (manual, Enis)
- Friend's new Google account added as an **OAuth test user** on the existing Cloud project.
- A `BBB` Drive folder in that account, shared as Editor with the sync service account. The seed files are **uploaded by the account owner** (Drive UI), because a service account cannot own files (the duplicate-file gotcha).

---

## 5. Testing

- Bot: 625 baseline stays green; new tests for `owners.py`, the owner-transfer flow, config defaults, `TRADE_FLOW_ENABLED=false` routing.
- Web: existing suites + `svelte-check` at 0 errors; new tests for `owners.ts`, the Kişiler page, the form.
- **Parity:** the shared fixtures assert TS and Python return identical owner balances and invariant results.
- **Enis-unchanged check:** run both suites, plus compute the account balances of Enis's real dataset before and after and require byte-equal output.
- Smoke test in Telegram on the friend's instance from his ID, then one full sync cycle to Drive, then a web sign-in with the new account.

---

## 6. Out of scope (later)

- Data-driven trade flow (brokers/portfolios from `brokers.json`) for the friend.
- Reading the café Sheet automatically.
- Tooling to reconstruct opening balances from bank statements (done by hand at first).
- Google OAuth verification (Testing mode's 7-day session expiry stays).
- Currency conversion between ₺ and $.

## 7. Risks

- **Enis can technically read the friend's data** on his VM. The friend should be told.
- **Sessions expire weekly** while the OAuth app is in Testing mode.
- **The VM is a single point of failure**; Drive holds the data, so nothing is lost, but the bot stops.
- **Opening balances depend on the friend's memory and statements.** The tool exposes the gap; it cannot invent the past.
