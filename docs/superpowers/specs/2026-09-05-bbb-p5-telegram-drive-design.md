# P5 — Telegram Bot ↔ Google Drive Integration — Design

## Purpose

`bbb-telegram-bot/` (a standalone Python project sitting inside the BBB Tracker repo, built mostly by Gemini) already implements: Turkish NLP trade parsing, a positions/P&L engine, JSON repository CRUD + undo, PDF statement reconciliation, a Telegram bot loop, and a hybrid AI layer (`src/ai/gemini_service.py` — deterministic parser first, Gemini `parse_complex_trade` fallback for hard sentences, plus `answer_portfolio_question` for free-form portfolio Q&A). 25 of 27 tests pass.

The gap: the bot writes trades only to its **own local `data/*.json`** copy and offers a `/fark` command to show the diff against the tracker's files. That means every mobile-entered trade must still be re-typed into the PWA. This phase makes the bot write to **the same Google Drive folder the PWA reads/writes** (established in P2), so a Telegram trade appears in the PWA with no re-entry — one source of truth.

Decision (made 2026-09-05, controller's call under standing delegation): **Option B — real Drive integration**, not the local-staging-plus-manual-sync model. Option A was rejected because it still requires double data entry, which defeats the bot's entire reason to exist.

## Scope

**In:**
1. A Python Drive client in the bot (`src/data/drive.py`) mirroring P2's `DriveSource` contract: OAuth (refresh-token flow), list files in the `BBB/` folder, read one JSON file, and write one with optimistic concurrency (md5Checksum compare → conflict → reload + retry once).
2. `TrackerRepository` gains a pluggable backend: `LocalBackend` (current behavior, for tests + token-less console) and `DriveBackend` (reads/writes the live Drive files). Selected by config (`STORAGE=drive|local`).
3. Trade confirm (`trade_flow.py`), cashflow entry, undo (`/geri_al`), and edit (`edit_flow.py`) all route through the repository, so they transparently hit Drive when `STORAGE=drive`.
4. Config + path fixes (see §6) so the project runs from its real location and `pytest` is green from any cwd.
5. `/fark` repurposed: with Drive as the live backend there's nothing to reconcile against a separate copy, so `/fark` instead reports "Drive senkron" plus the last write's timestamp/checksum, or is removed. (Decide during planning — lean toward a short status line, not removal, so the command doesn't 404.)

**Out (YAGNI / deferred):**
- A hosted/always-on deployment. The bot runs on Enis's machine (or a Pi) via `python -m src.bot.main`; no containerization, no webhook server — long-polling is fine for one user.
- Two-way conflict UI. The P2 md5 optimistic-concurrency + one silent retry is enough for a single user who won't realistically write from the PWA and Telegram in the same second. A second conflict surfaces a plain "veri değişti, tekrar dene" message.
- Migrating the bot's PDF-reconciliation feature to Drive — it already reads the tracker's open positions for comparison; once `DriveBackend` is the repo backend, it gets Drive data for free, no extra work.
- Writing snapshots/instruments/meta from the bot. The bot only ever appends to `transactions.json` and `cashflows.json` (and reads the rest). Same write surface as P2.
- `assetTransfers.json` / broker creation from Telegram — not requested; the bot's job is fast trade + cashflow entry.

## Global Constraints

- The bot's JSON output stays byte-compatible with the BBB Tracker schema (it already is — `repository.py` docstring asserts this; verify field-by-field against `app/src/lib/data/types.ts` during planning, especially `Transaction.girisParaBirimi`/`fiyat_tl`/`kur` which P3.5's currency-aware entry now populates).
- **New manual records carry `kaynak: 'manual'`** (Ruling P2-1, still binding) — the bot must tag its writes the same way the PWA does, so the PWA's manual-vs-migration filtering (cash balances, edit/delete eligibility) treats Telegram-entered trades identically to PWA-entered ones.
- The OAuth **client** is Enis's existing Google Cloud OAuth client (same one the PWA uses). The bot needs the `https://www.googleapis.com/auth/drive` scope (already expanded in P2). A **one-time** interactive consent on Enis's machine mints a refresh token, stored in `.env` (`GOOGLE_REFRESH_TOKEN`), never committed. Subsequent runs refresh silently.
- No secret (bot token, Gemini key, refresh token, client secret) ever enters git. `.gitignore` already lists `.env`; the project is not yet a git repo — planning's first task is `git init` + an initial commit of the current (reviewed) state so the P5 diff is reviewable.
- The bot must **never** write any file other than `transactions.json` and `cashflows.json` in the Drive `BBB/` folder. Reads are unrestricted.
- Tests never hit real Drive or real OAuth — `DriveBackend` is exercised with a mocked transport (same approach as P2's `drive.ts` fetch-mock tests: success, 404→create, conflict→retry, second-conflict→error).

## Section 1 — Drive client (`src/data/drive.py`)

A thin wrapper over `google-api-python-client` + `google-auth`:

```python
class DriveClient:
    def __init__(self, client_id, client_secret, refresh_token, folder_name="BBB"): ...
    def _service(self): ...                    # builds an authed Drive v3 service, refreshing the token
    def find_folder(self) -> str: ...          # folder id for `folder_name`
    def read_json(self, name: str) -> tuple[list|dict, str]:   # (parsed content, md5Checksum)
    def write_json(self, name: str, data, expected_md5: str | None) -> str:   # returns new md5; raises ConflictError on mismatch
```

- `write_json` with `expected_md5=None` creates the file (multipart upload) — only expected for a first-ever `cashflows.json` write if it somehow doesn't exist.
- `ConflictError` when the file's current md5 ≠ `expected_md5`. Caller reloads and retries once, then surfaces the error.
- Token refresh uses `google.oauth2.credentials.Credentials(...).refresh(Request())` — no browser needed after the one-time setup.
- A separate `scripts/authorize.py` (run once) does the interactive `InstalledAppFlow` consent and prints the refresh token for `.env`.

## Section 2 — Repository backend abstraction

`TrackerRepository.__init__` currently hardcodes `self.data_dir` file paths. Introduce:

```python
class StorageBackend(Protocol):
    def load(self, name: str) -> list | dict: ...
    def save(self, name: str, data: list | dict) -> None: ...   # handles concurrency internally

class LocalBackend:   # wraps the current _read_json/_write_json on DATA_DIR — unchanged behavior
class DriveBackend:   # wraps DriveClient; caches md5 per file; save() does the reload-retry-once dance
```

`TrackerRepository` takes a `backend` (defaults per `config.STORAGE`). Every `_read_json(self.txns_file)` becomes `self.backend.load("transactions")`, every `_write_json` becomes `self.backend.save("transactions", ...)`. `list_transactions`, `add_transaction`, `undo_last_transaction`, `create_transaction_payload`, cashflow methods, and `get_diff_with_bbb` all go through the backend. Undo stays an in-session stack of the pre-write array (already how it works) — on Drive it just means one more `save` with the reverted array.

## Section 3 — Bot wiring

Minimal — the handlers already call `repo.*`. Changes:
- `main.py` / handler modules instantiate `TrackerRepository()` which now picks the backend from config. No handler logic changes.
- On startup, if `STORAGE=drive` and the refresh token is missing/invalid, print a clear message pointing at `scripts/authorize.py` and exit (don't half-start).
- `handle_diff_command` (`/fark`): when backend is Drive, reply with a short "✅ Google Drive ile canlı senkron — son yazma: <ts>" instead of a diff.
- The Gemini hybrid layer is untouched — it produces a `ParsedTrade`; where that gets persisted is the backend's concern.

## Section 4 — Config & path fixes (do first, before the Drive work)

These are pre-existing breakage from the project being moved out of `~/Desktop/Gemini/`:
1. `src/config.py`: `BBB_DIR` default `BASE_DIR.parent / "BBB"` → `BASE_DIR.parent` (the bot sits *inside* the tracker repo; the tracker's `data/` is one level up). Add `STORAGE = os.getenv("STORAGE", "local")` and the three Google OAuth vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`).
2. `.env.example`: replace both `/Users/enisuslu/Desktop/Gemini/...` lines with the real paths (`/Users/enisuslu/Desktop/Market/BBB` and `.../BBB/bbb-telegram-bot/data`), and note both are optional (config derives them). Add the new `STORAGE` + OAuth keys with comments.
3. `README.md:75`: `cd /Users/enisuslu/Desktop/Gemini/bbb-telegram-bot` → the real path.
4. `tests/test_pdf_reconciler.py::test_reconcile_real_pdf_file`: `Path("tests/sample_qnb_statement.pdf")` → `Path(__file__).parent / "sample_qnb_statement.pdf"` so it passes from any cwd.
5. After fix 1, `tests/test_repository.py::test_bbb_folder_remains_intact` (expects `total_bbb == 153`) passes against the real file — confirm, don't modify the assertion.

After §4 the suite is 27/27 green with `STORAGE=local` (the default), and nothing about the bot's current local behavior has changed.

## Section 5 — Test strategy

- **Path/config fixes (§4):** the existing 2 failing tests turn green; no new tests needed.
- **`DriveClient`:** unit tests with a fake transport object — `read_json` parses + returns md5; `write_json` sends multipart on create, media-upload on update, raises `ConflictError` when the pre-write md5 check fails; token refresh is called when credentials are stale. Mirror `app/src/lib/data/drive.ts`'s test cases one-for-one.
- **`DriveBackend`:** `save` reloads + retries exactly once on `ConflictError`, then propagates; `load` returns the parsed array.
- **`TrackerRepository` with a fake backend:** `add_transaction` → backend.save called with the appended array carrying `kaynak: 'manual'`; `undo_last_transaction` → backend.save called with the reverted array; no test touches real Drive.
- **Schema parity:** one test builds a trade payload via `create_transaction_payload` and asserts every key/type matches a reference `Transaction` object copied from `app/src/lib/data/types.ts` (fail loudly if the PWA's type ever drifts).
- `google-api-python-client` + `google-auth` added to `requirements.txt`.

## Section 6 — Out-of-scope notes for a later phase

- Cashflow entry from Telegram (deposits/withdrawals/dividends) — the repository already has cashflow methods; wiring a `/nakit` command + NLP for it is a small follow-up once trades round-trip cleanly.
- The bot answering "how am I doing this month" via `answer_portfolio_question` would be much richer if it could read the PWA's derived figures (dashboard totals, this-month perf) rather than recomputing from raw transactions — but that means either duplicating `deriveAll` in Python or exposing a derived snapshot. Deferred; the current recompute-from-transactions context is adequate.
- Deploying so the bot runs when Enis's laptop is closed (a Pi, a cheap VPS, or Cloud Run) — purely an ops decision, no code impact on this phase.
