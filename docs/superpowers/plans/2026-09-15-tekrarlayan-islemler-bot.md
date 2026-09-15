# Tekrarlayan İşlemler — Bot (bbb-telegram-bot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ~2 minutes (the existing `bbb-sync` cycle), top up each active recurring rule's 12-month occurrence window in `personal_tx.json`, detect occurrences whose date has arrived, ask Enis on Telegram with Evet/Hayır buttons, and flip the row to "gerçekleşmiş" (or delete it) based on the answer.

**Architecture:** A pure `materialize_recurring()` function (Python mirror of the app's `materialize()`, spec D3 — deliberately not shared code) expands active rules read from the new `recurring_rules.json` into `personal_tx.json` rows. A new `src/sync/recurring.py` module, invoked from `SyncRunner.run_once()` exactly like the existing `reminder.py`/`levels.py` checks, does the daily top-up + due-detection + Telegram prompt, tracking "already asked" state in a small JSON file so the 2-minute cycle doesn't re-ask. A new `CallbackQueryHandler` branch (`recurring_flow.py`, wired into the existing `on_callback_query` dispatch chain in `main.py`) handles the Evet/Hayır tap.

**Tech Stack:** Python 3, python-telegram-bot, pytest. Run tests with `BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest -q` from `bbb-telegram-bot/`.

**Spec:** `docs/superpowers/specs/2026-09-15-tekrarlayan-islemler-design.md` (in the main BBB repo — this plan implements its §4).

**Depends on:** `2026-09-15-tekrarlayan-islemler-app.md` Task 1 must have shipped first (it defines the `recurring_rules.json` shape and the `PersonalTx.tekrarKuralId`/`durum` fields this plan reads and writes — same JSON shape, mirrored here in Python dicts).

## Global Constraints

- Bot **never writes** `recurring_rules.json` — only reads it (spec D1). All writes to it happen from the app.
- Ufuk 12 ay, idempotent top-up — aynı `(kural.id, tarih)` için ikinci satır açılmaz (aynı algoritma, spec §3, Python'da ayrı yazılmış — spec D3).
- "Hayır" cevabı o ayki satırı tamamen siler; kural ve sonraki aylar etkilenmez (spec D6). Tutar sorma akışı yok.
- Her yazım `PersonalRepository`'nin var olan `_save`/`atomic_write_json`/`backup_file`/`sync_lock` altyapısından geçer — yeni bir kilit mekanizması icat edilmez.
- `recurring_rules.json`, `once.py`'deki `SEEDED_FILES` listesine eklenir (spec D8) — böylece stage+merge boru hattından geçip VM'e ulaşır.
- Türkçe kullanıcı metinleri, mevcut `reminder.py`/`personal_flow.py` üslubunda.
- `BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest -q` yeşil kalmalı (tests klasöründeki `test_bbb_folder_remains_intact` `BBB_DIR` ister).

---

### Task 1: `PersonalRepository` — `recurring_rules.json` okuma + materialize edilmiş satır ekleme

**Files:**
- Modify: `bbb-telegram-bot/src/data/personal_repository.py`
- Modify: `bbb-telegram-bot/src/sync/once.py` (`SEEDED_FILES` listesi)
- Test: `bbb-telegram-bot/tests/test_personal_repository.py` (dosyayı Read ile aç, mevcut `describe`/sınıf yapısına uy — yoksa dosya adı `test_personal_repo_recurring.py` olarak yeni oluştur)

**Interfaces:**
- Produces: `PersonalRepository.list_recurring_rules() -> list[dict]`, `PersonalRepository.add_materialized_entries(rows: list[dict]) -> None`.

- [ ] **Step 1: Failing testi yaz**

`bbb-telegram-bot/tests/test_personal_repo_recurring.py`:

```python
import json
from pathlib import Path

from src.data.personal_repository import PersonalRepository


def _repo(tmp_path: Path) -> PersonalRepository:
    (tmp_path / "data").mkdir()
    return PersonalRepository(bbb_dir=tmp_path)


def test_list_recurring_rules_empty_when_file_missing(tmp_path):
    repo = _repo(tmp_path)
    assert repo.list_recurring_rules() == []


def test_list_recurring_rules_reads_file(tmp_path):
    repo = _repo(tmp_path)
    rule = {"id": "rr_1", "aciklama": "Netflix", "aktif": True}
    (tmp_path / "data" / "recurring_rules.json").write_text(json.dumps([rule]))
    assert repo.list_recurring_rules() == [rule]


def test_add_materialized_entries_appends_without_touching_undo_history(tmp_path):
    repo = _repo(tmp_path)
    (tmp_path / "data" / "personal_tx.json").write_text("[]")
    row = {"id": "px_x", "tarih": "2026-10-05", "durum": "planlandi"}
    repo.add_materialized_entries([row])
    assert repo.list_entries() == [row]
    assert repo._undo_history == []
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_personal_repo_recurring.py -q`
Expected: FAIL — `list_recurring_rules`/`add_materialized_entries` yok.

- [ ] **Step 3: `PersonalRepository`'e ekle**

`src/data/personal_repository.py` içinde `FILES` sözlüğüne (`"cashflows": "cashflows.json",` satırının altına):

```python
        "recurring": "recurring_rules.json",
```

`list_entries` metodunun (satır ~328) hemen üstüne yeni iki metod:

```python
    def list_recurring_rules(self) -> list[dict]:
        """Bot bu dosyaya hiç yazmaz — sadece app'in yazdığı kuralları okur
        (tasarım kararı D1)."""
        return self._load("recurring")

    def add_materialized_entries(self, rows: list[dict]) -> None:
        """Tekrarlayan kuralların otomatik ürettiği önizleme satırlarını
        `entries`'e ekler. Kullanıcının kendi eklediği bir kayıt değil, bu
        yüzden `_undo_history`'ye dokunmaz — "son kaydı geri al" bir
        materialization turunu değil, Enis'in son elle girdiği kaydı geri
        almalı."""
        if not rows:
            return
        before = self._load("entries")
        self._save("entries", before + rows)
```

- [ ] **Step 4: `once.py`'nin `SEEDED_FILES` listesine ekle**

`src/sync/once.py` içinde:

```python
SEEDED_FILES = [                      # ensure_seeded may create these
    "personal_tx.json", "payment_plans.json", "personal_accounts.json",
    "categories.json", "people.json", "debts.json", "recurring_rules.json",
]
```

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_personal_repo_recurring.py -q`
Expected: PASS (3 test)

- [ ] **Step 6: Tüm paketi çalıştır**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest -q`
Expected: Temiz (mevcut testler kırılmamış).

- [ ] **Step 7: Commit**

```bash
cd bbb-telegram-bot && git add src/data/personal_repository.py src/sync/once.py tests/test_personal_repo_recurring.py
git commit -m "feat(recurring): recurring_rules.json okuma ve materialize edilmiş satır ekleme"
```

---

### Task 2: `materialize_recurring()` — saf materialization fonksiyonu (Python)

**Files:**
- Create: `bbb-telegram-bot/src/data/recurring.py`
- Test: `bbb-telegram-bot/tests/test_recurring_materialize.py`

**Interfaces:**
- Consumes: `derive_entry_id` (`src/data/personal_rules.py`), `_now_iso` (`src/data/personal_rules.py`).
- Produces: `materialize_recurring(rules: list[dict], existing: list[dict], today: date, existing_ids: set[str], horizon_months: int = 12) -> list[dict]` — sadece eklenecek yeni satırları döner; app'teki `materialize()` (TS) ile aynı tarih matematiği, ayrı yazılmış (spec D3).

- [ ] **Step 1: Failing testleri yaz**

`bbb-telegram-bot/tests/test_recurring_materialize.py`:

```python
import datetime as dt

from src.data.recurring import materialize_recurring


def _rule(**over):
    base = {
        "id": "rr_1",
        "tur": "GIDER",
        "aciklama": "Netflix",
        "kategori": "eglence",
        "hesap": "NAKIT",
        "sahip": "ENIS",
        "paraBirimi": "TRY",
        "tutar": 229.9,
        "gunOfMonth": 5,
        "baslangicTarihi": "2026-01-01",
        "bitisTarihi": None,
        "aktif": True,
    }
    base.update(over)
    return base


def test_12_aylik_ufuk_uretir():
    rows = materialize_recurring([_rule()], [], dt.date(2026, 9, 15), set())
    assert len(rows) == 12
    assert rows[0]["tarih"] == "2026-10-05"
    assert rows[0]["durum"] == "planlandi"
    assert rows[0]["tekrarKuralId"] == "rr_1"
    assert rows[-1]["tarih"] == "2027-09-05"


def test_bugunun_gunu_gecmediyse_bu_ayi_da_uretir():
    rows = materialize_recurring([_rule(gunOfMonth=20)], [], dt.date(2026, 9, 15), set())
    assert rows[0]["tarih"] == "2026-09-20"


def test_ay_sonu_kisa_aylarda_sabitlenir():
    rows = materialize_recurring(
        [_rule(gunOfMonth=31, baslangicTarihi="2027-01-01")],
        [], dt.date(2027, 1, 15), set(), horizon_months=3,
    )
    subat = next(r for r in rows if r["tarih"].startswith("2027-02"))
    assert subat["tarih"] == "2027-02-28"


def test_idempotent_var_olan_satiri_tekrar_uretmez():
    existing = [{"tekrarKuralId": "rr_1", "tarih": "2026-10-05"}]
    rows = materialize_recurring([_rule()], existing, dt.date(2026, 9, 15), set())
    assert not any(r["tarih"] == "2026-10-05" for r in rows)
    assert len(rows) == 11


def test_bitis_tarihi_sonrasini_uretmez():
    rows = materialize_recurring(
        [_rule(bitisTarihi="2026-11-10")], [], dt.date(2026, 9, 15), set(), horizon_months=12,
    )
    assert all(r["tarih"] <= "2026-11-10" for r in rows)
    assert len(rows) == 2


def test_pasif_kural_uretmez():
    assert materialize_recurring([_rule(aktif=False)], [], dt.date(2026, 9, 15), set()) == []


def test_id_uretimi_var_olan_id_kumesiyle_carpismaz():
    existing_ids = {"px_" + "0" * 12}
    rows = materialize_recurring([_rule()], [], dt.date(2026, 9, 15), existing_ids)
    assert all(r["id"] not in existing_ids for r in rows)
    assert len({r["id"] for r in rows}) == len(rows)  # hepsi biricik
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_materialize.py -q`
Expected: FAIL — `src.data.recurring` modülü yok.

- [ ] **Step 3: `src/data/recurring.py`'yi yaz**

```python
"""Pure recurring-rule → PersonalTx-row materialization (bot side).

Deliberately a separate implementation from the app's TypeScript
`materialize()` (spec D3) — the date math is ~30 lines and duplicating it
is cheaper than sharing code across two languages/repos.
"""
from __future__ import annotations

import calendar
import datetime as dt

from .personal_rules import _now_iso, derive_entry_id


def _occurrence_date(year: int, month: int, gun_of_month: int) -> str:
    gun = min(gun_of_month, calendar.monthrange(year, month)[1])
    return f"{year:04d}-{month:02d}-{gun:02d}"


def materialize_recurring(
    rules: list[dict],
    existing: list[dict],
    today: dt.date,
    existing_ids: set[str],
    horizon_months: int = 12,
) -> list[dict]:
    """Aktif kuralları önümüzdeki `horizon_months` ay için `personal_tx`
    satırlarına genişletir. Sadece EKLENECEK yeni satırları döner — `existing`
    içinde zaten (kural, tarih) eşleşmesi varsa o ay atlanır (idempotent)."""
    existing_keys = {
        (r["tekrarKuralId"], r["tarih"]) for r in existing if r.get("tekrarKuralId")
    }
    today_iso = today.isoformat()
    out: list[dict] = []
    ids_in_use = set(existing_ids)

    for rule in rules:
        if not rule.get("aktif"):
            continue

        for m in range(horizon_months):
            idx = today.year * 12 + (today.month - 1) + m
            year, month = divmod(idx, 12)
            month += 1
            tarih = _occurrence_date(year, month, rule["gunOfMonth"])

            if tarih < today_iso or tarih < rule["baslangicTarihi"]:
                continue
            bitis = rule.get("bitisTarihi")
            if bitis is not None and tarih > bitis:
                continue
            if (rule["id"], tarih) in existing_keys:
                continue

            row = {
                "id": None,
                "tarih": tarih,
                "tur": rule["tur"],
                "tutar": rule["tutar"],
                "paraBirimi": rule["paraBirimi"],
                "kategori": rule["kategori"],
                "aciklama": rule["aciklama"],
                "hesap": rule["hesap"],
                "sahip": rule["sahip"],
                "taksitPlaniId": None,
                "taksitNo": None,
                "taksitToplam": None,
                "not": "",
                "kaynak": "manual",
                "olusturulma": _now_iso(),
                "tekrarKuralId": rule["id"],
                "durum": "planlandi",
            }
            row["id"] = derive_entry_id(row, ids_in_use)
            ids_in_use.add(row["id"])
            existing_keys.add((rule["id"], tarih))
            out.append(row)

    return out
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_materialize.py -q`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
cd bbb-telegram-bot && git add src/data/recurring.py tests/test_recurring_materialize.py
git commit -m "feat(recurring): materialize_recurring() Python taraf saf fonksiyon"
```

---

### Task 3: `notify.py` — butonlu Telegram mesajı

**Files:**
- Modify: `bbb-telegram-bot/src/sync/notify.py`
- Test: `bbb-telegram-bot/tests/test_notify.py` (dosyayı Read ile aç, mevcut `send_telegram` testinin mock `http_post` desenini kopyala; yoksa yeni oluştur)

**Interfaces:**
- Produces: `send_telegram_with_buttons(text, buttons, *, token=None, user_ids=None, http_post=_default_post, timeout=10.0) -> int` — `buttons: list[list[tuple[str, str]]]` (satır listesi, her satır `(label, callback_data)` tuple'ları). Mevcut `send_telegram`'a dokunmaz (regresyon riski yok).

- [ ] **Step 1: Failing testi yaz**

```python
def test_send_telegram_with_buttons_includes_inline_keyboard():
    from src.sync.notify import send_telegram_with_buttons

    calls = []

    def fake_post(url, json, timeout):
        calls.append(json)
        class R:
            status_code = 200
        return R()

    sent = send_telegram_with_buttons(
        "Bugün Netflix ₺229,90 tahsil edildi mi?",
        [[("Evet", "recur:yes:px_1"), ("Hayır", "recur:no:px_1")]],
        token="t", user_ids=[123], http_post=fake_post,
    )
    assert sent == 1
    assert calls[0]["chat_id"] == 123
    assert calls[0]["reply_markup"]["inline_keyboard"] == [
        [{"text": "Evet", "callback_data": "recur:yes:px_1"}, {"text": "Hayır", "callback_data": "recur:no:px_1"}]
    ]
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_notify.py -q -k buttons`
Expected: FAIL — `send_telegram_with_buttons` yok.

- [ ] **Step 3: `notify.py`'ye ekle**

`src/sync/notify.py` sonuna, `send_telegram`'ın altına:

```python
def send_telegram_with_buttons(
    text: str,
    buttons: list[list[tuple[str, str]]],
    *,
    token: Optional[str] = None,
    user_ids: Optional[Iterable[int]] = None,
    http_post: Callable = _default_post,
    timeout: float = 10.0,
) -> int:
    """`send_telegram` gibi ama inline Evet/Hayır butonlu — tekrarlayan işlem
    onayı için. Ayrı bir fonksiyon (send_telegram'a dokunulmadı) çünkü o
    fire-and-forget metin mesajı zaten çok yerde kullanılıyor."""
    if token is None or user_ids is None:
        from ..config import ALLOWED_USER_IDS, TELEGRAM_BOT_TOKEN

        token = TELEGRAM_BOT_TOKEN if token is None else token
        user_ids = ALLOWED_USER_IDS if user_ids is None else user_ids

    ids = [i for i in (user_ids or [])]
    if not token or not ids:
        return 0

    url = _API.format(token=token)
    reply_markup = {
        "inline_keyboard": [
            [{"text": label, "callback_data": data} for label, data in row]
            for row in buttons
        ]
    }
    sent = 0
    for uid in ids:
        try:
            resp = http_post(url, {"chat_id": uid, "text": text, "reply_markup": reply_markup}, timeout)
            if getattr(resp, "status_code", 200) < 400:
                sent += 1
        except Exception:  # noqa: BLE001 - notification is best-effort
            pass
    return sent
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_notify.py -q`
Expected: PASS (yeni test + eski `send_telegram` testleri)

- [ ] **Step 5: Commit**

```bash
cd bbb-telegram-bot && git add src/sync/notify.py tests/test_notify.py
git commit -m "feat(recurring): send_telegram_with_buttons — inline Evet/Hayır"
```

---

### Task 4: `src/sync/recurring.py` — günlük top-up + vade taraması

**Files:**
- Create: `bbb-telegram-bot/src/sync/recurring.py`
- Modify: `bbb-telegram-bot/src/sync/once.py` (`SyncRunner.__init__`, `run_once`)
- Test: `bbb-telegram-bot/tests/test_recurring_check.py`

**Interfaces:**
- Consumes: `PersonalRepository.list_recurring_rules/list_entries/add_materialized_entries` (Task 1), `materialize_recurring` (Task 2), `send_telegram_with_buttons` (Task 3), `read_json`/`atomic_write_json` (`src/data/jsonstore.py`).
- Produces: `check_recurring(repo, *, today=None, state_file=None, notify=send_telegram_with_buttons) -> dict` — `{"status": "ok", "materialized": N, "prompted": [...]}`.

- [ ] **Step 1: Failing testleri yaz**

`bbb-telegram-bot/tests/test_recurring_check.py`:

```python
import datetime as dt
import json
from pathlib import Path

from src.data.personal_repository import PersonalRepository
from src.sync.recurring import check_recurring


def _repo(tmp_path: Path, rules=None, entries=None) -> PersonalRepository:
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "recurring_rules.json").write_text(json.dumps(rules or []))
    (tmp_path / "data" / "personal_tx.json").write_text(json.dumps(entries or []))
    for name in ("payment_plans", "personal_accounts", "categories", "people", "debts", "cashflows"):
        (tmp_path / "data" / f"{name}.json").write_text("[]")
    return PersonalRepository(bbb_dir=tmp_path)


def _rule(**over):
    base = {
        "id": "rr_1", "tur": "GIDER", "aciklama": "Netflix", "kategori": "eglence",
        "hesap": "NAKIT", "sahip": "ENIS", "paraBirimi": "TRY", "tutar": 229.9,
        "gunOfMonth": 5, "baslangicTarihi": "2026-01-01", "bitisTarihi": None, "aktif": True,
    }
    base.update(over)
    return base


def test_top_up_materializes_and_persists(tmp_path):
    repo = _repo(tmp_path, rules=[_rule()])
    res = check_recurring(repo, today=dt.date(2026, 9, 15), state_file=tmp_path / "pending.json", notify=lambda *a, **k: 0)
    assert res["materialized"] == 12
    assert len(repo.list_entries()) == 12


def test_top_up_is_idempotent_across_two_runs(tmp_path):
    repo = _repo(tmp_path, rules=[_rule()])
    check_recurring(repo, today=dt.date(2026, 9, 15), state_file=tmp_path / "pending.json", notify=lambda *a, **k: 0)
    res2 = check_recurring(repo, today=dt.date(2026, 9, 15), state_file=tmp_path / "pending.json", notify=lambda *a, **k: 0)
    assert res2["materialized"] == 0
    assert len(repo.list_entries()) == 12


def test_due_occurrence_is_prompted_once(tmp_path):
    entries = [{
        "id": "px_due", "tarih": "2026-09-05", "tur": "GIDER", "tutar": 229.9,
        "paraBirimi": "TRY", "kategori": "eglence", "aciklama": "Netflix",
        "hesap": "NAKIT", "sahip": "ENIS", "taksitPlaniId": None, "taksitNo": None,
        "taksitToplam": None, "not": "", "kaynak": "manual", "olusturulma": "",
        "tekrarKuralId": "rr_1", "durum": "planlandi",
    }]
    repo = _repo(tmp_path, rules=[_rule()], entries=entries)
    prompts = []
    notify = lambda text, buttons, **k: (prompts.append((text, buttons)), 1)[1]
    state_file = tmp_path / "pending.json"

    res1 = check_recurring(repo, today=dt.date(2026, 9, 15), state_file=state_file, notify=notify)
    assert len(prompts) == 1
    assert "px_due" in prompts[0][1][0][0][1]  # callback_data içinde tx id
    assert res1["prompted"] == ["px_due"]

    # Aynı gün ikinci çalışma: tekrar sormaz (pending state)
    res2 = check_recurring(repo, today=dt.date(2026, 9, 15), state_file=state_file, notify=notify)
    assert len(prompts) == 1
    assert res2["prompted"] == []


def test_gecmis_kuralin_planli_satiri_uretmeyecek_kadar_pasifse_atlanir(tmp_path):
    repo = _repo(tmp_path, rules=[_rule(aktif=False)])
    res = check_recurring(repo, today=dt.date(2026, 9, 15), state_file=tmp_path / "pending.json", notify=lambda *a, **k: 0)
    assert res["materialized"] == 0
    assert repo.list_entries() == []
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_check.py -q`
Expected: FAIL — `src.sync.recurring` modülü yok.

- [ ] **Step 3: `src/sync/recurring.py`'yi yaz**

```python
"""Daily recurring-rule top-up + due-date Telegram confirmation.

Mirrors the shape of `reminder.py`: a pure-ish check function taking an
injected `today`/`state_file`/`notify`, called from `SyncRunner.run_once`
every ~2 minutes. A small state file remembers which due rows have already
been asked about, since the 2-minute cycle would otherwise re-prompt the
same row until it's answered.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Callable, Optional

from ..data.jsonstore import atomic_write_json, read_json
from ..data.personal_repository import PersonalRepository
from ..data.recurring import materialize_recurring
from .notify import send_telegram_with_buttons


def check_recurring(
    repo: PersonalRepository,
    *,
    today: Optional[dt.date] = None,
    state_file: Optional[Path] = None,
    notify: Callable[..., int] = send_telegram_with_buttons,
) -> dict:
    check_date = today or dt.date.today()
    target_state_file = state_file or (repo.data_dir / ".recurring_pending.json")
    pending: dict = read_json(target_state_file, default={})

    # 1. Top-up: her aktif kural için 12 aylık ufku tamamla.
    rules = repo.list_recurring_rules()
    existing = repo.list_entries()
    existing_ids = {r["id"] for r in existing if "id" in r}
    new_rows = materialize_recurring(rules, existing, check_date, existing_ids)
    if new_rows:
        repo.add_materialized_entries(new_rows)

    # 2. Vade taraması: durum='planlandi' ve tarih <= bugün, henüz sorulmamış.
    all_entries = repo.list_entries()
    today_iso = check_date.isoformat()
    prompted: list[str] = []

    for row in all_entries:
        if row.get("durum") != "planlandi":
            continue
        if row["tarih"] > today_iso:
            continue
        if row["id"] in pending:
            continue

        text = (
            f"Bugün {row['aciklama']} için "
            f"{row['tutar']:.2f} {row['paraBirimi']} tahsil edildi mi?"
        )
        buttons = [[("Evet", f"recur:yes:{row['id']}"), ("Hayır", f"recur:no:{row['id']}")]]
        sent = notify(text, buttons)
        if sent:
            pending[row["id"]] = {"asked_at": dt.datetime.now().isoformat()}
            prompted.append(row["id"])

    if prompted:
        atomic_write_json(target_state_file, pending)

    return {
        "status": "ok",
        "materialized": len(new_rows),
        "prompted": prompted,
    }
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_check.py -q`
Expected: PASS (4 test)

- [ ] **Step 5: `once.py`'ye bağla**

`src/sync/once.py` içindeki import bloğuna (`.reminder` importunun altına):

```python
from .recurring import check_recurring
```

`from ..data.repository import TrackerRepository` satırının altına:

```python
from ..data.personal_repository import PersonalRepository
```

`SyncRunner.__init__` içinde `self.repo = repo` satırının altına:

```python
        self.personal_repo = PersonalRepository(bbb_dir=repo.bbb_dir)
```

`run_once` içinde, `# I8: Level crossing alerts` bloğunun hemen altına:

```python
            # Tekrarlayan işlemler: top-up + vade taraması + Telegram onayı
            recurring_res = check_recurring(
                self.personal_repo,
                today=today,
                state_file=self.state_dir / ".recurring_pending.json",
            )
```

Dönen `dict`'e ekle (`"levels": levels_res,` satırının altına):

```python
                "recurring": recurring_res,
```

- [ ] **Step 6: Wiring testini yaz ve çalıştır**

`tests/test_recurring_check.py`'ye ekle (mevcut `test_sync_runner_triggers_reminder`'daki `MockRepo`/`dummy_rclone` desenini `tests/test_monthly_reminder.py`'den Read ile inceleyip aynı şekilde kur):

```python
def test_sync_runner_calls_check_recurring(tmp_path, monkeypatch):
    from src.sync.once import SyncRunner
    from tests.test_monthly_reminder import MockRepo, MockNotifier  # veya aynı sınıfları buraya kopyala

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    for name in ("recurring_rules", "personal_tx", "payment_plans", "personal_accounts", "categories", "people", "debts", "cashflows"):
        (data_dir / f"{name}.json").write_text("[]")
    bbb_dir = tmp_path / "bbb"
    (bbb_dir / "data").mkdir(parents=True)

    repo = MockRepo(snapshots=[], data_dir=data_dir, bbb_dir=data_dir.parent)
    runner = SyncRunner(repo, rclone=lambda phase: None, notify=MockNotifier(), state_dir=tmp_path)
    res = runner.run_once(today=dt.date(2026, 9, 15))
    assert res["recurring"]["status"] == "ok"
```

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_check.py -q`
Expected: PASS

- [ ] **Step 7: Tüm paketi çalıştır**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest -q`
Expected: Temiz.

- [ ] **Step 8: Commit**

```bash
cd bbb-telegram-bot && git add src/sync/recurring.py src/sync/once.py tests/test_recurring_check.py
git commit -m "feat(recurring): günlük top-up + vade taraması + Telegram onay isteği"
```

---

### Task 5: `recurring_flow.py` — Evet/Hayır callback işleyici

**Files:**
- Create: `bbb-telegram-bot/src/bot/handlers/recurring_flow.py`
- Modify: `bbb-telegram-bot/src/data/personal_repository.py` (`mark_entry_executed`, `delete_entry`)
- Modify: `bbb-telegram-bot/src/bot/main.py` (import + dispatch zinciri)
- Test: `bbb-telegram-bot/tests/test_recurring_flow.py`

**Interfaces:**
- Consumes: `get_repo` (`src/bot/handlers/personal_flow.py`), `safe_answer` (`src/bot/telegram_utils.py`), yeni `PersonalRepository.mark_entry_executed`/`delete_entry` (bu task'ta eklenir).
- Produces: `handle_recurring_callbacks(update, context) -> bool` — `"recur:"` önekli olmayan callback'lerde `False` döner (zincirdeki bir sonraki handler'a düşer), `on_callback_query`'e eklenir. `PersonalRepository.mark_entry_executed(entry_id) -> dict | None`, `PersonalRepository.delete_entry(entry_id) -> dict | None`.

- [ ] **Step 1: Failing testleri yaz**

`bbb-telegram-bot/tests/test_recurring_flow.py` (mevcut bir `*_flow.py` testinin `Update`/`CallbackQuery` mock deseni için `tests/test_debt_flow.py` veya benzerini Read ile aç ve aynı mock kurulumunu kullan):

```python
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.bot.handlers import recurring_flow
from src.data.personal_repository import PersonalRepository


def _repo(tmp_path: Path, entries) -> PersonalRepository:
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "personal_tx.json").write_text(json.dumps(entries))
    for name in ("recurring_rules", "payment_plans", "personal_accounts", "categories", "people", "debts", "cashflows"):
        (tmp_path / "data" / f"{name}.json").write_text("[]")
    return PersonalRepository(bbb_dir=tmp_path)


def _make_update(callback_data: str):
    query = MagicMock()
    query.data = callback_data
    query.answer = AsyncMock()
    query.edit_message_text = AsyncMock()
    update = MagicMock()
    update.callback_query = query
    return update, query


@pytest.mark.asyncio
async def test_ignores_other_prefixes():
    update, _ = _make_update("pf:cancel")
    assert await recurring_flow.handle_recurring_callbacks(update, MagicMock()) is False


@pytest.mark.asyncio
async def test_evet_marks_row_executed(tmp_path, monkeypatch):
    row = {"id": "px_1", "tarih": "2026-09-15", "tekrarKuralId": "rr_1", "durum": "planlandi", "aciklama": "Netflix", "tutar": 229.9, "paraBirimi": "TRY"}
    repo = _repo(tmp_path, [row])
    monkeypatch.setattr(recurring_flow, "get_repo", lambda: repo)

    update, query = _make_update("recur:yes:px_1")
    handled = await recurring_flow.handle_recurring_callbacks(update, MagicMock())

    assert handled is True
    saved = repo.list_entries()[0]
    assert "durum" not in saved
    query.edit_message_text.assert_awaited_once()


@pytest.mark.asyncio
async def test_hayir_deletes_row(tmp_path, monkeypatch):
    row = {"id": "px_1", "tarih": "2026-09-15", "tekrarKuralId": "rr_1", "durum": "planlandi", "aciklama": "Netflix", "tutar": 229.9, "paraBirimi": "TRY"}
    repo = _repo(tmp_path, [row])
    monkeypatch.setattr(recurring_flow, "get_repo", lambda: repo)

    update, query = _make_update("recur:no:px_1")
    handled = await recurring_flow.handle_recurring_callbacks(update, MagicMock())

    assert handled is True
    assert repo.list_entries() == []
    query.edit_message_text.assert_awaited_once()
```

(`pytest.mark.asyncio` bu repoda zaten kullanılıyor mu kontrol et — `pytest.ini`'yi Read ile aç; `asyncio_mode = auto` ise dekoratöre gerek yoktur, mevcut bir `*_flow` testinin üst kısmındaki deseni birebir kopyala.)

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_flow.py -q`
Expected: FAIL — `src.bot.handlers.recurring_flow` yok.

- [ ] **Step 3: `PersonalRepository`'e iki odaklı public yazma metodu ekle**

`src/data/personal_repository.py` içinde `update_entry_account`'ın (satır ~432) hemen altına, mevcut `@_kayitli` desenini takip ederek:

```python
    @_kayitli("entries", "guncelle")
    def mark_entry_executed(self, entry_id: str) -> dict | None:
        """`durum='planlandi'` bayrağını kaldırır — occurrence artık
        gerçekleşmiş sayılır (tekrarlayan işlem 'Evet' cevabı)."""
        entries = self._load("entries")
        idx = next((i for i, r in enumerate(entries) if r.get("id") == entry_id), None)
        if idx is None:
            return None
        updated = {k: v for k, v in entries[idx].items() if k != "durum"}
        entries[idx] = updated
        self._save("entries", entries)
        return updated

    @_kayitli("entries", "sil")
    def delete_entry(self, entry_id: str) -> dict | None:
        """Tek bir kaydı `entries`'ten kaldırır (tekrarlayan işlem 'Hayır'
        cevabı için — sadece o ayki oluşum, kural etkilenmez)."""
        entries = self._load("entries")
        row = next((r for r in entries if r.get("id") == entry_id), None)
        if row is None:
            return None
        self._save("entries", [r for r in entries if r.get("id") != entry_id])
        return row
```

- [ ] **Step 4: `recurring_flow.py`'yi yaz**

```python
"""Evet/Hayır callback handler for a due recurring-rule occurrence.

Wired into `on_callback_query`'s dispatch chain in `main.py`, same shape as
`handle_personal_callbacks` / `handle_debt_callbacks`.
"""
from __future__ import annotations

from telegram import Update
from telegram.ext import ContextTypes

from ..telegram_utils import safe_answer
from .personal_flow import get_repo


async def handle_recurring_callbacks(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    query = update.callback_query
    if not query or not query.data:
        return False

    data = query.data
    if not data.startswith("recur:"):
        return False

    _, action, tx_id = data.split(":", 2)
    repo = get_repo()

    if action == "yes":
        updated = repo.mark_entry_executed(tx_id)
        if updated is None:
            await safe_answer(query, "Bu kayıt artık yok.", show_alert=True)
            await query.edit_message_text("⚠️ Bu kayıt başka bir yerden değişmiş.")
            return True
        await safe_answer(query, "Kaydedildi.")
        await query.edit_message_text(f"✅ {updated['aciklama']} kaydedildi.")
    else:
        deleted = repo.delete_entry(tx_id)
        if deleted is None:
            await safe_answer(query, "Bu kayıt artık yok.", show_alert=True)
            await query.edit_message_text("⚠️ Bu kayıt başka bir yerden değişmiş.")
            return True
        await safe_answer(query, "Atlandı.")
        await query.edit_message_text(f"↩️ {deleted['aciklama']} bu ay atlandı.")

    return True
```

- [ ] **Step 5: `main.py`'ye bağla**

`src/bot/main.py` içinde `from .handlers.hata_flow import handle_hata_callbacks, handle_hata_command` satırının altına:

```python
from .handlers.recurring_flow import handle_recurring_callbacks
```

`on_callback_query` içinde `# Route personal ledger flow callbacks` bloğunun altına:

```python
    # Route recurring-rule confirmation callbacks
    if await handle_recurring_callbacks(update, context):
        return
```

- [ ] **Step 6: Testi çalıştır, geçtiğini doğrula**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest tests/test_recurring_flow.py -q`
Expected: PASS (3 test)

- [ ] **Step 7: Tüm paketi çalıştır**

Run: `cd bbb-telegram-bot && BBB_DIR=/Users/enisuslu/Desktop/Market/BBB .venv/bin/python -m pytest -q`
Expected: Temiz.

- [ ] **Step 8: Commit**

```bash
cd bbb-telegram-bot && git add src/bot/handlers/recurring_flow.py src/data/personal_repository.py src/bot/main.py tests/test_recurring_flow.py
git commit -m "feat(recurring): Telegram Evet/Hayır callback işleyici"
```

---

## Self-review notu (plan yazarı için, uygulayıcı bunu okumaz)

- Spec §4'teki tüm maddeler kapsandı: `recurring_rules.json` okuma + `SEEDED_FILES` (T1), materialize_recurring (T2), butonlu bildirim (T3), günlük top-up + vade taraması + pending state (T4), callback handler (T5).
- Spec D1 (bot yazmaz) T1'de `list_recurring_rules` salt-okunur; hiçbir task `recurring_rules.json`'a yazmıyor — doğrulandı.
- Spec D6 (Hayır → tek satır silinir, kural etkilenmez) T5'te `handle_recurring_callbacks`'in `no` dalında sadece o `tx_id`'li satır filtreleniyor, `recurring_rules.json`'a dokunulmuyor — doğrulandı.
- Tip/isim tutarlılığı: `materialize_recurring` imzası T2'de tanımlandı, T4'te aynı isimle çağrılıyor; `PersonalRepository.add_materialized_entries`/`list_recurring_rules` T1'de tanımlandı, T4'te aynı isimlerle kullanılıyor.
