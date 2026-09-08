# Kişisel Defter Phase 2 — Editing and Concurrency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Enis add, correct and delete personal-ledger records from the PWA, without the bot and the page ever destroying each other's writes.

**Architecture:** The bot's sync cycle stops overwriting the personal files with whichever copy happens to be newer and starts **merging** them: it pulls the remote copies into a staging directory and reconciles them against a stored base, row by row, using the same three-way merge the investment ledger already runs — extracted into one shared function rather than copied. Only once that is in place does the app gain its write controls.

**Tech Stack:** Bot — Python 3, `pytest`, existing `rclone`/systemd plumbing. App — Svelte 5 runes, TypeScript, Vitest. No new dependencies on either side.

**Spec:** `docs/superpowers/specs/2026-09-08-bbb-kisisel-defter-faz2-design.md` — read it before Task 1. Decisions are referenced as E1–E8.

**Two working directories:**
- Tasks 1–4: `~/Desktop/Market/BBB/bbb-telegram-bot` (`main`, 408 tests). Run `./.venv/bin/python -m pytest`.
- Tasks 5–9: `~/Desktop/Market/BBB/app` (`main`, 249 tests). Run `npm test` and `npm run check`.

## Task order is a safety property

**Tasks 1–4 must land and deploy before Task 5.** They are what makes a second writer safe. Shipping the app's edit controls first would open exactly the data-loss window this phase exists to close. Do not reorder.

## Global Constraints

- All 408 bot tests and all 249 app tests stay green. Never weaken an assertion to make a change pass.
- **`reverse_import_from_bbb` keeps its exact current behaviour.** Only its internals move (E2); its existing tests are the proof.
- **No silent loss.** Every conflict is either provably safe or reported to Enis on Telegram.
- The bot still writes only the six personal files plus `cashflows.json`; a trade still never reaches the personal code.
- Tests never touch Drive, rclone, Telegram or a real network.
- Turkish user-facing strings, plain text in the bot.
- Each task is its own TDD cycle and its own commit.

---

### Task 1: Extract the three-way merge

**Files:** Create `src/data/merge.py`. Modify `src/data/repository.py`. Test: `tests/test_merge.py`.

**Interfaces:**
- Produces: `merge_rows(base: dict[str, dict] | None, ours: list[dict], theirs: list[dict], *, key: str = "id") -> tuple[list[dict], dict]` returning `(merged, report)` where `report` is `{"updated": [...], "readded": [...], "deleted": [...], "conflicts": [{"ours": row|None, "theirs": row|None}]}`.
- `base is None` means "no base yet": only the both-differ rule applies and add/delete decisions are deferred, matching the investment side's first-run behaviour.
- On a genuine conflict **theirs wins** (E4), and the pair is reported.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_merge.py
"""The three-way row merge shared by the investment and personal ledgers."""
import pytest

from src.data.merge import merge_rows


def r(i, v="a"):
    return {"id": i, "v": v}


def base_of(rows):
    return {x["id"]: x for x in rows}


def test_identical_sides_are_kept():
    merged, rep = merge_rows(base_of([r(1)]), [r(1)], [r(1)])
    assert merged == [r(1)]
    assert rep["conflicts"] == []


def test_only_theirs_changed_takes_theirs():
    merged, rep = merge_rows(base_of([r(1, "a")]), [r(1, "a")], [r(1, "b")])
    assert merged == [r(1, "b")]
    assert rep["updated"] == [r(1, "b")]
    assert rep["conflicts"] == []


def test_only_ours_changed_keeps_ours():
    merged, rep = merge_rows(base_of([r(1, "a")]), [r(1, "b")], [r(1, "a")])
    assert merged == [r(1, "b")]
    assert rep["conflicts"] == []


def test_both_changed_is_a_conflict_and_theirs_wins():
    merged, rep = merge_rows(base_of([r(1, "a")]), [r(1, "b")], [r(1, "c")])
    assert merged == [r(1, "c")]
    assert rep["conflicts"] == [{"ours": r(1, "b"), "theirs": r(1, "c")}]


def test_new_row_on_their_side_is_added():
    merged, rep = merge_rows(base_of([]), [], [r(2)])
    assert merged == [r(2)]
    assert rep["readded"] == [r(2)]


def test_new_row_on_our_side_is_kept():
    merged, _ = merge_rows(base_of([]), [r(2)], [])
    assert merged == [r(2)]


def test_they_deleted_an_untouched_row_so_it_goes():
    merged, rep = merge_rows(base_of([r(1, "a")]), [r(1, "a")], [])
    assert merged == []
    assert rep["deleted"] == [r(1, "a")]


def test_they_deleted_a_row_we_edited_so_ours_survives_as_a_conflict():
    merged, rep = merge_rows(base_of([r(1, "a")]), [r(1, "b")], [])
    assert merged == [r(1, "b")]
    assert rep["conflicts"] == [{"ours": r(1, "b"), "theirs": None}]


def test_we_deleted_an_untouched_row_so_it_stays_deleted():
    merged, _ = merge_rows(base_of([r(1, "a")]), [], [r(1, "a")])
    assert merged == []


def test_without_a_base_only_the_differ_rule_applies():
    merged, rep = merge_rows(None, [r(1, "b")], [r(1, "c")])
    assert merged == [r(1, "c")]
    assert rep["conflicts"] == [{"ours": r(1, "b"), "theirs": r(1, "c")}]
    # add/delete decisions are deferred, so a one-sided row is kept
    merged2, _ = merge_rows(None, [r(2)], [])
    assert merged2 == [r(2)]


def test_order_follows_our_side_then_their_additions():
    merged, _ = merge_rows(base_of([]), [r(1), r(2)], [r(3)])
    assert [x["id"] for x in merged] == [1, 2, 3]
```

- [ ] **Step 2: Run and watch it fail** — `./.venv/bin/python -m pytest tests/test_merge.py -v`

- [ ] **Step 3: Implement `merge_rows`** in `src/data/merge.py`, lifting the decision table from `reverse_import_from_bbb`'s body. Compare rows with a plain `==` on the dicts (the existing `_rows_equal` does the same); keep the function free of any file or path knowledge.

- [ ] **Step 4: Refactor `reverse_import_from_bbb` to call it.** Its docstring, return shape, backup behaviour and base refresh all stay exactly as they are — only the per-row decisions move out. Map the names honestly: the bot ledger is `ours`, the BBB/dashboard copy is `theirs`.

- [ ] **Step 5: Run the whole suite** — `./.venv/bin/python -m pytest`
Expected: 408 + 11 passing, and in particular `tests/test_reverse_import.py` green **without edits**. If any of its assertions needed changing, the extraction was not behaviour-preserving — revert and redo.

- [ ] **Step 6: Commit** — `git commit -m "refactor: extract the three-way row merge into src/data/merge.py"`

---

### Task 2: Staged pull and the merge base

**Files:** Modify `src/sync/once.py`. Test: `tests/test_personal_sync.py`.

**Interfaces:**
- Produces: `STAGE_DIR = BBB_DIR / ".sync-stage"`, `BASE_DIR = BBB_DIR / ".sync-base"`; `_run_rclone("pull-personal")` fetches `DIRECT_WRITE_FILES` **into the staging directory**, without `--update`.
- Both directories sit in `BBB/`, never in `BBB/data/`, so the push (which copies `BBB/data/`) can never leak them to Drive (E8).

- [ ] **Step 1: Write the failing test**

```python
def test_the_personal_pull_targets_the_staging_directory(commands):
    _run_rclone("pull-personal")
    cmd = commands[-1]
    assert ".sync-stage" in " ".join(cmd)
    assert "--update" not in cmd, (
        "--update protects a local write by skipping the pull, which is exactly "
        "how a remote edit gets hidden; we now merge instead"
    )
    for name in DIRECT_WRITE_FILES:
        assert name in " ".join(cmd)


def test_the_main_pull_still_excludes_them_and_still_has_no_update(commands):
    _run_rclone("pull")
    main = " ".join(commands[0])
    for name in DIRECT_WRITE_FILES:
        assert name in main
    assert "--update" not in commands[0]


def test_the_stage_and_base_live_outside_data(tmp_path):
    from src.sync.once import BASE_DIR, STAGE_DIR
    assert "data" not in STAGE_DIR.name and "data" not in BASE_DIR.name
    assert STAGE_DIR.parent == BASE_DIR.parent
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Split the existing `"pull"` direction into `"pull"` (the main copy, unchanged, still excluding the direct-write files) and `"pull-personal"` (into `STAGE_DIR`, `--include` each direct-write file, no `--update`). Create both directories on demand.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: stage the personal pull instead of overwriting the live files"`

---

### Task 3: Merge the personal files in the cycle

**Files:** Modify `src/sync/once.py`, `src/sync/notify.py`. Test: `tests/test_personal_sync.py`.

**Interfaces:**
- Produces: `SyncRunner._merge_personal() -> dict` — for each name in `DIRECT_WRITE_FILES`, merge `base / local / staged`, write the result to `BBB/data/<name>` (backup first, atomic write, under the existing lock), refresh the base, and collect conflicts.
- `run_once` calls it between the pulls and the push. A missing staged file aborts the cycle without writing anything.

- [ ] **Step 1: Write the failing test**

```python
def test_a_remote_only_row_arrives(runner_with_files):
    """The app added a row; the bot must not drop it."""
    r = runner_with_files(local=[ROW_A], staged=[ROW_A, ROW_B], base=[ROW_A])
    r.run_once()
    assert ids(read_local(r, "personal_tx.json")) == {"px_a", "px_b"}


def test_a_local_only_row_survives(runner_with_files):
    """The bot added a row the app has not seen; the pull must not erase it."""
    r = runner_with_files(local=[ROW_A, ROW_C], staged=[ROW_A], base=[ROW_A])
    r.run_once()
    assert "px_c" in ids(read_local(r, "personal_tx.json"))


def test_the_scenario_from_the_spec_loses_nothing(runner_with_files):
    """App corrected px_a at 10:00; bot added px_c at 10:01; both must survive."""
    corrected = {**ROW_A, "tutar": 999.0}
    r = runner_with_files(local=[ROW_A, ROW_C], staged=[corrected], base=[ROW_A])
    r.run_once()
    rows = read_local(r, "personal_tx.json")
    assert ids(rows) == {"px_a", "px_c"}
    assert next(x for x in rows if x["id"] == "px_a")["tutar"] == 999.0


def test_a_genuine_conflict_is_reported_to_telegram(runner_with_files, sent):
    both = ({**ROW_A, "tutar": 1.0}, {**ROW_A, "tutar": 2.0})
    r = runner_with_files(local=[both[0]], staged=[both[1]], base=[ROW_A])
    r.run_once()
    assert any("çakışma" in m.lower() for m in sent)


def test_no_conflict_means_no_message(runner_with_files, sent):
    r = runner_with_files(local=[ROW_A], staged=[ROW_A], base=[ROW_A])
    r.run_once()
    assert sent == []


def test_a_failed_pull_writes_nothing(runner_with_files):
    r = runner_with_files(local=[ROW_A], staged=None, base=[ROW_A])  # staging absent
    before = read_local(r, "personal_tx.json")
    res = r.run_once()
    assert res["status"] == "error"
    assert read_local(r, "personal_tx.json") == before


def test_the_base_is_refreshed_to_the_merged_result(runner_with_files):
    r = runner_with_files(local=[ROW_A], staged=[ROW_A, ROW_B], base=[ROW_A])
    r.run_once()
    assert ids(read_base(r, "personal_tx.json")) == {"px_a", "px_b"}


def test_a_backup_is_written_before_the_merge(runner_with_files):
    r = runner_with_files(local=[ROW_A], staged=[ROW_A, ROW_B], base=[ROW_A])
    r.run_once()
    assert list((r.state_dir / "data" / "backups").glob("personal_tx-*.json"))
```

Build `runner_with_files` on the existing `tests/test_personal_sync.py` fixtures: a `SyncRunner` with a fake `rclone` that writes the given rows into the staging directory, and a fake `notify` collecting messages into `sent`.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement `_merge_personal`** using `merge_rows` from Task 1, and wire it into `run_once` between the pulls and the push. Reuse `jsonstore.backup_file` and `atomic_write_json`; the whole cycle already runs under the lock.

- [ ] **Step 4: Report conflicts.** Add `_format_personal_conflicts(by_file)` next to the existing `_format_conflicts`, producing the shape in spec §3.3 — the file's human name, the row's description and amount, the id's first eight characters, and which side won. Cap it at ten lines like the existing formatter.

- [ ] **Step 5: Full suite green.** Commit: `git commit -m "feat: merge the personal files instead of overwriting them"`

---

### Task 4: Bot-side documentation and deploy notes

**Files:** Modify `deploy/README.md`, `README.md`, `.gitignore`.

- [ ] **Step 1: Ignore the new directories.** `BBB/.sync-stage/` and `BBB/.sync-base/` live outside this repo, so nothing is needed in `.gitignore` — **verify that** with `git status` after a local run rather than assuming, and add a rule only if something shows up.

- [ ] **Step 2: Rewrite the sync section of `deploy/README.md`.** Replace the "Kişisel defter — tek kopya" section with the merged model: the staged pull, the base directory, the row-level merge, dashboard-wins, and the conflict DM. **State plainly that `--update` must not come back** — it protects a local write by skipping the pull, which is exactly how a remote edit gets hidden, and it is only safe when there is a single writer.

- [ ] **Step 3: Note the operational recovery.** Deleting `BBB/.sync-base/` is safe: the next cycle behaves like a first run (differ-rule only) and rebuilds the base. Say so, because it is the natural thing to try when something looks wrong.

- [ ] **Step 4: Commit** — `git commit -m "docs: the merged personal-file sync model"`

- [ ] **Step 5: Hand deployment to the controller.** Report that Tasks 1–4 are ready to deploy and that **Task 5 must not start until they are live on the VM**. The VM copy is not a git repo; it is updated by rsync with `--exclude '/data/'`, anchored with the leading slash.

---

### Task 5: The app's edit gate and writable files

**Files:** Modify `app/src/lib/data/store.ts`. Test: `app/src/lib/data/store.test.ts`.

**Interfaces:**
- Produces: `MutateOpts = { allowImported?: boolean; allowKaynak?: string[] }`, defaulting to `['manual']`; the six personal names accepted by `writeAndCommit`.

- [ ] **Step 1: Write the failing test**

```ts
it('varsayılan olarak telegram kaydını düzenlemeyi reddeder', async () => {
  await expect(
    updateRecord(store, source, 'personal_tx', (r) => r.id === 'px_a',
                 { ...row, tutar: 5 }),
  ).rejects.toThrow(/manuel/i)
})

it('allowKaynak verilince telegram kaydını düzenler', async () => {
  await updateRecord(store, source, 'personal_tx', (r) => r.id === 'px_a',
                     { ...row, tutar: 5 }, { allowKaynak: ['telegram', 'manual'] })
  expect(saved.personal_tx[0].tutar).toBe(5)
})

it('allowKaynak silmede de geçerli', async () => {
  await deleteRecord(store, source, 'personal_tx', (r) => r.id === 'px_a',
                     { allowKaynak: ['telegram'] })
  expect(saved.personal_tx).toHaveLength(0)
})

it('yatırım tarafının davranışı değişmez', async () => {
  await expect(
    updateRecord(store, source, 'transactions', (r) => r.id === 't_1', migratedRow),
  ).rejects.toThrow(/manuel/i)
})

it('kişisel dosyalara yazılabilir', async () => {
  await appendRecord(store, source, 'personal_tx', row)
  expect(saved.personal_tx).toHaveLength(1)
})
```

- [ ] **Step 2: Run and watch them fail** — `npm test -- store`

- [ ] **Step 3: Implement.** Add `allowKaynak` with the `['manual']` default, replacing the two `!== 'manual'` checks with a membership test. Leave `allowImported` and both error messages exactly as they are. Widen the writable `Kind` union.

- [ ] **Step 4: `npm test && npm run check` clean.** Commit: `git commit -m "feat(app): allow editing telegram-sourced personal records"`

---

### Task 6: Harcamalar — add, edit, delete

**Files:** Create `app/src/routes/hesaplar/HarcamaFormu.svelte`. Modify `app/src/routes/hesaplar/Harcamalar.svelte`. Test: matching `.test.ts` files.

- [ ] **Step 1: Write the failing test**

```ts
it('yeni kayıt formu zorunlu alanları doğrular', async () => { /* empty amount → error, no save */ })
it('yeni kaydı manual olarak yazar', async () => { /* saved row has kaynak 'manual' and a px_ id */ })
it('mevcut kaydın tutarını düzeltir', async () => { /* updateRecord called with the patch */ })
it('kaydı siler', async () => { /* deleteRecord called with the matching id */ })
it('taksit satırının plan bağını koparmaya izin vermez', async () => {
  /* the plan fields are rendered read-only for a row with taksitPlaniId */
})
it('Drive bağlı değilken düzenleme kapalı', async () => {
  /* controls disabled and the reason is shown */
})
```

Fill each body against the fixture, following the assertion style of the existing form tests (`NakitHareketiFormu.test.ts`).

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Mirror `NakitHareketiFormu`'s structure and validation. Fields: date, direction (`Gider`/`Gelir`), amount, currency, category (filtered by direction), account, owner, description. New rows get `kaynak: 'manual'`, `olusturulma: new Date().toISOString()`, and an id of `px_` + 12 random hex (E5 — do **not** port the bot's content hash to TypeScript). All writes pass `allowKaynak: ['telegram', 'manual']`.

- [ ] **Step 4: `npm test && npm run check` clean.** Commit: `git commit -m "feat(app): add, edit and delete on Harcamalar"`

---

### Task 7: Taksitler — cancel a plan

**Files:** Modify `app/src/routes/hesaplar/Taksitler.svelte`. Test: `app/src/routes/hesaplar/Taksitler.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
it('iptal, sadece gelecek taksitleri siler', async () => {
  /* 6-instalment plan, 3 past 3 future → the 3 past rows remain */
})
it('iptal, plan kaydını da siler', async () => { /* payment_plans loses the row */ })
it('iptal, kaç satır silineceğini söyleyip onay ister', async () => {
  /* the confirm text contains "3" */
})
it('onaylanmazsa hiçbir şey silinmez', async () => { /* no save call */ })
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Cancelling removes the plan row from `payment_plans` and every `personal_tx` row whose `taksitPlaniId` matches **and** whose `tarih > today`. The confirmation names the count explicitly. Past instalments are money already spent and must survive.

- [ ] **Step 4: `npm test && npm run check` clean.** Commit: `git commit -m "feat(app): cancel an instalment plan from Taksitler"`

---

### Task 8: Borçlar — edit, close, delete

**Files:** Modify `app/src/routes/hesaplar/Borclar.svelte`. Test: `app/src/routes/hesaplar/Borclar.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
it('borcu kapatır ama silmez', async () => {
  /* durum becomes 'KAPALI'; the row is still in debts */
})
it('kapanan borç listeden çıkar', async () => { /* it no longer renders as open */ })
it('tutarı düzeltir', async () => { /* updateRecord with the new tutar */ })
it('borcu siler', async () => { /* deleteRecord */ })
it('silmeden önce onay ister', async () => { /* no save without confirmation */ })
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** Closing sets `durum: 'KAPALI'` and keeps the row, so the history survives; deleting is a separate, confirmed action.

- [ ] **Step 4: `npm test && npm run check` clean.** Commit: `git commit -m "feat(app): edit, close and delete on Borçlar"`

---

### Task 9: Conflict handling, disconnected state, and docs

**Files:** Modify the three editable pages, `app/README.md`. Test: `app/src/routes/hesaplar/edit.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
it('ConflictError sonrası veriyi yeniler ve tekrar denemeyi ister', async () => {
  /* save throws ConflictError → load() called again, message mentions "tekrar" */
})
it('Drive bağlı değilken üç sayfada da düzenleme kapalı', async () => {
  for (const Page of [Harcamalar, Taksitler, Borclar]) {
    /* controls disabled, reason shown */
  }
})
it('kayıt hatası kullanıcıya görünür, sessizce yutulmaz', async () => {
  /* a thrown error surfaces as text */
})
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** On `ConflictError`, reload the dataset and show *"Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?"*. With no `source.save` (local dev), render the controls disabled with *"Düzenleme için Drive bağlantısı gerekiyor"*. Never swallow a write error.

- [ ] **Step 4: Document.** In `app/README.md`, extend the Kişisel Defter section: what is editable on each page, that app-created rows are tagged `manual` while bot rows stay `telegram`, and that the bot reconciles the two sides by merging rather than overwriting — with a pointer to the phase 2 spec.

- [ ] **Step 5: `npm test && npm run check` clean.** Commit: `git commit -m "feat(app): conflict handling and editing docs"`

---

### Closing

- [ ] Bot: `./.venv/bin/python -m pytest` — record the count. App: `npm test && npm run check` — record both.
- [ ] Confirm `tests/test_reverse_import.py` passes **unedited** (Task 1's proof).
- [ ] Confirm the load-bearing properties still hold: a trade never reaches the personal code; the main pull carries no `--update`; the bot writes only the seven allowed files; a missing personal file still does not break the app.
- [ ] Report what changed, both test counts, decisions you made alone, and anything skipped.

**Deployment is not part of this task**, but its order is: the controller deploys Tasks 1–4 to the VM **before** the app changes reach production, because the app's edit controls are only safe once the merge is live.

**Do not pick up without asking:** Layer D; the undo-button staleness; the httpx logger printing the Telegram token; real-time page updates.
