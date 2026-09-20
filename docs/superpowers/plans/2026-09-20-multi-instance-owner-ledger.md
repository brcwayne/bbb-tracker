# Multi-Instance Deployment + Owner Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the same system for a second person on fully separate data, and give the ledger a per-owner balance (who owns how much of a mixed pool of accounts).

**Architecture:** One codebase, two deployments differing only by `.env`, data dir, Drive folder and systemd units. Owner arithmetic is one pure function per language (`owners.ts`, `owners.py`) held to identical output by one shared JSON fixture. The bot gains `/bakiye`, `/aktar` and an owner-to-owner phrase; the web app gains a **Kişiler** tab.

**Tech Stack:** Python 3 + python-telegram-bot + pytest (bot); Svelte 5 + Vite + TypeScript + Vitest (app); systemd + rclone (VM).

**Spec:** `docs/superpowers/specs/2026-09-20-multi-instance-owner-ledger-design.md`

## Two repos — read this first

| Repo | Path | Remote | Tasks |
|---|---|---|---|
| **bot** (private, own `.git`, ignored by the BBB repo) | `/Users/enisuslu/Desktop/Market/BBB/bbb-telegram-bot` | `brcwayne/bbb-telegram-bot` | 1–6, 9 |
| **BBB** (public) | `/Users/enisuslu/Desktop/Market/BBB` | `brcwayne/bbb-tracker` | 7, 8, and this plan |

Run each task's commands **in its own repo** and commit there. Commit messages end with:
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
Do **not** push and do **not** touch the VM until Task 10 says so.

## Global Constraints

- Enis's behaviour does not change: all **625** existing bot tests and every existing app test stay green after every task.
- No new dependencies on either side.
- Nothing derived is computed inside a `.svelte` file; it lives in `app/src/lib/data/`.
- Writing `personal_accounts.json` / `people.json` preserves unknown fields.
- Turkish user-facing strings.
- **Secrets never enter git, this plan, specs or memory.** The friend's bot token and Telegram ID go only into the VM `.env` (Task 10).
- Enis's existing VM units, directories and rclone remote `gdrive` are never modified.

---

## Shared fixture (used by Tasks 5 and 7)

Create the **identical** file in both repos:
`bbb-telegram-bot/tests/fixtures/owner_ledger_cases.json` and `app/src/fixtures/owner_ledger_cases.json`.

Owner delta rules (spec §3.2): `GELIR` +, `GIDER` −, `DUZELTME` + (already signed), `SAHIP_AKTARIM` giver −/receiver +, `TRANSFER` with **exactly one** side in a personal account moves the row's `sahip` (money leaving/entering the personal ledger), any other `TRANSFER` moves nobody; rows dated after `today` and `durum: "planlandi"` are skipped; empty `sahip` → bucket `__sahipsiz__`.

```json
{
  "cases": [
    {
      "name": "karma: every row kind, gap is zero",
      "today": "2026-09-20",
      "people": [
        {"kod": "BEN", "ad": "Ben", "haneUyesi": true, "aktif": true},
        {"kod": "ANNE", "ad": "Anne", "haneUyesi": false, "aktif": true},
        {"kod": "KAFE", "ad": "Kafe", "haneUyesi": false, "aktif": true},
        {"kod": "DEDE", "ad": "Dede", "haneUyesi": false, "aktif": true}
      ],
      "accounts": [
        {"kod": "BANKA", "ad": "Banka", "tur": "BANKA", "paraBirimi": "TRY", "sahip": "BEN", "aktif": true},
        {"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "paraBirimi": "TRY", "sahip": "BEN", "aktif": true},
        {"kod": "KART", "ad": "Kart", "tur": "KREDI_KARTI", "paraBirimi": "TRY", "sahip": "BEN", "aktif": true}
      ],
      "rows": [
        {"id": "r1", "tarih": "2026-09-01", "tur": "DUZELTME", "tutar": 20000, "paraBirimi": "TRY", "hesap": "BANKA", "sahip": "ANNE"},
        {"id": "r2", "tarih": "2026-09-01", "tur": "DUZELTME", "tutar": 5000, "paraBirimi": "TRY", "hesap": "BANKA", "sahip": "BEN"},
        {"id": "r3", "tarih": "2026-09-02", "tur": "GELIR", "tutar": 3000, "paraBirimi": "TRY", "hesap": "BANKA", "sahip": "KAFE"},
        {"id": "r4", "tarih": "2026-09-03", "tur": "GIDER", "tutar": 800, "paraBirimi": "TRY", "hesap": "BANKA", "sahip": "ANNE"},
        {"id": "r5", "tarih": "2026-09-04", "tur": "SAHIP_AKTARIM", "tutar": 5000, "paraBirimi": "TRY", "hesap": "", "sahip": "ANNE", "karsiSahip": "BEN"},
        {"id": "r6", "tarih": "2026-09-05", "tur": "TRANSFER", "tutar": 1000, "paraBirimi": "TRY", "hesap": "BANKA", "karsiHesap": "NAKIT", "sahip": "BEN"},
        {"id": "r7", "tarih": "2026-09-06", "tur": "GIDER", "tutar": 400, "paraBirimi": "TRY", "hesap": "KART", "sahip": "BEN"},
        {"id": "r8", "tarih": "2026-09-07", "tur": "GIDER", "tutar": 100, "paraBirimi": "TRY", "hesap": "NAKIT", "sahip": ""},
        {"id": "r9", "tarih": "2026-10-01", "tur": "GIDER", "tutar": 999, "paraBirimi": "TRY", "hesap": "BANKA", "sahip": "BEN"},
        {"id": "r10", "tarih": "2026-09-01", "tur": "GIDER", "tutar": 777, "paraBirimi": "TRY", "hesap": "BANKA", "sahip": "BEN", "durum": "planlandi"},
        {"id": "r11", "tarih": "2026-09-08", "tur": "TRANSFER", "tutar": 2000, "paraBirimi": "TRY", "hesap": "BANKA", "karsiHesap": "QNB", "sahip": "ANNE"}
      ],
      "expected": {
        "owners": {
          "ANNE": {"TRY": 12200},
          "BEN": {"TRY": 9600},
          "KAFE": {"TRY": 3000},
          "DEDE": {},
          "__sahipsiz__": {"TRY": -100}
        },
        "ownerTotal": {"TRY": 24700},
        "accountTotal": {"TRY": 24700},
        "gap": {"TRY": 0}
      }
    },
    {
      "name": "yetim: a row on an unknown account shows up as a gap",
      "today": "2026-09-20",
      "people": [{"kod": "BEN", "ad": "Ben", "haneUyesi": true, "aktif": true}],
      "accounts": [
        {"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "paraBirimi": "TRY", "sahip": "BEN", "aktif": true}
      ],
      "rows": [
        {"id": "y1", "tarih": "2026-09-01", "tur": "DUZELTME", "tutar": 1000, "paraBirimi": "TRY", "hesap": "NAKIT", "sahip": "BEN"},
        {"id": "y2", "tarih": "2026-09-02", "tur": "GIDER", "tutar": 50, "paraBirimi": "TRY", "hesap": "YOK", "sahip": "BEN"}
      ],
      "expected": {
        "owners": {"BEN": {"TRY": 950}},
        "ownerTotal": {"TRY": 950},
        "accountTotal": {"TRY": 1000},
        "gap": {"TRY": -50}
      }
    }
  ]
}
```

Hand check of "karma": ANNE = 20000 − 800 − 5000 − 2000 = 12200; BEN = 5000 + 5000 − 400 = 9600; KAFE = 3000; sahipsiz = −100; total 24700. Accounts: BANKA = 20000 + 5000 + 3000 − 800 − 1000 − 2000 = 24200; NAKIT = 1000 − 100 = 900; KART = −400; total 24700.

---

# PART A — Bot repo (`bbb-telegram-bot`)

### Task 1: Instance settings in `config.py`

**Files:**
- Modify: `src/config.py` (after the `DEFAULT_COMMISSION_RATE` line)
- Test: `tests/test_instance_config.py` (create)

**Produces:** `config.parse_flag(value, default) -> bool`, and constants `INSTANCE_NAME`, `DEFAULT_OWNER` (default `"ENIS"`), `DEFAULT_OWNER_NAME` (default `"Enis"`), `TRADE_FLOW_ENABLED` (default `True`), `RCLONE_REMOTE` (default `"gdrive"`).

- [ ] **Step 1: Write the failing test** — `tests/test_instance_config.py`

```python
import importlib

import pytest

from src import config


@pytest.mark.parametrize("raw,default,expected", [
    (None, True, True),
    ("", True, True),
    ("false", True, False),
    ("0", True, False),
    ("kapalı", True, False),
    ("true", False, True),
    ("evet", False, True),
    (None, False, False),
])
def test_parse_flag(raw, default, expected):
    assert config.parse_flag(raw, default) is expected


def test_defaults_are_the_enis_deployment(monkeypatch):
    for name in ("INSTANCE_NAME", "DEFAULT_OWNER", "DEFAULT_OWNER_NAME",
                 "TRADE_FLOW_ENABLED", "RCLONE_REMOTE"):
        monkeypatch.delenv(name, raising=False)
    cfg = importlib.reload(config)
    assert cfg.INSTANCE_NAME == "enis"
    assert cfg.DEFAULT_OWNER == "ENIS"
    assert cfg.DEFAULT_OWNER_NAME == "Enis"
    assert cfg.TRADE_FLOW_ENABLED is True
    assert cfg.RCLONE_REMOTE == "gdrive"


def test_env_overrides_them(monkeypatch):
    monkeypatch.setenv("DEFAULT_OWNER", "BEN")
    monkeypatch.setenv("TRADE_FLOW_ENABLED", "false")
    monkeypatch.setenv("RCLONE_REMOTE", "gdrive-friend")
    cfg = importlib.reload(config)
    assert cfg.DEFAULT_OWNER == "BEN"
    assert cfg.TRADE_FLOW_ENABLED is False
    assert cfg.RCLONE_REMOTE == "gdrive-friend"
    monkeypatch.undo()
    importlib.reload(config)
```

- [ ] **Step 2: Run to verify it fails** — `.venv/bin/python -m pytest tests/test_instance_config.py -q` → FAIL (`parse_flag` missing).

- [ ] **Step 3: Implement** — in `src/config.py`, after `DEFAULT_COMMISSION_RATE = ...`:

```python
_FALSY = {"false", "0", "no", "off", "hayir", "hayır", "kapali", "kapalı"}


def parse_flag(value: str | None, default: bool) -> bool:
    """Blank/unset -> ``default``; a known 'off' word -> False; anything else -> True."""
    if value is None or not value.strip():
        return default
    return value.strip().lower() not in _FALSY


# --- Instance settings (a second deployment differs only by these + .env) ---
INSTANCE_NAME = os.getenv("INSTANCE_NAME", "enis").strip() or "enis"
DEFAULT_OWNER = os.getenv("DEFAULT_OWNER", "ENIS").strip() or "ENIS"
DEFAULT_OWNER_NAME = os.getenv("DEFAULT_OWNER_NAME", "Enis").strip() or "Enis"
TRADE_FLOW_ENABLED = parse_flag(os.getenv("TRADE_FLOW_ENABLED"), True)
RCLONE_REMOTE = os.getenv("RCLONE_REMOTE", "gdrive").strip() or "gdrive"
```

- [ ] **Step 4: Run** — `.venv/bin/python -m pytest tests/test_instance_config.py -q` → PASS; then full suite `.venv/bin/python -m pytest -q` → 625 + new, 0 failures.

- [ ] **Step 5: Commit** — `git add src/config.py tests/test_instance_config.py && git commit -m "feat(config): instance settings (owner, trade flag, rclone remote)"`

---

### Task 2: Remove the hard-coded owner `"ENIS"`

**Files:**
- Modify: `src/data/personal_seed.py`, `src/data/personal_repository.py` (imports, `ensure_seeded` ~L122-129, `add_account` L163-164, `add_transfer` L558-566, `build_ctx` L211), `src/bot/handlers/personal_flow.py` (L419, L812)
- Test: `tests/test_no_hardcoded_owner.py` (create)

**Consumes:** Task 1 constants.
**Produces:** `personal_seed.build_seed_people(owner_kod, owner_ad) -> list[dict]`, `personal_seed.build_seed_accounts(owner_kod) -> list[dict]`. For `("ENIS","Enis")` both return exactly today's seeds.

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

from src.data import personal_repository as pr
from src.data.personal_seed import (
    SEED_ACCOUNTS, SEED_PEOPLE, build_seed_accounts, build_seed_people,
)

ROOT = Path(__file__).resolve().parent.parent


def test_default_owner_seeds_are_unchanged():
    assert build_seed_people("ENIS", "Enis") == SEED_PEOPLE
    assert build_seed_accounts("ENIS") == SEED_ACCOUNTS


def test_another_owner_gets_only_themselves():
    assert build_seed_people("BEN", "Ben") == [
        {"kod": "BEN", "ad": "Ben", "haneUyesi": True, "aktif": True}]
    assert build_seed_accounts("BEN")[0]["sahip"] == "BEN"


def _repo(tmp_path, monkeypatch, owner="BEN", name="Ben"):
    monkeypatch.setattr(pr, "DEFAULT_OWNER", owner)
    monkeypatch.setattr(pr, "DEFAULT_OWNER_NAME", name)
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    return pr.PersonalRepository(bbb_dir=tmp_path)


def test_ensure_seeded_and_ctx_use_the_configured_owner(tmp_path, monkeypatch):
    r = _repo(tmp_path, monkeypatch)
    assert r.ensure_seeded(pull=lambda: None) is True
    assert [p["kod"] for p in r.list_people()] == ["BEN"]
    assert r.list_accounts()[0]["sahip"] == "BEN"
    assert r.build_ctx()["varsayilanSahip"] == "BEN"


def test_add_account_and_transfer_default_to_the_configured_owner(tmp_path, monkeypatch):
    r = _repo(tmp_path, monkeypatch)
    a = r.add_account("A", "BANKA")
    b = r.add_account("B", "NAKIT")
    assert a["sahip"] == "BEN"
    row = r.add_transfer("A", "B", 100)
    assert row["sahip"] == "BEN"


def test_no_owner_literal_outside_the_seed():
    for rel in ("src/bot/handlers/personal_flow.py", "src/data/personal_repository.py"):
        assert '"ENIS"' not in (ROOT / rel).read_text(encoding="utf-8"), rel
```

If `add_transfer` raises because `brokers.json` is absent, write `[]` to `tmp_path/"data"/"brokers.json"` in `_repo`.

- [ ] **Step 2: Run** → FAIL (`build_seed_people` missing).

- [ ] **Step 3: Implement**

`src/data/personal_seed.py` (append):

```python
def build_seed_people(owner_kod: str, owner_ad: str) -> list[dict]:
    """The default deployment keeps its historic two-person seed; any other
    owner starts with only themselves."""
    if owner_kod == "ENIS":
        return [dict(p) for p in SEED_PEOPLE]
    return [{"kod": owner_kod, "ad": owner_ad, "haneUyesi": True, "aktif": True}]


def build_seed_accounts(owner_kod: str) -> list[dict]:
    return [dict(a, sahip=owner_kod) for a in SEED_ACCOUNTS]
```

`src/data/personal_repository.py`:
1. Find the config import (`grep -n "config import" src/data/personal_repository.py`) and add `DEFAULT_OWNER, DEFAULT_OWNER_NAME` to it.
2. In `ensure_seeded`, replace the import line with `from .personal_seed import SEED_CATEGORIES, build_seed_accounts, build_seed_people`, and the `defaults` entries with `"accounts": build_seed_accounts(DEFAULT_OWNER)` and `"people": build_seed_people(DEFAULT_OWNER, DEFAULT_OWNER_NAME)`.
3. `add_account(self, ad, tur, para_birimi="TRY", sahip: str | None = None)` → first line of body `sahip = sahip or DEFAULT_OWNER`.
4. `add_transfer(..., sahip: str | None = None)` → first line of body `sahip = sahip or DEFAULT_OWNER`.
5. `build_ctx`: `"varsayilanSahip": people[0]["kod"] if people else DEFAULT_OWNER`.

`src/bot/handlers/personal_flow.py`: add `from ...config import DEFAULT_OWNER`; L419 `ctx.get("varsayilanSahip", DEFAULT_OWNER)`; L812 `"sahip": DEFAULT_OWNER,`.

- [ ] **Step 4: Run** the new test file, then the full suite → all green.
- [ ] **Step 5: Commit** — `feat(instance): owner comes from config, not a literal`

---

### Task 3: Configurable rclone remote

**Files:**
- Modify: `src/sync/once.py` (import at L21; `"gdrive:"` at ~L78, L86, L93)
- Test: `tests/test_sync_remote.py` (create)

**Consumes:** `config.RCLONE_REMOTE`.

- [ ] **Step 1: Write the failing test**

```python
from src.sync import once


def _capture(monkeypatch, tmp_path):
    cmds = []
    monkeypatch.setattr(once, "_rclone", lambda cmd, phase: cmds.append(cmd))
    monkeypatch.setattr(once, "BBB_DIR", tmp_path)
    monkeypatch.setattr(once, "STAGE_DIR", tmp_path / "stage")
    monkeypatch.setattr(once, "BASE_DIR", tmp_path / "base")
    return cmds


def test_every_direction_uses_the_configured_remote(monkeypatch, tmp_path):
    monkeypatch.setattr(once, "RCLONE_REMOTE", "gdrive-friend")
    cmds = _capture(monkeypatch, tmp_path)
    for direction in ("pull", "pull-personal", "push"):
        once._run_rclone(direction)
    assert len(cmds) == 3
    for cmd in cmds:
        assert "gdrive-friend:" in cmd
        assert "gdrive:" not in cmd


def test_default_remote_is_unchanged(monkeypatch, tmp_path):
    cmds = _capture(monkeypatch, tmp_path)
    once._run_rclone("pull")
    assert "gdrive:" in cmds[0]
```

- [ ] **Step 2: Run** → FAIL (`once.RCLONE_REMOTE` missing).
- [ ] **Step 3: Implement** — `from ..config import BBB_DIR, RCLONE_REMOTE`; replace the three `"gdrive:"` literals with `f"{RCLONE_REMOTE}:"`. Then `grep -rn "gdrive" src` and confirm only docstrings/comments remain.
- [ ] **Step 4: Run** the new tests + full suite → green.
- [ ] **Step 5: Commit** — `feat(sync): configurable rclone remote`

---

### Task 4: `TRADE_FLOW_ENABLED` gating

**Files:**
- Modify: `src/bot/routing.py` (append `effective_route`), `src/bot/main.py` (imports; route decision ~L155; `BOT_COMMANDS` block ~L268; `_post_init` L290; handler registration ~L319-342)
- Test: `tests/test_trade_flow_flag.py` (create)

**Produces:** `routing.effective_route(route: str, trade_enabled: bool) -> str`; `main.TRADE_COMMAND_NAMES: set[str]`; `main.bot_commands(trade_enabled: bool) -> list[BotCommand]`.

- [ ] **Step 1: Write the failing test**

```python
from src.bot import main
from src.bot.routing import effective_route


def test_trade_route_becomes_personal_when_disabled():
    assert effective_route("trade", False) == "personal"
    assert effective_route("trade", True) == "trade"
    assert effective_route("personal", False) == "personal"
    assert effective_route("none", False) == "none"


def test_menu_hides_trade_commands_when_disabled():
    names = {c.command for c in main.bot_commands(False)}
    assert names.isdisjoint(main.TRADE_COMMAND_NAMES)
    assert {"defter", "harcama_ozet", "borclar"} <= names
    on = {c.command for c in main.bot_commands(True)}
    assert main.TRADE_COMMAND_NAMES <= on


def _registered_commands(app):
    out = set()
    for handlers in app.handlers.values():
        for h in handlers:
            out |= set(getattr(h, "commands", ()))
    return out


def test_trade_commands_are_not_registered_when_disabled(monkeypatch):
    monkeypatch.setattr(main, "TRADE_FLOW_ENABLED", False)
    cmds = _registered_commands(main.create_bot_app())
    assert "portfoy" not in cmds and "kz" not in cmds
    assert "defter" in cmds


def test_trade_commands_are_registered_when_enabled(monkeypatch):
    monkeypatch.setattr(main, "TRADE_FLOW_ENABLED", True)
    cmds = _registered_commands(main.create_bot_app())
    assert {"portfoy", "kz", "ozet", "islemler"} <= cmds
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

`routing.py` (append):

```python
def effective_route(route: str, trade_enabled: bool) -> str:
    """A deployment with the trade flow switched off handles what the router
    would have sent there as an ordinary personal message instead."""
    return "personal" if route == "trade" and not trade_enabled else route
```

`main.py`:
- `from ..config import ALLOWED_USER_IDS, TELEGRAM_BOT_TOKEN, TRADE_FLOW_ENABLED`
- `from .routing import decide_route, effective_route`
- `route = effective_route(decide_route(text_raw, analyze_trade_message(text_raw), ctx, known_codes), TRADE_FLOW_ENABLED)`
- after `BOT_COMMANDS = [...]`:

```python
TRADE_COMMAND_NAMES = {"portfoy", "kz", "islemler", "ozet", "fark"}


def bot_commands(trade_enabled: bool) -> list[BotCommand]:
    if trade_enabled:
        return list(BOT_COMMANDS)
    return [c for c in BOT_COMMANDS if c.command not in TRADE_COMMAND_NAMES]
```
- `_post_init`: `await app.bot.set_my_commands(bot_commands(TRADE_FLOW_ENABLED))`
- In `create_bot_app`, wrap the four trade `add_handler` lines (`portfoy/pozisyonlar`, `kz`, `ozet/hesaplar`, `islemler/son`), the `fark/diff` line and the `filters.Document.ALL` line in `if TRADE_FLOW_ENABLED:`.

- [ ] **Step 4: Run** new tests + full suite → green (default flag `True` ⇒ Enis unchanged).
- [ ] **Step 5: Commit** — `feat(bot): TRADE_FLOW_ENABLED switches the trade flow off per instance`

---

### Task 5: `owners.py` (parity with the web implementation)

**Files:**
- Create: `src/data/owners.py`, `tests/fixtures/owner_ledger_cases.json` (from the shared fixture above), `tests/test_owners.py`

**Produces:** `owners.SAHIPSIZ = "__sahipsiz__"`, `owners.owner_ledger(rows, accounts, people, today) -> dict` with keys `owners`, `ownerTotal`, `accountTotal`, `gap` (money maps are `{currency: float}`), and `owners.owner_deltas(row, personal_codes) -> list[tuple[str, float]]`.

- [ ] **Step 1: Write the failing test** — `tests/test_owners.py`

```python
import json
from pathlib import Path

import pytest

from src.data.owners import SAHIPSIZ, owner_deltas, owner_ledger

FIXTURE = Path(__file__).parent / "fixtures" / "owner_ledger_cases.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_owner_ledger_matches_fixture(case):
    assert owner_ledger(case["rows"], case["accounts"], case["people"], case["today"]) == case["expected"]


def test_unknown_tur_is_inert():
    assert owner_deltas({"tur": "BILINMEYEN", "tutar": 5, "sahip": "A"}, set()) == []


def test_empty_owner_goes_to_the_sahipsiz_bucket():
    assert owner_deltas({"tur": "GIDER", "tutar": 10, "sahip": ""}, set()) == [(SAHIPSIZ, -10)]


def test_fixture_is_identical_to_the_web_copy():
    web = Path(__file__).resolve().parents[2] / "app" / "src" / "fixtures" / "owner_ledger_cases.json"
    if not web.exists():
        pytest.skip("web repo not checked out beside the bot")
    assert web.read_bytes() == FIXTURE.read_bytes()
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** — `src/data/owners.py`

```python
"""Per-owner balances over a mixed pool of accounts (spec §3.2).

Pure and side-effect free. The web app has the identical function
(`app/src/lib/data/owners.ts`); both are held to `owner_ledger_cases.json`.
"""
from __future__ import annotations

import math

SAHIPSIZ = "__sahipsiz__"


def _round2(n: float) -> float:
    """JS `Math.round(n*100)/100` — half rounds toward +inf — and never -0."""
    r = math.floor(n * 100 + 0.5) / 100
    return 0.0 if r == 0 else r


def _tx_delta(row: dict, kod: str, para: str) -> float:
    """Port of accounts.ts `txDelta`: what one row does to one account."""
    if row.get("paraBirimi") != para:
        return 0.0
    tur, tutar, d = row.get("tur"), float(row.get("tutar") or 0), 0.0
    if row.get("hesap") == kod:
        if tur in ("GELIR", "DUZELTME"):
            d += tutar
        elif tur in ("GIDER", "TRANSFER"):
            d -= tutar
    if tur == "TRANSFER" and row.get("karsiHesap") == kod:
        d += tutar
    return d


def owner_deltas(row: dict, personal: set[str]) -> list[tuple[str, float]]:
    tur, tutar = row.get("tur"), float(row.get("tutar") or 0)
    owner = row.get("sahip") or SAHIPSIZ
    if tur in ("GELIR", "DUZELTME"):
        return [(owner, tutar)]
    if tur == "GIDER":
        return [(owner, -tutar)]
    if tur == "SAHIP_AKTARIM":
        return [(owner, -tutar), (row.get("karsiSahip") or SAHIPSIZ, tutar)]
    if tur == "TRANSFER":
        src = row.get("hesap") in personal
        dst = bool(row.get("karsiHesap")) and row.get("karsiHesap") in personal
        if src and not dst:
            return [(owner, -tutar)]
        if dst and not src:
            return [(owner, tutar)]
    return []


def _add(money: dict, cur: str, n: float) -> None:
    money[cur] = money.get(cur, 0.0) + n


def _rounded(money: dict) -> dict:
    return {c: _round2(v) for c, v in money.items()}


def owner_ledger(rows: list[dict], accounts: list[dict], people: list[dict], today: str) -> dict:
    personal = {a["kod"] for a in accounts}
    owners: dict[str, dict] = {p["kod"]: {} for p in people if p.get("aktif", True)}
    live = [r for r in rows if r.get("tarih", "") <= today and r.get("durum") != "planlandi"]
    for r in live:
        for who, d in owner_deltas(r, personal):
            _add(owners.setdefault(who, {}), r.get("paraBirimi", "TRY"), d)

    owner_total: dict = {}
    for money in owners.values():
        for cur, v in money.items():
            _add(owner_total, cur, v)

    account_total: dict = {}
    for a in accounts:
        bal = sum(_tx_delta(r, a["kod"], a["paraBirimi"]) for r in live)
        _add(account_total, a["paraBirimi"], _round2(bal))

    gap = {c: _round2(owner_total.get(c, 0.0) - account_total.get(c, 0.0))
           for c in set(owner_total) | set(account_total)}
    return {
        "owners": {k: _rounded(m) for k, m in owners.items()},
        "ownerTotal": _rounded(owner_total),
        "accountTotal": _rounded(account_total),
        "gap": gap,
    }
```

- [ ] **Step 4: Run** `tests/test_owners.py` → PASS; full suite green.
- [ ] **Step 5: Commit** — `feat(owners): per-owner balance + invariant, shared fixture`

---

### Task 6: `/bakiye`, `/aktar`, and the owner-to-owner phrase

**Files:**
- Modify: `src/data/personal_repository.py` (new `add_owner_transfer` after `add_transfer`), `src/bot/main.py` (wiring, `BOT_COMMANDS`)
- Create: `src/bot/handlers/owner_flow.py`
- Test: `tests/test_owner_flow.py` (create)

**Consumes:** `owners.owner_ledger`, `PersonalRepository.list_people/list_accounts/list_entries`, `normalize_turkish_str`, `debt_flow._fmt_amount`, `config.DEFAULT_OWNER`.
**Produces:** `PersonalRepository.add_owner_transfer(gonderen, alan, tutar, para_birimi="TRY", tarih=None, aciklama="") -> dict`; in `owner_flow`: `resolve_owner(token, people, self_kod) -> str | None`, `parse_owner_transfer(text, people, self_kod) -> dict | None`, `parse_aktar_args(args, people, self_kod) -> dict | str`, `format_bakiye(ledger, people) -> str`, `handle_bakiye`, `handle_aktar_command`, `handle_owner_transfer_text`, `handle_owner_callbacks`.

- [ ] **Step 1: Write the failing tests** — `tests/test_owner_flow.py`

```python
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.bot.handlers import owner_flow as of
from src.data import personal_repository as pr

PEOPLE = [
    {"kod": "BEN", "ad": "Ben", "haneUyesi": True, "aktif": True},
    {"kod": "ANNE", "ad": "Anne", "haneUyesi": False, "aktif": True},
    {"kod": "KAFE", "ad": "Kafe", "haneUyesi": False, "aktif": True},
]


def test_resolve_owner():
    assert of.resolve_owner("annemin", PEOPLE, "BEN") == "ANNE"
    assert of.resolve_owner("anne'nin", PEOPLE, "BEN") == "ANNE"
    assert of.resolve_owner("kafenin", PEOPLE, "BEN") == "KAFE"
    assert of.resolve_owner("kendime", PEOPLE, "BEN") == "BEN"
    assert of.resolve_owner("ANNE", PEOPLE, "BEN") == "ANNE"
    assert of.resolve_owner("market", PEOPLE, "BEN") is None


def test_phrase_take_from_owner():
    d = of.parse_owner_transfer("annemin parasından 5000 tl kendime aldım", PEOPLE, "BEN")
    assert d == {"gonderen": "ANNE", "alan": "BEN", "tutar": 5000.0}


def test_phrase_thousands_separator():
    d = of.parse_owner_transfer("Anne'nin parasından 5.000 aldım", PEOPLE, "BEN")
    assert d["tutar"] == 5000.0 and d["gonderen"] == "ANNE"


def test_phrase_add_to_owner():
    d = of.parse_owner_transfer("annenin parasına 3000 tl ekledim", PEOPLE, "BEN")
    assert d == {"gonderen": "BEN", "alan": "ANNE", "tutar": 3000.0}


def test_phrase_ignores_ordinary_spending():
    assert of.parse_owner_transfer("markette 340 lira", PEOPLE, "BEN") is None
    assert of.parse_owner_transfer("anne için elektrik 800", PEOPLE, "BEN") is None


def test_aktar_args():
    d = of.parse_aktar_args(["anne", "ben", "5000", "market", "parası"], PEOPLE, "BEN")
    assert d == {"gonderen": "ANNE", "alan": "BEN", "tutar": 5000.0, "aciklama": "market parası"}
    assert isinstance(of.parse_aktar_args(["anne", "ben", "x"], PEOPLE, "BEN"), str)
    assert isinstance(of.parse_aktar_args(["anne", "anne", "10"], PEOPLE, "BEN"), str)
    assert isinstance(of.parse_aktar_args(["yok", "ben", "10"], PEOPLE, "BEN"), str)


def test_add_owner_transfer_writes_a_sahip_aktarim_row(tmp_path):
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    r = pr.PersonalRepository(bbb_dir=tmp_path)
    r._save("people", PEOPLE)
    row = r.add_owner_transfer("ANNE", "BEN", 5000, aciklama="market")
    assert row["tur"] == "SAHIP_AKTARIM"
    assert (row["sahip"], row["karsiSahip"], row["hesap"]) == ("ANNE", "BEN", "")
    assert r.list_entries() == [row]
    with pytest.raises(ValueError):
        r.add_owner_transfer("ANNE", "ANNE", 10)
    with pytest.raises(ValueError):
        r.add_owner_transfer("ANNE", "YOK", 10)
    with pytest.raises(ValueError):
        r.add_owner_transfer("ANNE", "BEN", 0)


def test_format_bakiye_reports_owners_and_the_gap():
    ledger = {
        "owners": {"ANNE": {"TRY": 12200.0}, "BEN": {"TRY": 9600.0},
                   "KAFE": {}, of.SAHIPSIZ: {"TRY": -100.0}},
        "ownerTotal": {"TRY": 21700.0}, "accountTotal": {"TRY": 21700.0}, "gap": {"TRY": 0.0},
    }
    text = of.format_bakiye(ledger, PEOPLE)
    assert "Anne" in text and "12.200" in text and "9.600" in text
    assert "Sahipsiz" in text
    assert "tutuyor" in text
    ledger["gap"] = {"TRY": -50.0}
    assert "Fark" in of.format_bakiye(ledger, PEOPLE)


def test_handle_bakiye_replies(monkeypatch, tmp_path):
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    repo = pr.PersonalRepository(bbb_dir=tmp_path)
    repo._save("people", PEOPLE)
    monkeypatch.setattr(of, "PersonalRepository", lambda: repo)
    reply = AsyncMock()
    update = SimpleNamespace(message=SimpleNamespace(reply_text=reply))
    asyncio.run(of.handle_bakiye(update, SimpleNamespace(user_data={})))
    assert reply.await_count == 1
```

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: Implement**

`personal_repository.py`, right after `add_transfer`:

```python
    @_kayitli("entries", "ekle")
    def add_owner_transfer(
        self,
        gonderen: str,
        alan: str,
        tutar: float,
        para_birimi: str = "TRY",
        tarih: str | None = None,
        aciklama: str = "",
    ) -> dict:
        """Move money between two *owners* inside the pool: no account changes."""
        kodlar = {p["kod"] for p in self.list_people()}
        if gonderen not in kodlar:
            raise ValueError(f"Geçersiz kişi: '{gonderen}'")
        if alan not in kodlar:
            raise ValueError(f"Geçersiz kişi: '{alan}'")
        if gonderen == alan:
            raise ValueError("Gönderen ve alan kişi aynı olamaz.")
        if float(tutar) <= 0:
            raise ValueError("Tutar sıfırdan büyük olmalı.")

        from .personal_rules import derive_entry_id, _now_iso
        row = {
            "id": None,
            "tarih": tarih or dt.date.today().isoformat(),
            "tur": "SAHIP_AKTARIM",
            "tutar": round(float(tutar), 2),
            "paraBirimi": para_birimi,
            "kategori": "sahip-aktarim",
            "aciklama": aciklama.strip() or f"{gonderen} -> {alan}",
            "hesap": "",
            "sahip": gonderen,
            "karsiSahip": alan,
            "taksitPlaniId": None,
            "taksitNo": None,
            "taksitToplam": None,
            "not": "",
            "kaynak": "telegram",
            "olusturulma": _now_iso(),
        }
        row["id"] = derive_entry_id(row, self.existing_ids())
        before_entries = self._load("entries")
        self._undo_history.append({
            "entries": before_entries,
            "plans": self._load("plans"),
            "cashflows": self._load("cashflows"),
        })
        self._save("entries", before_entries + [row])
        return row
```

`src/bot/handlers/owner_flow.py`:

```python
"""Owner ledger on Telegram: /bakiye, /aktar and "<kişi>'nin parasından ..."."""
from __future__ import annotations

import logging
import re

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.error import BadRequest
from telegram.ext import ContextTypes

from ...config import DEFAULT_OWNER
from ...data.owners import SAHIPSIZ, owner_ledger
from ...data.personal_repository import PersonalRepository
from ...nlp.aliases import normalize_turkish_str
from .debt_flow import _fmt_amount

logger = logging.getLogger(__name__)

OWNER_DRAFT_KEY = "owner_draft"
_SELF_WORDS = {"ben", "benim", "kendim", "kendime", "bana"}
_SYMBOL = {"TRY": "₺", "USD": "$"}

_TAKE_RE = re.compile(
    r"^(?P<who>[a-z']+)\s+parasindan\s+(?P<amt>[\d.,]+)\s*(?:tl|lira)?\s*"
    r"(?:kendime|bana)?\s*(?:aldim|cektim|gecirdim)\b")
_ADD_RE = re.compile(
    r"^(?P<who>[a-z']+)\s+parasina\s+(?P<amt>[\d.,]+)\s*(?:tl|lira)?\s*"
    r"(?:ekledim|koydum|yatirdim)\b")


def _parse_amount(raw: str) -> float | None:
    s = raw.strip()
    if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", s):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        v = float(s)
    except ValueError:
        return None
    return v if v > 0 else None


def resolve_owner(token: str, people: list[dict], self_kod: str) -> str | None:
    """'annemin' / "anne'nin" / 'ANNE' / 'kendime' -> a person code, or None."""
    t = normalize_turkish_str(token).strip("'")
    if t in _SELF_WORDS:
        return self_kod
    for p in people:
        if normalize_turkish_str(p["kod"]) == t:
            return p["kod"]
    best, best_len = None, 0
    for p in people:
        ad = normalize_turkish_str(p["ad"])
        if len(ad) >= 3 and t.startswith(ad) and len(ad) > best_len:
            best, best_len = p["kod"], len(ad)
    return best


def parse_owner_transfer(text: str, people: list[dict], self_kod: str) -> dict | None:
    norm = normalize_turkish_str(text)
    for regex, taking in ((_TAKE_RE, True), (_ADD_RE, False)):
        m = regex.match(norm)
        if not m:
            continue
        who = resolve_owner(m.group("who"), people, self_kod)
        amt = _parse_amount(m.group("amt"))
        if not who or amt is None or who == self_kod:
            return None
        return ({"gonderen": who, "alan": self_kod, "tutar": amt} if taking
                else {"gonderen": self_kod, "alan": who, "tutar": amt})
    return None


def parse_aktar_args(args: list[str], people: list[dict], self_kod: str) -> dict | str:
    """`/aktar <kimden> <kime> <tutar> [açıklama...]` -> draft, or an error text."""
    if len(args) < 3:
        return "Kullanım: /aktar <kimden> <kime> <tutar> [not]\nÖrnek: /aktar anne ben 5000 market"
    gonderen = resolve_owner(args[0], people, self_kod)
    alan = resolve_owner(args[1], people, self_kod)
    tutar = _parse_amount(args[2])
    if not gonderen:
        return f"'{args[0]}' diye bir kişi bulamadım. Kişiler: /tanimlar"
    if not alan:
        return f"'{args[1]}' diye bir kişi bulamadım. Kişiler: /tanimlar"
    if tutar is None:
        return f"'{args[2]}' geçerli bir tutar değil."
    if gonderen == alan:
        return "Gönderen ve alan kişi aynı olamaz."
    return {"gonderen": gonderen, "alan": alan, "tutar": tutar,
            "aciklama": " ".join(args[3:]).strip()}


def _name(people: list[dict], kod: str) -> str:
    if kod == SAHIPSIZ:
        return "Sahipsiz"
    return next((p["ad"] for p in people if p["kod"] == kod), kod)


def _money(m: dict) -> str:
    if not m:
        return "0"
    return " · ".join(f"{_fmt_amount(v)} {_SYMBOL.get(c, c)}" for c, v in sorted(m.items()))


def format_bakiye(ledger: dict, people: list[dict]) -> str:
    order = [p["kod"] for p in people if p["kod"] in ledger["owners"]]
    order += [k for k in ledger["owners"] if k not in order]
    lines = ["👥 *Kişi bakiyeleri*", "━━━━━━━━━━━━━━━━━━"]
    for kod in order:
        m = ledger["owners"][kod]
        if kod == SAHIPSIZ and not any(m.values()):
            continue
        mark = "❓" if kod == SAHIPSIZ else "👤"
        lines.append(f"{mark} {_name(people, kod)}: {_money(m)}")
    gaps = {c: v for c, v in ledger["gap"].items() if v}
    lines.append("")
    if gaps:
        lines.append(f"⚠️ Fark: {_money(gaps)} — kişi toplamı hesaplarla tutmuyor, bir kayıt eksik olabilir.")
    else:
        lines.append("✅ Kişi toplamı hesaplarla tutuyor.")
    return "\n".join(lines)


def _self_kod(people: list[dict]) -> str:
    return next((p["kod"] for p in people if p.get("haneUyesi") and p.get("aktif", True)), DEFAULT_OWNER)


async def handle_bakiye(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    repo = PersonalRepository()
    people = repo.list_people()
    import datetime as dt
    ledger = owner_ledger(repo.list_entries(), repo.list_accounts(), people,
                          dt.date.today().isoformat())
    await update.message.reply_text(format_bakiye(ledger, people), parse_mode="Markdown")
    return True


def _confirm_text(draft: dict, people: list[dict]) -> str:
    return (f"🔁 *{_name(people, draft['gonderen'])}* → *{_name(people, draft['alan'])}*\n"
            f"{_fmt_amount(draft['tutar'])} ₺ kişiler arası aktarım\n"
            "_Hesaplardaki para değişmez, sadece kimin olduğu değişir._\nKaydedeyim mi?")


async def _ask(update: Update, context: ContextTypes.DEFAULT_TYPE, draft: dict, people: list[dict]) -> None:
    context.user_data[OWNER_DRAFT_KEY] = draft
    kb = InlineKeyboardMarkup([[InlineKeyboardButton("✅ Kaydet", callback_data="own:ok"),
                                InlineKeyboardButton("✖️ İptal", callback_data="own:no")]])
    await update.message.reply_text(_confirm_text(draft, people), parse_mode="Markdown", reply_markup=kb)


async def handle_aktar_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    people = PersonalRepository().list_people()
    parsed = parse_aktar_args(list(context.args or []), people, _self_kod(people))
    if isinstance(parsed, str):
        await update.message.reply_text(parsed)
        return True
    await _ask(update, context, parsed, people)
    return True


async def handle_owner_transfer_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    text = update.message.text if update.message and update.message.text else ""
    people = PersonalRepository().list_people()
    draft = parse_owner_transfer(text, people, _self_kod(people))
    if not draft:
        return False
    await _ask(update, context, draft, people)
    return True


async def handle_owner_callbacks(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    query = update.callback_query
    if not query or query.data not in ("own:ok", "own:no"):
        return False
    try:
        await query.answer()
    except BadRequest:
        pass
    draft = context.user_data.pop(OWNER_DRAFT_KEY, None)
    if query.data == "own:no" or not draft:
        msg = "İptal edildi." if query.data == "own:no" else "Bu onay süresi dolmuş, tekrar yaz."
        await query.edit_message_text(msg)
        return True
    repo = PersonalRepository()
    try:
        row = repo.add_owner_transfer(draft["gonderen"], draft["alan"], draft["tutar"],
                                      aciklama=draft.get("aciklama", ""))
    except ValueError as e:
        await query.edit_message_text(f"⚠️ Kaydedilemedi: {e}")
        return True
    people = repo.list_people()
    await query.edit_message_text(
        f"✅ Kaydedildi: {_name(people, row['sahip'])} → {_name(people, row['karsiSahip'])}, "
        f"{_fmt_amount(row['tutar'])} ₺\nBakiyeler: /bakiye")
    return True
```

`src/bot/main.py`:
- import: `from .handlers.owner_flow import handle_aktar_command, handle_bakiye, handle_owner_callbacks, handle_owner_transfer_text`
- in `on_text_message`, immediately **before** the `# Decide explicitly which flow owns it` comment: `if await handle_owner_transfer_text(update, context): return`
- in `on_callback_query`, right after the `security_guard` check: `if await handle_owner_callbacks(update, context): return`
- register: `app.add_handler(CommandHandler(["bakiye"], handle_bakiye))` and `app.add_handler(CommandHandler(["aktar"], handle_aktar_command))` (next to `borclar`, **not** inside the trade `if`)
- `BOT_COMMANDS`: add `BotCommand("bakiye", "Kişi bakiyeleri ve hesaplarla tutarlılık")` and `BotCommand("aktar", "Kişiler arası aktarım: /aktar anne ben 5000")`.

- [ ] **Step 4: Run** `tests/test_owner_flow.py` → PASS; full suite green.
- [ ] **Step 5: Commit** — `feat(owners): /bakiye, /aktar and the owner-transfer phrase`

Also re-run `tests/test_trade_flow_flag.py` (menu/handler sets changed).

---

# PART B — BBB repo (web app)

### Task 7: Types + `owners.ts`

**Files:**
- Modify: `app/src/lib/data/types.ts` (`PersonalTx`, ~L127-146)
- Create: `app/src/lib/data/owners.ts`, `app/src/lib/data/owners.test.ts`, `app/src/fixtures/owner_ledger_cases.json` (identical to the bot's copy)

**Produces:** `SAHIPSIZ`, `type Money = Record<string, number>`, `interface OwnerLedger { owners: Record<string, Money>; ownerTotal: Money; accountTotal: Money; gap: Money }`, `ownerDeltas(row, personal: Set<string>): [string, number][]`, `ownerLedger(rows: PersonalTx[], accounts: PersonalAccount[], people: Person[], today: string): OwnerLedger`.

- [ ] **Step 1: Write the failing test** — `owners.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { SAHIPSIZ, ownerDeltas, ownerLedger } from './owners'

const cases = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixtures/owner_ledger_cases.json', import.meta.url)), 'utf-8'),
).cases

describe('ownerLedger', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(ownerLedger(c.rows, c.accounts, c.people, c.today)).toEqual(c.expected)
    })
  }

  it('unknown tur is inert', () => {
    expect(ownerDeltas({ tur: 'BILINMEYEN', tutar: 5, sahip: 'A' } as any, new Set())).toEqual([])
  })

  it('empty owner falls into the sahipsiz bucket', () => {
    expect(ownerDeltas({ tur: 'GIDER', tutar: 10, sahip: '' } as any, new Set())).toEqual([[SAHIPSIZ, -10]])
  })
})
```

- [ ] **Step 2: Run** — `cd app && npx vitest run src/lib/data/owners.test.ts` → FAIL.
- [ ] **Step 3: Implement**

`types.ts`: `tur: 'GIDER' | 'GELIR' | 'TRANSFER' | 'DUZELTME' | 'SAHIP_AKTARIM'` and, after `karsiHesap?`, add `/** Receiver on a SAHIP_AKTARIM (`sahip` is the giver). */ karsiSahip?: string`.

`owners.ts`:

```ts
import type { Person, PersonalAccount, PersonalTx } from './types'
import { accountBalances, round2 } from './accounts'

/** Bucket for rows whose `sahip` is empty, so the invariant still holds and the gap stays attributable. */
export const SAHIPSIZ = '__sahipsiz__'

export type Money = Record<string, number>

export interface OwnerLedger {
  owners: Record<string, Money>
  ownerTotal: Money
  accountTotal: Money
  /** ownerTotal − accountTotal per currency; anything but 0 means a record is missing or orphaned. */
  gap: Money
}

const add = (m: Money, cur: string, n: number) => {
  m[cur] = (m[cur] ?? 0) + n
}

const roundMoney = (m: Money): Money =>
  Object.fromEntries(Object.entries(m).map(([c, v]) => [c, round2(v)]))

/** What one row does to owner balances (spec §3.2). */
export function ownerDeltas(row: PersonalTx, personal: Set<string>): [string, number][] {
  const owner = row.sahip || SAHIPSIZ
  switch (row.tur) {
    case 'GELIR':
    case 'DUZELTME':
      return [[owner, row.tutar]]
    case 'GIDER':
      return [[owner, -row.tutar]]
    case 'SAHIP_AKTARIM':
      return [[owner, -row.tutar], [row.karsiSahip || SAHIPSIZ, row.tutar]]
    case 'TRANSFER': {
      const src = personal.has(row.hesap)
      const dst = !!row.karsiHesap && personal.has(row.karsiHesap)
      if (src && !dst) return [[owner, -row.tutar]]
      if (dst && !src) return [[owner, row.tutar]]
      return []
    }
    default:
      return []
  }
}

export function ownerLedger(
  rows: PersonalTx[],
  accounts: PersonalAccount[],
  people: Person[],
  today: string,
): OwnerLedger {
  const personal = new Set(accounts.map((a) => a.kod))
  const owners: Record<string, Money> = {}
  for (const p of people) if (p.aktif !== false) owners[p.kod] = {}

  for (const r of rows) {
    if (r.tarih > today || r.durum === 'planlandi') continue
    for (const [who, d] of ownerDeltas(r, personal)) add((owners[who] ??= {}), r.paraBirimi, d)
  }

  const ownerTotal: Money = {}
  for (const m of Object.values(owners)) for (const [c, v] of Object.entries(m)) add(ownerTotal, c, v)

  const accountTotal: Money = {}
  const bal = accountBalances(rows, accounts, today)
  for (const a of accounts) add(accountTotal, a.paraBirimi, bal.get(a.kod) ?? 0)

  const gap: Money = {}
  for (const c of new Set([...Object.keys(ownerTotal), ...Object.keys(accountTotal)])) {
    gap[c] = round2((ownerTotal[c] ?? 0) - (accountTotal[c] ?? 0))
  }

  return {
    owners: Object.fromEntries(Object.entries(owners).map(([k, m]) => [k, roundMoney(m)])),
    ownerTotal: roundMoney(ownerTotal),
    accountTotal: roundMoney(accountTotal),
    gap,
  }
}
```

- [ ] **Step 4: Run** the new test, then `npm test` and `npm run check` → all green, 0 svelte-check errors (fix any exhaustiveness error the widened `tur` union causes; `SAHIP_AKTARIM` rows must be inert on Harcamalar/HesapDetay — add a test in `Harcamalar.test.ts` that a `SAHIP_AKTARIM` row is not listed if it is not already covered).
- [ ] **Step 5: Verify parity** — `diff app/src/fixtures/owner_ledger_cases.json bbb-telegram-bot/tests/fixtures/owner_ledger_cases.json` prints nothing.
- [ ] **Step 6: Commit** — `feat(owners): ownerLedger + SAHIP_AKTARIM type, shared fixture`

---

### Task 8: **Kişiler** tab (page, transfer form, add person)

**Files:**
- Modify: `app/src/router.ts` (`HesapRoute`, `HESAP_ROUTES`, `hesapMap` in `currentRoute`, new `visibleRoutes`), `app/src/App.svelte` (import page, `pages` map, nav loop L237)
- Create: `app/src/routes/hesaplar/Kisiler.svelte`, `app/src/routes/hesaplar/SahipAktarimFormu.svelte`, `app/src/routes/hesaplar/Kisiler.test.ts`, `app/src/router.kisiler.test.ts`

**Consumes:** `ownerLedger`, `SAHIPSIZ` (Task 7); `appendRecord`, `load` from `lib/data/store`; `ConflictError`; `newPersonalId`; `tryFmt`, `usd`; `EmptyState`.
**Produces:** route `#/h/kisiler` (`'h-kisiler'`), `visibleRoutes(volume, people)`.

- [ ] **Step 1: Failing router test** — `router.kisiler.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { visibleRoutes, HESAP_ROUTES } from './router'

describe('Kişiler tab', () => {
  it('is a hesaplar route', () => {
    expect(HESAP_ROUTES.some((r) => r.id === 'h-kisiler' && r.path === '#/h/kisiler')).toBe(true)
  })
  it('is hidden with fewer than two active people', () => {
    expect(visibleRoutes('hesaplar', [{ aktif: true }]).some((r) => r.id === 'h-kisiler')).toBe(false)
    expect(visibleRoutes('hesaplar', []).some((r) => r.id === 'h-kisiler')).toBe(false)
  })
  it('is shown with two or more active people', () => {
    const two = [{ aktif: true }, { aktif: true }]
    expect(visibleRoutes('hesaplar', two).some((r) => r.id === 'h-kisiler')).toBe(true)
  })
  it('never appears in the yatirim volume', () => {
    expect(visibleRoutes('yatirim', [{}, {}]).some((r) => r.id === 'h-kisiler')).toBe(false)
  })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** in `router.ts`: add `'h-kisiler'` to `HesapRoute`; add `{ id: 'h-kisiler', path: '#/h/kisiler', label: 'Kişiler' }` to `HESAP_ROUTES` (after Borçlar); add `kisiler: 'h-kisiler'` to `hesapMap`; append:

```ts
export function visibleRoutes(
  volume: Volume,
  people: { aktif?: boolean }[] = [],
): RouteEntry<Route | HesapRoute>[] {
  const all = routesFor(volume)
  const owners = people.filter((p) => p.aktif !== false).length
  return owners >= 2 ? all : all.filter((r) => r.id !== 'h-kisiler')
}
```

`App.svelte`: `import Kisiler from './routes/hesaplar/Kisiler.svelte'`; add `'h-kisiler': Kisiler,` to `pages`; import `visibleRoutes` from `./router` and change L237 to `{#each visibleRoutes(volume, $store.dataset?.people ?? []) as r}`.

- [ ] **Step 4: Failing page test** — `Kisiler.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Kisiler from './Kisiler.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset, PersonalTx } from '../../lib/data/types'

const row = (o: Partial<PersonalTx>): PersonalTx => ({
  id: 'x', tarih: '2026-09-01', tur: 'DUZELTME', tutar: 0, paraBirimi: 'TRY', kategori: 'duzeltme',
  aciklama: '', hesap: 'NAKIT', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null,
  not: '', kaynak: 'manual', olusturulma: '2026-09-01T00:00:00Z', ...o,
})

const ds: Dataset = {
  ...fixture,
  people: [
    { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
    { kod: 'ANNE', ad: 'Anne', haneUyesi: false, aktif: true },
  ],
  personalAccounts: [
    { kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true },
  ],
  personalTx: [
    row({ id: 'a', tutar: 1000, sahip: 'ANNE' }),
    row({ id: 'b', tur: 'SAHIP_AKTARIM', tutar: 400, sahip: 'ANNE', karsiSahip: 'ENIS', hesap: '' }),
  ],
}

describe('Kişiler sayfası', () => {
  it('kişi başına bakiye gösterir', () => {
    const { container } = render(Kisiler, { dataset: ds })
    expect(container.textContent).toContain('Anne')
    expect(container.textContent).toMatch(/600/)
    expect(container.textContent).toMatch(/400/)
  })

  it('hesaplarla tutuyorsa onay gösterir', () => {
    const { container } = render(Kisiler, { dataset: ds })
    expect(container.textContent).toMatch(/tutuyor/i)
  })

  it('tutmuyorsa farkı uyarı olarak gösterir', () => {
    const bad = { ...ds, personalTx: [...ds.personalTx!, row({ id: 'c', tur: 'GIDER', tutar: 50, hesap: 'YOK', sahip: 'ENIS' })] }
    const { container } = render(Kisiler, { dataset: bad })
    expect(container.textContent).toMatch(/fark/i)
  })

  it('Drive yokken düzenleme kapalı, not gösterir', () => {
    const { container } = render(Kisiler, { dataset: ds })
    expect(container.textContent).toMatch(/Drive bağlantısı/i)
  })
})
```

- [ ] **Step 5: Implement** `Kisiler.svelte` following `Borclar.svelte` conventions (props `dataset`, `source`, `store`; `isDrive = Boolean(source?.save)`; the offline note text "Düzenleme için Drive bağlantısı gerekiyor"; classes `page-container`, `section-card`, `section-title`, `balance-card`, `offline-note`, `error-banner`):

```svelte
<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Person } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { ownerLedger, SAHIPSIZ } from '../../lib/data/owners'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import SahipAktarimFormu from './SahipAktarimFormu.svelte'

  let { dataset, source, store }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
  } = $props()

  const isDrive = $derived(Boolean(source?.save))
  const today = new Date().toISOString().slice(0, 10)
  const people = $derived(dataset?.people ?? [])
  const ledger = $derived(
    ownerLedger(dataset?.personalTx ?? [], dataset?.personalAccounts ?? [], people, today),
  )
  const fmt = (n: number, cur: string) => (cur === 'USD' ? usd(n) : tryFmt(n))
  const nameOf = (kod: string) =>
    kod === SAHIPSIZ ? 'Sahipsiz' : (people.find((p) => p.kod === kod)?.ad ?? kod)
  const ownerKods = $derived(
    Object.keys(ledger.owners).filter(
      (k) => k !== SAHIPSIZ || Object.values(ledger.owners[k]).some((v) => v !== 0),
    ),
  )
  const gaps = $derived(Object.entries(ledger.gap).filter(([, v]) => v !== 0))

  let aktarimAcik = $state(false)
  let yeniAd = $state('')
  let kisiHata = $state<string | null>(null)
  let kisiKaydediyor = $state(false)

  function slug(ad: string): string {
    return ad
      .trim()
      .toLocaleUpperCase('tr')
      .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  async function kisiEkle() {
    kisiHata = null
    const ad = yeniAd.trim()
    const kod = slug(ad)
    if (!ad || !kod) { kisiHata = 'Bir isim yaz.'; return }
    if (people.some((p) => p.kod === kod)) { kisiHata = 'Bu kişi zaten var.'; return }
    if (!source || !store) return
    kisiKaydediyor = true
    try {
      const p: Person = { kod, ad, haneUyesi: false, aktif: true }
      await appendRecord<Person>(store, source, 'people', p)
      yeniAd = ''
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        try { await load(store, source) } catch {}
        kisiHata = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — tekrar dener misin?'
      } else {
        kisiHata = e instanceof Error ? e.message : String(e)
      }
    } finally {
      kisiKaydediyor = false
    }
  }
</script>

{#if people.length === 0}
  <EmptyState message="Henüz kişi tanımlı değil." />
{:else}
  <div class="page-container">
    {#if !isDrive}
      <div class="offline-note">Düzenleme için Drive bağlantısı gerekiyor.</div>
    {/if}

    <section class="section-card">
      <h3 class="section-title">Kişi Bakiyeleri</h3>
      <div class="balances-grid">
        {#each ownerKods as kod}
          <div class="balance-card" data-testid="owner-card">
            <span class="person-name">{nameOf(kod)}</span>
            {#each Object.entries(ledger.owners[kod]) as [cur, v]}
              <span class="fig-val num {v < 0 ? 'loss' : 'gain'}">{fmt(v, cur)}</span>
            {:else}
              <span class="fig-val num muted">0</span>
            {/each}
          </div>
        {/each}
      </div>

      {#if gaps.length}
        <div class="error-banner" role="alert">
          Fark: {gaps.map(([c, v]) => fmt(v, c)).join(' · ')} — kişi toplamı hesaplarla tutmuyor,
          bir kayıt eksik ya da hesabı silinmiş olabilir.
        </div>
      {:else}
        <p class="empty-hint">Kişi toplamı hesaplarla tutuyor.</p>
      {/if}
    </section>

    <section class="section-card">
      <h3 class="section-title">Kişiler arası aktarım</h3>
      {#if aktarimAcik && isDrive}
        <SahipAktarimFormu {dataset} {source} {store}
          onSaved={() => (aktarimAcik = false)} onCancel={() => (aktarimAcik = false)} />
      {:else}
        <button type="button" class="btn-primary" disabled={!isDrive}
          onclick={() => (aktarimAcik = true)}>+ Aktarım ekle</button>
      {/if}
    </section>

    <section class="section-card">
      <h3 class="section-title">Kişi ekle</h3>
      {#if kisiHata}<div class="error-banner">{kisiHata}</div>{/if}
      <form onsubmit={(e) => { e.preventDefault(); kisiEkle() }}>
        <label for="yeni-kisi">İsim</label>
        <input id="yeni-kisi" aria-label="Yeni kişi" bind:value={yeniAd} disabled={!isDrive || kisiKaydediyor} />
        <button type="submit" class="btn-primary" disabled={!isDrive || kisiKaydediyor}>Ekle</button>
      </form>
    </section>
  </div>
{/if}
```

Match `EmptyState`'s real props exactly as `Borclar.svelte` uses them (the snippet's `message=` is a stand-in), and reuse the class names and markup that `Borclar.svelte` / `TransferFormu.svelte` already style.

`SahipAktarimFormu.svelte` mirrors `TransferFormu.svelte`'s structure (same props `dataset`, `source`, `store`, `onSaved`, `onCancel`, same `ConflictError` handling). State: `gonderen`, `alan` (selects over active `people`), `tutarText`, `tarihText` (today), `aciklama`, `paraBirimi` (`'TRY' | 'USD'`, default `'TRY'`). Validation: both chosen, different, amount > 0. On submit `appendRecord<PersonalTx>(store, source, 'personal_tx', row)` with:

```ts
const row: PersonalTx = {
  id: newPersonalId(),
  tarih: tarihText,
  tur: 'SAHIP_AKTARIM',
  tutar: Number(tutarText),
  paraBirimi,
  kategori: 'sahip-aktarim',
  aciklama: aciklama.trim() || `${nameOf(gonderen)} → ${nameOf(alan)}`,
  hesap: '',
  sahip: gonderen,
  karsiSahip: alan,
  taksitPlaniId: null,
  taksitNo: null,
  taksitToplam: null,
  not: '',
  kaynak: 'manual',
  olusturulma: new Date().toISOString(),
}
```

- [ ] **Step 6: Run** — `npx vitest run src/routes/hesaplar/Kisiler.test.ts src/router.kisiler.test.ts`, then `npm test` and `npm run check` → all green, 0 errors / 0 warnings.
- [ ] **Step 7: Commit** — `feat(hesaplar): Kişiler sekmesi — kişi bakiyeleri, aktarım, kişi ekle`

---

# PART C — Deployment

### Task 9: Friend-instance deploy artifacts (bot repo)

**Files (create):**
- `deploy/instances/friend/env.example`
- `deploy/instances/friend/bbb-friend-bot.service`
- `deploy/instances/friend/bbb-friend-sync.service`, `.timer`, `.path`
- `deploy/instances/friend/KULLANIM.md`
- `deploy/deploy.sh`

- [ ] **Step 1: Read the real Enis units on the VM (read-only)** to copy their exact shape:
  `ssh -i <SSH_KEY> ubuntu@<VM_HOST> 'systemctl cat bbb-bot.service bbb-sync.path bbb-sync.timer'`
  Base every friend unit on these, changing **only** `WorkingDirectory`, `EnvironmentFile`, `ExecStart` paths and `Description`. Do not edit or restart any existing unit.

- [ ] **Step 2: `env.example`** (no secrets):

```
INSTANCE_NAME=friend
DEFAULT_OWNER=BEN            # set to the friend's own code (uppercase, ASCII)
DEFAULT_OWNER_NAME=Ben       # the friend's display name
TRADE_FLOW_ENABLED=false
RCLONE_REMOTE=gdrive-friend
TELEGRAM_BOT_TOKEN=          # filled on the VM only — never commit
ALLOWED_USER_IDS=            # filled on the VM only
BBB_DIR=/home/ubuntu/BBB-friend
DATA_DIR=/home/ubuntu/bbb-friend/data
GEMINI_ENABLED=false
QWEN_URL=http://127.0.0.1:11434
QWEN_MODEL=qwen2.5:7b-instruct
QWEN_ENABLED=true
```

- [ ] **Step 3: Units** — `bbb-friend-bot.service`: `WorkingDirectory=/home/ubuntu/bbb-friend`, `EnvironmentFile=/home/ubuntu/bbb-friend/.env`, `ExecStart=/home/ubuntu/bbb-friend/.venv/bin/python -m src.bot.main` (confirm the module path against Step 1's Enis unit). `bbb-friend-sync.service` is `deploy/bbb-sync.service` with `WorkingDirectory`/`EnvironmentFile`/`ExecStart` pointed at `/home/ubuntu/bbb-friend`. `.timer` and `.path` copy the Enis ones with `Unit=bbb-friend-sync.service` and `PathChanged` pointing at `/home/ubuntu/BBB-friend/data/personal_tx.json` (the friend's instance writes no trades, so watching the personal ledger is what makes a Telegram entry push quickly).

- [ ] **Step 4: `deploy.sh`** — one command, tests gate the deploy, excludes are anchored:

```bash
#!/usr/bin/env bash
# Usage: deploy/deploy.sh <instance>   (instance: enis | friend)
set -euo pipefail
INSTANCE="${1:?usage: deploy.sh <enis|friend>}"
HOST="ubuntu@<VM_HOST>"
KEY="<SSH_KEY>"
cd "$(dirname "$0")/.."

case "$INSTANCE" in
  enis)   REMOTE_DIR="/home/ubuntu/bbb-telegram-bot"; UNITS="bbb-bot.service" ;;
  friend) REMOTE_DIR="/home/ubuntu/bbb-friend";       UNITS="bbb-friend-bot.service" ;;
  *) echo "unknown instance: $INSTANCE" >&2; exit 2 ;;
esac

echo "→ tests"
.venv/bin/python -m pytest -q

echo "→ rsync to $INSTANCE"
rsync -az --delete \
  -e "ssh -i $KEY" \
  --exclude '/.env' --exclude '/data/' --exclude '/.venv/' --exclude '/.git/' \
  --exclude '/pdf_uploads/' --exclude '/logs/' --exclude '__pycache__/' \
  --exclude '/.pytest_cache/' --exclude '/.worktrees/' --exclude '/.superpowers/' \
  --exclude '/bot.log' --exclude '/.claude/' \
  ./ "$HOST:$REMOTE_DIR/"

echo "→ restart"
ssh -i "$KEY" "$HOST" "sudo systemctl restart $UNITS && sleep 2 && systemctl is-active $UNITS"
```

  Note: every exclude is **anchored** (`/data/`, not `data/`) — the unanchored form once silently dropped `src/data/`.

- [ ] **Step 5: `KULLANIM.md`** — one page, Turkish, for the friend: how to open the bot, the four things he types (`markette 340 lira`, `anne için elektrik 800`, `annemin parasından 5000 kendime aldım`, `/bakiye`), what `/bakiye` "Fark" means, how to open the web page and sign in, and the plain warning that the person running the server (Enis) can technically see his data.

- [ ] **Step 6: Verify** — `bash -n deploy/deploy.sh`; `chmod +x deploy/deploy.sh`; `grep -rniE 'token|[0-9]{8,}:[A-Za-z0-9_-]{30,}' deploy/` returns nothing.
- [ ] **Step 7: Commit** — `feat(deploy): friend instance units, env example, deploy script`

---

### Task 10: Provision, verify, hand over

This task **acts outside the repos** (the VM, Google, Telegram). Do the parts marked *Claude*; stop and ask at each *Enis* item. Never modify Enis's existing units, directories or the `gdrive` rclone remote.

**Enis does (Claude waits):**
1. **Google Cloud → OAuth consent screen → Test users:** add the friend's new Google account.
2. **In that Google account:** create a Drive folder `BBB`, and share it as **Editor** with the sync service account (Claude reads its address from the VM's rclone config and gives it to Enis).
3. **Upload the seed files** into that `BBB` folder through the Drive web UI, logged in as the new account (files must be *owned by the account*, not by the service account). Claude prepares them in Step A below.
4. **Put the secrets on the VM himself** with `!` in this session (Claude never writes the token to a file in git or memory):
   `! ssh -i <SSH_KEY> ubuntu@<VM_HOST> 'read -rs -p "token: " T && sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$T|" ~/bbb-friend/.env'`
   and set `ALLOWED_USER_IDS` the same way with the friend's Telegram user ID.
5. **Rotate the bot token** in BotFather (`/revoke`) if the pasted one should be treated as exposed, and use the new one in item 4.

**Claude does:**
- [ ] **A. Seed files** — write `people.json` (the friend's owner only), `personal_accounts.json` (one `NAKIT` account owned by him), `categories.json` (copy of `SEED_CATEGORIES`) and empty `[]` for `personal_tx`, `payment_plans`, `debts`, `recurring_rules`, into a local scratch folder; hand the folder path to Enis for item 3. Ask Enis for the friend's display name and owner code first (default `DEFAULT_OWNER`/`DEFAULT_OWNER_NAME`).
- [ ] **B. VM layout** (`ssh`): `mkdir -p ~/bbb-friend ~/BBB-friend/data`; create `~/bbb-friend/.venv` and install `requirements.txt`; copy `env.example` → `~/bbb-friend/.env` (secrets left blank for Enis); configure a **new** rclone remote `gdrive-friend` against the service account, pointed at the new folder (mirror how `gdrive` is configured; do not edit `gdrive`).
- [ ] **C. Deploy** — `deploy/deploy.sh enis` first and confirm Enis's bot is `active` and unchanged (send him `/bakiye`-free smoke: `/defter` still answers), then `deploy/deploy.sh friend`.
- [ ] **D. Install units** — copy the four `bbb-friend-*` files to `/etc/systemd/system/`, `daemon-reload`, `enable --now bbb-friend-bot.service bbb-friend-sync.timer bbb-friend-sync.path`.
- [ ] **E. Verify** — `systemctl is-active` on the three friend units **and** on Enis's three existing units; `journalctl -u bbb-friend-sync -n 20` shows `status: ok` with failure counter 0; the friend sends `/start` then `/bakiye` and gets an answer; `market 340 lira` from the friend lands in `~/BBB-friend/data/personal_tx.json` and reaches the Drive folder within one sync cycle; the friend signs in to the web app with the new account, picks the `BBB` folder, and sees the same entry and the **Kişiler** tab once he has added a second person.
- [ ] **F. Enis-unchanged check.** Before Task 1 starts, record fingerprints: `shasum -a 256 ~/Desktop/Market/BBB/data/*.json > "$CLAUDE_JOB_DIR/tmp/data.before"` and, on the VM, `ssh -i <SSH_KEY> ubuntu@<VM_HOST> 'systemctl cat bbb-bot.service bbb-sync.service bbb-sync.timer bbb-sync.path | sha256sum; rclone listremotes'` (save the output). After Step E, run `shasum -a 256 -c "$CLAUDE_JOB_DIR/tmp/data.before"` (every file `OK`) and repeat the VM command (identical hash, `gdrive:` still listed). Any difference is a stop-and-report.
- [ ] **G. Handover** — Enis moves the account's password, 2-step verification, **recovery email and phone** to the friend; Claude re-runs Step E's sync check afterwards. Then `git push` both repos (Enis's go-ahead required) and update memory (`bbb-friend-instance`, no secrets).

---

## Self-review against the spec

| Spec item | Covered by |
|---|---|
| M1 one codebase, per-instance config | Tasks 1–4, 9 |
| M2 instance owns everything | Tasks 9, 10 (own dir/venv/.env/units/rclone remote/Drive) |
| M3 Enis's units untouched | Tasks 9 (read-only step), 10 (rule + Step F) |
| M4 owner = `people.json` entry | Tasks 6, 8 (`kişi ekle`, `resolve_owner`) |
| M5 `SAHIP_AKTARIM` | Tasks 5, 6, 7, 8 |
| M6 derived balances | Tasks 5, 7 (pure functions, no stored field) |
| M7 invariant + banner | Tasks 5, 7, 8 (`gap`), 6 (`format_bakiye`) |
| M8 trade flow off | Task 4 |
| M9 café income = `GELIR` with a café owner | Existing entry forms/bot expense flow + owner picker; covered by the `KAFE` cases in the fixture |
| M10 backward compatible | Tasks 2, 4 (defaults), 7 (inert `tur`), 10 Step F |
| M11 secrets not in git | Global Constraints, Task 9 Step 6, Task 10 items 4–5 |
| M12 handover | Task 10 Step G |
| §4.1 tab visible only with ≥ 2 owners | Task 8 (`visibleRoutes`) — note Enis's own `people.json` has two active people, so he will see the tab too (additive, per M10) |
| §5 parity + smoke | Tasks 5, 7 (shared fixture + byte-equality test), 10 Step E |

Known scope trims (spec §6 out of scope): data-driven trade flow, café Sheet import, statement-based opening balances, OAuth verification, currency conversion.
