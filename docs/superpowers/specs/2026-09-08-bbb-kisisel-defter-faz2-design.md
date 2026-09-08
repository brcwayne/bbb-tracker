# Kişisel Defter — Phase 2 — Editing and Concurrency — Design

**Date:** 2026-09-08
**Scope:** Let Enis add, correct and delete personal-ledger records from the PWA, and make it safe for the bot and the page to write the same files.

---

## 0. What actually changes

Phase 1 shipped four read-only pages. Adding a write path from the page is a small amount of UI over a **change in the system's shape**: until now the Telegram bot has been the *only* writer of the six personal files, and that single fact is the entire reason the single-copy model in `2026-09-07-bbb-personal-ledger-ab-design.md` §5.3 is safe.

**This spec triggers that section's expiry condition.** §5.3 says, in as many words, that the moment anything else can write these files, last-writer-wins becomes silent data loss and the model needs a merge base and a conflict rule. That is what §3 below builds.

The loss is concrete, not theoretical:

1. Enis corrects a row in the PWA at 10:00. The app writes `personal_tx.json` to Drive.
2. The bot records an expense at 10:01, writing the **local** `BBB/data/personal_tx.json` — which does not contain the 10:00 correction.
3. The 10:02 sync pulls with `--update`. The local file is newer than Drive's, so the pull **skips** it.
4. The push overwrites Drive with the local copy. **The 10:00 correction is gone**, with no error anywhere.

Everything else in Phase 2 is ordinary UI work. This is the part that has to be right.

---

## 1. Decisions

| # | Decision | Rationale |
|---|---|---|
| E1 | **Three-way merge with a base**, mirroring `TrackerRepository.reverse_import_from_bbb`. | The investment ledger already solved this exact shape and has run in production for days. Inventing a second scheme would mean two subtly different merge algorithms in one repo. |
| E2 | **The algorithm is extracted into one reusable pure function** and the existing investment method is refactored to call it. | Copying a subtle merge by hand into a second place is how the two drift apart. `tests/test_reverse_import.py` is the safety net for the refactor. |
| E3 | **The personal pull goes to a staging directory**, and the live local files are only written by the merge. `--update` is dropped for these files. | `--update` protects a local write by *skipping the pull* — which is precisely what hides the remote edit. Once we merge, we need both sides, so we must fetch the remote copy without destroying the local one. |
| E4 | **The dashboard wins a genuine conflict**, and a Telegram DM says what was overridden. | Same rule and same notification the investment sync already uses; one mental model. When the two disagree, the side Enis was last looking at is the better guess. |
| E5 | **Rows created in the PWA get a random id** (`px_` + 12 hex), not a content-derived one. | Content derivation exists so that inserting a row cannot silently re-key the file — a migration concern. Uniqueness is the only property the merge needs, and porting the hash to TypeScript would put a subtle algorithm in two languages. |
| E6 | **The `kaynak === 'manual'` edit gate is widened by parameter, not loosened globally.** | See §4 — every personal row carries `kaynak: 'telegram'` and would otherwise be uneditable. |
| E7 | **Editable: Harcamalar (add / edit / delete), Taksitler (cancel a whole plan), Borçlar (edit / close / delete). Özet stays read-only.** | Özet is a report; editing belongs where the records are listed. |
| E8 | **The base file lives outside `BBB/data/`**, in `BBB/.sync-base/`. | The push copies `BBB/data/` only, so a base kept there can never leak to Drive and can never be mistaken for ledger data. |

---

## 2. Global constraints

- **No silent loss.** Every merge decision is either provably safe or reported to Enis on Telegram. A conflict is never resolved quietly.
- **The investment sync must not regress.** `reverse_import_from_bbb` keeps its exact current behaviour; only its internals move. All existing bot tests stay green.
- **The bot's own guarantees hold**: it still writes only the six personal files plus `cashflows.json`; a trade still never reaches the personal code.
- **Tests never touch Drive, rclone or a real network.**
- Turkish user-facing strings, plain text in the bot, matching the app's voice on the page.
- App: `npm test` and `npm run check` clean. Bot: `pytest` green.

---

## 3. The concurrency design

### 3.1 The sync cycle, before and after

Today, for the personal and direct-write files:

```
rclone copy gdrive: → BBB/data/  --update  --include <direct-write files>
```

After:

```
rclone copy gdrive: → BBB/.sync-stage/  --include <direct-write files>
for each file:
    merged, report = merge_rows(base[file], local[file], staged[file])
    write merged → BBB/data/<file>
    base[file] = merged
push
```

The staging directory and the base directory both sit in `BBB/`, not `BBB/data/`, so neither is ever pushed to Drive. `--update` is removed for these files: it is no longer needed, and keeping it would re-introduce the skip that hides remote edits.

`cashflows.json` joins the same treatment. It has two writers for the same reason — the bot's investment bridge and the PWA's cash-movement form.

### 3.2 The merge, per row id

Extracted verbatim in behaviour from `reverse_import_from_bbb`:

| Situation | Result |
|---|---|
| Both sides have the row, identical | keep |
| Both have it, only the remote changed vs. base | take the remote |
| Both have it, only the local changed vs. base | keep local |
| Both have it, **both** changed (or no base) | **conflict → remote wins**, reported |
| Only the remote has it, base does not | a new row made in the app → add |
| Only the remote has it, base has it unchanged locally | the local side deleted it → let the delete propagate |
| Only the local has it, base does not | a new row made by the bot → keep |
| Only the local has it, base has it unchanged remotely | the app deleted it → drop |
| Only the local has it, base has it and the local changed it | **conflict → the local edit is kept**, reported |

With no base yet (first run after this ships) only the "both differ" rule applies, and add/delete decisions are deferred — exactly as the investment side handles its first run.

### 3.3 What Enis sees

A cycle with conflicts sends one Telegram message, in the existing `_format_conflicts` shape:

```
⚠️ Kişisel defter: 2 çakışma uygulama lehine çözüldü:
• Market · 340 TL (px_9f2a…): bot ve uygulama farklı → uygulamanın hali alındı
• Kira · 25.000 TL (px_4b81…): bot düzenledi, uygulama sildi → bot kaydı korundu
```

Backups are written before every merge write, into the existing `BBB/data/backups/`, so any bad merge is recoverable by hand.

---

## 4. The write path in the app

`store.ts` already has `appendRecord`, `updateRecord`, `deleteRecord`, and `DriveSource.save` already does an md5 optimistic-concurrency write with a `ConflictError`. Phase 2 reuses all of it. Two things must change.

**The edit gate.** `updateRecord` and `deleteRecord` refuse any row whose `kaynak !== 'manual'`:

```ts
if (!opts.allowImported && arr[idx].kaynak !== 'manual')
  throw new Error('Sadece manuel kayıtlar düzenlenebilir.')
```

Every personal row written by the bot carries `kaynak: 'telegram'`, so with the gate as it stands **not one personal record would be editable**. The fix is a new option, not a widened default:

```ts
export type MutateOpts = { allowImported?: boolean; allowKaynak?: string[] }
// default ['manual'] — the investment side's behaviour and messages are untouched
```

The personal pages pass `allowKaynak: ['telegram', 'manual']`. The `allowImported` escape hatch and its warning keep their present meaning for the Log page.

**The writable file list.** The `Kind` type that `writeAndCommit` accepts grows to include the six personal names. `LocalFileSource` still has no `save`, so editing is a Drive-connected feature; in local dev the controls render disabled with a plain explanation rather than failing on click.

**Conflict on write.** When `DriveSource.save` raises `ConflictError` (someone else changed the file since it was read), the page reloads the dataset and asks Enis to redo the edit — the same treatment the investment forms already give.

---

## 5. What editing means, per page

**Harcamalar** — add a record (a form mirroring `NakitHareketiFormu`'s shape: date, direction, amount, currency, category, account, owner, description), edit any field of an existing row, delete a row. An instalment row (`taksitPlaniId !== null`) may have its amount, date and description corrected but cannot be unlinked from its plan; that guard is enforced in the form, not left to the user.

**Taksitler** — cancel a whole plan. Cancelling removes the plan row and **every one of its instalment rows dated after today**, leaving the already-paid past intact, and is confirmed with an explicit count ("3 gelecek taksit silinecek"). Individual instalments are corrected on Harcamalar.

**Borçlar** — edit an open debt's amount or description, mark it closed, or delete it. Closing sets `durum: 'KAPALI'` rather than removing the row, so the history survives.

**Özet** stays read-only.

New rows written from the app carry `kaynak: 'manual'` — matching what the PWA already writes elsewhere, and letting Enis tell at a glance which records came from the phone form rather than from a Telegram message.

---

## 6. Failure modes

| What happens | What Enis sees |
|---|---|
| Not connected to Drive (local dev) | Controls disabled with "Düzenleme için Drive bağlantısı gerekiyor" |
| `ConflictError` on save | "Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?" |
| Drive token expired | The existing re-auth prompt, unchanged |
| Merge found a conflict | One Telegram DM per cycle listing what was overridden (§3.3) |
| rclone fails during a cycle | The existing 3-strike Telegram alert, unchanged; no merge is written |

The merge never runs on a failed pull — a missing staged file means "we could not see the remote side", and the cycle aborts rather than guessing.

---

## 7. Testing

**Bot.** The extracted `merge_rows(base, ours, theirs)` gets a table test covering all nine rows of §3.2, plus the no-base case. `reverse_import_from_bbb`'s existing tests must pass unchanged after the refactor — that is the proof the extraction was behaviour-preserving. The staged-pull flow is tested with a fake rclone that writes fixtures into the staging directory: a remote-only add arrives; a local-only add survives; a genuine conflict resolves remote-wins and is reported; a failed pull writes nothing.

**App.** `updateRecord`/`deleteRecord` accept a `telegram` row when `allowKaynak` includes it and still refuse it by default; the personal file names are writable; a `ConflictError` surfaces the reload message; the Harcamalar form validates amount, date and required fields; cancelling a plan removes exactly the future rows; closing a debt sets `durum` without deleting.

---

## 8. Out of scope

Layer D (PDF statements). Editing from the bot beyond what it already does. A shared undo across the two writers — the bot's undo stays session-local and the app's edits are corrected by editing again. Real-time updates: the page still shows what it loaded, and a refresh is how you see the bot's newest rows.
