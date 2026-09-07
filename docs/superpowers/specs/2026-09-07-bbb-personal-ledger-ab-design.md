# Personal Ledger — Layers A + B — Design

**Date:** 2026-09-07
**Scope:** Layer A (natural-language entry via Telegram + Qwen, writing to Drive) and Layer B (personal-ledger data model).
**Out of scope:** Layer C (inter-account transfers, `cashflows.json` bridge, person debt commands) and Layer D (credit-card statement ingest + rule engine). Both get their own spec → plan → build cycle.

---

## 0. Current state — correcting the record

Earlier planning notes assumed Layer A was greenfield ("build a Telegram bot, pick a Drive write strategy"). It is not. As of 2026-09-07 the following already exists and works:

- **`bbb-telegram-bot/`** — a standalone Python project (its own git repo, `main` branch, **no remote yet**) sitting inside the BBB Tracker checkout at `~/Desktop/Market/BBB/bbb-telegram-bot`. ~4,500 lines across `src/{nlp,data,bot,pdf,sync,ai,cli}`, 21 test modules.
- **It runs on Enis's Oracle VM**, long-polling, under systemd.
- **Drive writes are already solved — via `rclone`, not the Drive API.** `deploy/bbb-sync.{service,timer,path}` + `src/sync/once.py` run a lock-guarded convergence cycle: `rclone copy gdrive: → BBB/data/` (pull) → `reverse_import_from_bbb()` → `apply_sync_to_bbb()` → `rclone copy BBB/data/ → gdrive:` (push). A 2-minute timer catches dashboard edits; an inotify `.path` unit on the bot's `transactions.json` / `cashflows.json` pushes a Telegram trade near-instantly. Conflicts resolve **dashboard-wins**; timestamped backups precede every write; 3 consecutive rclone failures raise one Telegram DM, recovery raises one; `~/BBB/.sync-paused` is a kill switch and `~/BBB/.sync.lock` (flock) serialises runs.
- **The bot makes no AI calls.** `src/config.py` says so explicitly: the runtime is fully deterministic. `src/ai/gemini_service.py` is dormant behind `GEMINI_ENABLED=false`. There is **no Qwen code anywhere** in the repo.

So the *infrastructure* half of Layer A is done. What remains of A is the **natural-language layer** and **wiring a new file family into the existing pipe**. This spec is sized accordingly — it is much smaller than the original 4-layer sketch implied.

The design doc `2026-09-05-bbb-p5-telegram-drive-design.md` proposed an in-process Drive API client (`src/data/drive.py`, OAuth refresh token, md5 optimistic concurrency). **That was superseded by the rclone sync approach** and never built. It is historical; do not implement it.

---

## 1. Decisions

All made by Enis on 2026-09-07 unless marked otherwise.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Qwen runs on the same Oracle VM behind Ollama**, reached over `127.0.0.1`. | Already installed and running. No public exposure, no API key, no egress cost. |
| D2 | **Personal-ledger data lives as a single copy in the Drive `BBB/` folder** (locally: `BBB_DIR/data/`). No bot-local second copy, no merge machinery. | Only one writer exists in this phase (the bot). The two-copy + `reverse_import` machinery used for `transactions.json` exists to reconcile bot-vs-dashboard edits; the personal ledger has no dashboard writer yet, so that complexity would be pure cost. See §5.3 for the safety argument and its expiry condition. |
| D3 | **Instalments are recorded as one expense row per month.** | Enis wants "bu ay ne harcadım" to reflect actual monthly cash out, with future months visible ahead of time. |
| D4 | **No currency conversion.** A TRY transaction is stored in TRY; a USD one in USD. | Enis's explicit call: "TL işlemleri TL olarak, USD işlemleri USD olarak yazılsın, çevirmeye gerek yok." Reports total per currency, side by side. Reversible later — `tarih` + the existing `fxrates.json` is enough to add a converted view without a migration. |
| D5 | **Confirm-then-write.** The bot shows a one-line summary with `[Kaydet] [Düzelt] [İptal]`; nothing is persisted until Kaydet. | Mirrors the existing trade flow, so the two ledgers feel identical to use. |
| D6 | **Categories are a seeded, editable list.** Qwen must pick from it; it may not invent one. | Prevents the `market`/`markat`/`alışveriş` label drift that makes monthly reports untrustworthy. |
| D7 | **Payment instruments are individually defined** (cash, each bank account, each credit card) — not just a `nakit/kart/banka` type. | Layer C balances and Layer D statement matching both key off the specific card. Cheap now, expensive to retrofit. |
| D8 | **Multi-person household.** `people.json` is an editable list; every row carries a `sahip`. | Enis chose "hane halkı" over "sadece ben" / "ben + anne". |
| D9 | **`debts.json`'s schema is defined and the empty file is created in B, but nothing writes it until C.** | Locks the shape so C is additive, without inflating B's build. |
| D10 | **No PWA page in this phase.** | Enis: "tam tasarlanmış sayfayı bütün işlemler bitince istiyorum" — the designed ledger UI comes after C and D, once its full content is known. |
| D11 | **No historical data import.** The ledger starts empty. | Enis: "yok, sıfırdan başlıyoruz." |
| D12 | **The bot repo gets a GitHub remote; the VM updates via `git pull`.** | Enis's answer on deployment. Currently the bot repo has no remote at all, which makes VM updates unreproducible. |

---

## 2. Global constraints

- **The existing trade flow must not change behaviour.** Every current test stays green, and no code path that today reaches `analyze_trade_message` is re-ordered. The new layer attaches strictly *after* the existing deterministic parser and the correction handler have both declined a message (§4.1).
- **Numeric correctness never depends on the LLM.** Qwen extracts *fields*; Python computes every number, date, split, and id. A Qwen response containing arithmetic is ignored, not trusted.
- **Qwen is a soft dependency.** Timeout, connection refusal, malformed JSON, or a schema-invalid response all degrade to the bot's existing "mesajı anlayamadım" help text. A Qwen outage must never break trade entry, sync, or any existing command.
- **The new writer touches only the six personal-ledger files listed in §3.** It must never write `transactions.json`, `cashflows.json`, `instruments.json`, `snapshots.json`, `meta.json`, `fxrates.json`, `brokers.json`, or `portfolios.json` — those stay the exclusive domain of the existing `TrackerRepository` and the sync cycle. A guard test asserts this (§7).
- **No secrets in git.** `QWEN_URL`, `QWEN_MODEL` go in `.env` / `.env.example` (they are not secrets, but they are environment-specific). The Telegram token and any keys stay as they are.
- **Tests never reach the network.** Qwen is exercised through a fake HTTP transport; the sync/rclone layer already has this discipline (`tests/test_sync_runner.py`).
- **Turkish user-facing strings.** Every bot message, category name, and error follows the existing bot's Turkish voice.

---

## 3. Section B — the data model

Six new JSON files in the Drive `BBB/` folder. They follow the existing BBB conventions: a flat array per file, Turkish field names, `kod`/`ad` pairs for reference lists, `kaynak` + `olusturulma` provenance on every written row, ISO `YYYY-MM-DD` dates.

### 3.1 `personal_tx.json` — the ledger

```json
[
  {
    "id": "px_9f2a1c4d7e30",
    "tarih": "2026-09-07",
    "tur": "GIDER",
    "tutar": 340.0,
    "paraBirimi": "TRY",
    "kategori": "market",
    "aciklama": "Migros",
    "hesap": "NAKIT",
    "sahip": "ENIS",
    "taksitPlaniId": null,
    "taksitNo": null,
    "taksitToplam": null,
    "not": "",
    "kaynak": "telegram",
    "olusturulma": "2026-09-07T18:22:11Z"
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Content-derived, `px_` + 12 hex. See §3.7. |
| `tarih` | `YYYY-MM-DD` | The date the expense/income is *attributed to*. For an instalment row this is that instalment's month, not the purchase date. |
| `tur` | `"GIDER"` \| `"GELIR"` | |
| `tutar` | number | Always **positive**, in `paraBirimi` units. Direction lives in `tur`, never in the sign. |
| `paraBirimi` | `"TRY"` \| `"USD"` | No conversion (D4). Other codes are rejected in this phase. |
| `kategori` | string | Must be an active `kod` in `categories.json`. |
| `aciklama` | string | Short free text ("Migros", "Beyaz eşya"). May be empty. |
| `hesap` | string | Must be an active `kod` in `personal_accounts.json`. |
| `sahip` | string | Must be a `kod` in `people.json` with `haneUyesi: true`. |
| `taksitPlaniId` | string \| null | Set on instalment rows; `null` on ordinary rows. |
| `taksitNo` | int \| null | 1-based instalment index. |
| `taksitToplam` | int \| null | Total instalment count, denormalised so a row renders as "3/6" without a join. |
| `not` | string | Long free note. Usually empty. |
| `kaynak` | `"telegram"` \| `"manual"` | `"telegram"` for bot-created rows. `"manual"` reserved for a future PWA form, mirroring Ruling P2-1 on the investment side. |
| `olusturulma` | ISO-8601 UTC | Write time. Never edited on update. |

**Invariant:** `taksitPlaniId`, `taksitNo`, `taksitToplam` are either all null or all non-null.

### 3.2 `payment_plans.json` — instalment plans

The header record for a split purchase. The individual monthly charges live in `personal_tx.json` (D3); this file exists so a plan can be described, edited, or cancelled as one thing.

```json
[
  {
    "id": "pp_4b81e0aa9c12",
    "alisTarihi": "2026-09-07",
    "aciklama": "Beyaz eşya",
    "toplamTutar": 12000.0,
    "paraBirimi": "TRY",
    "taksitSayisi": 6,
    "taksitTutari": 2000.0,
    "sonTaksitTutari": 2000.0,
    "kategori": "ev",
    "hesap": "GARANTI-BONUS",
    "sahip": "ENIS",
    "durum": "AKTIF",
    "kaynak": "telegram",
    "olusturulma": "2026-09-07T18:22:11Z"
  }
]
```

- `taksitTutari` applies to instalments `1..n-1`; `sonTaksitTutari` to instalment `n` and absorbs the rounding remainder (§3.6). When the division is exact they are equal.
- `durum`: `"AKTIF"` | `"BITTI"` | `"IPTAL"`. Nothing computes `"BITTI"` automatically in this phase — it is a field C/D can use.
- **Referential rule:** exactly `taksitSayisi` rows in `personal_tx.json` carry this `taksitPlaniId`, and their `tutar` values sum to `toplamTutar` to the cent. This is asserted by a test.

### 3.3 `personal_accounts.json` — payment instruments

```json
[
  { "kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "paraBirimi": "TRY", "sahip": "ENIS", "aktif": true },
  { "kod": "GARANTI-BONUS", "ad": "Garanti Bonus", "tur": "KREDI_KARTI", "paraBirimi": "TRY",
    "sahip": "ENIS", "aktif": true, "hesapKesim": 15, "sonOdeme": 25 }
]
```

- `tur`: `"NAKIT"` | `"BANKA"` | `"KREDI_KARTI"`.
- `hesapKesim` / `sonOdeme` (day-of-month integers, 1–31) appear **only** on `KREDI_KARTI` rows and are optional. Nothing in A+B reads them; they exist so Layer D's statement matching has a place to live. The bot never asks for them — if Enis wants them set, he edits the file or Layer C/D adds a flow.
- Seeded on first run with a single row: `NAKIT`. Everything else is created on demand via the "+ Yeni" button (§4.4).

### 3.4 `categories.json`

```json
[ { "kod": "market", "ad": "Market", "tur": "GIDER", "aktif": true } ]
```

Seeded with 15 `GIDER` categories and 3 `GELIR` categories:

**GIDER:** `market` (Market), `yeme-icme` (Yeme-içme), `ulasim` (Ulaşım), `yakit` (Yakıt), `fatura` (Fatura), `kira` (Kira), `saglik` (Sağlık), `giyim` (Giyim), `ev` (Ev & eşya), `teknoloji` (Teknoloji), `eglence` (Eğlence), `egitim` (Eğitim), `abonelik` (Abonelik), `hediye` (Hediye), `diger` (Diğer).

**GELIR:** `maas` (Maaş), `ek-gelir` (Ek gelir), `diger-gelir` (Diğer gelir).

`kod` values are ASCII-safe slugs (no Turkish diacritics) so they survive any downstream tooling; `ad` carries the proper Turkish display form. `diger` is the fallback the bot offers when Qwen returns nothing usable — it is never auto-assigned silently, only offered as a button.

### 3.5 `people.json`

```json
[
  { "kod": "ENIS", "ad": "Enis", "haneUyesi": true,  "aktif": true },
  { "kod": "ANNE", "ad": "Anne", "haneUyesi": true,  "aktif": true }
]
```

One file serves two purposes: `haneUyesi: true` rows are valid `sahip` values (whose money it is); `haneUyesi: false` rows are external counterparties for Layer C's debts. In A+B only the `true` side is used; the flag exists so C does not need a schema change.

Seeded with `ENIS` (default `sahip`) and `ANNE`. Further members are added via "+ Yeni".

**Note on the investment side's `sahip`:** `data/brokers.json` already carries a free-text `sahip` (`"Enis"`, `"Anne"` — display-cased, not codes). The personal ledger deliberately uses uppercase `kod` references instead. Reconciling the two namespaces is a **Layer C** concern (C is where the two ledgers actually meet); do not touch `brokers.json` in this phase.

### 3.6 `debts.json` — schema only (D9)

Created as `[]`. No code in A+B writes it. Defined here so C is purely additive:

```json
[
  {
    "id": "db_...",
    "tarih": "2026-09-07",
    "yon": "VERDIM",
    "kisi": "AHMET",
    "tutar": 5000.0,
    "paraBirimi": "TRY",
    "aciklama": "",
    "hesap": "NAKIT",
    "durum": "ACIK",
    "kapatanKayitlar": [],
    "kaynak": "telegram",
    "olusturulma": "2026-09-07T18:22:11Z"
  }
]
```

`yon`: `"VERDIM"` (I lent — a receivable) | `"ALDIM"` (I borrowed — a payable). `kisi` references a `people.json` `kod`. `kapatanKayitlar` holds the ids of repayment rows; running balance = `tutar` minus the sum of those. Nothing in A+B validates this file.

### 3.7 Identifiers

Content-derived, following the ruling that closed P0/P1 (hashing a row *number* silently re-keys everything when a row is inserted).

```
canonical = "|".join([tarih, tur, f"{tutar:.2f}", paraBirimi, hesap, kategori,
                      sahip, aciklama.strip(), str(taksitPlaniId), str(taksitNo)])
id        = "px_" + sha256(canonical.encode("utf-8")).hexdigest()[:12]
```

Two genuinely identical rows (two identical coffees on the same day) collide by construction. Resolution: on write, if the id already exists in the file, append `-2`, then `-3`, and so on until free. This is deterministic given the file's current contents, which is the same guarantee the investment side settled on.

`payment_plans.json` ids use prefix `pp_` over `alisTarihi|toplamTutar|paraBirimi|taksitSayisi|hesap|sahip|aciklama`. `debts.json` uses `db_` (defined for C).

---

## 4. Section A — natural-language entry

### 4.1 Routing — where the new layer attaches

`src/bot/main.py::on_text_message` currently ends like this:

```python
handled = await handle_trade_text_message(update, context)     # deterministic trade parser
if handled: return
handled = await handle_conversational_correction(update, context)
if handled: return
await update.message.reply_text("💡 *Mesajı anlayamadım.* …")   # <-- dead end
```

**The change is to replace that dead end, and nothing else:**

```python
handled = await handle_personal_text_message(update, context)  # NEW — Qwen-backed
if handled: return
await update.message.reply_text("💡 *Mesajı anlayamadım.* …")   # unchanged fallback
```

This is the single most important structural property of this design:

- "10 adet aselsan 221'den aldım" is claimed by the deterministic trade parser exactly as it is today. Qwen never sees it. **Zero regression surface on the investment flow.**
- "markette 340 lira" is not a trade, is not a correction, and today produces the help text. Now it reaches Qwen.
- Qwen down / slow / confused → `handle_personal_text_message` returns `False` → the user sees today's help text. The bot's behaviour degrades to exactly its current behaviour, never worse.

A consequence worth stating: a *trade* sentence the deterministic parser fails to understand will also reach Qwen, which will correctly classify it as `ANLASILMADI` (its prompt only knows the personal ledger) and fall through. Using Qwen to rescue hard trade sentences is a plausible future win but is **out of scope** — it would put the LLM in the path of the investment ledger, which this phase deliberately avoids.

### 4.2 `src/ai/qwen_service.py` — the Qwen client

A small module with one public function and no bot knowledge:

```python
@dataclass
class PersonalParse:
    tur: str                      # "GIDER" | "GELIR" | "ANLASILMADI"
    tutar: float | None
    paraBirimi: str | None        # "TRY" | "USD"
    kategori: str | None          # a kod from categories.json, or None
    hesap: str | None             # a kod from personal_accounts.json, or None
    sahip: str | None             # a kod from people.json, or None
    tarihIfadesi: str | None      # the VERBATIM date phrase from the message
    taksitSayisi: int | None
    aciklama: str
    guven: float                  # 0..1, self-reported

def parse_personal_message(text: str, ctx: ParseContext) -> PersonalParse | None:
    """Returns None on ANY failure (timeout, refused connection, bad JSON,
    schema-invalid response). Never raises to the caller."""
```

- **Transport:** `POST {QWEN_URL}/api/chat` with `{"model": QWEN_MODEL, "stream": false, "format": "json", "options": {"temperature": 0}, "messages": [...]}`. `requests` is already a dependency; no new package.
- **Config:** `QWEN_URL` (default `http://127.0.0.1:11434`), `QWEN_MODEL` (default `qwen2.5:7b-instruct`), `QWEN_TIMEOUT` (default `20` seconds), `QWEN_ENABLED` (default `true`). Added to `src/config.py` and `.env.example`. The exact model tag is confirmed on the VM during the build (`ollama list`) — the default is a placeholder, not a claim.
- **Retries:** one retry on timeout or a 5xx, then give up. No exponential backoff — a human is waiting on a Telegram message.
- **The system prompt is built per call** from `ParseContext` and contains: today's date, the active category list (`kod` + `ad`), the active account list, the household member list, the default `sahip`, the required output keys, and the instruction *"Sadece JSON döndür. Hesaplama yapma, taksit tutarı hesaplama, tarihi çözme — sadece cümlede geçeni aktar."*
- **The response is never trusted.** `parse_personal_message` validates: `tur` in the allowed set; `tutar` a positive finite number or null; `paraBirimi` in `{TRY, USD}` or null; `kategori` / `hesap` / `sahip` each either null or a member of the corresponding list *passed in this call*; `taksitSayisi` an integer in `2..36` or null. Any violation → that field becomes `None` (treated as missing, so the bot asks) rather than failing the whole parse. A violation of `tur` itself → return `None`.
- The dormant `src/ai/gemini_service.py` is left untouched.

### 4.3 The deterministic core — `src/data/personal_rules.py`

Everything numeric, pure and separately testable, with no Telegram or HTTP imports:

**`resolve_date(phrase, today) -> (iso_date, warnings)`** — reuses the bot's existing Turkish date logic. `src/nlp/parser.py::_resolve_date` already handles `dün`, `bugün`, and `1 eylül 2026`-style forms and warns `"Tarih anlaşılamadı, bugün varsayıldı."`. **Task: hoist it to a public `resolve_turkish_date(text, today_date)`** in `src/nlp/` and have both the trade parser and the personal flow call it. Do not fork a second date parser. If `tarihIfadesi` is null or unresolvable, the date is today and the summary shows it, so `Düzelt` can fix it — no extra question is spent on this.

**`split_instalments(total, n) -> list[Decimal]`**

```
base = floor(total / n, 2)          # 2 decimal places, rounding down
rows = [base] * (n - 1) + [total - base * (n - 1)]
```

Guarantees `sum(rows) == total` exactly. Computed in `Decimal`, stored as float rounded to 2 places. Example: `10000 / 3` → `3333.33, 3333.33, 3333.34`. Example: `12000 / 6` → six exact `2000.00`.

**`instalment_dates(purchase_date, n) -> list[date]`** — instalment `k` (1-based) falls on `purchase_date` shifted by `k-1` months, **clamped to the last day of the target month**. So a purchase on 31 January with 3 instalments yields 31 Jan, 28 Feb, 31 Mar. The first instalment is in the purchase month.

> This is a simplification: a real Turkish credit card posts the first instalment to the *next* statement, and the actual dates depend on the card's cut-off day. `personal_accounts.json` already carries `hesapKesim`/`sonOdeme` for when Layer D brings real statement data. Until then the simple rule is used, and it is stated in the confirm summary ("Eki–Mar") so a wrong month is visible before saving.

**`build_rows(parse, ctx) -> (list[personal_tx], payment_plan | None)`** — the single function that turns a validated `PersonalParse` plus resolved date into the rows to persist. With `taksitSayisi` null it returns one row and no plan; otherwise `n` rows and a plan, ids derived per §3.7.

**`missing_fields(draft) -> list[str]`** — a required field is missing when: `tutar` is null; or `hesap` is null and more than one active account exists; or `kategori` is null; or `sahip` is null and more than one household member exists. When exactly one candidate exists it is filled silently rather than asked (a single-account, single-person setup should never be interrogated).

### 4.4 `src/bot/handlers/personal_flow.py` — the conversation

Modelled directly on `trade_flow.py`, which already solves draft state, missing-field questions, inline keyboards, and stale-callback handling. Reuse its patterns; do not invent new ones.

1. **Parse.** Call `parse_personal_message`. `None` or `tur == "ANLASILMADI"` → return `False` (caller shows the existing help text).
2. **Draft.** Build a draft dict in `context.user_data["personal_draft"]`, exactly as the trade flow keeps its `ParsedTrade`.
3. **Ask at most one question per turn.** If `missing_fields` is non-empty, ask about the first one with an inline keyboard of the valid options. Categories: the 15 as buttons across rows, plus **`+ Yeni`**. Accounts and people likewise.
4. **`+ Yeni`** puts the flow in "awaiting a name" state; the next plain text message creates the row in `categories.json` / `personal_accounts.json` / `people.json` (slugified ASCII `kod`, the typed text as `ad`, `aktif: true`, and for an account a type question — `Nakit / Banka / Kredi kartı`) and resumes the draft. This is what removes the need for any settings screen while there is no PWA page (D10).
5. **Confirm.** One summary line plus `[✅ Kaydet] [✏️ Düzelt] [❌ İptal]`:
   - ordinary: `🧾 Market · 340 TL · Migros · Nakit · Enis · 7 Eyl`
   - instalment: `🧾 Ev · 12.000 TL · Beyaz eşya · Garanti Bonus · Enis · 6 × 2.000 TL (Eki–Mar)`
   - Any warning from date resolution is appended on its own line.
6. **`Düzelt`** reuses the trade flow's field-edit keyboard shape (tutar / kategori / hesap / tarih / sahip / açıklama), one field at a time, then returns to the confirm step.
7. **`Kaydet`** calls `PersonalRepository.add_entry(rows, plan)` and replies `✅ Kaydedildi` with a `↩️ Geri al` button. **`İptal`** discards the draft.
8. **Undo** is an in-session stack of the pre-write arrays, exactly like `undo_last_transaction`. The existing `/geri_al` command stays bound to the *trade* ledger; the personal undo lives on the confirmation message's button. (Overloading `/geri_al` across two ledgers would be ambiguous — deliberately avoided.)

### 4.5 New commands

| Command | Behaviour |
|---|---|
| `/defter` | Last 10 personal-ledger rows, newest first, with their ids. |
| `/harcama_ozet` | Current month: total per currency, then a per-category breakdown, descending. Future-dated instalment rows are excluded (`tarih <= today`), so the figure is money actually spent. |
| `/tanimlar` | Lists the active categories, accounts, and household members — so Enis can see what Qwen is allowed to choose from. |

Registered in `BOT_COMMANDS` so they appear in Telegram's `/` menu. `/yardim` gains a short personal-ledger section with two examples.

---

## 5. Persistence

### 5.1 `src/data/personal_repository.py`

A new class, deliberately **not** an extension of `TrackerRepository` — that class carries the two-copy sync machinery (`reverse_import_from_bbb`, `apply_sync_to_bbb`, `last_synced.json`) which the personal ledger explicitly does not use (D2). Mixing them would make both harder to reason about.

```python
class PersonalRepository:
    def __init__(self, bbb_dir: Path | None = None): ...   # defaults to config.BBB_DIR / "data"
    # reference lists
    def list_categories(self) -> list[dict]: ...
    def list_accounts(self) -> list[dict]: ...
    def list_people(self) -> list[dict]: ...
    def add_category(self, ad: str, tur: str = "GIDER") -> dict: ...
    def add_account(self, ad: str, tur: str, para_birimi: str = "TRY", sahip: str = "ENIS") -> dict: ...
    def add_person(self, ad: str, hane_uyesi: bool = True) -> dict: ...
    # the ledger
    def list_entries(self, limit: int | None = None) -> list[dict]: ...
    def add_entry(self, rows: list[dict], plan: dict | None) -> dict: ...
    def undo_last_entry(self) -> dict | None: ...      # restores the pre-write arrays
    def month_summary(self, year: int, month: int) -> dict: ...
    def ensure_seeded(self) -> None: ...               # see §5.2 — pulls before seeding
```

- Writes are atomic (temp file + `os.replace`) and preceded by a timestamped backup into `BBB_DIR/data/backups/`, matching `TrackerRepository._atomic_write_json`. Reuse that helper rather than copying it — hoist it to a shared module if that is cleaner.
- `add_entry` writes `personal_tx.json` and, when a plan exists, `payment_plans.json` — the plan first, so a crash between the two leaves an orphan plan (harmless, visible) rather than instalment rows pointing at a plan that does not exist.
- `undo_last_entry` pops the in-session stack pushed by `add_entry` and rewrites both files, so undoing an instalment purchase removes the plan **and** all of its rows in one step. There is no id-addressed delete in this phase — nothing in the flow needs one, and editing arrives with Layer C. (`/defter` still prints ids, which is useful for reading and for a manual fix.)
- `ensure_seeded` is idempotent and never modifies an existing file. Its bootstrap ordering is load-bearing — see §5.2.

### 5.2 Sync wiring

`src/sync/once.py`'s cycle is `rclone copy gdrive: → BBB/data/` (pull), then merge, then `rclone copy BBB/data/ → gdrive:` (push). `rclone copy` overwrites a destination file whenever it differs from the source — **it does not compare which one is newer.**

That is fine for the investment files, because the bot's authoritative ledger lives in its own `bbb-telegram-bot/data/` directory, outside both rclone paths: the pull may clobber `BBB/data/transactions.json`, and `apply_sync_to_bbb()` immediately rebuilds it from the bot's copy.

**The personal ledger has no such second copy (D2), so the plain pull would destroy it.** Concretely: the bot writes an expense at 10:00; the cycle at 10:02 pulls the Drive copy — last pushed at 10:00, before the write — over the local file; the row is gone before it is ever pushed. A lock does not help: it serialises the write and the cycle but does not stop the overwrite.

The fix has two parts:

1. **Split the pull.** `_run_rclone("pull")` excludes the six personal files from the blind copy and fetches them in a second invocation carrying `--update`, which copies only when the *source* is newer:

   ```
   rclone copy gdrive: BBB/data/ --exclude backups/** --exclude {the six personal files}
   rclone copy gdrive: BBB/data/ --update --include {the six personal files}
   ```

   A newer local write therefore survives the pull and is carried out by the push. A hand edit made directly in Drive is newer than the local copy and still comes down, so the Drive side stays usable.

   **`--update` is applied only to the personal files, never to the whole pull.** Adding it globally would break the existing two-way sync: `apply_sync_to_bbb()` rewrites `BBB/data/transactions.json` at the end of every cycle, making the local copy permanently newer than Drive's, so a global `--update` would skip it forever and dashboard edits would stop being imported. This is a trap worth naming, because the one-line "just add `--update`" version of this fix looks correct and is not.

2. **Seed only after a successful pull.** `ensure_seeded` must not create empty files on a machine whose local `data/` is missing but whose Drive folder is populated — the empty files would be newer and the next push would overwrite real data. So `ensure_seeded` first runs the personal-file pull above; if rclone fails, it seeds nothing, logs a warning, and the personal-entry handler returns `False` for that run (the user sees the ordinary help text). Only after a successful pull does it create the files that are genuinely absent on both sides.

Also:

- `deploy/bbb-sync.path` gains `PathModified=` entries for `BBB/data/personal_tx.json` and `BBB/data/payment_plans.json`, so a Telegram expense pushes to Drive as fast as a trade does. The 2-minute timer covers the reference-list files; extra inotify watches for those are not worth it.
- No other change to the cycle: the push already copies the whole directory, so the six files ride along.
- `.gitignore` in the BBB repo already excludes `data/`. Verify it covers the new files — they are user data and must never be committed.

### 5.3 Concurrency, and when this model expires

With §5.2 in place, the remaining question is interleaving rather than clobbering. `PersonalRepository` acquires the existing `BBB_DIR/.sync.lock` (flock) around every read-modify-write; `SyncRunner.run_once` already holds that lock for its whole cycle, so a write can never land in the middle of a pull/push. The lock helper is currently private to `SyncRunner`; hoist it to a shared module and give it a second caller.

That leaves a single-writer system with a last-writer-wins tiebreak on the Drive side, which is correct **because the bot is the only writer**. There is no PWA page (D10) and nothing else touches these files.

**Expiry condition — record this in the plan and in the bot's README.** The moment anything else can *write* the personal ledger, last-writer-wins becomes silent data loss between two real editors, and this model needs what `transactions.json` already has: a merge base and a conflict rule. Because the designed UI page is deliberately scheduled last, the phase that builds it **must** revisit this section before shipping a write path. This should be discovered by reading the spec, not by losing a month of expenses.

## 6. Deployment (D12)

The bot repo currently has **no git remote**, so there is no reproducible way to get code onto the VM. The plan's closing tasks:

1. Create a **private** GitHub repo for `bbb-telegram-bot` under Enis's account and push `main`. Private, not public: `bot.log` history, `pdf_uploads/`, and the data directory make this repo a poor candidate for publication, and the `.env` discipline has never been audited for a public setting. (The BBB tracker repo stays public and unchanged.)
2. Confirm `.gitignore` covers `.env`, `data/`, `bot.log`, `pdf_uploads/`, `.venv/`, `__pycache__/` before the first push. **Audit the existing history for a committed secret before pushing** — the repo was built locally with no expectation of publication.
3. Document the VM update procedure in `deploy/README.md`: `git pull` → `pip install -r requirements.txt` → `systemctl restart` the bot service.

Enis's manual steps (the build session cannot do these): create the GitHub repo, confirm the Ollama model tag on the VM (`ollama list`), set `QWEN_MODEL` in the VM's `.env`, and run the first `git pull` + restart.

---

## 7. Test strategy

The bot's suite is `pytest`, currently 21 modules, with an established discipline of no network and no real Telegram. New tests follow it.

| Area | Tests |
|---|---|
| `split_instalments` | exact division; remainder to the last row (`10000/3`); sum equals the total for a spread of totals and counts; `n = 2`; rejects `n < 2` and non-positive totals. |
| `instalment_dates` | month rollover; the 31 Jan clamp across a non-leap and a leap February; first instalment is the purchase month. |
| `resolve_turkish_date` | the trade parser's existing cases still pass after the hoist (regression); `dün`, `bugün`, `1 eylül 2026`; unresolvable → today + warning. |
| ids | determinism for identical input; different input differs; the `-2` collision suffix; a plan's rows sum to `toplamTutar`. |
| `parse_personal_message` | fake transport: valid response parses; timeout → `None`; connection refused → `None`; non-JSON body → `None`; a hallucinated category/account/person → that field is `None`, the rest survives; `taksitSayisi: 0` or `99` → `None`; one retry then give up. **No test touches a real Ollama.** |
| `missing_fields` | asks for a missing amount; does not ask for the account when only one exists; asks when several exist. |
| `PersonalRepository` | seeding is idempotent; seeding is skipped when the pre-seed pull fails (§5.2); `add_entry` appends and backs up; `undo_last_entry` removes an instalment plan *and* exactly its rows; `month_summary` totals per currency and excludes future-dated instalment rows; the file set written is exactly the six personal files (**a guard test asserting the investment JSONs are untouched** — mirroring the existing `test_bbb_folder_remains_intact` discipline). |
| Sync wiring | the personal-file pull carries `--update` and the main pull does not (a regression test on the constructed rclone argv, so nobody "simplifies" it back into one call); the personal files are excluded from the main pull exactly once. |
| `personal_flow` | fake Telegram objects, as `test_trade_flow.py` does: full happy path through confirm → save; the one-question path; `+ Yeni` category creation; `İptal` discards; `Kaydet` on a stale draft does not crash. |
| Routing | a trade sentence never reaches the Qwen client (assert it is not called); an unparseable sentence does; with Qwen returning `None` the user gets the existing help text and nothing is written. |

The existing 21 modules must stay green. The `_resolve_date` hoist is the only change touching existing code paths, and it is a pure move plus a rename.

---

## 8. Deferred

**To Layer C:** transfers between personal accounts; the bridge writing a `cashflows.json` row when money moves from a bank account into a brokerage account; bot commands for lending/borrowing (`debts.json` gets its writer); reconciling the `people.json` code namespace with `brokers.json`'s free-text `sahip`; per-account running balances.

**To Layer D:** credit-card statement upload (PDF/CSV), the keyword rule engine, per-line classification with a confirm-before-write summary, and real statement-driven instalment dates via `hesapKesim`/`sonOdeme`.

**To the final UI phase:** the designed "Kişisel Defter" page, and — mandatorily — revisiting §5.3 before that page can write.

**Explicitly not planned:** using Qwen to rescue trade sentences the deterministic parser misses; currency conversion in the personal ledger (D4); importing historical expense data (D11); the Drive API client from the superseded P5 spec.
