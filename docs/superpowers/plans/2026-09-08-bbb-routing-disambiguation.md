# Trade vs. Personal — Routing Disambiguation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop the trade parser from swallowing everyday purchase sentences, without letting the personal ledger swallow real trades.

## The bug, as observed live

Enis sent `dün 3000 TL'ye altı taksit ile bisiklet aldım`. The bot replied as if he were buying a stock:

```
Anlaşılanlar: Alış · 3,000 adet · LIRALIK BISIKLET ALTI TAKSITE BOLDUM · 2026-09-07
• Birim fiyat kaç?
```

It then held that trade conversation open, so every following message was read as an answer to it.

Root cause, confirmed by running the parser directly:

```
analyze_trade_message("dun 3000 TL ye alti taksit ile bisiklet aldim")
  → is_trade_attempt=True, enstruman='YE ALTI TAKSIT BISIKLET', missing=['fiyat']
analyze_trade_message("eczaneden ilac aldim 450")
  → is_trade_attempt=True, enstruman='ECZANEDEN ILAC', missing=['fiyat']
```

`analyze_trade_message` claims **any** sentence with a buy/sell verb and a number, even when the instrument is unrecognised text. That was harmless while the trade flow was the only consumer of free text. It stopped being harmless when the personal ledger was placed strictly after it (spec §4.1) — a deliberate choice to protect the trade flow, which turns out to protect it too well. `aldım` is the commonest Turkish word for an everyday purchase.

**Why the obvious fix is wrong.** Simply running the personal rules first breaks the other direction, also confirmed by measurement:

```
analyze_personal_message("100 lot migros 500 den aldim") → kategori='market', tutar=500.0
```

`migros` is a market keyword *and* `MIGROS` normalises to the real BIST ticker `MGROS`. Personal-first would book a genuine share purchase as groceries. Neither parser can be trusted alone; the routing has to weigh both.

## The routing rule

In `on_text_message`, replace the current "trade, then correction, then personal" chain with an explicit decision, evaluated in order:

1. **Known instrument ⇒ trade.** If the trade parse yields an instrument that resolves to a code the system already knows (`instruments.json` plus `KNOWN_ALIASES`), it is a trade. `MIGROS → MGROS`, `ASELSAN → ASELS`. This branch protects every real trade, including the keyword collisions.
2. **Unknown instrument, trade-shaped ⇒ trade.** If the instrument is unrecognised but the sentence *looks* like a trade — it contains `adet` or `lot`, or it carries **two or more** numbers that are not a date and not an instalment count — treat it as a trade and ask, exactly as today. This keeps "10 adet yenihisse 45 den aldım" working for a stock not yet in the file.
3. **Otherwise ⇒ personal ledger.** One number, no quantity word: `bisiklet aldım 3000 TL`, `eczaneden ilaç aldım 450`. The personal flow then runs its normal rules-first path.
4. If the personal flow also declines, fall through to the correction handler and finally the existing help text, unchanged.

Checked against the real cases:

| Message | Instrument | Shape | Route |
|---|---|---|---|
| `10 adet aselsan 221 den aldım` | ASELS known | — | trade |
| `100 lot migros 500 den aldım` | MGROS known | — | trade |
| `10 adet yenihisse 45 den aldım` | unknown | `adet` + 2 numbers | trade |
| `dün 3000 TL'ye altı taksit ile bisiklet aldım` | unknown | 1 number | **personal** |
| `eczaneden ilaç aldım 450` | unknown | 1 number | **personal** |
| `markette 340 lira` | not a trade attempt | — | personal |

**Spec §4.1 is amended by this plan.** The old rule — "the personal flow attaches strictly after the deterministic trade parser" — is replaced by the four-step decision above. The property it was protecting still holds and is still tested: **a message naming a known instrument always goes to the trade flow, and Qwen never sees it.**

**Tech Stack:** existing modules only. `src/nlp/aliases.py` (`normalize_instrument`, `KNOWN_ALIASES`), `src/nlp/parser.py`, `src/nlp/personal_parser.py`.

**Working directory:** `~/Desktop/Market/BBB/bbb-telegram-bot`, `main` @ `9113789`, 342 tests green.

## Global Constraints

- All 342 existing tests stay green. Do not weaken an assertion to make a change pass.
- **No real trade may ever reach the personal ledger.** Task 2's table is the regression suite for this.
- The LLM still computes nothing, and still never sees a message naming a known instrument.
- Turkish user-facing strings, plain text.
- Each task is its own TDD cycle and commit.

---

### Task 1: Know whether an instrument is real

**Files:** Modify `src/nlp/aliases.py`. Test: `tests/test_personal_routing.py`.

**Interfaces:**
- Produces: `is_known_instrument(raw: str, known_codes: set[str] | None = None) -> bool`. True when `normalize_instrument(raw)` is in `KNOWN_ALIASES`' values, or in `known_codes` when supplied (the caller passes the codes from `instruments.json`).

- [ ] **Step 1: Write the failing test**

```python
from src.nlp.aliases import is_known_instrument


def test_recognises_a_known_ticker_and_its_alias():
    assert is_known_instrument("ASELSAN") is True
    assert is_known_instrument("ASELS") is True
    assert is_known_instrument("MIGROS") is True


def test_rejects_everyday_words():
    assert is_known_instrument("BISIKLET") is False
    assert is_known_instrument("ECZANEDEN ILAC") is False
    assert is_known_instrument("YE ALTI TAKSIT BISIKLET") is False
    assert is_known_instrument("") is False


def test_extra_codes_from_the_instruments_file_are_honoured():
    assert is_known_instrument("YENIHISSE", known_codes={"YENIHISSE"}) is True
    assert is_known_instrument("YENIHISSE") is False
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Normalise, then test membership. Treat empty/whitespace as False. Do not change `normalize_instrument`'s behaviour.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: is_known_instrument for routing decisions"`

---

### Task 2: The routing decision

**Files:** Create `src/bot/routing.py`. Test: `tests/test_personal_routing.py`.

**Interfaces:**
- Produces: `decide_route(text: str, trade_parse, ctx: dict, known_codes: set[str]) -> str`, returning `"trade"` | `"personal"` | `"none"`.
- `"none"` means neither parser wants it; the caller then tries the correction handler and the help text.

- [ ] **Step 1: Write the failing test** — this table is the regression suite; keep it intact.

```python
import pytest

from src.bot.routing import decide_route
from src.nlp.parser import analyze_trade_message
from src.data.personal_seed import SEED_ACCOUNTS, SEED_CATEGORIES, SEED_PEOPLE

CTX = {"kategoriler": SEED_CATEGORIES, "hesaplar": SEED_ACCOUNTS,
       "kisiler": SEED_PEOPLE, "bugun": "2026-09-08", "varsayilanSahip": "ENIS"}
KNOWN = {"ASELS", "MGROS", "TUPRS"}


def _route(text):
    return decide_route(text, analyze_trade_message(text), CTX, KNOWN)


@pytest.mark.parametrize("text", [
    "10 adet aselsan 221 den aldim",
    "100 lot migros 500 den aldim",
    "50 adet tuprs 140 aldim",
    "1 eylul 2026 midas a1cap 9042 adet 7,87 alis",
    "10 adet yenihisse 45 den aldim",
])
def test_trades_stay_on_the_trade_flow(text):
    assert _route(text) == "trade"


@pytest.mark.parametrize("text", [
    "dun 3000 TL ye alti taksit ile bisiklet aldim",
    "eczaneden ilac aldim 450",
    "markette 340 lira",
    "kira 25000 odedim",
    "yemek 1.250,50 tl",
    "netflix 200 tl aldim",
])
def test_everyday_purchases_go_to_the_personal_ledger(text):
    assert _route(text) == "personal"


def test_a_known_instrument_beats_a_category_keyword():
    """MIGROS is a real ticker AND 'migros' is a market keyword."""
    assert _route("100 lot migros 500 den aldim") == "trade"


def test_nonsense_is_routed_nowhere():
    assert _route("bugun hava guzel") == "none"


def test_an_instalment_count_is_not_a_second_number():
    # 'alti taksit' is a count in words; '6 taksit' in digits must not make
    # the sentence look trade-shaped either.
    assert _route("bisiklet aldim 3000 tl 6 taksit") == "personal"
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement** the four-step rule. For "two or more numbers", count numeric tokens in the normalised text after removing any date span consumed by `resolve_turkish_date` and any `\d+\s*taksit` span. Quantity words are `adet` and `lot`.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: explicit trade-vs-personal routing decision"`

---

### Task 3: Wire the decision into the bot

**Files:** Modify `src/bot/main.py`. Test: `tests/test_personal_routing.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_a_purchase_sentence_no_longer_reaches_the_trade_flow(spies):
    u = FakeUpdate("dun 3000 TL ye alti taksit ile bisiklet aldim")
    await bot_main.on_text_message(u, FakeContext())
    assert spies["trade"] == 0, "this is a bicycle, not a stock"
    assert spies["personal"] == 1


@pytest.mark.asyncio
async def test_a_real_trade_still_reaches_the_trade_flow(spies):
    spies["_trade_handles"] = True
    u = FakeUpdate("10 adet aselsan 221 den aldim")
    await bot_main.on_text_message(u, FakeContext())
    assert spies["trade"] == 1
    assert spies["personal"] == 0
```

Keep every existing test in this module passing — in particular the one asserting Qwen never sees a trade.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Build `ctx` and `known_codes` once (cache the codes; reload when `instruments.json` changes or simply per message — the file is small). Call `decide_route`, then dispatch. Preserve the existing behaviour that an in-progress trade conversation (a pending draft in `user_data`) keeps priority over any routing decision — **check that first**, before `decide_route`, so an open conversation is never hijacked mid-answer.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: route each message by explicit decision, not by parser order"`

---

### Task 4: Turkish number words for instalments

`altı taksit` is how people write it. R4 currently only matches digits.

**Files:** Modify `src/nlp/personal_parser.py`. Test: `tests/test_personal_parser.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.parametrize("text,n", [
    ("bisiklet aldim 3000 tl alti taksit", 6),
    ("üç taksit yaptim 900 tl", 3),
    ("on iki taksit 12000 tl", 12),
    ("iki taksit 500", 2),
    ("bir taksit 500", None),
    ("markette 340 lira", None),
])
def test_instalment_count_written_in_words(text, n):
    assert extract_instalments(text) == n
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** A `NUMBER_WORDS` map covering `iki, uc, dort, bes, alti, yedi, sekiz, dokuz, on, on iki, oniki, yirmi dort, yirmidort, otuz alti` (normalised, so `üç` arrives as `uc`). Match `(<word>|\d+)\s*taksit`; keep the `2..36` range check.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: accept instalment counts written in Turkish words"`

---

### Task 5: A visible way out

Enis's report: *"iptal seçeneği yok, her mesajımda aynı mesaj geliyor."* The trade flow's missing-field prompt only mentions typing `iptal` in the help text, and the personal flow's missing-field question has no cancel button either. A user stuck in a conversation must be able to leave it with one tap.

**Files:** Modify `src/bot/handlers/personal_flow.py`, `src/bot/handlers/trade_flow.py`. Test: `tests/test_personal_flow.py`, `tests/test_trade_flow.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_the_missing_field_question_offers_a_cancel_button(repo, monkeypatch):
    _qwen(monkeypatch, None)
    u, c = FakeUpdate("filanca yerde 200 lira"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    markup = u.message.replies[-1][1].get("reply_markup")
    labels = [b.text for row in markup.inline_keyboard for b in row]
    assert any("ptal" in l for l in labels)


@pytest.mark.asyncio
async def test_cancelling_from_the_question_clears_the_draft(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 200.0,
                                     "paraBirimi": "TRY", "kategori": None,
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-08", "taksitSayisi": None,
                                     "aciklama": "x", "uyarilar": []}
    await personal_flow.handle_personal_callbacks(FakeCallbackUpdate("pf:cancel"), c)
    assert "personal_draft" not in c.user_data
```

For the trade flow, add an equivalent test asserting the missing-field prompt text names `iptal` explicitly on its own line.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Add `❌ İptal` to the personal flow's missing-field keyboard. In the trade flow's missing-field prompt, append a plain line: `İptal etmek için: iptal`. Do not restructure the trade flow beyond that one line.

- [ ] **Step 4: Full suite green.** Commit: `git commit -m "feat: a visible way out of both entry conversations"`

---

### Closing

- [ ] Run the whole suite and record the count.
- [ ] Re-confirm the load-bearing properties: no trade reaches Qwen or the personal ledger (Task 2 + 3 tables); the `--update` pull asymmetry; the investment-files write guard.
- [ ] Report what changed, the test count, decisions you made alone, and anything skipped.

**Deployment is not part of this task.** The controller deploys. Note for it: the VM copy is not a git repo; it is updated by rsync with `--exclude '/data/'` — **anchored with the leading slash**, because an unanchored `data/` also matches `src/data/` and silently drops modules.

**Do not pick up without asking:** single-lock read-modify-write; undo-button staleness; the httpx logger printing the Telegram token; remaining low-frequency keyword collisions.
