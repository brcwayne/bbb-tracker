# Personal Ledger — Rules-First Parsing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make everyday expense entry deterministic and instant. A Turkish keyword pass runs *before* Qwen and, for common sentences, answers completely on its own — so the LLM is never consulted, nothing can be misclassified, and the reply is immediate.

**Why:** measured on the deployed bot (2026-09-08, `qwen2.5:7b` on the 4-core ARM VM, CPU-only):

| Message | Qwen's answer | Correct? |
|---|---|---|
| `markette 340 lira` | GELIR, no category | **wrong direction, no category** |
| `dun benzin 1200 tl` | GIDER, `yakit` | right |
| `maas geldi 85000` | GELIR, `maas` | right |
| `beyaz esya 12000 tl 6 taksit` | GELIR, no category | **wrong direction, no category** |

Half wrong on direction, half missing the category, at 13.7 s per call. A 7B model on CPU is not a dependable Turkish classifier, and the fix is not a bigger model — it is to stop asking it questions the code can answer. The trade parser already works this way and does not misread anything.

**Architecture:** `analyze_personal_message()` (new, pure, deterministic) extracts amount, currency, category, direction, date, instalment count, and account from the raw text. If it found an amount **and** a category, the flow skips Qwen entirely. Otherwise Qwen fills only the still-unknown fields, and **the rules win every conflict**. A consequence worth having: with Ollama down, common expenses still record.

**Tech Stack:** Python 3, existing helpers only — `src/nlp/aliases.py::normalize_turkish_str`, `src/nlp/parser.py::_clean_number`, `src/nlp/dates.py::resolve_turkish_date`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-bbb-personal-ledger-ab-design.md` — §4.2/§4.3 are amended by this plan; everything else stands.

**Working directory:** `~/Desktop/Market/BBB/bbb-telegram-bot`, branch `main` @ `ceb096d` (276 tests green). Run `./.venv/bin/python -m pytest`.

## Global Constraints

- All 276 existing tests stay green. Never weaken an assertion to make a change pass.
- **The trade flow is untouched.** This code runs only where `handle_personal_text_message` already runs — after the deterministic trade parser and the correction handler both decline.
- **Rules beat the LLM, always.** Where a rule produced a value, Qwen's value for that field is discarded, not merged.
- **The LLM still computes nothing.** Amounts, dates, splits and ids stay in Python.
- Turkish user-facing strings, plain text (no Markdown).
- Every keyword is stored **already normalised** (lowercase, no Turkish diacritics) so matching never has to normalise the table at runtime.
- Live data is never touched by tests; keep using `tmp_path` fixtures.
- Each task is its own TDD cycle and its own commit.

---

## The rules

### R1 — Amount and currency

Scan the normalised text for a number followed (within one token) by a currency word, or a bare number.

- Currency: `tl`, `lira`, `try`, `₺` → `TRY`. `dolar`, `usd`, `$` → `USD`. Nothing → `TRY` (default).
- Numbers are parsed with the existing `_clean_number`, which already handles `1.250,50`, `12.000` and `340`.
- **Ignore a number that is immediately followed by `taksit`** — `6 taksit` is a count, not an amount.
- Ignore numbers that are part of a date already consumed by `resolve_turkish_date`.
- If several candidate amounts remain, take the **largest** — in `beyaz esya 12000 tl 6 taksit` the amount is 12000, not 6.
- **No amount ⇒ the rules claim nothing.** A message with no number is not a ledger entry.

### R2 — Category, by longest keyword match

The message is split into tokens. A keyword matches a token when:

- the keyword is **4 characters or longer** and the token *starts with* it (this is what absorbs Turkish suffixes: `markette`, `marketten`, `markete` all match `market`); or
- the keyword is **shorter than 4 characters** and the token equals it exactly.

**When several keywords match, the longest keyword wins.** That single rule resolves the real collisions: `telefon faturasi` → `fatura` beats `telefon` → `teknoloji`.

Ambiguous words are deliberately **excluded** from the table rather than guessed:
- `metro` — both a supermarket chain and public transport. Excluded; `metrobus` is kept.
- `firin` — both a bakery and an oven. Excluded; `pastane` is kept.

### R3 — Direction

1. If a category matched, the direction is that category's `tur` (from `categories.json`) — so `maas` implies `GELIR`, `market` implies `GIDER`.
2. Otherwise, if an income verb is present (`geldi`, `yatti`, `yattı`, `girdi`, `kazandim`, `odendi`), direction is `GELIR`.
3. Otherwise **`GIDER`**. Expenses are the overwhelming majority; defaulting there is right far more often than not, and the confirmation card shows the direction before anything is saved.

### R4 — Instalments

`(\d+)\s*taksit` → that many instalments, accepted only in `2..36`. Everything else about instalments (the split, the dates) stays in `personal_rules.py` exactly as it is.

### R5 — Date

Delegate to the existing `resolve_turkish_date`. No new date logic.

### R6 — Account

Match an active account's `ad` or `kod` from `personal_accounts.json`, normalised, by the same longest-match rule as R2. No match leaves it unset — `missing_fields` then either silently fills it (one account) or asks.

### R7 — When Qwen is called

Only when the rules found an amount but **no category**. In that case Qwen is asked, and its `kategori` and `tur` are used **only if the rules left them unset**. If the rules found a category, Qwen is not called at all.

If the rules found nothing (no amount) the flow asks Qwen once anyway — that is the path for phrasings no keyword covers — and if Qwen also returns nothing, the flow declines and the user sees the existing help text.

### The keyword table

Stored in `src/nlp/personal_keywords.py` as `CATEGORY_KEYWORDS: dict[str, tuple[str, ...]]`, keyed by the `kod` in `categories.json`. All entries are pre-normalised ASCII.

```
market       market, migros, bim, a101, sok, bakkal, manav, kasap, sarkuteri,
             carrefour, macrocenter, tarim kredi, carsi
yeme-icme    restoran, lokanta, kafe, kahve, starbucks, yemek, yemeksepeti,
             getir, doner, pizza, burger, tost, simit, pastane, borek, kebap,
             bar, meyhane, cay
ulasim       otobus, metrobus, marmaray, taksi, uber, bitaksi, dolmus,
             istanbulkart, otopark, hgs, ogs, kopru, bilet, tren, ucak,
             feribot, vapur
yakit        benzin, mazot, motorin, dizel, yakit, petrol, opet, shell,
             aytemiz, lpg
fatura       fatura, elektrik, dogalgaz, internet, aidat, turkcell, vodafone,
             turk telekom, superonline, telefon faturasi, su faturasi
kira         kira
saglik       eczane, ilac, doktor, hastane, muayene, dis hekimi, tahlil,
             gozluk, lens, psikolog, asi, ameliyat
giyim        giyim, kiyafet, ayakkabi, tisort, pantolon, gomlek, elbise, mont,
             zara, defacto, koton, bershka, mavi jeans
ev           mobilya, beyaz esya, buzdolabi, camasir makinesi, bulasik makinesi,
             koltuk, yatak, ikea, madame coco, english home, deterjan,
             temizlik, hali, perde
teknoloji    bilgisayar, laptop, tablet, kulaklik, klavye, monitor, teknosa,
             vatan bilgisayar, mediamarkt, iphone, telefon, sarj aleti
eglence      sinema, tiyatro, konser, oyun, bowling, tatil, otel, muze,
             mac bileti
egitim       kurs, okul, universite, harc, kitap, ozel ders, sinav, udemy, ders
abonelik     abonelik, netflix, spotify, youtube premium, amazon prime, disney,
             icloud, google one, chatgpt, adobe, spor salonu, uyelik
hediye       hediye, dogum gunu, cicek, yilbasi
maas         maas, bordro, ucret
ek-gelir     prim, ikramiye, freelance, ek is, kira geliri, faiz
diger-gelir  iade, geri odeme
```

`diger` intentionally has no keywords — it is only ever chosen by the user from the keyboard.

---

### Task 1: The keyword table and matcher

**Files:** Create `src/nlp/personal_keywords.py`. Test: `tests/test_personal_keywords.py`.

**Interfaces:**
- Produces: `CATEGORY_KEYWORDS: dict[str, tuple[str, ...]]`; `INCOME_VERBS: tuple[str, ...]`; `match_category(text: str) -> str | None`; `match_from(text: str, options: dict[str, str]) -> str | None` (generic longest-match used again for accounts in Task 4).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_keywords.py
"""Deterministic Turkish keyword matching for the personal ledger."""
import pytest

from src.nlp.personal_keywords import CATEGORY_KEYWORDS, match_category, match_from


@pytest.mark.parametrize("text,expected", [
    ("markette 340 lira", "market"),
    ("marketten aldim", "market"),
    ("markete gittim", "market"),
    ("migros 250", "market"),
    ("dun benzin 1200 tl", "yakit"),
    ("shell 900", "yakit"),
    ("eczaneden ilac 300", "saglik"),
    ("kira 25000", "kira"),
    ("netflix 200", "abonelik"),
    ("maas geldi 85000", "maas"),
    ("beyaz esya 12000", "ev"),
    ("sinema bileti 400", "eglence"),
])
def test_matches_the_expected_category(text, expected):
    assert match_category(text) == expected


def test_longest_keyword_wins_over_a_shorter_one():
    # 'telefon faturasi' (fatura) must beat 'telefon' (teknoloji)
    assert match_category("telefon faturasi 450 tl") == "fatura"
    assert match_category("telefon aldim 30000") == "teknoloji"


def test_no_keyword_returns_none():
    assert match_category("filanca yerde 200 lira") is None


def test_ambiguous_words_are_deliberately_absent():
    flat = {k for kws in CATEGORY_KEYWORDS.values() for k in kws}
    assert "metro" not in flat, "ambiguous: supermarket vs transport"
    assert "firin" not in flat, "ambiguous: bakery vs oven"


def test_every_keyword_is_stored_already_normalised():
    for kws in CATEGORY_KEYWORDS.values():
        for k in kws:
            assert k == k.lower()
            assert not (set(k) & set("çğıöşüÇĞİÖŞÜ")), f"{k!r} must be ASCII-normalised"


def test_short_keywords_need_an_exact_token():
    # 'sok' (the chain) must not match 'sokakta'
    assert match_category("sokakta 50 lira buldum") != "market"
    assert match_category("sok 120 lira") == "market"


def test_match_from_picks_the_longest_option():
    opts = {"nakit": "NAKIT", "garanti bonus": "GARANTI-BONUS", "garanti": "GARANTI"}
    assert match_from("garanti bonus ile 340", opts) == "GARANTI-BONUS"
    assert match_from("nakit verdim", opts) == "NAKIT"
    assert match_from("hicbiri yok", opts) is None
```

- [ ] **Step 2: Run it and watch it fail.** `./.venv/bin/python -m pytest tests/test_personal_keywords.py -v`

- [ ] **Step 3: Implement.** Write the table exactly as listed under "The keyword table" above. Then:

```python
from .aliases import normalize_turkish_str

MIN_PREFIX_LEN = 4


def _matches(keyword: str, norm_text: str) -> bool:
    """Multi-word keywords match as a substring; single words match a token,
    by prefix when long enough (Turkish suffixes) or exactly when short."""
    if " " in keyword:
        return keyword in norm_text
    for token in norm_text.split():
        if len(keyword) >= MIN_PREFIX_LEN:
            if token.startswith(keyword):
                return True
        elif token == keyword:
            return True
    return False


def match_from(text: str, options: dict[str, str]) -> str | None:
    """options maps an already-normalised phrase -> the value to return.
    The longest matching phrase wins."""
    norm = normalize_turkish_str(text)
    best_key, best_val = "", None
    for phrase, value in options.items():
        if _matches(phrase, norm) and len(phrase) > len(best_key):
            best_key, best_val = phrase, value
    return best_val


def match_category(text: str) -> str | None:
    options = {kw: kod for kod, kws in CATEGORY_KEYWORDS.items() for kw in kws}
    return match_from(text, options)
```

- [ ] **Step 4: Tests pass.** Then commit: `git commit -m "feat: Turkish keyword table and longest-match matcher"`

---

### Task 2: Amount, currency and instalment extraction

**Files:** Create `src/nlp/personal_parser.py`. Modify `src/nlp/parser.py` (rename `_clean_number` → public `clean_number`, keep `_clean_number = clean_number` as an alias so nothing else breaks). Test: `tests/test_personal_parser.py`.

**Interfaces:**
- Produces: `extract_amount(text: str) -> tuple[float | None, str]` returning `(amount, currency)`; `extract_instalments(text: str) -> int | None`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_parser.py
"""Deterministic amount / currency / instalment extraction."""
import pytest

from src.nlp.personal_parser import extract_amount, extract_instalments


@pytest.mark.parametrize("text,amount,cur", [
    ("markette 340 lira", 340.0, "TRY"),
    ("markette 340 tl", 340.0, "TRY"),
    ("markette 340", 340.0, "TRY"),
    ("340₺ market", 340.0, "TRY"),
    ("20 dolar abonelik", 20.0, "USD"),
    ("20 usd", 20.0, "USD"),
    ("kira 25.000 tl", 25000.0, "TRY"),
    ("yemek 1.250,50 tl", 1250.5, "TRY"),
    ("teknoloji 12000,75", 12000.75, "TRY"),
])
def test_extracts_amount_and_currency(text, amount, cur):
    assert extract_amount(text) == (amount, cur)


def test_no_number_means_no_amount():
    assert extract_amount("markette harcadim") == (None, "TRY")


def test_instalment_count_is_not_mistaken_for_the_amount():
    assert extract_amount("beyaz esya 12000 tl 6 taksit")[0] == 12000.0


def test_the_largest_candidate_wins():
    assert extract_amount("3 paket 450 lira")[0] == 450.0


@pytest.mark.parametrize("text,n", [
    ("beyaz esya 12000 tl 6 taksit", 6),
    ("12 taksit yaptim", 12),
    ("3taksit", 3),
    ("markette 340 lira", None),
    ("1 taksit", None),
    ("99 taksit", None),
])
def test_extracts_instalment_count(text, n):
    assert extract_instalments(text) == n
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Normalise the text, drop `\d+\s*taksit` spans before hunting for the amount, find number-like tokens with a regex that accepts `.`/`,` groupings, run each through `clean_number`, take the largest. Currency comes from the first currency word found anywhere in the text, defaulting to `TRY`.

- [ ] **Step 4: Tests pass, full suite green.** Commit: `git commit -m "feat: deterministic amount, currency and instalment extraction"`

---

### Task 3: The deterministic first pass

**Files:** Modify `src/nlp/personal_parser.py`. Test: `tests/test_personal_parser.py`.

**Interfaces:**
- Produces: `analyze_personal_message(text: str, ctx: dict) -> RuleParse`, a dataclass with the same field names as `PersonalParse` (`tur`, `tutar`, `paraBirimi`, `kategori`, `hesap`, `sahip`, `tarih`, `taksitSayisi`, `aciklama`, `uyarilar`) plus `needs_llm: bool`.
- `needs_llm` is `True` when `kategori` is unset. `tur` follows R3. `tarih` uses `resolve_turkish_date`. `aciklama` is the original text, trimmed to 80 chars.

- [ ] **Step 1: Write the failing test** — the four real-world failures are the headline cases:

```python
import datetime as dt

from src.nlp.personal_parser import analyze_personal_message

CTX = {
    "kategoriler": [
        {"kod": "market", "ad": "Market", "tur": "GIDER", "aktif": True},
        {"kod": "yakit", "ad": "Yakıt", "tur": "GIDER", "aktif": True},
        {"kod": "ev", "ad": "Ev & eşya", "tur": "GIDER", "aktif": True},
        {"kod": "maas", "ad": "Maaş", "tur": "GELIR", "aktif": True},
    ],
    "hesaplar": [{"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "aktif": True}],
    "kisiler": [{"kod": "ENIS", "ad": "Enis", "haneUyesi": True, "aktif": True}],
    "bugun": "2026-09-08", "varsayilanSahip": "ENIS",
}


def test_the_four_failures_that_motivated_this_plan():
    a = analyze_personal_message("markette 340 lira", CTX)
    assert (a.tur, a.tutar, a.kategori, a.needs_llm) == ("GIDER", 340.0, "market", False)

    b = analyze_personal_message("dun benzin 1200 tl", CTX)
    assert (b.tur, b.tutar, b.kategori) == ("GIDER", 1200.0, "yakit")
    assert b.tarih == "2026-09-07"

    c = analyze_personal_message("maas geldi 85000", CTX)
    assert (c.tur, c.tutar, c.kategori) == ("GELIR", 85000.0, "maas")

    d = analyze_personal_message("beyaz esya 12000 tl 6 taksit", CTX)
    assert (d.tur, d.tutar, d.kategori, d.taksitSayisi) == ("GIDER", 12000.0, "ev", 6)


def test_unknown_category_asks_for_the_llm():
    a = analyze_personal_message("filanca yerde 200 lira", CTX)
    assert a.tutar == 200.0
    assert a.kategori is None
    assert a.needs_llm is True
    assert a.tur == "GIDER", "unknown direction defaults to expense"


def test_income_verb_flips_the_direction_without_a_category():
    a = analyze_personal_message("filancadan 5000 geldi", CTX)
    assert a.tur == "GELIR"


def test_no_amount_is_not_a_ledger_entry():
    a = analyze_personal_message("bugun hava guzel", CTX)
    assert a.tutar is None and a.kategori is None and a.needs_llm is True


def test_date_defaults_to_today():
    assert analyze_personal_message("markette 340", CTX).tarih == "2026-09-08"


def test_description_keeps_the_original_text():
    assert "market" in analyze_personal_message("markette 340 lira", CTX).aciklama.lower()
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement** per R1–R6, deriving `tur` from the matched category's `tur` in `ctx["kategoriler"]`.

- [ ] **Step 4: Tests pass.** Commit: `git commit -m "feat: deterministic first-pass parser for the personal ledger"`

---

### Task 4: Account matching from the rules

**Files:** Modify `src/nlp/personal_parser.py`. Test: `tests/test_personal_parser.py`.

- [ ] **Step 1: Write the failing test**

```python
CTX_ACCOUNTS = dict(CTX, hesaplar=[
    {"kod": "NAKIT", "ad": "Nakit", "tur": "NAKIT", "aktif": True},
    {"kod": "GARANTI-BONUS", "ad": "Garanti Bonus", "tur": "KREDI_KARTI", "aktif": True},
])


def test_account_is_matched_by_name():
    a = analyze_personal_message("markette 340 garanti bonus ile", CTX_ACCOUNTS)
    assert a.hesap == "GARANTI-BONUS"


def test_account_is_matched_by_code():
    assert analyze_personal_message("markette 340 nakit", CTX_ACCOUNTS).hesap == "NAKIT"


def test_no_account_mentioned_leaves_it_unset():
    assert analyze_personal_message("markette 340", CTX_ACCOUNTS).hesap is None


def test_inactive_accounts_are_not_matched():
    ctx = dict(CTX_ACCOUNTS, hesaplar=[
        {"kod": "ESKI-KART", "ad": "Eski Kart", "tur": "KREDI_KARTI", "aktif": False}])
    assert analyze_personal_message("eski kart ile 340", ctx).hesap is None
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement** using `match_from` over `{normalize(ad): kod, normalize(kod): kod}` for active accounts only.

- [ ] **Step 4: Tests pass.** Commit: `git commit -m "feat: match the payment account from the message"`

---

### Task 5: Wire rules ahead of Qwen

**Files:** Modify `src/bot/handlers/personal_flow.py`. Test: `tests/test_personal_flow.py`.

**Interfaces:**
- Produces: `merge_parses(rule, llm) -> dict` — builds the draft; for every field the rule's value wins whenever it is set.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_a_rule_covered_message_never_calls_qwen(repo, monkeypatch):
    called = []
    monkeypatch.setattr(personal_flow, "parse_personal_message",
                        lambda t, c: called.append(t))
    u, c = FakeUpdate("markette 340 lira"), FakeContext()
    assert await personal_flow.handle_personal_text_message(u, c) is True
    assert called == [], "the rules answered; Qwen must not be consulted"
    d = c.user_data["personal_draft"]
    assert (d["tur"], d["tutar"], d["kategori"]) == ("GIDER", 340.0, "market")


@pytest.mark.asyncio
async def test_an_uncovered_message_does_call_qwen(repo, monkeypatch):
    called = []

    def fake(t, ctx):
        called.append(t)
        return PersonalParse(tur="GIDER", tutar=200.0, paraBirimi="TRY",
                             kategori="eglence", hesap="NAKIT", sahip="ENIS",
                             aciklama="filanca")

    monkeypatch.setattr(personal_flow, "parse_personal_message", fake)
    u, c = FakeUpdate("filanca yerde 200 lira"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    assert called, "no keyword matched, so Qwen should have been asked"
    assert c.user_data["personal_draft"]["kategori"] == "eglence"


@pytest.mark.asyncio
async def test_the_rules_override_a_disagreeing_qwen(repo, monkeypatch):
    """Qwen said GELIR for a grocery expense — exactly the observed failure."""
    monkeypatch.setattr(personal_flow, "parse_personal_message",
                        lambda t, c: PersonalParse(tur="GELIR", tutar=999.0,
                                                   kategori="maas", aciklama="x"))
    u, c = FakeUpdate("markette 340 lira"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    d = c.user_data["personal_draft"]
    assert d["tur"] == "GIDER" and d["kategori"] == "market" and d["tutar"] == 340.0


@pytest.mark.asyncio
async def test_qwen_being_down_still_records_a_rule_covered_expense(repo, monkeypatch):
    monkeypatch.setattr(personal_flow, "parse_personal_message", lambda t, c: None)
    u, c = FakeUpdate("dun benzin 1200 tl"), FakeContext()
    assert await personal_flow.handle_personal_text_message(u, c) is True


@pytest.mark.asyncio
async def test_nonsense_is_still_declined(repo, monkeypatch):
    monkeypatch.setattr(personal_flow, "parse_personal_message", lambda t, c: None)
    u, c = FakeUpdate("bugun hava guzel"), FakeContext()
    assert await personal_flow.handle_personal_text_message(u, c) is False
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** At the top of `handle_personal_text_message`, call `analyze_personal_message(text, ctx)`. If `needs_llm` is False, build the draft from the rules alone. Otherwise call `parse_personal_message` and `merge_parses(rule, llm)`, rule-wins. Keep every existing behaviour after that point (missing-field question, confirm card, save) unchanged.

- [ ] **Step 4: Tests pass, full suite green.** Commit: `git commit -m "feat: run the deterministic rules before Qwen, rules win conflicts"`

---

### Task 6: Tell the user when Qwen is thinking

A Qwen call takes 14–60 s on this VM. Right now the user sees nothing at all during that time.

**Files:** Modify `src/bot/handlers/personal_flow.py`, `src/ai/qwen_service.py`. Test: `tests/test_personal_flow.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_a_wait_notice_is_sent_before_a_slow_qwen_call(repo, monkeypatch):
    monkeypatch.setattr(personal_flow, "parse_personal_message",
                        lambda t, c: PersonalParse(tur="GIDER", tutar=200.0,
                                                   paraBirimi="TRY", kategori="eglence",
                                                   hesap="NAKIT", sahip="ENIS",
                                                   aciklama="x"))
    u, c = FakeUpdate("filanca yerde 200 lira"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    assert any("düşün" in r[0].lower() or "bakıyorum" in r[0].lower()
               for r in u.message.replies)


@pytest.mark.asyncio
async def test_no_wait_notice_when_the_rules_answer(repo, monkeypatch):
    monkeypatch.setattr(personal_flow, "parse_personal_message",
                        lambda t, c: None)
    u, c = FakeUpdate("markette 340 lira"), FakeContext()
    await personal_flow.handle_personal_text_message(u, c)
    assert not any("düşün" in r[0].lower() for r in u.message.replies)
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Send `"🤔 Düşünüyorum, birkaç saniye..."` immediately before the Qwen call. Also **run the blocking call off the event loop** — `await asyncio.to_thread(parse_personal_message, text, ctx)` — so a slow model cannot freeze the whole bot for other messages (same reasoning as the startup fix).

- [ ] **Step 4: Drop the timeout retry.** In `parse_personal_message`, retry only on a connection error; do **not** retry a `Timeout`. On CPU inference a timeout means "too slow", and retrying just doubles the user's wait. Update `tests/test_qwen_service.py::test_timeout_returns_none_after_one_retry` to assert exactly one attempt on timeout, and add a case asserting the retry still happens on a connection error.

- [ ] **Step 5: Tests pass.** Commit: `git commit -m "feat: wait notice, off-loop Qwen call, no retry on timeout"`

---

### Task 7: Make the direction correctable on the confirm card

Observed on the live bot: the direction was wrong and the only recourse was cancelling and retyping. `tur` was left out of the editable field list.

**Files:** Modify `src/bot/handlers/personal_flow.py`. Test: `tests/test_personal_flow.py`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_direction_can_be_flipped_from_the_confirm_card(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": "market",
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-08", "taksitSayisi": None,
                                     "aciklama": "Migros", "uyarilar": []}
    u = FakeCallbackUpdate("pf:set:tur:GELIR")
    assert await personal_flow.handle_personal_callbacks(u, c) is True
    assert c.user_data["personal_draft"]["tur"] == "GELIR"


@pytest.mark.asyncio
async def test_flipping_the_direction_resets_a_now_invalid_category(repo):
    c = FakeContext()
    c.user_data["personal_draft"] = {"tur": "GIDER", "tutar": 340.0,
                                     "paraBirimi": "TRY", "kategori": "market",
                                     "hesap": "NAKIT", "sahip": "ENIS",
                                     "tarih": "2026-09-08", "taksitSayisi": None,
                                     "aciklama": "Migros", "uyarilar": []}
    await personal_flow.handle_personal_callbacks(FakeCallbackUpdate("pf:set:tur:GELIR"), c)
    assert c.user_data["personal_draft"]["kategori"] is None, \
        "an expense category cannot survive a switch to income"
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Add `tur` to the `Düzelt` field list with two buttons (`Gider` / `Gelir`). Flipping it clears `kategori` when the current category's `tur` no longer matches, then re-enters `_advance(...)` so the right category keyboard is offered.

- [ ] **Step 4: Tests pass.** Commit: `git commit -m "feat: correct the entry direction from the confirm card"`

---

### Task 8: Strengthen the Qwen prompt (now the fallback only)

**Files:** Modify `src/ai/qwen_service.py`. Test: `tests/test_qwen_service.py`.

- [ ] **Step 1: Write the failing test**

```python
def test_prompt_states_the_expense_default_and_shows_examples():
    p = build_prompt(CTX)
    assert "GIDER" in p
    assert "ornek" in p.lower() or "örnek" in p.lower()
    assert p.count("{") >= 2, "at least two worked examples"


def test_prompt_labels_each_category_with_its_direction():
    p = build_prompt(CTX)
    assert "[GIDER]" in p and "[GELIR]" in p
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Add to `build_prompt`: each category rendered as `kod (ad) [GIDER|GELIR]`; the rule *"Emin değilsen tur=GIDER kullan — kayıtların çoğu harcamadır."*; and two worked examples, one expense and one income, each shown as the exact JSON expected. Keep the prompt under ~2500 characters — every extra character costs real seconds of CPU prefill on this VM.

- [ ] **Step 4: Tests pass, full suite green.** Commit: `git commit -m "feat: expense default and worked examples in the Qwen prompt"`

---

### Closing

- [ ] Run the whole suite and record the count.
- [ ] Confirm the load-bearing properties still hold: `tests/test_personal_routing.py` (a trade never reaches this code), `tests/test_personal_sync.py` (the `--update` asymmetry), `tests/test_personal_repository.py::test_writer_never_touches_the_investment_files`.
- [ ] Report: what changed, the test count, any decision you made on your own, and anything you chose not to do.

**Deployment is NOT part of this task.** The controller will deploy. For its benefit, note in your report that the VM copy is not a git repo and is updated by rsync with `--exclude '/data/'` — **anchored**, because an unanchored `data/` also matches `src/data/` and silently drops four modules.

**Do not pick up without asking:** full single-lock read-modify-write in `PersonalRepository`; undo-button staleness; the httpx logger printing the Telegram token into the journal.
