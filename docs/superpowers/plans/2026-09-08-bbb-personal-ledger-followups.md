# Personal Ledger — Day-1 Follow-up Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the four parked issues that would degrade the very first day of using the personal ledger. None of them corrupt data; all of them are visible to the user within minutes of normal use.

**Context:** A+B shipped on `bbb-telegram-bot` `main` @ `ff9a3eb` (260 tests green). Spec: `docs/superpowers/specs/2026-09-07-bbb-personal-ledger-ab-design.md`. Original plan: `docs/superpowers/plans/2026-09-07-bbb-personal-ledger-ab.md`.

**Working directory:** `~/Desktop/Market/BBB/bbb-telegram-bot`. Run `./.venv/bin/python -m pytest`.

## Global Constraints

- All 260 existing tests stay green. Never weaken an existing assertion to make a change pass.
- Turkish user-facing strings, plain text (no Markdown — this bot has been bitten twice by parse errors).
- The four load-bearing properties from the whole-branch review must still hold: trade-flow non-regression; the split-pull `--update` asymmetry (personal half only); the LLM-never-computes boundary; six-file write containment.
- Each fix is its own TDD cycle and its own commit.

---

### Fix 1: Startup must not block the event loop

**The problem (verified):** `src/bot/main.py::_post_init` is `async def` and calls `PersonalRepository().ensure_seeded()` directly. That runs two `subprocess.run` rclone calls with `timeout=180` each. On a slow or hanging network the bot's event loop is blocked for up to ~6 minutes at startup and answers nothing — it looks broken.

**Files:** Modify `src/bot/main.py`. Test: `tests/test_personal_routing.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_post_init_does_not_block_the_event_loop(monkeypatch):
    """ensure_seeded runs two 180s rclone calls; it must go to a thread."""
    import asyncio

    from src.bot import main as bm

    seen = {}

    async def fake_to_thread(fn, *a, **kw):
        seen["threaded"] = True
        return fn(*a, **kw)

    class FakeRepo:
        def ensure_seeded(self):
            seen["called"] = True
            return True

    monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr("src.data.personal_repository.PersonalRepository", FakeRepo)

    class FakeBot:
        async def set_my_commands(self, cmds):
            return None

    await bm._post_init(type("App", (), {"bot": FakeBot()})())

    assert seen.get("called") is True
    assert seen.get("threaded") is True, "ensure_seeded must not run on the event loop"
```

- [ ] **Step 2: Run it and watch it fail** — `./.venv/bin/python -m pytest tests/test_personal_routing.py -k post_init -v`. Expected: `threaded` is missing.

- [ ] **Step 3: Fix.** In `src/bot/main.py`, `import asyncio` and change the call inside `_post_init` to:

```python
        if not await asyncio.to_thread(PersonalRepository().ensure_seeded):
            logger.warning("Kişisel defter hazırlanamadı (rclone pull başarısız).")
```

Keep the surrounding `try/except` exactly as it is — a failure here must still never stop the bot.

- [ ] **Step 4: Run the full suite** — `./.venv/bin/python -m pytest -q`. Expected: 261 passed.

- [ ] **Step 5: Commit** — `git commit -m "fix: seed the personal ledger off the event loop"`

---

### Fix 2: `/defter` is flooded by future-dated instalments

**The problem (verified):** `PersonalRepository.list_entries(limit=…)` sorts by `(tarih, olusturulma)` descending (`src/data/personal_repository.py:164-169`). Instalment rows are dated in future months, so after one 6-instalment purchase `/defter` shows five rows the user has not spent yet and hides their actual recent entries.

**Decision:** `/defter` means "what did I record lately", so order by `olusturulma` (when it was written) descending, not by `tarih`. Keep future-dated rows visible — they are real commitments — but they no longer crowd out recent activity, because a whole instalment purchase shares one `olusturulma`.

**Files:** Modify `src/data/personal_repository.py`, `src/bot/handlers/personal_flow.py` (the line renderer). Test: `tests/test_personal_repository.py`, `tests/test_personal_commands.py`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_personal_repository.py
def test_list_entries_orders_by_when_it_was_recorded(repo):
    _add(repo, tarih="2026-09-01", aciklama="eski ama yeni kaydedildi")
    _add(repo, tarih="2026-12-01", tutar=50.0, aciklama="ileri tarihli")
    _add(repo, tarih="2026-09-02", tutar=10.0, aciklama="en son kaydedilen")
    assert repo.list_entries(limit=1)[0]["aciklama"] == "en son kaydedilen"


def test_an_instalment_purchase_does_not_crowd_out_recent_entries(repo):
    _add(repo, tutar=12000.0, taksitSayisi=6, aciklama="Beyaz eşya")
    _add(repo, tutar=25.0, aciklama="Kahve", kategori="yeme-icme")
    top = [e["aciklama"] for e in repo.list_entries(limit=3)]
    assert top[0] == "Kahve"
```

```python
# tests/test_personal_commands.py
@pytest.mark.asyncio
async def test_defter_shows_recent_entries_not_only_future_instalments(repo):
    _add(repo, tutar=12000.0, taksitSayisi=6, kategori="ev", aciklama="Beyaz eşya")
    _add(repo, tutar=25.0, aciklama="Kahve", kategori="yeme-icme")
    u = FakeUpdate()
    await personal_flow.handle_defter(u, FakeContext())
    assert "Kahve" in u.message.replies[0]


@pytest.mark.asyncio
async def test_defter_marks_a_future_dated_row(repo):
    _add(repo, tutar=12000.0, taksitSayisi=6, kategori="ev", aciklama="Beyaz eşya")
    u = FakeUpdate()
    await personal_flow.handle_defter(u, FakeContext())
    assert "ileri" in u.message.replies[0].lower() or "→" in u.message.replies[0]
```

Note: `_add` in `test_personal_repository.py` writes rows whose `olusturulma` comes from `build_rows`, which stamps a whole-second UTC timestamp — three `_add` calls in the same second would tie. Make the ordering deterministic by sorting on `(olusturulma, tarih)` descending **and** by having the test pass distinct `olusturulma` values if a tie appears; if the tie is real, add a monotonic counter suffix rather than sleeping in the test.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Fix `list_entries`**

```python
    def list_entries(self, limit: int | None = None) -> list[dict]:
        rows = self._load("entries")
        if limit is None:
            return rows
        # Ordered by when it was RECORDED, not by the date it is attributed to:
        # instalment rows live in future months and would otherwise bury the
        # user's actual recent activity.
        return sorted(rows, key=lambda r: (r["olusturulma"], r["tarih"]),
                      reverse=True)[:limit]
```

- [ ] **Step 4: Mark future rows in the `/defter` line renderer.** In `handle_defter`, append a marker to any row whose `tarih` is after today (e.g. ` → ileri tarihli`) so a future instalment is never mistaken for money already spent.

- [ ] **Step 5: Full suite green, then commit** — `git commit -m "fix: /defter orders by record time and flags future-dated rows"`

---

### Fix 3: Income entry is offered expense categories

**The problem (verified):** `src/bot/handlers/personal_flow.py:202` builds the category keyboard as `[(c["ad"], c["kod"]) for c in ctx["kategoriler"]]` with no filter on `tur`. A `GELIR` draft is therefore offered the 15 expense categories instead of Maaş / Ek gelir / Diğer gelir. The Qwen system prompt has the same flaw — it lists every category regardless of direction.

**Files:** Modify `src/bot/handlers/personal_flow.py`, `src/ai/qwen_service.py`. Test: `tests/test_personal_flow.py`, `tests/test_qwen_service.py`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_personal_flow.py
@pytest.mark.asyncio
async def test_income_draft_is_offered_only_income_categories(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="GELIR", tutar=50000.0, paraBirimi="TRY",
                                     hesap="NAKIT", sahip="ENIS", aciklama="Maaş"))
    u, c = FakeUpdate("maaş 50000 geldi"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    markup = u.message.replies[-1][1]["reply_markup"]
    labels = [b.text for row in markup.inline_keyboard for b in row]
    assert "Maaş" in labels
    assert "Market" not in labels


@pytest.mark.asyncio
async def test_expense_draft_is_offered_only_expense_categories(repo, monkeypatch):
    _qwen(monkeypatch, PersonalParse(tur="GIDER", tutar=340.0, paraBirimi="TRY",
                                     hesap="NAKIT", sahip="ENIS", aciklama="Migros"))
    u, c = FakeUpdate("markette 340"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    markup = u.message.replies[-1][1]["reply_markup"]
    labels = [b.text for row in markup.inline_keyboard for b in row]
    assert "Market" in labels and "Maaş" not in labels
```

```python
# tests/test_qwen_service.py
def test_prompt_labels_each_category_with_its_direction():
    p = build_prompt(CTX)
    assert "GIDER" in p and "GELIR" in p
```

Extend `CTX` in `tests/test_qwen_service.py` with a `GELIR` category so the assertion is meaningful.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Filter the keyboard by direction.** At the category-options site, use the draft's `tur`:

```python
        opts = [(c["ad"], c["kod"]) for c in ctx["kategoriler"]
                if c.get("tur", "GIDER") == draft.get("tur", "GIDER")]
```

Make sure the `➕ Yeni` button still appends, and that `add_category` is already called with `tur=draft["tur"]` (it is — Task 11 of the original plan).

- [ ] **Step 4: Label direction in the Qwen prompt.** In `build_prompt`, render each category as `kod (ad) [GIDER]` / `[GELIR]` and add one rule line: *"Kategori, tur ile aynı yönde olmalı: GIDER kaydına GELIR kategorisi verme."* Do not add validation that rejects a mismatched pair — `_clean` already drops any code not in the list, and a direction mismatch should degrade to "ask", not to a hard failure.

- [ ] **Step 5: Full suite green, then commit** — `git commit -m "fix: offer categories matching the entry's direction"`

---

### Fix 4: A typo creates a permanent reference row

**The problem:** in the `➕ Yeni` sub-flow the typed text becomes a category / account / person immediately. `Migrso` or `Anmne` therefore becomes a permanent row that syncs to Drive and is offered forever after. There is no editor (no PWA page until after C and D), so noise can only accumulate.

**Files:** Modify `src/bot/handlers/personal_flow.py`. Test: `tests/test_personal_flow.py`.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.asyncio
async def test_a_new_category_name_is_confirmed_before_it_is_created(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": None,
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_awaiting"] = "yeni:kategori"
    u = FakeUpdate("Evcil hayvan")
    await personal_flow.handle_personal_text_message(u, c)
    assert not any(cat["kod"] == "evcil-hayvan" for cat in repo.list_categories()), \
        "nothing is created until the name is confirmed"
    assert "Evcil hayvan" in u.message.replies[-1][0]


@pytest.mark.asyncio
async def test_confirming_the_name_creates_it_and_resumes(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": None,
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_new_name"] = "Evcil hayvan"
    c.user_data["personal_new_field"] = "kategori"
    u = FakeCallbackUpdate("pf:newok:kategori")
    await personal_flow.handle_personal_callbacks(u, c)
    assert any(cat["kod"] == "evcil-hayvan" for cat in repo.list_categories())
    assert c.user_data["personal_draft"]["kategori"] == "evcil-hayvan"


@pytest.mark.asyncio
async def test_rejecting_the_name_creates_nothing_and_re_asks(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": None,
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-07", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    c.user_data["personal_new_name"] = "Evcil hayvan"
    c.user_data["personal_new_field"] = "kategori"
    u = FakeCallbackUpdate("pf:newno:kategori")
    await personal_flow.handle_personal_callbacks(u, c)
    assert repo.list_categories() and not any(
        cat["kod"] == "evcil-hayvan" for cat in repo.list_categories())
    assert "personal_new_name" not in c.user_data
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Insert one confirm step.** When a `yeni:<field>` name arrives, store it in `personal_new_name` / `personal_new_field` and reply `Yeni kategori olarak "Evcil hayvan" eklensin mi?` with `[✅ Ekle] [✏️ Tekrar yaz]` → `pf:newok:<field>` / `pf:newno:<field>`. Only `pf:newok:` calls `repo.add_category` / `add_person`. For an account, `pf:newok:hesap` still leads to the existing type question before `add_account` runs.

Reuse the `_advance(...)` helper for the resume path — do not duplicate the "ask next missing field, else confirm" logic.

- [ ] **Step 4: Full suite green, then commit** — `git commit -m "fix: confirm a new category/account/person name before creating it"`

---

### Closing

- [ ] Run `./.venv/bin/python -m pytest -q` and record the final count.
- [ ] Confirm the four load-bearing properties still have passing tests: `tests/test_personal_routing.py` (trade non-regression), `tests/test_personal_sync.py` (the `--update` asymmetry), `tests/test_qwen_service.py` (LLM never computes), `tests/test_personal_repository.py::test_writer_never_touches_the_investment_files`.
- [ ] Report what changed, the test count, and anything you chose not to do.

**Still parked after this pass** (deliberately — do not pick these up without asking): full single-lock read-modify-write in `PersonalRepository`; undo-button staleness (id in callback data); E402 mid-file test imports; redundant per-file `data/*.json` gitignore lines.
