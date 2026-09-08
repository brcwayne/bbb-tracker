# Investment Bridge — personal transfers that reach `cashflows.json`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When money moves from a personal account into a brokerage account (or back), record it in **both** ledgers — the personal transfer as today, plus a matching row in the investment ledger's `cashflows.json`. This is the piece that joins the two halves of BBB; without it "how much capital have I put in?" is permanently wrong.

**Why now:** Layer C shipped debts and personal-to-personal transfers (`7b28bcb`), but `transfer_flow.py` never touches `cashflows.json`. Confirmed by inspection: `TrackerRepository` declares `self.cashflows_file` and defines **no cashflow methods at all**, and `apply_sync_to_bbb()` mirrors only `transactions.json` and `instruments.json`. Nothing in the bot has ever written a cashflow.

**Architecture:** the bridge writes `cashflows.json` through the **direct-write path** that the personal files already use (single copy in `BBB_DIR/data/`, `--update` on the pull, `.sync.lock` held around the write) — *not* through `TrackerRepository`'s two-copy merge machinery, which does not cover cashflows and would have to be built from scratch. `cashflows.json` already exists in Drive and is owned by Enis, so the service-account creation trap does not apply.

**Spec:** amends `docs/superpowers/specs/2026-09-07-bbb-personal-ledger-ab-design.md` §5.2 and its "six files only" constraint. Everything else stands.

**Working directory:** `~/Desktop/Market/BBB/bbb-telegram-bot`, `main` @ `7b28bcb`, 385 tests green. Run `./.venv/bin/python -m pytest`.

## Established facts — verified, do not re-derive

- **Cashflow schema** (`app/src/lib/data/types.ts`, and 21 live rows):
  `id, tarih, hesap, portfoy|null, tur, enstruman|null, tutar_tl|null, tutar_usd, kur|null, aciklama, kaynak, hedefHesap?`
  `tur` ∈ `YATIRMA | CEKME | TEMETTU | TRANSFER`. Ids look like `c_e0deecc8aeae72e6` — prefix `c_` + **16** hex.
- **The investment ledger is USD-based.** `tutar_usd` is required and non-null. The personal ledger deliberately does not convert (spec D4); this file does. Both conventions are correct in their own file — do not "harmonise" them.
- **FX:** `src/data/tcmb.py::FxService.get_usd_try(date_iso) -> float`, with a local cache and business-day walk-back. `TrackerRepository` already constructs one as `self.fx_service`.
- **`kaynak` must be `"manual"`**, not `"telegram"`. Verified in the app: `cashBalances.ts` skips only `kaynak === 'migration'` (so any other value counts toward balances), but `EkleKaydi.svelte` lists only `kaynak === 'manual'` rows as editable. A `"telegram"` cashflow would silently be uneditable in the PWA. This matches Ruling P2-1 in the parent spec: bot-written records are tagged exactly as the PWA tags its own.
  **The personal ledger keeps `kaynak: "telegram"`** — different file, different audience, deliberate.
- **Brokers** live in `BBB_DIR/data/brokers.json`: `GARAN, MIDAS, QNB, TEB, OYAK-E, OYAK-ANNE, KASA`, each with `kod`, `ad`, `sahip`, `aktif`.
- **The PWA also writes cashflows** (`app/src/routes/forms/NakitHareketiFormu.svelte`), directly to Drive. So this file has two writers from day one — see Task 2 for how that is handled.

## Global Constraints

- All 385 existing tests stay green. Never weaken an assertion to make a change pass.
- **`cashflows.json` is the only investment file this code may write.** `transactions.json`, `instruments.json`, `snapshots.json`, `meta.json`, `fxrates.json`, `brokers.json`, `portfolios.json` stay forbidden, and the existing guard test is amended to say exactly that — not deleted.
- **Both rows or neither.** A transfer into a brokerage account that lands in only one ledger recreates the bug this plan exists to fix.
- Amounts, dates and ids stay in Python. The LLM classifies the sentence; it never computes the USD figure.
- Turkish user-facing strings, plain text.
- Each task is its own TDD cycle and commit.

---

### Task 1: Know which accounts are brokerages

**Files:** Modify `src/data/personal_repository.py`, `src/nlp/personal_parser.py`. Test: `tests/test_personal_repository.py`, `tests/test_personal_parser.py`.

**Interfaces:**
- `PersonalRepository.list_brokers() -> list[dict]` — active rows from `BBB_DIR/data/brokers.json`; `[]` when the file is missing.
- `PersonalRepository.build_ctx()` gains a `"kurumlar"` key carrying those rows.
- `analyze_personal_message` sets `karsiHesap` to a **broker `kod`** when the message names one, using the same longest-match helper already used for personal accounts.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_repository.py
def test_list_brokers_reads_the_investment_account_file(repo):
    import json
    (repo.data_dir / "brokers.json").write_text(json.dumps([
        {"kod": "MIDAS", "ad": "Midas", "tur": "BROKER", "sahip": "Enis", "aktif": True},
        {"kod": "ESKI", "ad": "Eski", "tur": "BROKER", "sahip": "Enis", "aktif": False},
    ]), encoding="utf-8")
    assert [b["kod"] for b in repo.list_brokers()] == ["MIDAS"]


def test_list_brokers_is_empty_when_the_file_is_absent(repo):
    assert repo.list_brokers() == []


def test_build_ctx_exposes_the_brokers(repo):
    assert "kurumlar" in repo.build_ctx()
```

```python
# tests/test_personal_parser.py
CTX_BROKERS = dict(CTX, hesaplar=[
    {"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "aktif": True},
    {"kod": "GARANTI", "ad": "Garanti", "tur": "BANKA", "aktif": True},
], kurumlar=[
    {"kod": "MIDAS", "ad": "Midas", "aktif": True},
    {"kod": "OYAK-E", "ad": "Oyak · Enis", "aktif": True},
])


def test_a_brokerage_named_as_the_destination_is_recognised():
    a = analyze_personal_message("garantiden midasa 50000 attim", CTX_BROKERS)
    assert a.hesap == "GARANTI"
    assert a.karsiHesap == "MIDAS"


def test_a_brokerage_code_with_a_dash_is_recognised():
    a = analyze_personal_message("nakitten oyak e 10000 yatirdim", CTX_BROKERS)
    assert a.karsiHesap == "OYAK-E"


def test_a_personal_to_personal_transfer_names_no_broker():
    a = analyze_personal_message("nakitten garantiye 5000", CTX_BROKERS)
    assert a.karsiHesap == "GARANTI"
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** `list_brokers` reads `self.data_dir / "brokers.json"` through `read_json` and filters `aktif`. In the parser, build the destination options from personal accounts **and** brokers together, so a single longest-match pass finds either.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: recognise brokerage accounts as transfer destinations"`

---

### Task 2: The cashflow write path

**Files:** Modify `src/data/personal_repository.py`, `src/data/personal_rules.py`, `src/sync/once.py`. Test: `tests/test_personal_repository.py`, `tests/test_personal_sync.py`.

**Interfaces:**
- `derive_cashflow_id(row: dict, existing: set[str]) -> str` in `personal_rules.py` — `c_` + **16** hex over `tarih|hesap|tur|f"{tutar_usd:.2f}"|aciklama`, with the same `-2`/`-3` collision suffix as the other ids.
- `PersonalRepository.list_cashflows() -> list[dict]`
- `PersonalRepository.add_cashflow(row: dict) -> dict` — appends to `cashflows.json` under the lock, with a backup, exactly like the other writes.
- `PersonalRepository.build_cashflow(tarih, hesap, tur, tutar_tl, aciklama) -> dict` — fills `tutar_usd` and `kur` from `FxService.get_usd_try(tarih)`, sets `portfoy=None`, `enstruman=None`, `kaynak="manual"`. **Raises `FxUnavailable` when no rate can be obtained** — never writes a guessed figure into the investment ledger.

**The sync split.** `src/sync/once.py` currently has one list, `PERSONAL_FILES`, used for two different jobs: the `--update` pull, and deciding what `ensure_seeded` may create. Those must now diverge — `cashflows.json` needs the `--update` pull but must **never** be seeded, because it already exists and holds real data.

```python
SEEDED_FILES = [                      # ensure_seeded may create these
    "personal_tx.json", "payment_plans.json", "personal_accounts.json",
    "categories.json", "people.json", "debts.json",
]
DIRECT_WRITE_FILES = SEEDED_FILES + ["cashflows.json"]   # pulled with --update
```

The main pull excludes `DIRECT_WRITE_FILES`; the second pull includes them with `--update`. `ensure_seeded` iterates `SEEDED_FILES` only.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_sync.py
from src.sync.once import DIRECT_WRITE_FILES, SEEDED_FILES


def test_cashflows_is_pulled_with_update_but_never_seeded():
    assert "cashflows.json" in DIRECT_WRITE_FILES
    assert "cashflows.json" not in SEEDED_FILES


def test_the_main_pull_excludes_every_direct_write_file(commands):
    _run_rclone("pull")
    main = " ".join(commands[0])
    for name in DIRECT_WRITE_FILES:
        assert name in main
    assert "--update" not in commands[0]


def test_seeding_never_creates_cashflows(tmp_path):
    repo = PersonalRepository(bbb_dir=tmp_path)
    repo.ensure_seeded(pull=lambda: None)
    assert not (repo.data_dir / "cashflows.json").exists(), \
        "cashflows.json holds real investment data; an empty one would destroy it on push"
```

```python
# tests/test_personal_repository.py
import pytest

from src.data.personal_repository import FxUnavailable


@pytest.fixture
def repo_fx(repo, monkeypatch):
    monkeypatch.setattr(repo.fx_service, "get_usd_try", lambda date_iso=None: 48.0)
    return repo


def test_build_cashflow_converts_to_usd_at_the_days_rate(repo_fx):
    row = repo_fx.build_cashflow("2026-09-08", "MIDAS", "YATIRMA", 48000.0, "Garanti → Midas")
    assert row["tutar_usd"] == 1000.0
    assert row["tutar_tl"] == 48000.0 and row["kur"] == 48.0
    assert row["kaynak"] == "manual", "must match how the PWA tags its own rows"
    assert row["portfoy"] is None and row["enstruman"] is None
    assert row["id"].startswith("c_") and len(row["id"]) == 18


def test_build_cashflow_refuses_without_a_rate(repo):
    def boom(date_iso=None):
        raise RuntimeError("tcmb yok")
    repo.fx_service.get_usd_try = boom
    with pytest.raises(FxUnavailable):
        repo.build_cashflow("2026-09-08", "MIDAS", "YATIRMA", 48000.0, "x")


def test_add_cashflow_appends_and_keeps_existing_rows(repo_fx):
    import json
    (repo_fx.data_dir / "cashflows.json").write_text(
        json.dumps([{"id": "c_existing", "tarih": "2016-01-01", "hesap": "TOPLU",
                     "tur": "YATIRMA", "tutar_usd": 1.0, "kaynak": "migration"}]),
        encoding="utf-8")
    row = repo_fx.build_cashflow("2026-09-08", "MIDAS", "YATIRMA", 48000.0, "x")
    repo_fx.add_cashflow(row)
    ids = [c["id"] for c in repo_fx.list_cashflows()]
    assert ids[0] == "c_existing" and len(ids) == 2


def test_the_writer_still_refuses_every_other_investment_file(repo_fx):
    """cashflows.json is now allowed; the rest are not."""
    for name in ("transactions.json", "instruments.json", "snapshots.json",
                 "meta.json", "fxrates.json", "brokers.json", "portfolios.json"):
        (repo_fx.data_dir / name).write_text('["SENTINEL"]', encoding="utf-8")
    repo_fx.add_cashflow(repo_fx.build_cashflow("2026-09-08", "MIDAS", "YATIRMA", 100.0, "x"))
    for name in ("transactions.json", "instruments.json", "snapshots.json",
                 "meta.json", "fxrates.json", "brokers.json", "portfolios.json"):
        assert (repo_fx.data_dir / name).read_text(encoding="utf-8") == '["SENTINEL"]'
```

Update the existing `test_writer_never_touches_the_investment_files` to drop `cashflows.json` from its sentinel list and leave a comment pointing at this task — **amend it, do not delete it**.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Give `PersonalRepository` an `FxService` (`self.fx_service = FxService(self.data_dir)`), add `"cashflows": "cashflows.json"` to `FILES`, and split the sync lists as above.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: cashflow write path with USD conversion at the day's rate"`

---

### Task 3: Recognise the bridge case

**Files:** Modify `src/bot/handlers/transfer_flow.py`. Test: `tests/test_transfer_flow.py`.

A transfer is a **bridge** when exactly one side is a brokerage:

| Source | Destination | Result |
|---|---|---|
| personal | brokerage | personal transfer **+** cashflow `YATIRMA` on the brokerage |
| brokerage | personal | personal transfer **+** cashflow `CEKME` on the brokerage |
| personal | personal | personal transfer only (today's behaviour) |
| brokerage | brokerage | **not supported** — say so plainly; this is a broker-to-broker move that belongs in the investment ledger |

- [ ] **Step 1: Write the failing test**

```python
def test_money_into_a_brokerage_is_a_deposit():
    assert classify_transfer("GARANTI", "MIDAS", brokers={"MIDAS"}) == ("YATIRMA", "MIDAS")


def test_money_out_of_a_brokerage_is_a_withdrawal():
    assert classify_transfer("MIDAS", "GARANTI", brokers={"MIDAS"}) == ("CEKME", "MIDAS")


def test_a_personal_to_personal_move_creates_no_cashflow():
    assert classify_transfer("NAKIT", "GARANTI", brokers={"MIDAS"}) is None


def test_broker_to_broker_is_rejected():
    with pytest.raises(ValueError):
        classify_transfer("MIDAS", "OYAK-E", brokers={"MIDAS", "OYAK-E"})
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement** `classify_transfer(kaynak, hedef, brokers) -> tuple[str, str] | None`, raising `ValueError` for broker-to-broker.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: classify a transfer as an investment deposit or withdrawal"`

---

### Task 4: Show both effects before saving, write both or neither

**Files:** Modify `src/bot/handlers/transfer_flow.py`. Test: `tests/test_transfer_flow.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_the_card_names_both_ledgers(repo_bridge):
    c = FakeContext()
    c.user_data["transfer_draft"] = {"kaynak": "GARANTI", "hedef": "MIDAS",
                                     "tutar": 48000.0, "paraBirimi": "TRY",
                                     "tarih": "2026-09-08", "aciklama": ""}
    u = FakeUpdate("")
    await transfer_flow.show_transfer_confirm(u, c)
    text = u.message.replies[-1][0]
    assert "Midas" in text
    assert "1.000" in text or "1000" in text, "the USD figure must be visible before saving"
    assert "yatırım" in text.lower()


@pytest.mark.asyncio
async def test_saving_a_bridge_writes_both_rows(repo_bridge):
    await _save_bridge(repo_bridge)
    assert len(repo_bridge.list_entries()) >= 1
    flows = repo_bridge.list_cashflows()
    assert len(flows) == 1
    assert flows[0]["tur"] == "YATIRMA" and flows[0]["hesap"] == "MIDAS"
    assert flows[0]["kaynak"] == "manual"


@pytest.mark.asyncio
async def test_a_failed_cashflow_write_rolls_the_personal_row_back(repo_bridge, monkeypatch):
    def boom(row):
        raise RuntimeError("disk dolu")
    monkeypatch.setattr(repo_bridge, "add_cashflow", boom)
    await _save_bridge(repo_bridge)
    assert repo_bridge.list_entries() == [], "both rows or neither"
    assert repo_bridge.list_cashflows() == []


@pytest.mark.asyncio
async def test_no_rate_means_nothing_is_saved_and_the_user_is_told(repo_bridge, monkeypatch):
    from src.data.personal_repository import FxUnavailable

    def boom(*a, **kw):
        raise FxUnavailable("kur yok")
    monkeypatch.setattr(repo_bridge, "build_cashflow", boom)
    u = await _save_bridge(repo_bridge, return_update=True)
    assert repo_bridge.list_entries() == []
    assert "kur" in u.message.replies[-1][0].lower()
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** The confirm card gains a second line for a bridge transfer, e.g.
`Garanti → Midas · 48.000 TL` / `Yatırım defterine: 1.000 $ sermaye girişi (kur 48,00)`.
On save: build the cashflow **first** (so an `FxUnavailable` aborts before anything is written), then write the personal transfer, then the cashflow; if the cashflow write raises, undo the personal write through the existing snapshot and report. On `FxUnavailable`, save nothing and tell the user to try again shortly — the rate is cached after one successful fetch.

**Why refuse rather than half-write:** a brokerage transfer that reaches only the personal ledger is exactly the defect this plan removes. A clear "try again in a minute" is recoverable; a silently missing capital deposit is not.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: bridge transfers write both ledgers, or neither"`

---

### Task 5: Undo removes both rows

**Files:** Modify `src/data/personal_repository.py`, `src/bot/handlers/transfer_flow.py`. Test: `tests/test_transfer_flow.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_undo_after_a_bridge_transfer_clears_both_ledgers(repo_bridge):
    await _save_bridge(repo_bridge)
    assert repo_bridge.list_cashflows()
    repo_bridge.undo_last_entry()
    assert repo_bridge.list_entries() == []
    assert repo_bridge.list_cashflows() == [], "the investment row must go back too"


@pytest.mark.asyncio
async def test_undo_leaves_pre_existing_cashflows_alone(repo_bridge):
    import json
    (repo_bridge.data_dir / "cashflows.json").write_text(
        json.dumps([{"id": "c_old", "tarih": "2016-01-01", "hesap": "TOPLU",
                     "tur": "YATIRMA", "tutar_usd": 1.0, "kaynak": "migration"}]),
        encoding="utf-8")
    await _save_bridge(repo_bridge)
    repo_bridge.undo_last_entry()
    assert [c["id"] for c in repo_bridge.list_cashflows()] == ["c_old"]
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Extend the undo snapshot to carry the pre-write `cashflows` array alongside `entries` and `plans`, and restore all three. Keep the existing behaviour for non-bridge saves — a snapshot with an unchanged cashflow array restores it harmlessly.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: undo a bridge transfer from both ledgers"`

---

### Task 6: Sync watcher and documentation

**Files:** Modify `deploy/bbb-sync.path`, `README.md`, `deploy/README.md`.

- [ ] **Step 1: Watch the file.** Add a `PathModified=` line for `<BBB>/data/cashflows.json` so a bridge transfer pushes to Drive as fast as an expense does, matching the absolute-path style already in the unit.

- [ ] **Step 2: Document the write surface.** In `README.md`, state that the bot now writes `cashflows.json` in addition to the six personal files, that bridge rows carry `kaynak: "manual"` so the PWA treats them exactly like its own, and that the USD figure comes from the TCMB rate for the transfer's date.

- [ ] **Step 3: Document the sync split.** In `deploy/README.md`, under the existing "Kişisel defter — tek kopya" section, explain that `SEEDED_FILES` and `DIRECT_WRITE_FILES` are deliberately different lists: `cashflows.json` is pulled with `--update` like the personal files, but **must never be seeded**, because an empty one pushed over Drive would destroy the real investment cash history.

- [ ] **Step 4: Commit.** `git commit -m "docs: cashflow write surface and the seeded/direct-write split"`

---

### Closing

- [ ] Run the whole suite and record the count.
- [ ] Re-confirm the load-bearing properties: a trade never reaches the personal code (`tests/test_personal_routing.py`); the main pull carries no `--update` (`tests/test_personal_sync.py`); the seven remaining investment files are never written (`tests/test_personal_repository.py`).
- [ ] Report what changed, the test count, decisions you made alone, and anything skipped.

**Deployment is not part of this task.** For the controller: the VM copy is not a git repo; it is updated by rsync with `--exclude '/data/'` — **anchored with the leading slash**, since an unanchored `data/` also matches `src/data/`. No new JSON file is introduced by this plan, so no Drive pre-creation is needed.

**Do not pick up without asking:** single-lock read-modify-write; undo-button staleness; the httpx logger printing the Telegram token; Layer D (PDF statements) — deferred by Enis.
