# Personal Ledger A+B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Enis record household expenses, income, and instalment purchases by typing plain Turkish at the existing Telegram bot, persisting them as six new JSON files in the Drive `BBB/` folder.

**Architecture:** The bot's text handler already tries a deterministic trade parser, then a correction handler, then gives up with a help message. This plan replaces only that give-up branch with a Qwen-backed personal-ledger flow, so the investment path is untouched and a Qwen outage degrades to today's behaviour. Qwen extracts *fields* only; every number, date, instalment split, and identifier is computed in pure Python. Persistence is a single copy in `BBB_DIR/data/`, carried to Drive by the existing `bbb-sync` rclone cycle — which must be taught not to clobber it.

**Tech Stack:** Python 3, `python-telegram-bot>=22`, `requests` (already a dependency), `pytest`. Qwen via Ollama's HTTP API on the same VM. No new packages.

**Spec:** `docs/superpowers/specs/2026-09-07-bbb-personal-ledger-ab-design.md` — read it before Task 1. Decisions are referenced below as D1–D12 and sections as §N.

**Working directory:** All code changes are in `~/Desktop/Market/BBB/bbb-telegram-bot` (its own git repo, branch `main`). The spec and this plan live in the parent BBB repo and are already committed there. Run `pytest` from `bbb-telegram-bot/`.

## Global Constraints

- **The existing trade flow must not change behaviour.** All 21 existing test modules stay green. No code path that today reaches `analyze_trade_message` may be re-ordered.
- **Numeric correctness never comes from the LLM.** Qwen returns fields; Python computes every amount, date, split, and id. Any arithmetic in a Qwen response is ignored.
- **Qwen is a soft dependency.** Timeout, refused connection, malformed JSON, or a schema-invalid response all return `None` and let the caller fall through to the bot's existing "mesajı anlayamadım" text. `parse_personal_message` never raises.
- **The new writer touches only these six files:** `personal_tx.json`, `payment_plans.json`, `personal_accounts.json`, `categories.json`, `people.json`, `debts.json`. It must never write `transactions.json`, `cashflows.json`, `instruments.json`, `snapshots.json`, `meta.json`, `fxrates.json`, `brokers.json`, `portfolios.json`.
- **No network in tests.** Qwen and rclone are exercised through fakes. `tests/conftest.py` already pins TCMB; follow that pattern.
- **All user-facing strings are Turkish**, matching the existing bot's voice.
- **Amounts are always positive**; direction lives in `tur` (`"GIDER"` / `"GELIR"`), never in the sign.
- **No currency conversion** (D4). `paraBirimi` is `"TRY"` or `"USD"`; anything else is rejected.
- **Dates are ISO `YYYY-MM-DD` strings** in stored JSON; `datetime.date` only inside pure functions.
- Commit after every task with the message given in the task's final step.

---

### Task 1: Hoist the Turkish date resolver

`src/nlp/parser.py::_resolve_date` already understands `dün`, `bugün`, `1 eylül 2026`, `DD.MM.YYYY`, and ISO dates. The personal flow needs the same logic. Move it, do not fork it.

**Files:**
- Create: `src/nlp/dates.py`
- Modify: `src/nlp/parser.py` (delete `_resolve_date`, import the hoisted one)
- Test: `tests/test_dates.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolve_turkish_date(norm_text: str, raw_text: str, today_date: str) -> tuple[str, list[str], list[str]]` returning `(iso_date, spans_to_strip, warnings)` — the exact signature `_resolve_date` has today, so `parser.py` needs no logic change.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_dates.py
"""The Turkish date resolver is shared by the trade parser and the personal ledger."""
import datetime as dt

from src.nlp.aliases import normalize_turkish_str
from src.nlp.dates import resolve_turkish_date

TODAY = "2026-09-07"


def _r(text):
    return resolve_turkish_date(normalize_turkish_str(text), text, TODAY)


def test_bugun_defaults_to_today():
    iso, _, warnings = _r("markette 340 lira")
    assert iso == TODAY
    assert warnings == []


def test_dun_is_yesterday():
    iso, strip, _ = _r("dün markette 340 lira")
    assert iso == "2026-09-06"
    assert "dun" in strip


def test_turkish_month_with_year():
    iso, _, _ = _r("1 eylül 2026 beyaz eşya")
    assert iso == "2026-09-01"


def test_turkish_month_without_year_assumes_current_and_warns():
    iso, _, warnings = _r("3 ekim market")
    assert iso == "2026-10-03"
    assert any("yıl" in w for w in warnings)


def test_numeric_date():
    iso, _, _ = _r("14.08.2026 kira")
    assert iso == "2026-08-14"


def test_iso_date():
    iso, _, _ = _r("2026-07-01 kira")
    assert iso == "2026-07-01"


def test_impossible_date_falls_back_to_today_with_warning():
    iso, _, warnings = _r("31 şubat 2026 market")
    assert iso == TODAY
    assert any("anlaşılamadı" in w for w in warnings)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_dates.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.nlp.dates'`

- [ ] **Step 3: Create `src/nlp/dates.py`**

Move the body of `_resolve_date` verbatim out of `src/nlp/parser.py`, together with the `TURKISH_MONTHS` dict, the `_MONTH_ALT` string, and the `TR_DATE_PATTERN` regex it depends on. Rename the function to `resolve_turkish_date` and keep the signature identical. The new module needs `import datetime as dt` and `import re`.

- [ ] **Step 4: Rewire `src/nlp/parser.py`**

Delete the moved definitions. Add near the other imports:

```python
from .dates import TURKISH_MONTHS, resolve_turkish_date
```

Then, so nothing else in the file needs editing:

```python
_resolve_date = resolve_turkish_date
```

`TURKISH_MONTHS` is re-exported because other modules or tests may import it from `parser`. Verify with `grep -rn "TURKISH_MONTHS\|TR_DATE_PATTERN" src tests` that every existing importer still resolves.

- [ ] **Step 5: Run the new tests and the full suite**

Run: `pytest tests/test_dates.py -v && pytest`
Expected: the new file passes; the whole suite is green with the same count as before plus 7.

- [ ] **Step 6: Commit**

```bash
git add src/nlp/dates.py src/nlp/parser.py tests/test_dates.py
git commit -m "refactor: hoist the Turkish date resolver into src/nlp/dates.py"
```

---

### Task 2: Shared JSON store and sync lock

`TrackerRepository` has private atomic-write helpers and `SyncRunner` has a private flock helper. The personal repository needs both. Extract them into one small module. `TrackerRepository`'s own helpers are left alone (no unrelated refactor); only `SyncRunner`'s lock moves, because the personal repository must take *the same* lock object.

**Files:**
- Create: `src/data/jsonstore.py`
- Modify: `src/sync/once.py` (`SyncRunner._hold_lock` delegates to the shared helper)
- Test: `tests/test_jsonstore.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `read_json(path: Path, default=None)` — returns `default` (or `[]`) on a missing or corrupt file.
  - `atomic_write_json(path: Path, data) -> None` — temp file + `Path.replace`, `indent=2`, `ensure_ascii=False`.
  - `backup_file(path: Path, backup_dir: Path) -> str | None` — copies `path` to `<backup_dir>/<stem>-<YYYYmmdd-HHMMSS>.json`, returns the new path as a string, or `None` if `path` does not exist.
  - `sync_lock(state_dir: Path)` — a context manager yielding `True` when the exclusive lock on `<state_dir>/.sync.lock` was acquired and `False` when it is already held.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_jsonstore.py
"""Shared atomic-write, backup, and cross-process lock helpers."""
import json
from pathlib import Path

from src.data.jsonstore import atomic_write_json, backup_file, read_json, sync_lock


def test_read_json_returns_default_for_missing_file(tmp_path):
    assert read_json(tmp_path / "nope.json", default=[]) == []


def test_read_json_returns_default_for_corrupt_file(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{not json", encoding="utf-8")
    assert read_json(p, default=[]) == []


def test_atomic_write_uses_rename_and_leaves_no_tmp(tmp_path, monkeypatch):
    p = tmp_path / "x.json"
    seen = []
    real_replace = Path.replace

    def spy(self, target):
        seen.append((str(self), str(target)))
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", spy)
    atomic_write_json(p, [{"id": "px_1"}])

    assert seen and seen[0][0].endswith(".tmp")
    assert json.loads(p.read_text(encoding="utf-8")) == [{"id": "px_1"}]
    assert not list(tmp_path.glob("*.tmp"))


def test_atomic_write_keeps_turkish_characters_readable(tmp_path):
    p = tmp_path / "x.json"
    atomic_write_json(p, [{"ad": "Yeme-içme"}])
    assert "Yeme-içme" in p.read_text(encoding="utf-8")


def test_backup_file_copies_with_timestamp(tmp_path):
    p = tmp_path / "personal_tx.json"
    p.write_text("[]", encoding="utf-8")
    out = backup_file(p, tmp_path / "backups")
    assert out is not None
    b = Path(out)
    assert b.exists() and b.name.startswith("personal_tx-") and b.suffix == ".json"


def test_backup_file_returns_none_for_missing_source(tmp_path):
    assert backup_file(tmp_path / "gone.json", tmp_path / "backups") is None


def test_sync_lock_is_exclusive(tmp_path):
    with sync_lock(tmp_path) as first:
        assert first is True
        with sync_lock(tmp_path) as second:
            assert second is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_jsonstore.py -v`
Expected: FAIL — `No module named 'src.data.jsonstore'`

- [ ] **Step 3: Write `src/data/jsonstore.py`**

```python
"""Shared JSON persistence helpers.

Extracted so the personal ledger writes with the same atomicity guarantees as
the trade ledger, and takes the *same* lock the background sync holds.
"""
from __future__ import annotations

import datetime as dt
import fcntl
import json
from contextlib import contextmanager
from pathlib import Path


def read_json(path: Path, default=None):
    if not path.exists():
        return default if default is not None else []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default if default is not None else []


def atomic_write_json(path: Path, data) -> None:
    """Temp file + rename, so a concurrent reader (the sync) never sees a
    half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def backup_file(path: Path, backup_dir: Path) -> str | None:
    if not path.exists():
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = backup_dir / f"{path.stem}-{ts}.json"
    dest.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return str(dest)


@contextmanager
def sync_lock(state_dir: Path):
    """Yields True when the exclusive lock was taken, False when it is held
    elsewhere. Never blocks."""
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    fh = open(state_dir / ".sync.lock", "w")
    try:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        yield True
    finally:
        fh.close()
```

- [ ] **Step 4: Delegate `SyncRunner._hold_lock`**

In `src/sync/once.py`, add `from ..data.jsonstore import sync_lock` and replace the body of `_hold_lock` so the two callers share one implementation:

```python
    @contextmanager
    def _hold_lock(self):
        with sync_lock(self.state_dir) as acquired:
            yield acquired
```

Leave `self._lock_path` in place — `tests/test_sync_runner.py` may reference it. Confirm with `grep -n "_lock_path" tests src`.

- [ ] **Step 5: Run the tests**

Run: `pytest tests/test_jsonstore.py tests/test_sync_runner.py -v && pytest`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/data/jsonstore.py src/sync/once.py tests/test_jsonstore.py
git commit -m "refactor: shared jsonstore helpers + one sync lock implementation"
```

---

### Task 3: Instalment maths and dates

Pure functions, no I/O. This is the arithmetic the LLM is never allowed to do (D3, §4.3).

**Files:**
- Create: `src/data/personal_rules.py`
- Test: `tests/test_personal_rules.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `split_instalments(total: float, n: int) -> list[float]` — `n` amounts summing exactly to `total`; the remainder lands on the **last** one. Raises `ValueError` for `n < 2` or `total <= 0`.
  - `instalment_dates(purchase: datetime.date, n: int) -> list[datetime.date]` — instalment `k` is `purchase` plus `k-1` months, clamped to the last day of the target month. Raises `ValueError` for `n < 1`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_rules.py
"""Instalment arithmetic — deterministic, never delegated to the LLM."""
import datetime as dt

import pytest

from src.data.personal_rules import instalment_dates, split_instalments


def test_exact_division():
    assert split_instalments(12000, 6) == [2000.0] * 6


def test_remainder_goes_to_the_last_instalment():
    assert split_instalments(10000, 3) == [3333.33, 3333.33, 3333.34]


def test_two_instalments_with_odd_cent():
    assert split_instalments(100.01, 2) == [50.0, 50.01]


@pytest.mark.parametrize("total", [12000, 10000, 99.99, 1234.56, 7])
@pytest.mark.parametrize("n", [2, 3, 6, 9, 12])
def test_instalments_always_sum_to_the_total(total, n):
    rows = split_instalments(total, n)
    assert len(rows) == n
    assert round(sum(rows), 2) == round(float(total), 2)
    assert all(r > 0 for r in rows)


@pytest.mark.parametrize("n", [0, 1, -3])
def test_rejects_impossible_instalment_counts(n):
    with pytest.raises(ValueError):
        split_instalments(1000, n)


def test_rejects_non_positive_total():
    with pytest.raises(ValueError):
        split_instalments(0, 3)


def test_first_instalment_is_the_purchase_month():
    d = instalment_dates(dt.date(2026, 9, 7), 3)
    assert d[0] == dt.date(2026, 9, 7)
    assert d[1] == dt.date(2026, 10, 7)
    assert d[2] == dt.date(2026, 11, 7)


def test_month_end_is_clamped():
    d = instalment_dates(dt.date(2026, 1, 31), 3)
    assert d == [dt.date(2026, 1, 31), dt.date(2026, 2, 28), dt.date(2026, 3, 31)]


def test_month_end_is_clamped_in_a_leap_year():
    d = instalment_dates(dt.date(2028, 1, 31), 2)
    assert d[1] == dt.date(2028, 2, 29)


def test_rolls_over_the_year():
    d = instalment_dates(dt.date(2026, 11, 15), 4)
    assert d[-1] == dt.date(2027, 2, 15)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_rules.py -v`
Expected: FAIL — `No module named 'src.data.personal_rules'`

- [ ] **Step 3: Write the implementation**

```python
"""Pure rules for the personal ledger. No I/O, no Telegram, no HTTP."""
from __future__ import annotations

import calendar
import datetime as dt
from decimal import ROUND_DOWN, Decimal


def split_instalments(total: float, n: int) -> list[float]:
    """`n` positive amounts summing exactly to `total`, remainder on the last."""
    if n < 2:
        raise ValueError("taksit sayısı en az 2 olmalı")
    if total <= 0:
        raise ValueError("tutar pozitif olmalı")
    cents = Decimal(str(total)).quantize(Decimal("0.01"))
    base = (cents / n).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    rows = [base] * (n - 1)
    rows.append(cents - base * (n - 1))
    return [float(r) for r in rows]


def _add_months(d: dt.date, months: int) -> dt.date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return dt.date(year, month, day)


def instalment_dates(purchase: dt.date, n: int) -> list[dt.date]:
    """Instalment k falls k-1 months after the purchase, clamped to month end.

    Simplification: a real Turkish card posts the first instalment to the next
    statement, on a date governed by the card's cut-off day. Layer D replaces
    this using `hesapKesim` on the account. Until then the summary shows the
    month range so a wrong month is visible before saving.
    """
    if n < 1:
        raise ValueError("taksit sayısı en az 1 olmalı")
    return [_add_months(purchase, k) for k in range(n)]
```

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_rules.py -v`
Expected: PASS (all parametrised cases).

- [ ] **Step 5: Commit**

```bash
git add src/data/personal_rules.py tests/test_personal_rules.py
git commit -m "feat: instalment split and instalment date rules"
```

---

### Task 4: Content-derived identifiers

P0/P1 established that hashing a row *position* silently re-keys everything when a row is inserted. Ids are derived from content (§3.7).

**Files:**
- Modify: `src/data/personal_rules.py`
- Test: `tests/test_personal_rules.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `derive_entry_id(row: dict, existing: set[str]) -> str` — `px_` + 12 hex, with a `-2`, `-3`, … suffix on collision.
  - `derive_plan_id(plan: dict, existing: set[str]) -> str` — same, prefix `pp_`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_personal_rules.py`:

```python
from src.data.personal_rules import derive_entry_id, derive_plan_id

ROW = {
    "tarih": "2026-09-07", "tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY",
    "hesap": "NAKIT", "kategori": "market", "sahip": "ENIS", "aciklama": "Migros",
    "taksitPlaniId": None, "taksitNo": None,
}


def test_entry_id_is_deterministic():
    assert derive_entry_id(ROW, set()) == derive_entry_id(dict(ROW), set())


def test_entry_id_has_the_expected_shape():
    got = derive_entry_id(ROW, set())
    assert got.startswith("px_") and len(got) == 15


def test_entry_id_changes_with_content():
    other = dict(ROW, tutar=341.0)
    assert derive_entry_id(other, set()) != derive_entry_id(ROW, set())


def test_entry_id_ignores_surrounding_whitespace_in_the_description():
    assert derive_entry_id(dict(ROW, aciklama="  Migros "), set()) == derive_entry_id(ROW, set())


def test_identical_rows_get_a_collision_suffix():
    first = derive_entry_id(ROW, set())
    second = derive_entry_id(ROW, {first})
    third = derive_entry_id(ROW, {first, second})
    assert second == f"{first}-2"
    assert third == f"{first}-3"


def test_plan_id_has_its_own_prefix():
    plan = {"alisTarihi": "2026-09-07", "toplamTutar": 12000.0, "paraBirimi": "TRY",
            "taksitSayisi": 6, "hesap": "GARANTI-BONUS", "sahip": "ENIS",
            "aciklama": "Beyaz eşya"}
    got = derive_plan_id(plan, set())
    assert got.startswith("pp_") and len(got) == 15
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_rules.py -k id -v`
Expected: FAIL — `ImportError: cannot import name 'derive_entry_id'`

- [ ] **Step 3: Implement**

Add to `src/data/personal_rules.py` (`import hashlib` at the top):

```python
def _hash(prefix: str, parts: list[str], existing: set[str]) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]
    base = f"{prefix}_{digest}"
    if base not in existing:
        return base
    n = 2
    while f"{base}-{n}" in existing:
        n += 1
    return f"{base}-{n}"


def derive_entry_id(row: dict, existing: set[str]) -> str:
    parts = [
        row["tarih"], row["tur"], f"{float(row['tutar']):.2f}", row["paraBirimi"],
        row["hesap"], row["kategori"], row["sahip"],
        (row.get("aciklama") or "").strip(),
        str(row.get("taksitPlaniId")), str(row.get("taksitNo")),
    ]
    return _hash("px", parts, existing)


def derive_plan_id(plan: dict, existing: set[str]) -> str:
    parts = [
        plan["alisTarihi"], f"{float(plan['toplamTutar']):.2f}", plan["paraBirimi"],
        str(plan["taksitSayisi"]), plan["hesap"], plan["sahip"],
        (plan.get("aciklama") or "").strip(),
    ]
    return _hash("pp", parts, existing)
```

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_rules.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/personal_rules.py tests/test_personal_rules.py
git commit -m "feat: content-derived ids for personal ledger rows and plans"
```

---

### Task 5: Draft validation and row building

Turns a validated draft into the rows to persist, and decides what still has to be asked.

**Files:**
- Modify: `src/data/personal_rules.py`
- Create: `src/data/personal_seed.py`
- Test: `tests/test_personal_rules.py`

**Interfaces:**
- Consumes: `split_instalments`, `instalment_dates`, `derive_entry_id`, `derive_plan_id` (Tasks 3–4).
- Produces:
  - `missing_fields(draft: dict, ctx: dict) -> list[str]` — subset of `["tutar", "kategori", "hesap", "sahip"]`, in that order.
  - `build_rows(draft: dict, existing_ids: set[str]) -> tuple[list[dict], dict | None]`.
  - `src/data/personal_seed.py`: `SEED_CATEGORIES`, `SEED_ACCOUNTS`, `SEED_PEOPLE` (lists of dicts).

The **draft** shape used from here to the end of the plan:

```python
{"tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY", "kategori": "market",
 "hesap": "NAKIT", "sahip": "ENIS", "tarih": "2026-09-07", "taksitSayisi": None,
 "aciklama": "Migros", "uyarilar": []}
```

The **ctx** shape:

```python
{"kategoriler": [...], "hesaplar": [...], "kisiler": [...],
 "bugun": "2026-09-07", "varsayilanSahip": "ENIS"}
```

- [ ] **Step 1: Write the failing test**

Append to `tests/test_personal_rules.py`:

```python
from src.data.personal_rules import build_rows, missing_fields

CTX_ONE = {
    "kategoriler": [{"kod": "market", "ad": "Market", "tur": "GIDER", "aktif": True}],
    "hesaplar": [{"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "aktif": True}],
    "kisiler": [{"kod": "ENIS", "ad": "Enis", "haneUyesi": True, "aktif": True}],
    "bugun": "2026-09-07", "varsayilanSahip": "ENIS",
}
CTX_MANY = dict(
    CTX_ONE,
    hesaplar=CTX_ONE["hesaplar"] + [{"kod": "GARANTI-BONUS", "ad": "Garanti Bonus",
                                     "tur": "KREDI_KARTI", "aktif": True}],
    kisiler=CTX_ONE["kisiler"] + [{"kod": "ANNE", "ad": "Anne",
                                   "haneUyesi": True, "aktif": True}],
)

DRAFT = {"tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY", "kategori": "market",
         "hesap": "NAKIT", "sahip": "ENIS", "tarih": "2026-09-07",
         "taksitSayisi": None, "aciklama": "Migros", "uyarilar": []}


def test_nothing_missing_when_the_draft_is_complete():
    assert missing_fields(DRAFT, CTX_ONE) == []


def test_missing_amount_is_asked_first():
    assert missing_fields(dict(DRAFT, tutar=None, kategori=None), CTX_ONE)[0] == "tutar"


def test_single_account_is_not_asked_about():
    assert "hesap" not in missing_fields(dict(DRAFT, hesap=None), CTX_ONE)


def test_several_accounts_means_the_account_is_asked():
    assert "hesap" in missing_fields(dict(DRAFT, hesap=None), CTX_MANY)


def test_single_household_member_is_not_asked_about():
    assert "sahip" not in missing_fields(dict(DRAFT, sahip=None), CTX_ONE)


def test_several_members_means_the_owner_is_asked():
    assert "sahip" in missing_fields(dict(DRAFT, sahip=None), CTX_MANY)


def test_category_is_always_asked_when_absent():
    assert "kategori" in missing_fields(dict(DRAFT, kategori=None), CTX_ONE)


def test_ordinary_expense_builds_one_row_and_no_plan():
    rows, plan = build_rows(DRAFT, set())
    assert plan is None
    assert len(rows) == 1
    r = rows[0]
    assert r["tutar"] == 340.0 and r["tarih"] == "2026-09-07"
    assert r["taksitPlaniId"] is None and r["taksitNo"] is None and r["taksitToplam"] is None
    assert r["kaynak"] == "telegram" and r["id"].startswith("px_")
    assert r["olusturulma"].endswith("Z")


def test_instalment_purchase_builds_a_plan_and_one_row_per_month():
    draft = dict(DRAFT, tutar=12000.0, taksitSayisi=6, kategori="market",
                 aciklama="Beyaz eşya")
    rows, plan = build_rows(draft, set())
    assert plan is not None and plan["id"].startswith("pp_")
    assert len(rows) == 6
    assert [r["tarih"] for r in rows][:2] == ["2026-09-07", "2026-10-07"]
    assert [r["taksitNo"] for r in rows] == [1, 2, 3, 4, 5, 6]
    assert all(r["taksitToplam"] == 6 for r in rows)
    assert all(r["taksitPlaniId"] == plan["id"] for r in rows)
    assert round(sum(r["tutar"] for r in rows), 2) == 12000.0
    assert plan["taksitTutari"] == 2000.0 and plan["sonTaksitTutari"] == 2000.0
    assert plan["durum"] == "AKTIF"


def test_instalment_remainder_is_reflected_in_the_plan_header():
    draft = dict(DRAFT, tutar=10000.0, taksitSayisi=3)
    rows, plan = build_rows(draft, set())
    assert plan["taksitTutari"] == 3333.33
    assert plan["sonTaksitTutari"] == 3333.34
    assert rows[-1]["tutar"] == 3333.34


def test_rows_within_one_instalment_purchase_get_distinct_ids():
    draft = dict(DRAFT, tutar=12000.0, taksitSayisi=6)
    rows, _ = build_rows(draft, set())
    assert len({r["id"] for r in rows}) == 6


def test_existing_ids_are_avoided():
    rows_a, _ = build_rows(DRAFT, set())
    rows_b, _ = build_rows(DRAFT, {rows_a[0]["id"]})
    assert rows_b[0]["id"] == f"{rows_a[0]['id']}-2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_rules.py -k "missing or build or rows" -v`
Expected: FAIL — `cannot import name 'build_rows'`

- [ ] **Step 3: Implement `build_rows` and `missing_fields`**

Add to `src/data/personal_rules.py`:

```python
def _active(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r.get("aktif", True)]


def missing_fields(draft: dict, ctx: dict) -> list[str]:
    """Required fields still unknown. A field with exactly one possible value
    is filled silently by the caller, never asked about."""
    missing: list[str] = []
    if not draft.get("tutar"):
        missing.append("tutar")
    if not draft.get("kategori"):
        missing.append("kategori")
    if not draft.get("hesap") and len(_active(ctx["hesaplar"])) != 1:
        missing.append("hesap")
    household = [p for p in _active(ctx["kisiler"]) if p.get("haneUyesi")]
    if not draft.get("sahip") and len(household) != 1:
        missing.append("sahip")
    return missing


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_rows(draft: dict, existing_ids: set[str]) -> tuple[list[dict], dict | None]:
    """Turn a complete draft into the rows to persist, plus a plan header when
    the purchase is split into instalments."""
    taken = set(existing_ids)
    created = _now_iso()
    n = draft.get("taksitSayisi")

    def row(tarih: str, tutar: float, plan_id, no, toplam) -> dict:
        r = {
            "id": None, "tarih": tarih, "tur": draft["tur"], "tutar": round(tutar, 2),
            "paraBirimi": draft["paraBirimi"], "kategori": draft["kategori"],
            "aciklama": (draft.get("aciklama") or "").strip(), "hesap": draft["hesap"],
            "sahip": draft["sahip"], "taksitPlaniId": plan_id, "taksitNo": no,
            "taksitToplam": toplam, "not": "", "kaynak": "telegram",
            "olusturulma": created,
        }
        r["id"] = derive_entry_id(r, taken)
        taken.add(r["id"])
        return r

    if not n:
        return [row(draft["tarih"], float(draft["tutar"]), None, None, None)], None

    total = float(draft["tutar"])
    amounts = split_instalments(total, int(n))
    dates = instalment_dates(dt.date.fromisoformat(draft["tarih"]), int(n))
    plan = {
        "id": None, "alisTarihi": draft["tarih"],
        "aciklama": (draft.get("aciklama") or "").strip(), "toplamTutar": round(total, 2),
        "paraBirimi": draft["paraBirimi"], "taksitSayisi": int(n),
        "taksitTutari": amounts[0], "sonTaksitTutari": amounts[-1],
        "kategori": draft["kategori"], "hesap": draft["hesap"], "sahip": draft["sahip"],
        "durum": "AKTIF", "kaynak": "telegram", "olusturulma": created,
    }
    plan["id"] = derive_plan_id(plan, set())
    rows = [
        row(d.isoformat(), amt, plan["id"], k + 1, int(n))
        for k, (d, amt) in enumerate(zip(dates, amounts))
    ]
    return rows, plan
```

- [ ] **Step 4: Write `src/data/personal_seed.py`**

```python
"""Defaults created on first run (§3.3–3.5). `kod` values are ASCII slugs;
`ad` carries the Turkish display form."""

SEED_CATEGORIES = [
    {"kod": "market", "ad": "Market", "tur": "GIDER", "aktif": True},
    {"kod": "yeme-icme", "ad": "Yeme-içme", "tur": "GIDER", "aktif": True},
    {"kod": "ulasim", "ad": "Ulaşım", "tur": "GIDER", "aktif": True},
    {"kod": "yakit", "ad": "Yakıt", "tur": "GIDER", "aktif": True},
    {"kod": "fatura", "ad": "Fatura", "tur": "GIDER", "aktif": True},
    {"kod": "kira", "ad": "Kira", "tur": "GIDER", "aktif": True},
    {"kod": "saglik", "ad": "Sağlık", "tur": "GIDER", "aktif": True},
    {"kod": "giyim", "ad": "Giyim", "tur": "GIDER", "aktif": True},
    {"kod": "ev", "ad": "Ev & eşya", "tur": "GIDER", "aktif": True},
    {"kod": "teknoloji", "ad": "Teknoloji", "tur": "GIDER", "aktif": True},
    {"kod": "eglence", "ad": "Eğlence", "tur": "GIDER", "aktif": True},
    {"kod": "egitim", "ad": "Eğitim", "tur": "GIDER", "aktif": True},
    {"kod": "abonelik", "ad": "Abonelik", "tur": "GIDER", "aktif": True},
    {"kod": "hediye", "ad": "Hediye", "tur": "GIDER", "aktif": True},
    {"kod": "diger", "ad": "Diğer", "tur": "GIDER", "aktif": True},
    {"kod": "maas", "ad": "Maaş", "tur": "GELIR", "aktif": True},
    {"kod": "ek-gelir", "ad": "Ek gelir", "tur": "GELIR", "aktif": True},
    {"kod": "diger-gelir", "ad": "Diğer gelir", "tur": "GELIR", "aktif": True},
]

SEED_ACCOUNTS = [
    {"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "paraBirimi": "TRY",
     "sahip": "ENIS", "aktif": True},
]

SEED_PEOPLE = [
    {"kod": "ENIS", "ad": "Enis", "haneUyesi": True, "aktif": True},
    {"kod": "ANNE", "ad": "Anne", "haneUyesi": True, "aktif": True},
]
```

- [ ] **Step 5: Run the tests**

Run: `pytest tests/test_personal_rules.py -v && pytest`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/data/personal_rules.py src/data/personal_seed.py tests/test_personal_rules.py
git commit -m "feat: personal draft validation, row building, and seed defaults"
```

---

### Task 6: PersonalRepository — reference lists

Reading and extending `categories.json`, `personal_accounts.json`, `people.json`. Seeding is deliberately **not** in this task — it depends on the rclone pull ordering and lands in Task 8.

**Files:**
- Create: `src/data/personal_repository.py`
- Test: `tests/test_personal_repository.py`

**Interfaces:**
- Consumes: `jsonstore` (Task 2), `personal_seed` (Task 5).
- Produces:
  - `PersonalRepository(bbb_dir: Path | None = None)` — files live in `<bbb_dir>/data/`; defaults to `config.BBB_DIR`.
  - `FILES: dict[str, str]` — class attribute mapping logical name → filename, for the guard test.
  - `list_categories()`, `list_accounts()`, `list_people()` → `list[dict]`
  - `add_category(ad: str, tur: str = "GIDER") -> dict`
  - `add_account(ad: str, tur: str, para_birimi: str = "TRY", sahip: str = "ENIS") -> dict`
  - `add_person(ad: str, hane_uyesi: bool = True) -> dict`
  - `slugify(ad: str) -> str` (module-level) — Turkish-aware ASCII slug.
  - `build_ctx() -> dict` — the `ctx` shape from Task 5.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_repository.py
"""The personal ledger repository — a single copy under BBB/data/."""
import json

import pytest

from src.data.personal_repository import PersonalRepository, slugify


@pytest.fixture
def repo(tmp_path):
    r = PersonalRepository(bbb_dir=tmp_path)
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    return r


def test_slugify_strips_turkish_diacritics():
    assert slugify("Yeme-içme") == "yeme-icme"
    assert slugify("Sağlık") == "saglik"
    assert slugify("Garanti Bonus") == "garanti-bonus"
    assert slugify("Şişli  Öğle") == "sisli-ogle"


def test_lists_are_empty_before_seeding(repo):
    assert repo.list_categories() == []
    assert repo.list_accounts() == []
    assert repo.list_people() == []


def test_add_category_persists_and_returns_the_row(repo):
    row = repo.add_category("Evcil hayvan")
    assert row["kod"] == "evcil-hayvan" and row["ad"] == "Evcil hayvan"
    assert row["tur"] == "GIDER" and row["aktif"] is True
    on_disk = json.loads((repo.data_dir / "categories.json").read_text(encoding="utf-8"))
    assert on_disk == [row]


def test_add_category_is_idempotent_for_the_same_name(repo):
    first = repo.add_category("Evcil hayvan")
    second = repo.add_category("evcil hayvan")
    assert first["kod"] == second["kod"]
    assert len(repo.list_categories()) == 1


def test_add_account_uppercases_the_code_and_keeps_the_type(repo):
    row = repo.add_account("Garanti Bonus", tur="KREDI_KARTI")
    assert row["kod"] == "GARANTI-BONUS" and row["tur"] == "KREDI_KARTI"
    assert row["paraBirimi"] == "TRY" and row["aktif"] is True


def test_add_account_rejects_an_unknown_type(repo):
    with pytest.raises(ValueError):
        repo.add_account("Bir şey", tur="KRIPTO")


def test_add_person_defaults_to_a_household_member(repo):
    row = repo.add_person("Babaanne")
    assert row["kod"] == "BABAANNE" and row["haneUyesi"] is True


def test_build_ctx_exposes_only_active_household_members(repo):
    repo.add_person("Enis")
    repo.add_person("Ahmet", hane_uyesi=False)
    ctx = repo.build_ctx()
    assert [p["kod"] for p in ctx["kisiler"]] == ["ENIS"]
    assert ctx["varsayilanSahip"] == "ENIS"
    assert ctx["bugun"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_repository.py -v`
Expected: FAIL — `No module named 'src.data.personal_repository'`

- [ ] **Step 3: Implement**

```python
"""Personal-ledger persistence: a single copy in <BBB_DIR>/data/, carried to
Drive by the bbb-sync rclone cycle. Deliberately NOT a subclass of
TrackerRepository — that class carries the two-copy merge machinery the
personal ledger does not use (spec D2)."""
from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

from ..config import BBB_DIR
from .jsonstore import atomic_write_json, backup_file, read_json, sync_lock

_TR_MAP = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
ACCOUNT_TYPES = {"NAKIT", "BANKA", "KREDI_KARTI"}


def slugify(ad: str) -> str:
    s = ad.strip().translate(_TR_MAP).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


class PersonalRepository:
    FILES = {
        "entries": "personal_tx.json",
        "plans": "payment_plans.json",
        "accounts": "personal_accounts.json",
        "categories": "categories.json",
        "people": "people.json",
        "debts": "debts.json",
    }

    def __init__(self, bbb_dir: Path | None = None):
        self.bbb_dir = Path(bbb_dir or BBB_DIR)
        self.data_dir = self.bbb_dir / "data"
        self.backup_dir = self.data_dir / "backups"
        self._undo_history: list[dict] = []

    def _path(self, name: str) -> Path:
        return self.data_dir / self.FILES[name]

    def _load(self, name: str) -> list[dict]:
        return read_json(self._path(name), default=[])

    def _save(self, name: str, rows: list[dict]) -> None:
        """Backup, then atomic write, under the lock the background sync holds."""
        path = self._path(name)
        with sync_lock(self.bbb_dir) as acquired:
            if not acquired:
                raise RuntimeError("senkron sürüyor, biraz sonra tekrar dene")
            backup_file(path, self.backup_dir)
            atomic_write_json(path, rows)

    # --- reference lists ---

    def list_categories(self) -> list[dict]:
        return self._load("categories")

    def list_accounts(self) -> list[dict]:
        return self._load("accounts")

    def list_people(self) -> list[dict]:
        return self._load("people")

    def add_category(self, ad: str, tur: str = "GIDER") -> dict:
        kod = slugify(ad)
        rows = self.list_categories()
        for r in rows:
            if r["kod"] == kod:
                return r
        row = {"kod": kod, "ad": ad.strip(), "tur": tur, "aktif": True}
        rows.append(row)
        self._save("categories", rows)
        return row

    def add_account(self, ad: str, tur: str, para_birimi: str = "TRY",
                    sahip: str = "ENIS") -> dict:
        if tur not in ACCOUNT_TYPES:
            raise ValueError(f"bilinmeyen hesap türü: {tur}")
        kod = slugify(ad).upper()
        rows = self.list_accounts()
        for r in rows:
            if r["kod"] == kod:
                return r
        row = {"kod": kod, "ad": ad.strip(), "tur": tur,
               "paraBirimi": para_birimi, "sahip": sahip, "aktif": True}
        rows.append(row)
        self._save("accounts", rows)
        return row

    def add_person(self, ad: str, hane_uyesi: bool = True) -> dict:
        kod = slugify(ad).upper()
        rows = self.list_people()
        for r in rows:
            if r["kod"] == kod:
                return r
        row = {"kod": kod, "ad": ad.strip(), "haneUyesi": hane_uyesi, "aktif": True}
        rows.append(row)
        self._save("people", rows)
        return row

    def build_ctx(self) -> dict:
        people = [p for p in self.list_people()
                  if p.get("aktif", True) and p.get("haneUyesi")]
        return {
            "kategoriler": [c for c in self.list_categories() if c.get("aktif", True)],
            "hesaplar": [a for a in self.list_accounts() if a.get("aktif", True)],
            "kisiler": people,
            "bugun": dt.date.today().isoformat(),
            "varsayilanSahip": people[0]["kod"] if people else "ENIS",
        }
```

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_repository.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/personal_repository.py tests/test_personal_repository.py
git commit -m "feat: PersonalRepository reference lists"
```

---

### Task 7: PersonalRepository — the ledger

Appending entries, undo, listing, and the monthly summary.

**Files:**
- Modify: `src/data/personal_repository.py`
- Test: `tests/test_personal_repository.py`

**Interfaces:**
- Consumes: Task 6's `PersonalRepository`.
- Produces:
  - `list_entries(limit: int | None = None) -> list[dict]` — newest first when `limit` is given.
  - `list_plans() -> list[dict]`
  - `add_entry(rows: list[dict], plan: dict | None) -> dict` — returns `{"rows": [...], "plan": plan}`.
  - `undo_last_entry() -> dict | None` — restores the pre-write arrays; returns what was removed, or `None`.
  - `month_summary(year: int, month: int) -> dict` — `{"toplam": {"TRY": 1234.5}, "kategoriler": {"TRY": [("market", 900.0), ...]}, "adet": 7}`, descending by amount, future-dated rows excluded.
  - `existing_ids() -> set[str]`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_personal_repository.py`:

```python
import datetime as dt

from src.data.personal_rules import build_rows

DRAFT = {"tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY", "kategori": "market",
         "hesap": "NAKIT", "sahip": "ENIS", "tarih": "2026-09-07",
         "taksitSayisi": None, "aciklama": "Migros", "uyarilar": []}


def _add(repo, **over):
    draft = dict(DRAFT, **over)
    rows, plan = build_rows(draft, repo.existing_ids())
    return repo.add_entry(rows, plan)


def test_add_entry_appends_and_can_be_read_back(repo):
    _add(repo)
    entries = repo.list_entries()
    assert len(entries) == 1 and entries[0]["aciklama"] == "Migros"


def test_add_entry_writes_a_backup_on_the_second_write(repo):
    _add(repo)
    _add(repo, tutar=99.0)
    assert list((repo.data_dir / "backups").glob("personal_tx-*.json"))


def test_instalment_purchase_writes_rows_and_a_plan(repo):
    _add(repo, tutar=12000.0, taksitSayisi=6, aciklama="Beyaz eşya")
    assert len(repo.list_entries()) == 6
    assert len(repo.list_plans()) == 1


def test_undo_removes_an_instalment_purchase_whole(repo):
    _add(repo)
    _add(repo, tutar=12000.0, taksitSayisi=6, aciklama="Beyaz eşya")
    removed = repo.undo_last_entry()
    assert removed is not None
    assert len(repo.list_entries()) == 1
    assert repo.list_plans() == []


def test_undo_returns_none_when_there_is_nothing_to_undo(repo):
    assert repo.undo_last_entry() is None


def test_list_entries_limit_returns_newest_first(repo):
    _add(repo, tarih="2026-09-01", aciklama="ilk")
    _add(repo, tarih="2026-09-05", aciklama="son")
    assert [e["aciklama"] for e in repo.list_entries(limit=1)] == ["son"]


def test_month_summary_totals_per_currency(repo):
    _add(repo, tarih="2026-09-02", tutar=340.0, paraBirimi="TRY")
    _add(repo, tarih="2026-09-03", tutar=20.0, paraBirimi="USD", aciklama="abonelik")
    s = repo.month_summary(2026, 9)
    assert s["toplam"]["TRY"] == 340.0 and s["toplam"]["USD"] == 20.0


def test_month_summary_excludes_future_dated_instalments(repo):
    today = dt.date.today()
    _add(repo, tarih=today.isoformat(), tutar=12000.0, taksitSayisi=6,
         aciklama="Beyaz eşya")
    s = repo.month_summary(today.year, today.month)
    assert s["toplam"]["TRY"] == 2000.0
    assert s["adet"] == 1


def test_month_summary_orders_categories_by_amount_descending(repo):
    _add(repo, tarih="2026-09-02", tutar=100.0, kategori="market")
    _add(repo, tarih="2026-09-03", tutar=500.0, kategori="kira")
    s = repo.month_summary(2026, 9)
    assert [k for k, _ in s["kategoriler"]["TRY"]] == ["kira", "market"]


def test_income_is_not_mixed_into_the_expense_total(repo):
    _add(repo, tarih="2026-09-02", tutar=100.0)
    _add(repo, tarih="2026-09-03", tutar=50000.0, tur="GELIR", kategori="maas")
    s = repo.month_summary(2026, 9)
    assert s["toplam"]["TRY"] == 100.0
    assert s["gelir"]["TRY"] == 50000.0


def test_writer_never_touches_the_investment_files(repo):
    for name in ("transactions.json", "cashflows.json", "instruments.json",
                 "snapshots.json", "meta.json", "fxrates.json", "brokers.json",
                 "portfolios.json"):
        (repo.data_dir / name).write_text('["SENTINEL"]', encoding="utf-8")
    _add(repo, tutar=12000.0, taksitSayisi=6)
    repo.add_category("Evcil hayvan")
    repo.add_account("Garanti Bonus", tur="KREDI_KARTI")
    repo.undo_last_entry()
    for name in ("transactions.json", "cashflows.json", "instruments.json",
                 "snapshots.json", "meta.json", "fxrates.json", "brokers.json",
                 "portfolios.json"):
        assert (repo.data_dir / name).read_text(encoding="utf-8") == '["SENTINEL"]'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_repository.py -k "entry or summary or undo or investment" -v`
Expected: FAIL — `AttributeError: 'PersonalRepository' object has no attribute 'existing_ids'`

- [ ] **Step 3: Implement**

Append to `PersonalRepository`:

```python
    # --- the ledger ---

    def list_entries(self, limit: int | None = None) -> list[dict]:
        rows = self._load("entries")
        if limit is None:
            return rows
        return sorted(rows, key=lambda r: (r["tarih"], r["olusturulma"]),
                      reverse=True)[:limit]

    def list_plans(self) -> list[dict]:
        return self._load("plans")

    def existing_ids(self) -> set[str]:
        return {r["id"] for r in self._load("entries")}

    def add_entry(self, rows: list[dict], plan: dict | None) -> dict:
        before_entries = self._load("entries")
        before_plans = self._load("plans")
        self._undo_history.append({"entries": before_entries, "plans": before_plans})
        if plan is not None:
            self._save("plans", before_plans + [plan])
        self._save("entries", before_entries + rows)
        return {"rows": rows, "plan": plan}

    def undo_last_entry(self) -> dict | None:
        if not self._undo_history:
            return None
        snap = self._undo_history.pop()
        removed_entries = [r for r in self._load("entries")
                           if r["id"] not in {e["id"] for e in snap["entries"]}]
        removed_plans = [p for p in self._load("plans")
                         if p["id"] not in {e["id"] for e in snap["plans"]}]
        self._save("entries", snap["entries"])
        self._save("plans", snap["plans"])
        return {"rows": removed_entries, "plans": removed_plans}

    def month_summary(self, year: int, month: int) -> dict:
        today = dt.date.today().isoformat()
        prefix = f"{year:04d}-{month:02d}"
        rows = [r for r in self._load("entries")
                if r["tarih"].startswith(prefix) and r["tarih"] <= today]
        gider = [r for r in rows if r["tur"] == "GIDER"]
        gelir = [r for r in rows if r["tur"] == "GELIR"]

        def totals(subset):
            out: dict[str, float] = {}
            for r in subset:
                out[r["paraBirimi"]] = round(out.get(r["paraBirimi"], 0.0) + r["tutar"], 2)
            return out

        by_cat: dict[str, dict[str, float]] = {}
        for r in gider:
            cur = by_cat.setdefault(r["paraBirimi"], {})
            cur[r["kategori"]] = round(cur.get(r["kategori"], 0.0) + r["tutar"], 2)

        return {
            "toplam": totals(gider),
            "gelir": totals(gelir),
            "kategoriler": {
                cur: sorted(d.items(), key=lambda kv: kv[1], reverse=True)
                for cur, d in by_cat.items()
            },
            "adet": len(gider),
        }
```

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_repository.py -v && pytest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/data/personal_repository.py tests/test_personal_repository.py
git commit -m "feat: personal ledger entries, undo, and monthly summary"
```

---

### Task 8: Sync-safe seeding and the split rclone pull

**This is the load-bearing task of the plan.** Read spec §5.2 in full before starting. A plain `rclone copy` pull overwrites `BBB/data/personal_tx.json` with the Drive copy regardless of which is newer, so a bot write made between two cycles is destroyed before it is ever pushed. The investment ledger survives this only because the bot keeps an authoritative second copy outside the rclone paths; the personal ledger has none.

**Files:**
- Modify: `src/sync/once.py` (`_run_rclone`)
- Modify: `src/data/personal_repository.py` (`ensure_seeded`)
- Modify: `deploy/bbb-sync.path`
- Test: `tests/test_personal_sync.py`

**Interfaces:**
- Consumes: `PersonalRepository` (Tasks 6–7), `SEED_*` (Task 5).
- Produces:
  - `src/sync/once.py`: `PERSONAL_FILES: list[str]` — the six filenames; `_run_rclone(direction)` issues **two** commands for `"pull"`.
  - `PersonalRepository.ensure_seeded(pull=None) -> bool` — `pull` is a zero-argument callable defaulting to the personal-file pull; returns `True` when the ledger is usable.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_sync.py
"""The personal ledger is a single copy, so the pull must not clobber it."""
import json

import pytest

from src.data.personal_repository import PersonalRepository
from src.sync.once import PERSONAL_FILES, _run_rclone


@pytest.fixture
def commands(monkeypatch):
    seen = []
    monkeypatch.setattr("src.sync.once.subprocess.run",
                        lambda cmd, **kw: seen.append(cmd) or _Ok())
    return seen


class _Ok:
    returncode = 0
    stderr = ""


def test_pull_issues_two_commands(commands):
    _run_rclone("pull")
    assert len(commands) == 2


def test_main_pull_excludes_every_personal_file(commands):
    _run_rclone("pull")
    main = " ".join(commands[0])
    for name in PERSONAL_FILES:
        assert f"--exclude {name}" in main or name in main.split()
    assert "--update" not in commands[0], (
        "--update on the main pull would permanently skip transactions.json, "
        "because apply_sync_to_bbb rewrites it at the end of every cycle"
    )


def test_personal_pull_is_update_only(commands):
    _run_rclone("pull")
    assert "--update" in commands[1]
    joined = " ".join(commands[1])
    for name in PERSONAL_FILES:
        assert name in joined


def test_push_is_a_single_command(commands):
    _run_rclone("push")
    assert len(commands) == 1


def test_ensure_seeded_creates_all_six_files(tmp_path):
    repo = PersonalRepository(bbb_dir=tmp_path)
    assert repo.ensure_seeded(pull=lambda: None) is True
    for name in repo.FILES.values():
        assert (repo.data_dir / name).exists()
    assert len(repo.list_categories()) == 18
    assert [p["kod"] for p in repo.list_people()] == ["ENIS", "ANNE"]
    assert [a["kod"] for a in repo.list_accounts()] == ["NAKIT"]
    assert json.loads((repo.data_dir / "debts.json").read_text(encoding="utf-8")) == []


def test_ensure_seeded_is_idempotent(tmp_path):
    repo = PersonalRepository(bbb_dir=tmp_path)
    repo.ensure_seeded(pull=lambda: None)
    repo.add_category("Evcil hayvan")
    repo.ensure_seeded(pull=lambda: None)
    assert len(repo.list_categories()) == 19


def test_ensure_seeded_refuses_to_seed_when_the_pull_fails(tmp_path):
    """Otherwise empty files would be newer than a populated Drive folder and
    the next push would destroy real data."""
    repo = PersonalRepository(bbb_dir=tmp_path)

    def boom():
        raise RuntimeError("rclone yok")

    assert repo.ensure_seeded(pull=boom) is False
    assert not (repo.data_dir / "personal_tx.json").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_sync.py -v`
Expected: FAIL — `cannot import name 'PERSONAL_FILES'`

- [ ] **Step 3: Split the pull in `src/sync/once.py`**

Replace `_run_rclone` with:

```python
PERSONAL_FILES = [
    "personal_tx.json", "payment_plans.json", "personal_accounts.json",
    "categories.json", "people.json", "debts.json",
]


def _rclone(cmd: list[str], phase: str) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=180)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
        detail = getattr(e, "stderr", "") or str(e)
        raise RcloneError(f"rclone {phase}: {str(detail).strip()[:300]}") from e


def _run_rclone(direction: str) -> None:
    data = str(BBB_DIR / "data") + "/"
    if direction == "pull":
        # The investment files: a blind copy is correct — apply_sync_to_bbb()
        # rebuilds them from the bot's own authoritative ledger afterwards.
        main = ["rclone", "copy", "gdrive:", data, "--exclude", "backups/**"]
        for name in PERSONAL_FILES:
            main += ["--exclude", name]
        _rclone(main, "pull")
        # The personal files have no second copy, so a blind copy would destroy
        # a bot write made since the last push. --update copies only when the
        # SOURCE is newer. It must NOT be applied to the main pull: after every
        # cycle apply_sync_to_bbb() rewrites transactions.json, making the local
        # copy permanently newer, so a global --update would skip it forever and
        # dashboard edits would stop being imported.
        personal = ["rclone", "copy", "gdrive:", data, "--update"]
        for name in PERSONAL_FILES:
            personal += ["--include", name]
        _rclone(personal, "pull")
    elif direction == "push":
        _rclone(["rclone", "copy", data, "gdrive:", "--exclude", "backups/**",
                 "--exclude", "reconciliation-report.md"], "push")
    else:  # pragma: no cover - programmer error
        raise ValueError(direction)
```

- [ ] **Step 4: Add `ensure_seeded` to `PersonalRepository`**

```python
    def _default_pull(self) -> None:
        from ..sync.once import _run_rclone
        _run_rclone("pull")

    def ensure_seeded(self, pull=None) -> bool:
        """Create any missing personal file, but only AFTER a successful pull.

        On a machine whose local data/ is empty but whose Drive folder is
        populated, seeding first would write empty files that are newer than
        Drive's, and the next push would destroy real data. If the pull fails
        we seed nothing and report the ledger unusable for this run.
        """
        from .personal_seed import SEED_ACCOUNTS, SEED_CATEGORIES, SEED_PEOPLE
        try:
            (pull or self._default_pull)()
        except Exception:
            return False
        self.data_dir.mkdir(parents=True, exist_ok=True)
        defaults = {
            "entries": [], "plans": [], "debts": [],
            "categories": SEED_CATEGORIES, "accounts": SEED_ACCOUNTS,
            "people": SEED_PEOPLE,
        }
        for name, seed in defaults.items():
            path = self._path(name)
            if not path.exists():
                atomic_write_json(path, list(seed))
        return True
```

- [ ] **Step 5: Watch the new files for instant push**

In `deploy/bbb-sync.path`, add two `PathModified=` lines alongside the existing ones, pointing at `<BBB>/data/personal_tx.json` and `<BBB>/data/payment_plans.json`. Match the absolute-path style already used in the file.

- [ ] **Step 6: Run the tests**

Run: `pytest tests/test_personal_sync.py tests/test_sync_runner.py -v && pytest`
Expected: all green — in particular the existing sync tests, which exercise the rewritten `_run_rclone`.

- [ ] **Step 7: Commit**

```bash
git add src/sync/once.py src/data/personal_repository.py deploy/bbb-sync.path tests/test_personal_sync.py
git commit -m "feat: sync-safe personal ledger — split rclone pull, seed after pull"
```

---

### Task 9: The Qwen client

**Files:**
- Create: `src/ai/qwen_service.py`
- Modify: `src/config.py`, `.env.example`
- Test: `tests/test_qwen_service.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (the `ctx` dict shape from Task 5 is passed in).
- Produces:
  - `PersonalParse` dataclass with fields `tur, tutar, paraBirimi, kategori, hesap, sahip, tarihIfadesi, taksitSayisi, aciklama, guven`.
  - `build_prompt(ctx: dict) -> str`
  - `parse_personal_message(text: str, ctx: dict) -> PersonalParse | None` — returns `None` on any failure; never raises.
- Config added: `QWEN_URL` (default `http://127.0.0.1:11434`), `QWEN_MODEL` (default `qwen2.5:7b-instruct`), `QWEN_TIMEOUT` (default `20`), `QWEN_ENABLED` (default `true`).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_qwen_service.py
"""Qwen extracts fields only, and is never trusted."""
import json

import pytest

from src.ai import qwen_service
from src.ai.qwen_service import build_prompt, parse_personal_message

CTX = {
    "kategoriler": [{"kod": "market", "ad": "Market", "tur": "GIDER", "aktif": True},
                    {"kod": "ev", "ad": "Ev & eşya", "tur": "GIDER", "aktif": True}],
    "hesaplar": [{"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "aktif": True},
                 {"kod": "GARANTI-BONUS", "ad": "Garanti Bonus",
                  "tur": "KREDI_KARTI", "aktif": True}],
    "kisiler": [{"kod": "ENIS", "ad": "Enis", "haneUyesi": True, "aktif": True}],
    "bugun": "2026-09-07", "varsayilanSahip": "ENIS",
}

GOOD = {"tur": "GIDER", "tutar": 340, "paraBirimi": "TRY", "kategori": "market",
        "hesap": "NAKIT", "sahip": "ENIS", "tarihIfadesi": None,
        "taksitSayisi": None, "aciklama": "Migros", "guven": 0.9}


class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return {"message": {"content": json.dumps(self._payload)}}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def _post(monkeypatch, *responses):
    calls = []

    def fake(url, **kwargs):
        calls.append((url, kwargs))
        r = responses[min(len(calls) - 1, len(responses) - 1)]
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(qwen_service.requests, "post", fake)
    return calls


def test_prompt_lists_the_allowed_values_and_today(monkeypatch):
    p = build_prompt(CTX)
    assert "2026-09-07" in p
    assert "market" in p and "GARANTI-BONUS" in p and "ENIS" in p
    assert "hesaplama" in p.lower()


def test_valid_response_parses(monkeypatch):
    _post(monkeypatch, _Resp(GOOD))
    got = parse_personal_message("markette 340 lira", CTX)
    assert got.tur == "GIDER" and got.tutar == 340.0
    assert got.kategori == "market" and got.hesap == "NAKIT"


def test_timeout_returns_none_after_one_retry(monkeypatch):
    import requests as rq
    calls = _post(monkeypatch, rq.exceptions.Timeout("slow"))
    assert parse_personal_message("markette 340 lira", CTX) is None
    assert len(calls) == 2, "expected exactly one retry"


def test_connection_refused_returns_none(monkeypatch):
    import requests as rq
    _post(monkeypatch, rq.exceptions.ConnectionError("refused"))
    assert parse_personal_message("markette 340 lira", CTX) is None


def test_non_json_body_returns_none(monkeypatch):
    class Junk(_Resp):
        def json(self):
            return {"message": {"content": "sana yardımcı olayım!"}}

    _post(monkeypatch, Junk(GOOD))
    assert parse_personal_message("merhaba", CTX) is None


def test_unknown_tur_returns_none(monkeypatch):
    _post(monkeypatch, _Resp(dict(GOOD, tur="TRANSFER")))
    assert parse_personal_message("bir şey", CTX) is None


def test_anlasilmadi_parses_but_carries_no_fields(monkeypatch):
    _post(monkeypatch, _Resp({"tur": "ANLASILMADI", "aciklama": "", "guven": 0.1}))
    got = parse_personal_message("hava nasıl", CTX)
    assert got is not None and got.tur == "ANLASILMADI"


def test_hallucinated_category_is_dropped_but_the_rest_survives(monkeypatch):
    _post(monkeypatch, _Resp(dict(GOOD, kategori="uzay-yolculugu")))
    got = parse_personal_message("markette 340 lira", CTX)
    assert got.kategori is None and got.tutar == 340.0


def test_hallucinated_account_and_person_are_dropped(monkeypatch):
    _post(monkeypatch, _Resp(dict(GOOD, hesap="AKBANK", sahip="DEDE")))
    got = parse_personal_message("markette 340 lira", CTX)
    assert got.hesap is None and got.sahip is None


def test_bad_currency_is_dropped(monkeypatch):
    _post(monkeypatch, _Resp(dict(GOOD, paraBirimi="EUR")))
    assert parse_personal_message("markette 340 euro", CTX).paraBirimi is None


@pytest.mark.parametrize("n", [0, 1, 99, -2, "altı"])
def test_out_of_range_instalment_count_is_dropped(monkeypatch, n):
    _post(monkeypatch, _Resp(dict(GOOD, taksitSayisi=n)))
    assert parse_personal_message("beyaz eşya", CTX).taksitSayisi is None


def test_negative_amount_is_dropped(monkeypatch):
    _post(monkeypatch, _Resp(dict(GOOD, tutar=-5)))
    assert parse_personal_message("markette", CTX).tutar is None


def test_disabled_qwen_never_calls_out(monkeypatch):
    calls = _post(monkeypatch, _Resp(GOOD))
    monkeypatch.setattr(qwen_service.config, "QWEN_ENABLED", False)
    assert parse_personal_message("markette 340 lira", CTX) is None
    assert calls == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_qwen_service.py -v`
Expected: FAIL — `No module named 'src.ai.qwen_service'`

- [ ] **Step 3: Extend `src/config.py`**

Append, keeping the file's existing style:

```python
# --- Qwen (Ollama on the same VM) ---
QWEN_URL = os.getenv("QWEN_URL", "http://127.0.0.1:11434").rstrip("/")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen2.5:7b-instruct")
QWEN_TIMEOUT = float(os.getenv("QWEN_TIMEOUT", "20"))
QWEN_ENABLED = os.getenv("QWEN_ENABLED", "true").strip().lower() not in {
    "false", "0", "no", "off", "hayir", "hayır", "kapali", "kapalı",
}
```

Add the matching block to `.env.example` with Turkish comments explaining that `QWEN_MODEL` must match a tag from `ollama list` on the VM.

- [ ] **Step 4: Write `src/ai/qwen_service.py`**

```python
"""Qwen (via Ollama) turns a Turkish sentence into personal-ledger FIELDS.

It never computes anything. Every number, date, instalment split, and id is
produced by src/data/personal_rules.py. Any failure returns None so the caller
falls back to the bot's ordinary "anlayamadım" reply.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import requests

from .. import config

logger = logging.getLogger(__name__)

CURRENCIES = {"TRY", "USD"}
KINDS = {"GIDER", "GELIR", "ANLASILMADI"}


@dataclass
class PersonalParse:
    tur: str
    tutar: float | None = None
    paraBirimi: str | None = None
    kategori: str | None = None
    hesap: str | None = None
    sahip: str | None = None
    tarihIfadesi: str | None = None
    taksitSayisi: int | None = None
    aciklama: str = ""
    guven: float = 0.0


def build_prompt(ctx: dict) -> str:
    cats = ", ".join(f"{c['kod']} ({c['ad']})" for c in ctx["kategoriler"])
    accs = ", ".join(f"{a['kod']} ({a['ad']})" for a in ctx["hesaplar"])
    people = ", ".join(f"{p['kod']} ({p['ad']})" for p in ctx["kisiler"])
    return (
        "Sen bir kişisel finans defteri asistanısın. Kullanıcının Türkçe mesajını "
        "okuyup SADECE bir JSON nesnesi döndür. Başka hiçbir şey yazma.\n\n"
        f"Bugünün tarihi: {ctx['bugun']}\n"
        f"Geçerli kategoriler: {cats}\n"
        f"Geçerli hesap/kart kodları: {accs}\n"
        f"Geçerli kişi kodları: {people}\n"
        f"Varsayılan kişi: {ctx['varsayilanSahip']}\n\n"
        "JSON alanları:\n"
        '  tur: "GIDER" | "GELIR" | "ANLASILMADI"\n'
        "  tutar: sayı veya null (mesajda geçen tutar; asla hesaplama yapma)\n"
        '  paraBirimi: "TRY" | "USD" | null\n'
        "  kategori: yukarıdaki listeden bir kod veya null\n"
        "  hesap: yukarıdaki listeden bir kod veya null\n"
        "  sahip: yukarıdaki listeden bir kod veya null\n"
        "  tarihIfadesi: mesajdaki tarih ifadesi AYNEN (ör. \"dün\") veya null\n"
        "  taksitSayisi: tam sayı veya null\n"
        "  aciklama: kısa etiket (ör. \"Migros\")\n"
        "  guven: 0 ile 1 arasında\n\n"
        "Kurallar: Listede olmayan bir kategori/hesap/kişi UYDURMA, null bırak. "
        "Taksit tutarını HESAPLAMA, tarihi ÇÖZME — sadece cümlede geçeni aktar. "
        "Mesaj bir harcama/gelir kaydı değilse tur=\"ANLASILMADI\" döndür."
    )


def _valid_codes(rows: list[dict]) -> set[str]:
    return {r["kod"] for r in rows}


def _clean(raw: dict, ctx: dict) -> PersonalParse | None:
    tur = raw.get("tur")
    if tur not in KINDS:
        return None
    p = PersonalParse(tur=tur, aciklama=str(raw.get("aciklama") or "").strip()[:80])
    try:
        p.guven = float(raw.get("guven") or 0.0)
    except (TypeError, ValueError):
        p.guven = 0.0

    try:
        tutar = float(raw.get("tutar"))
        p.tutar = tutar if tutar > 0 else None
    except (TypeError, ValueError):
        p.tutar = None

    cur = raw.get("paraBirimi")
    p.paraBirimi = cur if cur in CURRENCIES else None

    kat = raw.get("kategori")
    p.kategori = kat if kat in _valid_codes(ctx["kategoriler"]) else None
    hes = raw.get("hesap")
    p.hesap = hes if hes in _valid_codes(ctx["hesaplar"]) else None
    sah = raw.get("sahip")
    p.sahip = sah if sah in _valid_codes(ctx["kisiler"]) else None

    ifade = raw.get("tarihIfadesi")
    p.tarihIfadesi = str(ifade) if isinstance(ifade, str) and ifade.strip() else None

    n = raw.get("taksitSayisi")
    p.taksitSayisi = n if isinstance(n, int) and not isinstance(n, bool) and 2 <= n <= 36 else None
    return p


def parse_personal_message(text: str, ctx: dict) -> PersonalParse | None:
    if not config.QWEN_ENABLED:
        return None
    body = {
        "model": config.QWEN_MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": build_prompt(ctx)},
            {"role": "user", "content": text},
        ],
    }
    for attempt in (1, 2):
        try:
            resp = requests.post(f"{config.QWEN_URL}/api/chat", json=body,
                                 timeout=config.QWEN_TIMEOUT)
            resp.raise_for_status()
            content = resp.json()["message"]["content"]
            return _clean(json.loads(content), ctx)
        except Exception as e:
            logger.warning("Qwen denemesi %s başarısız: %s", attempt, e)
    return None
```

- [ ] **Step 5: Run the tests**

Run: `pytest tests/test_qwen_service.py -v && pytest`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ai/qwen_service.py src/config.py .env.example tests/test_qwen_service.py
git commit -m "feat: Qwen field-extraction client with hard response validation"
```

---

### Task 10: The personal conversation flow

Model this on `src/bot/handlers/trade_flow.py` — read it first. Reuse its draft-in-`user_data`, inline-keyboard, and stale-callback patterns rather than inventing new ones.

**Files:**
- Create: `src/bot/handlers/personal_flow.py`
- Test: `tests/test_personal_flow.py`

**Interfaces:**
- Consumes: `parse_personal_message` (Task 9), `PersonalRepository` (Tasks 6–8), `build_rows` / `missing_fields` (Task 5), `resolve_turkish_date` (Task 1).
- Produces:
  - `handle_personal_text_message(update, context) -> bool` — `True` when it took ownership of the message.
  - `handle_personal_callbacks(update, context) -> bool`
  - `format_summary(draft: dict, ctx: dict) -> str`
- Draft state key: `context.user_data["personal_draft"]`. Pending-input key: `context.user_data["personal_awaiting"]`.
- Callback data prefixes: `pf:save`, `pf:cancel`, `pf:edit`, `pf:field:<name>`, `pf:set:<field>:<value>`, `pf:new:<field>`, `pf:undo`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_flow.py
"""The Telegram conversation for personal-ledger entry."""
import types

import pytest

from src.bot.handlers import personal_flow
from src.ai.qwen_service import PersonalParse
from src.data.personal_repository import PersonalRepository


class FakeMessage:
    def __init__(self, text=""):
        self.text = text
        self.replies = []

    async def reply_text(self, text, **kwargs):
        self.replies.append((text, kwargs))
        return types.SimpleNamespace(message_id=1)


class FakeUpdate:
    def __init__(self, text=""):
        self.message = FakeMessage(text)
        self.callback_query = None
        self.effective_message = self.message


class FakeContext:
    def __init__(self):
        self.user_data = {}


@pytest.fixture
def repo(tmp_path, monkeypatch):
    r = PersonalRepository(bbb_dir=tmp_path)
    r.ensure_seeded(pull=lambda: None)
    monkeypatch.setattr(personal_flow, "get_repo", lambda: r)
    return r


def _qwen(monkeypatch, parse):
    monkeypatch.setattr(personal_flow, "parse_personal_message",
                        lambda text, ctx: parse)


COMPLETE = PersonalParse(tur="GIDER", tutar=340.0, paraBirimi="TRY",
                         kategori="market", hesap="NAKIT", sahip="ENIS",
                         aciklama="Migros", guven=0.9)


@pytest.mark.asyncio
async def test_returns_false_when_qwen_is_unavailable(repo, monkeypatch):
    _qwen(monkeypatch, None)
    u, c = FakeUpdate("hava nasıl"), FakeContext()
    assert await personal_flow.handle_personal_text_message(u, c) is False
    assert u.message.replies == []


@pytest.mark.asyncio
async def test_returns_false_for_anlasilmadi(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="ANLASILMADI"))
    u, c = FakeUpdate("hava nasıl"), FakeContext()
    assert await personal_flow.handle_personal_text_message(u, c) is False


@pytest.mark.asyncio
async def test_complete_message_goes_straight_to_confirmation(repo, monkeypatch):
    _qwen(monkeypatch, COMPLETE)
    u, c = FakeUpdate("markette 340 lira"), FakeContext()
    assert await personal_flow.handle_personal_text_message(u, c) is True
    text, kwargs = u.message.replies[-1]
    assert "340" in text and "Market" in text
    assert kwargs["reply_markup"] is not None
    assert c.user_data["personal_draft"]["tutar"] == 340.0
    assert repo.list_entries() == [], "nothing is written before confirmation"


@pytest.mark.asyncio
async def test_missing_category_asks_exactly_one_question(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="GIDER", tutar=340.0, paraBirimi="TRY",
                                     hesap="NAKIT", sahip="ENIS", aciklama="Migros"))
    u, c = FakeUpdate("340 lira harcadım"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    assert len(u.message.replies) == 1
    assert "kategori" in u.message.replies[0][0].lower()


@pytest.mark.asyncio
async def test_missing_currency_defaults_to_try(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="GIDER", tutar=340.0, kategori="market",
                                     hesap="NAKIT", sahip="ENIS", aciklama="Migros"))
    u, c = FakeUpdate("markette 340"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    assert c.user_data["personal_draft"]["paraBirimi"] == "TRY"


@pytest.mark.asyncio
async def test_date_phrase_is_resolved_in_python(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="GIDER", tutar=340.0, paraBirimi="TRY",
                                     kategori="market", hesap="NAKIT", sahip="ENIS",
                                     tarihIfadesi="dün", aciklama="Migros"))
    u, c = FakeUpdate("dün markette 340 lira"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    import datetime as dt
    assert c.user_data["personal_draft"]["tarih"] == (
        dt.date.today() - dt.timedelta(days=1)).isoformat()


@pytest.mark.asyncio
async def test_instalment_summary_shows_the_split(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="GIDER", tutar=12000.0, paraBirimi="TRY",
                                     kategori="ev", hesap="NAKIT", sahip="ENIS",
                                     taksitSayisi=6, aciklama="Beyaz eşya"))
    u, c = FakeUpdate("beyaz eşya 12000 6 taksit"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    text = u.message.replies[-1][0]
    assert "6" in text and "2.000" in text


def test_format_summary_of_an_ordinary_expense(repo):
    draft = {"tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY", "kategori": "market",
             "hesap": "NAKIT", "sahip": "ENIS", "tarih": "2026-09-07",
             "taksitSayisi": None, "aciklama": "Migros", "uyarilar": []}
    s = personal_flow.format_summary(draft, repo.build_ctx())
    assert "Market" in s and "340" in s and "Migros" in s and "Nakit" in s


def test_format_summary_appends_warnings(repo):
    draft = {"tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY", "kategori": "market",
             "hesap": "NAKIT", "sahip": "ENIS", "tarih": "2026-09-07",
             "taksitSayisi": None, "aciklama": "Migros",
             "uyarilar": ["Tarih anlaşılamadı, bugün varsayıldı."]}
    assert "anlaşılamadı" in personal_flow.format_summary(draft, repo.build_ctx())
```

Add `pytest-asyncio` to `requirements.txt` and `asyncio_mode = auto` under `[pytest]` in `pytest.ini` **only if** the existing suite does not already provide async support — check `tests/test_trade_flow.py` first and follow whatever it does.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_flow.py -v`
Expected: FAIL — `No module named 'src.bot.handlers.personal_flow'`

- [ ] **Step 3: Implement the flow**

Write `src/bot/handlers/personal_flow.py` with:

- a module-level `get_repo()` returning a lazily-created singleton `PersonalRepository` (so tests can monkeypatch it),
- `handle_personal_text_message`: if `personal_awaiting` is set, treat the text as the answer to the pending question and resume; otherwise call `parse_personal_message(text, repo.build_ctx())`. `None` or `tur == "ANLASILMADI"` → return `False`. Build the draft: copy the parse's fields; `paraBirimi` defaults to `"TRY"`; resolve `tarihIfadesi` with `resolve_turkish_date(normalize_turkish_str(phrase), phrase, ctx["bugun"])` and collect its warnings into `draft["uyarilar"]`; when a required field has exactly one candidate fill it silently. Then `missing_fields` → ask the first one, or show the confirmation.
- `format_summary(draft, ctx)`: `🧾 <Kategori adı> · <tutar> <TL|$> · <açıklama> · <hesap adı> · <kişi adı> · <gün ay>`; for an instalment purchase append ` · <n> × <taksit tutarı> (<ilk ay>–<son ay>)`; append each warning on its own line. Use the amount formatting already in `src/bot/telegram_utils.py` if it has one — check before writing a new formatter.
- keyboards: option buttons for the asked field plus `➕ Yeni`, and the confirm row `[✅ Kaydet] [✏️ Düzelt] [❌ İptal]`.
- `handle_personal_callbacks`: dispatch on the `pf:` prefixes; unknown or stale callback data answers the query and returns `True` without raising (mirror `trade_flow`'s stale-callback handling). `pf:save` → `build_rows(draft, repo.existing_ids())` → `repo.add_entry(...)` → reply `✅ Kaydedildi` with an `↩️ Geri al` button (`pf:undo`) → clear the draft. `pf:undo` → `repo.undo_last_entry()`. `pf:cancel` → clear the draft, reply `❌ İptal edildi`.

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_flow.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/handlers/personal_flow.py tests/test_personal_flow.py requirements.txt pytest.ini
git commit -m "feat: personal ledger Telegram flow with confirm-before-write"
```

---

### Task 11: The "➕ Yeni" creation sub-flow

Without a PWA page (D10) this is the only way to add a category, card, or household member, so it must work end to end.

**Files:**
- Modify: `src/bot/handlers/personal_flow.py`
- Test: `tests/test_personal_flow.py`

**Interfaces:**
- Consumes: `PersonalRepository.add_category/add_account/add_person` (Task 6).
- Produces: no new public names — `pf:new:<field>` callback handling plus the `personal_awaiting` states `"yeni:kategori"`, `"yeni:hesap"`, `"yeni:hesap_turu"`, `"yeni:sahip"`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_personal_flow.py`:

```python
class FakeQuery:
    def __init__(self, data, user_data_message=None):
        self.data = data
        self.message = user_data_message or FakeMessage()
        self.answered = False
        self.edits = []

    async def answer(self, *a, **kw):
        self.answered = True

    async def edit_message_text(self, text, **kwargs):
        self.edits.append((text, kwargs))


class FakeCallbackUpdate:
    def __init__(self, data):
        self.callback_query = FakeQuery(data)
        self.message = None
        self.effective_message = self.callback_query.message


@pytest.mark.asyncio
async def test_new_category_button_asks_for_a_name(repo, monkeypatch):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": None,
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    u = FakeCallbackUpdate("pf:new:kategori")
    assert await personal_flow.handle_personal_callbacks(u, c) is True
    assert c.user_data["personal_awaiting"] == "yeni:kategori"


@pytest.mark.asyncio
async def test_typing_a_new_category_name_creates_it_and_resumes(repo, monkeypatch):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": None,
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_awaiting"] = "yeni:kategori"
    u = FakeUpdate("Evcil hayvan")
    assert await personal_flow.handle_personal_text_message(u, c) is True
    assert any(cat["kod"] == "evcil-hayvan" for cat in repo.list_categories())
    assert c.user_data["personal_draft"]["kategori"] == "evcil-hayvan"
    assert "personal_awaiting" not in c.user_data
    assert "Evcil hayvan" in u.message.replies[-1][0]


@pytest.mark.asyncio
async def test_new_account_asks_for_its_type_before_creating(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": "market",
                                     "hesap": None, "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_awaiting"] = "yeni:hesap"
    u = FakeUpdate("Garanti Bonus")
    await personal_flow.handle_personal_text_message(u, c)
    assert c.user_data["personal_awaiting"] == "yeni:hesap_turu"
    assert repo.list_accounts() == [a for a in repo.list_accounts()
                                    if a["kod"] != "GARANTI-BONUS"]
    text = u.message.replies[-1][0].lower()
    assert "kredi" in text or "tür" in text


@pytest.mark.asyncio
async def test_choosing_the_account_type_creates_it_and_resumes(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": "market",
                                     "hesap": None, "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_awaiting"] = "yeni:hesap_turu"
    c.user_data["personal_new_name"] = "Garanti Bonus"
    u = FakeCallbackUpdate("pf:set:hesap_turu:KREDI_KARTI")
    await personal_flow.handle_personal_callbacks(u, c)
    assert any(a["kod"] == "GARANTI-BONUS" and a["tur"] == "KREDI_KARTI"
               for a in repo.list_accounts())
    assert c.user_data["personal_draft"]["hesap"] == "GARANTI-BONUS"


@pytest.mark.asyncio
async def test_new_person_creates_a_household_member(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": "market",
                                     "hesap": "NAKIT", "sahip": None,
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_awaiting"] = "yeni:sahip"
    await personal_flow.handle_personal_text_message(FakeUpdate("Babaanne"), c)
    assert any(p["kod"] == "BABAANNE" and p["haneUyesi"] for p in repo.list_people())
    assert c.user_data["personal_draft"]["sahip"] == "BABAANNE"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_flow.py -k new -v`
Expected: FAIL — the callback returns `False` or the awaiting state is never set.

- [ ] **Step 3: Implement**

In `handle_personal_callbacks`, `pf:new:<field>` sets `personal_awaiting = f"yeni:{field}"` and replies asking for a name. In `handle_personal_text_message`, when `personal_awaiting` starts with `yeni:` treat the whole message as the name:
- `yeni:kategori` → `repo.add_category(name, tur=draft["tur"])`, set `draft["kategori"]`, clear the state, continue the flow (ask the next missing field or show the confirmation).
- `yeni:hesap` → store `personal_new_name`, set `personal_awaiting = "yeni:hesap_turu"`, show three buttons `pf:set:hesap_turu:NAKIT|BANKA|KREDI_KARTI`. Only after the type is chosen call `repo.add_account(name, tur=...)`.
- `yeni:sahip` → `repo.add_person(name)`, set `draft["sahip"]`, clear the state, continue.

After each creation, always re-enter the same "ask next missing field, else confirm" routine used at the end of Task 10 — do not duplicate that logic; factor it into one private `_advance(update, context, draft)` helper and call it from every resume point.

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_flow.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/handlers/personal_flow.py tests/test_personal_flow.py
git commit -m "feat: create categories, accounts, and people from the confirm flow"
```

---

### Task 12: Route the flow into the bot

The single wiring change. It replaces the dead end in `on_text_message` and adds a callback route — nothing else.

**Files:**
- Modify: `src/bot/main.py`
- Test: `tests/test_personal_routing.py`

**Interfaces:**
- Consumes: `handle_personal_text_message`, `handle_personal_callbacks` (Tasks 10–11).
- Produces: no new names.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_routing.py
"""The personal flow attaches strictly AFTER the deterministic trade parser,
so a Qwen outage can never degrade trade entry."""
import pytest

from src.bot import main as bot_main


class FakeMessage:
    def __init__(self, text):
        self.text = text
        self.replies = []

    async def reply_text(self, text, **kwargs):
        self.replies.append(text)


class FakeUpdate:
    def __init__(self, text):
        self.message = FakeMessage(text)
        self.effective_user = type("U", (), {"id": 1, "username": "enis"})()
        self.effective_message = self.message


class FakeContext:
    def __init__(self):
        self.user_data = {}


@pytest.fixture
def spies(monkeypatch):
    calls = {"trade": 0, "correction": 0, "personal": 0}

    async def trade(u, c):
        calls["trade"] += 1
        return calls.get("_trade_handles", False)

    async def correction(u, c):
        calls["correction"] += 1
        return False

    async def personal(u, c):
        calls["personal"] += 1
        return calls.get("_personal_handles", False)

    monkeypatch.setattr(bot_main, "handle_trade_text_message", trade)
    monkeypatch.setattr(bot_main, "handle_conversational_correction", correction)
    monkeypatch.setattr(bot_main, "handle_personal_text_message", personal)
    return calls


@pytest.mark.asyncio
async def test_a_trade_message_never_reaches_the_personal_flow(spies):
    spies["_trade_handles"] = True
    u = FakeUpdate("10 adet aselsan 221 den aldım")
    await bot_main.on_text_message(u, FakeContext())
    assert spies["trade"] == 1
    assert spies["personal"] == 0, "Qwen must never see an investment trade"


@pytest.mark.asyncio
async def test_an_unparseable_message_reaches_the_personal_flow(spies):
    spies["_personal_handles"] = True
    u = FakeUpdate("markette 340 lira")
    await bot_main.on_text_message(u, FakeContext())
    assert spies["personal"] == 1
    assert u.message.replies == [], "no help text once the personal flow took it"


@pytest.mark.asyncio
async def test_the_help_text_survives_when_nothing_handles_the_message(spies):
    u = FakeUpdate("hava nasıl")
    await bot_main.on_text_message(u, FakeContext())
    assert spies["personal"] == 1
    assert any("anlayamadım" in r.lower() for r in u.message.replies)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_routing.py -v`
Expected: FAIL — `AttributeError: module 'src.bot.main' has no attribute 'handle_personal_text_message'`

- [ ] **Step 3: Wire it in**

In `src/bot/main.py` add the import:

```python
from .handlers.personal_flow import (
    handle_personal_callbacks,
    handle_personal_text_message,
)
```

In `on_text_message`, immediately **before** the final `await update.message.reply_text("💡 *Mesajı anlayamadım.* …")`:

```python
    # Not a trade and not a correction -> the personal ledger gets a look.
    # Qwen lives ONLY here, so an outage degrades to the help text below and
    # never touches trade entry.
    handled = await handle_personal_text_message(update, context)
    if handled:
        return
```

In `on_callback_query`, add after the sync route:

```python
    if await handle_personal_callbacks(update, context):
        return
```

- [ ] **Step 4: Run the tests**

Run: `pytest tests/test_personal_routing.py -v && pytest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/bot/main.py tests/test_personal_routing.py
git commit -m "feat: route unparsed messages to the personal ledger flow"
```

---

### Task 13: Commands and startup seeding

**Files:**
- Modify: `src/bot/main.py`, `src/bot/handlers/personal_flow.py`, `src/bot/handlers/query_flow.py` (the `/yardim` text)
- Test: `tests/test_personal_commands.py`

**Interfaces:**
- Consumes: `PersonalRepository.list_entries/month_summary/build_ctx/ensure_seeded`.
- Produces: `handle_defter(update, context)`, `handle_harcama_ozet(update, context)`, `handle_tanimlar(update, context)` in `personal_flow.py`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_commands.py
"""/defter, /harcama_ozet, /tanimlar."""
import datetime as dt

import pytest

from src.bot.handlers import personal_flow
from src.data.personal_repository import PersonalRepository
from src.data.personal_rules import build_rows


class FakeMessage:
    def __init__(self):
        self.replies = []

    async def reply_text(self, text, **kwargs):
        self.replies.append(text)


class FakeUpdate:
    def __init__(self):
        self.message = FakeMessage()
        self.effective_message = self.message


class FakeContext:
    def __init__(self):
        self.user_data = {}


@pytest.fixture
def repo(tmp_path, monkeypatch):
    r = PersonalRepository(bbb_dir=tmp_path)
    r.ensure_seeded(pull=lambda: None)
    monkeypatch.setattr(personal_flow, "get_repo", lambda: r)
    return r


def _add(repo, **over):
    base = {"tur": "GIDER", "tutar": 340.0, "paraBirimi": "TRY", "kategori": "market",
            "hesap": "NAKIT", "sahip": "ENIS", "tarih": dt.date.today().isoformat(),
            "taksitSayisi": None, "aciklama": "Migros", "uyarilar": []}
    rows, plan = build_rows(dict(base, **over), repo.existing_ids())
    repo.add_entry(rows, plan)


@pytest.mark.asyncio
async def test_defter_reports_emptiness_clearly(repo):
    u = FakeUpdate()
    await personal_flow.handle_defter(u, FakeContext())
    assert "kayıt" in u.message.replies[0].lower()


@pytest.mark.asyncio
async def test_defter_lists_recent_entries(repo):
    _add(repo)
    _add(repo, tutar=99.0, aciklama="Kahve", kategori="yeme-icme")
    u = FakeUpdate()
    await personal_flow.handle_defter(u, FakeContext())
    out = u.message.replies[0]
    assert "Kahve" in out and "Migros" in out


@pytest.mark.asyncio
async def test_ozet_shows_the_monthly_total_and_categories(repo):
    _add(repo, tutar=500.0, kategori="kira")
    _add(repo, tutar=100.0, kategori="market")
    u = FakeUpdate()
    await personal_flow.handle_harcama_ozet(u, FakeContext())
    out = u.message.replies[0]
    assert "600" in out.replace(".", "").replace(",", "")
    assert out.index("Kira") < out.index("Market"), "descending by amount"


@pytest.mark.asyncio
async def test_ozet_excludes_future_instalments(repo):
    _add(repo, tutar=12000.0, taksitSayisi=6, kategori="ev", aciklama="Beyaz eşya")
    u = FakeUpdate()
    await personal_flow.handle_harcama_ozet(u, FakeContext())
    out = u.message.replies[0].replace(".", "").replace(",", "")
    assert "2000" in out and "12000" not in out


@pytest.mark.asyncio
async def test_tanimlar_lists_what_qwen_may_choose_from(repo):
    u = FakeUpdate()
    await personal_flow.handle_tanimlar(u, FakeContext())
    out = u.message.replies[0]
    assert "Market" in out and "Nakit" in out and "Enis" in out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_personal_commands.py -v`
Expected: FAIL — `module 'src.bot.handlers.personal_flow' has no attribute 'handle_defter'`

- [ ] **Step 3: Implement the three handlers**

In `personal_flow.py`, all Turkish, all plain text (avoid Markdown — the existing bot has been bitten twice by Markdown parse errors, see commits `cae3a43` and `dfd3fec`):
- `handle_defter` — `repo.list_entries(limit=10)`, one line each: `07 Eyl · Market · 340 TL · Migros · Nakit` plus the id in parentheses; instalment rows append ` (3/6)`. Empty → `"📖 Defterde henüz kayıt yok."`.
- `handle_harcama_ozet` — `repo.month_summary(today.year, today.month)`; a total line per currency, then the category breakdown descending, then the income line if non-zero.
- `handle_tanimlar` — three sections listing the active categories, accounts (with their type), and household members.

- [ ] **Step 4: Register the commands and seed at startup**

In `src/bot/main.py`:

```python
app.add_handler(CommandHandler(["defter"], handle_defter))
app.add_handler(CommandHandler(["harcama_ozet", "harcama"], handle_harcama_ozet))
app.add_handler(CommandHandler(["tanimlar"], handle_tanimlar))
```

Add to `BOT_COMMANDS`:

```python
    BotCommand("defter", "Kişisel defter — son kayıtlar"),
    BotCommand("harcama_ozet", "Bu ayki harcama özeti"),
    BotCommand("tanimlar", "Kategoriler, hesaplar ve kişiler"),
```

In `_post_init`, after `set_my_commands`, seed the ledger and log the outcome — a failure must not stop the bot:

```python
    from ..data.personal_repository import PersonalRepository
    if not PersonalRepository().ensure_seeded():
        logger.warning("Kişisel defter hazırlanamadı (rclone pull başarısız).")
```

Finally extend the `/yardim` text in `src/bot/handlers/query_flow.py::handle_start` with a short personal-ledger section and two examples: `markette 340 lira` and `beyaz eşya 12000 tl 6 taksit`.

- [ ] **Step 5: Run the tests**

Run: `pytest tests/test_personal_commands.py -v && pytest`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/bot/main.py src/bot/handlers/personal_flow.py src/bot/handlers/query_flow.py tests/test_personal_commands.py
git commit -m "feat: /defter, /harcama_ozet, /tanimlar and startup seeding"
```

---

### Task 14: Documentation, secret audit, and the GitHub remote

The bot repo currently has **no remote**, so there is no reproducible way to get this onto the VM (D12).

**Files:**
- Modify: `README.md`, `deploy/README.md`, `.gitignore`

- [ ] **Step 1: Audit the ignore rules and the existing history**

```bash
cat .gitignore
git ls-files | grep -E '\.env$|^data/|bot\.log|pdf_uploads/' || echo "clean"
git log --all --oneline --name-only | grep -E '\.env$|bot\.log' || echo "no secret ever committed"
```

Expected: the working tree tracks none of them and no `.env` or `bot.log` appears in history. Add any missing pattern to `.gitignore` (`.env`, `data/`, `bot.log`, `pdf_uploads/`, `.venv/`, `__pycache__/`, `.pytest_cache/`) and commit. **If a secret is found in history, stop and report it — do not push.**

- [ ] **Step 2: Document the personal ledger in `README.md`**

Add a "Kişisel Defter" section covering: the six files and what each holds; two example messages; the confirm-then-save flow and the `➕ Yeni` button; the three new commands; the `QWEN_*` settings and that `QWEN_MODEL` must match a tag from `ollama list`; that a Qwen outage degrades to the old help text and breaks nothing.

- [ ] **Step 3: Record the write-safety contract in `deploy/README.md`**

Add a subsection titled **"Kişisel defter — tek kopya"** stating, in the same operational tone as the rest of that file:
- the personal files live only in `BBB/data/`, with no bot-side copy;
- the pull is split in two, and the personal half carries `--update`;
- **`--update` must never be added to the main pull** — `apply_sync_to_bbb()` rewrites `transactions.json` every cycle, so the local copy is permanently newer and a global `--update` would silently stop importing dashboard edits;
- `ensure_seeded` pulls before it seeds, so an empty local `data/` can never overwrite a populated Drive folder;
- **the expiry condition:** the moment anything other than the bot can write these files — the planned PWA "Kişisel Defter" page — last-writer-wins becomes real data loss, and this needs a merge base and a conflict rule like `transactions.json` has. The phase that builds that page must revisit spec §5.3 first.

- [ ] **Step 4: Document the VM update procedure**

In `deploy/README.md`, an "Update on the VM" section:

```sh
cd ~/bbb-telegram-bot
git pull
. .venv/bin/activate && pip install -r requirements.txt
sudo systemctl restart bbb-bot          # confirm the real unit name on the VM
sudo systemctl restart bbb-sync.timer bbb-sync.path
```

- [ ] **Step 5: Run the full suite one last time**

Run: `pytest`
Expected: every test green. Record the count in the commit message.

- [ ] **Step 6: Commit**

```bash
git add README.md deploy/README.md .gitignore
git commit -m "docs: personal ledger usage, write-safety contract, VM update steps"
```

- [ ] **Step 7: Hand the remaining steps to Enis**

These need his accounts and his VM; do not attempt them. Report them as the final message:
1. Create a **private** GitHub repo for `bbb-telegram-bot` and push: `git remote add origin <url> && git push -u origin main`. Private, not public — this repo has carried `bot.log`, `pdf_uploads/`, and a data directory, and its `.env` discipline was never audited for publication.
2. On the VM: `ollama list`, then set `QWEN_MODEL` in `.env` to the exact tag shown.
3. On the VM: `git pull`, reinstall requirements, restart the bot and the sync units.
4. Send the bot `markette 340 lira` and confirm the summary, then `/defter` and `/harcama_ozet`.
5. Confirm `personal_tx.json` appears in the Drive `BBB/` folder within two minutes.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 D1 Qwen on localhost | 9 |
| §1 D2 single copy in BBB/data | 6, 7, 8 |
| §1 D3 instalments as monthly rows | 3, 5 |
| §1 D4 no currency conversion | 5, 7 (per-currency totals) |
| §1 D5 confirm-then-write | 10 |
| §1 D6 seeded editable categories | 5, 6, 11 |
| §1 D7 individual payment instruments | 5, 6, 11 |
| §1 D8 multi-person household | 5, 6, 11 |
| §1 D9 debts.json schema only | 8 (created empty; no writer anywhere) |
| §1 D10 no PWA page | — (nothing built) |
| §1 D11 no historical import | — (nothing built) |
| §1 D12 GitHub remote + VM pull | 14 |
| §3.1–3.5 file schemas | 5, 6, 7, 8 |
| §3.6 debts schema | 8 |
| §3.7 identifiers | 4 |
| §4.1 routing | 12 |
| §4.2 Qwen client | 9 |
| §4.3 deterministic core | 1, 3, 4, 5 |
| §4.4 conversation | 10, 11 |
| §4.5 commands | 13 |
| §5.1 PersonalRepository | 6, 7 |
| §5.2 sync wiring | 8 |
| §5.3 lock + expiry condition | 6 (`_save` takes the lock), 14 (documented) |
| §6 deployment | 14 |
| §7 test strategy | every task |

No gap found.

**Type consistency:** `resolve_turkish_date` keeps `_resolve_date`'s three-tuple signature (Tasks 1, 10). The draft dict defined in Task 5 is used unchanged in Tasks 7, 10, 11, 13. `PersonalParse` field names (Task 9) match the draft keys they feed. `build_rows(draft, existing_ids)` is called with `repo.existing_ids()` in Tasks 7, 10, 13. `ensure_seeded(pull=...)` is injectable in every test that uses it (Tasks 8, 10, 13). `PersonalRepository.FILES` is defined in Task 6 and consumed by the guard test in Task 7 and by `PERSONAL_FILES` in Task 8 — **these two lists must stay in step; Task 8's test asserts the six names explicitly so a divergence fails loudly.**

**Placeholders:** none — every code step carries the actual code or a precise, named edit to an existing function.
