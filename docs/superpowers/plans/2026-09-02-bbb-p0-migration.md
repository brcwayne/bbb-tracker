# BBB Tracker P0 — Veri Modeli + Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `BigBlackBook_2026v15 kopyası.xlsm` içindeki tüm geçmişi, tasarım dokümanının §5 şemalarına uygun, doğrulanmış bir JSON veri setine (`transactions.json`, `cashflows.json`, `brokers.json`, `portfolios.json`, `instruments.json`, `fxrates.json`, `snapshots.json`, `meta.json`) dönüştüren, tekrar çalıştırılabilir bir Python migration aracı.

**Architecture:** Tek yönlü bir veri hattı: Excel'den ham satır çıkarımı → normalizasyon (sayı/tarih/para birimi) → hesap/portföy eşleme + TCMB geçmiş kuru ile USD'ye çevirme → `transactions.json` / `cashflows.json` üretimi → pozisyon/gerçekleşmiş K/Z türetimi → Excel'in Stock Position / Monthly Report / Portföyler sayfalarına karşı mutabakat raporu. Ara-katman yok; çıktı yerel `data/` klasörüne yazılır, Drive'a yükleme P1'de. Belirsizlikler (enstrüman sınıfı, XAU para birimi) kod dışı `overrides/` JSON dosyalarından beslenir, böylece araç deterministik ve idempotent kalır.

**Tech Stack:** Python 3.14, `openpyxl` (xlsm okuma), stdlib `urllib.request` + `xml.etree` (TCMB günlük kur XML'i — `requests` bağımlılığı yok), `pytest`. Çıktı düz JSON.

**Spec:** `docs/superpowers/specs/2026-09-02-bbb-tracker-design.md`

## Global Constraints

- **USD bazlı muhasebe.** Her işlem o günün USD/TRY kuruyla USD'ye çevrilir; tüm türetilmiş toplamlar USD. TL değerler saklanır ama doğruluk USD'de. (spec §2.3, §11)
- **Deterministik & idempotent.** Aynı girdi + aynı `overrides/` → byte-aynı çıktı. Migration kayıtlarının `id`'si içerikten türetilir (ULID değil): `"t_" + sha1(f"{sheet}:{row_no}").hexdigest()[:16]` işlemler için, `"c_" + ...` nakit için. (spec §5.1 not: ULID yalnızca uygulama-içi kayıtlar için)
- **Enstrüman sınıfı enum'u:** `BIST` | `ALTIN` | `FON_PARA` | `FON_HISSE` | `USA` (Varlik Siniflari sayfasıyla aynı). (spec §5.5)
- **Hesap/portföy eşleme tablosu (kesin):** `QNB→(QNB,ENIS)`, `KASA→(KASA,ENIS)`, `MID.USA→(MIDAS,USA)`, `TEB→(TEB,ENIS)`, `OYAK E→(OYAK-E,ENIS)`, `M.Delta→(MIDAS,DELTA)`, `GARAN→(GARAN,ENIS)`, `MIDAS→(MIDAS,ENIS)`, `M.Alfa→(MIDAS,ALFA)`, `QNB.F→(QNB,FON)`. Eşleşme büyük/küçük harf ve `.`/boşluk duyarsız. (spec §8.2)
- **Fiyat para birimi kuralı:** Excel Trade Log `I` (Price) sütunu **USD** → doğrudan `fiyat_usd`. `H` (TL) sütunu doluysa → `fiyat_tl`, boşsa `fiyat_tl = fiyat_usd * kur`. `girisParaBirimi` enstrüman sınıfından: `BIST`/`ALTIN`/`FON_*` → `TL`, `USA` → `USD`. (spec §5.1, §8.3)
- **Trade Log sütun düzeni:** `C`=No, `D`=portföy etiketi, `E`=tarih, `F`=enstrüman kodu, `G`=yön (BUY/SELL), `H`=TL, `I`=Price(USD), `J`=lot, `K`=manuel komisyon. `A`=`#VALUE!` (yok say). Veri satır 15'te başlar. (spec §8)
- **Bank Transfers tutarları USD** (Excel toplamı Dashboard "Capital" USD değeriyle birebir). (spec §8, doğrulama çapası)
- **Kısa pozisyon yok.** Eldeki lottan fazla `SAT` → mutabakat raporunda hata. (spec §11)
- **Ortalama maliyet:** hareketli ağırlıklı ortalama; `SAT` ortalama maliyeti değiştirmez, gerçekleşmiş K/Z = `(satis_fiyat_usd - ort_maliyet_usd) * satilan_lot - komisyon_usd`. (spec §11)
- **Nakit bakiyesi (hesap bazlı):** `Σ YATIRMA - Σ CEKME + Σ satış net_usd - Σ alış net_usd + Σ TEMETTU`. (spec §11)
- **TCMB kuru:** "Döviz Alış" (`ForexBuying`). Hafta sonu/tatil → en yakın **önceki** iş günü. Bir tarih hiç bulunamazsa `overrides/fxrates_seed.json`'dan. (spec §15.3 — bu planda "Döviz Alış" olarak sabitlendi)
- Tüm para alanları JSON'da `number` (float), 6 ondalık basamağa yuvarlanır. Tarihler `YYYY-MM-DD`.
- Kod `migration/` altında, kendi venv'inde. Depo kökü: `/Users/enisuslu/Desktop/Market/BBB`.

---

## File Structure

```
migration/
  requirements.txt              # openpyxl, pytest
  pytest.ini
  README.md                     # çalıştırma prosedürü (Task 12)
  bbb_migration/
    __init__.py
    constants.py                # label→(hesap,portfoy) map, statik brokers/portfolios, sütun düzeni, sabitler
    normalize.py                # parse_decimal, parse_date, parse_action, is_error_value
    xlsx_extract.py             # xlsm → ham satır dict'leri (Trade Log / Bank Transfers / Dividends / referans sayfalar)
    tcmb.py                     # günlük kur XML çekimi, iş-günü geri yürüme, disk cache, build_fxrates
    instruments.py             # distinct kodlardan instruments.json iskeleti + overrides merge
    transform.py               # ham satır + eşleme + fx + enstrüman → transaction / cashflow kayıtları
    positions.py               # açık/kapalı pozisyon, gerçekleşmiş K/Z, hesap bazlı nakit
    snapshots.py               # Monthly Report sayfasından aylık snapshot çıkarımı
    reconcile.py               # türetilen vs Excel referans → mutabakat raporu (markdown)
    cli.py                      # orkestrasyon; `python -m bbb_migration`
    __main__.py                # → cli.main()
  overrides/
    instruments.json            # kullanıcı-doldurur: kod → sinif, fiyatSembolu, girisParaBirimi, altinKatsayi
    fxrates_seed.json           # TCMB'de bulunamayan tarihler için elle kur
  tests/
    conftest.py
    fixtures/
      build_fixture.py          # mini.xlsm üretici (deterministik ~6 işlem + nakit + temettü)
      mini.xlsm                 # build_fixture.py çıktısı, commit'lenir
      tcmb_20200106.xml         # örnek TCMB yanıtı (mock için)
      tcmb_20200104.xml         # cumartesi → 404 senaryosu için boş/klasör
    test_normalize.py
    test_xlsx_extract.py
    test_tcmb.py
    test_instruments.py
    test_transform.py
    test_positions.py
    test_snapshots.py
    test_reconcile.py
    test_cli_integration.py
data/                            # migration çıktısı (gitignore; P1'de Drive'a gider)
```

Her dosyanın tek sorumluluğu var. `normalize.py` saf fonksiyonlar (I/O yok). `xlsx_extract.py` yalnızca okuma. `tcmb.py` yalnızca kur. `transform.py` iş kuralları. `positions.py` / `snapshots.py` türetme. `reconcile.py` karşılaştırma. `cli.py` sırayı bağlar.

---

## Task 1: Proje iskeleti + sabitler

**Files:**
- Create: `migration/requirements.txt`, `migration/pytest.ini`, `migration/bbb_migration/__init__.py`, `migration/bbb_migration/constants.py`, `migration/tests/conftest.py`, `migration/overrides/instruments.json`, `migration/overrides/fxrates_seed.json`
- Modify: `.gitignore` (kök) — `data/`, `migration/.venv/`, `__pycache__/`, `.pytest_cache/` ekle
- Test: `migration/tests/test_constants.py`

**Interfaces:**
- Consumes: —
- Produces:
  - `constants.LABEL_MAP: dict[str, tuple[str, str]]` — normalize edilmiş etiket → `(hesap, portfoy)`
  - `constants.BROKERS: list[dict]` — spec §5.3 statik içerik
  - `constants.PORTFOLIOS: list[dict]` — spec §5.4 statik içerik
  - `constants.TRADE_LOG_COLS: dict[str, str]` — `{"no":"C","portfoy":"D","tarih":"E","kod":"F","yon":"G","tl":"H","fiyat":"I","lot":"J","komisyon":"K"}`
  - `constants.DATA_START_ROW: int = 15`
  - `constants.MONEY_ROUND: int = 6`
  - `constants.normalize_label(s: str) -> str` — `s.strip().lower().replace(".", "").replace(" ", "")`

- [ ] **Step 1: venv + bağımlılıklar**

```bash
cd /Users/enisuslu/Desktop/Market/BBB/migration
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
printf 'openpyxl==3.1.5\npytest==8.3.4\n' > requirements.txt
.venv/bin/pip install -r requirements.txt
printf '[pytest]\ntestpaths = tests\n' > pytest.ini
```

- [ ] **Step 2: `.gitignore` güncelle (kök)**

`/Users/enisuslu/Desktop/Market/BBB/.gitignore` sonuna ekle:

```
data/
migration/.venv/
__pycache__/
.pytest_cache/
*.pyc
```

- [ ] **Step 3: Failing test yaz — `migration/tests/test_constants.py`**

```python
from bbb_migration import constants


def test_label_map_resolves_case_and_dot_insensitive():
    assert constants.LABEL_MAP[constants.normalize_label("M.Alfa")] == ("MIDAS", "ALFA")
    assert constants.LABEL_MAP[constants.normalize_label("m alfa")] == ("MIDAS", "ALFA")
    assert constants.LABEL_MAP[constants.normalize_label("OYAK E")] == ("OYAK-E", "ENIS")
    assert constants.LABEL_MAP[constants.normalize_label("QNB.F")] == ("QNB", "FON")


def test_all_ten_excel_labels_present():
    raw = ["QNB", "KASA", "MID.USA", "TEB", "OYAK E", "M.Delta",
           "GARAN", "MIDAS", "M.Alfa", "QNB.F"]
    for label in raw:
        assert constants.normalize_label(label) in constants.LABEL_MAP


def test_brokers_and_portfolios_match_spec():
    codes = {b["kod"] for b in constants.BROKERS}
    assert codes == {"GARAN", "MIDAS", "QNB", "TEB", "OYAK-E", "OYAK-ANNE", "KASA"}
    pcodes = {p["kod"] for p in constants.PORTFOLIOS}
    assert pcodes == {"ENIS", "ALFA", "DELTA", "FON", "USA"}
```

- [ ] **Step 4: Testi çalıştır, fail olduğunu gör**

Run: `cd migration && .venv/bin/pytest tests/test_constants.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'bbb_migration'`

- [ ] **Step 5: `bbb_migration/__init__.py` (boş) + `bbb_migration/constants.py` yaz**

```python
"""Statik eşlemeler ve sabitler — tasarım dokümanı §5.3, §5.4, §8.2."""

MONEY_ROUND = 6
DATA_START_ROW = 15

TRADE_LOG_COLS = {
    "no": "C", "portfoy": "D", "tarih": "E", "kod": "F",
    "yon": "G", "tl": "H", "fiyat": "I", "lot": "J", "komisyon": "K",
}


def normalize_label(s: str) -> str:
    return s.strip().lower().replace(".", "").replace(" ", "")


_RAW_LABEL_MAP = {
    "QNB": ("QNB", "ENIS"),
    "KASA": ("KASA", "ENIS"),
    "MID.USA": ("MIDAS", "USA"),
    "TEB": ("TEB", "ENIS"),
    "OYAK E": ("OYAK-E", "ENIS"),
    "M.Delta": ("MIDAS", "DELTA"),
    "GARAN": ("GARAN", "ENIS"),
    "MIDAS": ("MIDAS", "ENIS"),
    "M.Alfa": ("MIDAS", "ALFA"),
    "QNB.F": ("QNB", "FON"),
}
LABEL_MAP = {normalize_label(k): v for k, v in _RAW_LABEL_MAP.items()}

BROKERS = [
    {"kod": "GARAN", "ad": "Garanti Yatırım", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "MIDAS", "ad": "Midas", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "QNB", "ad": "QNB Finansinvest", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "TEB", "ad": "TEB Yatırım", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "OYAK-E", "ad": "Oyak · Enis", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "OYAK-ANNE", "ad": "Oyak · Anne", "tur": "BROKER", "sahip": "Anne", "aktif": True},
    {"kod": "KASA", "ad": "Kasa (fiziki)", "tur": "FIZIKI", "sahip": "Enis", "aktif": True},
]

PORTFOLIOS = [
    {"kod": "ENIS", "ad": "Enis (kendi seçimlerim)", "aktif": True},
    {"kod": "ALFA", "ad": "Alfa (Yatırım101)", "aktif": True},
    {"kod": "DELTA", "ad": "Delta (Yatırım101)", "aktif": True},
    {"kod": "FON", "ad": "Fonlar", "aktif": True},
    {"kod": "USA", "ad": "ABD Piyasası", "aktif": True},
]
```

- [ ] **Step 6: `conftest.py` — repo kökünü path'e ekle**

`migration/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

- [ ] **Step 7: `overrides/` başlangıç dosyaları**

`migration/overrides/instruments.json`:

```json
{
  "_aciklama": "kod -> {sinif, fiyatKaynagi, fiyatSembolu, girisParaBirimi, altinKatsayi?}. sinif enum: BIST|ALTIN|FON_PARA|FON_HISSE|USA",
  "ASTOR": {"sinif": "BIST", "fiyatKaynagi": "yahoo", "fiyatSembolu": "ASTOR.IS", "girisParaBirimi": "TL"}
}
```

`migration/overrides/fxrates_seed.json`:

```json
{
  "_aciklama": "TCMB'de bulunamayan tarihler icin elle USD/TRY (Doviz Alis). Ornek: \"2001-02-21\": 0.68",
  "2001-01-01": 0.6752
}
```

- [ ] **Step 8: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_constants.py -v`
Expected: PASS (3 test)

- [ ] **Step 9: Commit**

```bash
cd /Users/enisuslu/Desktop/Market/BBB
git add .gitignore migration/requirements.txt migration/pytest.ini migration/bbb_migration/__init__.py migration/bbb_migration/constants.py migration/tests/conftest.py migration/tests/test_constants.py migration/overrides/
git commit -m "feat(migration): project scaffold and static mappings"
```

---

## Task 2: Normalizasyon (`normalize.py`)

**Files:**
- Create: `migration/bbb_migration/normalize.py`
- Test: `migration/tests/test_normalize.py`

**Interfaces:**
- Consumes: —
- Produces:
  - `is_error_value(v) -> bool` — `v` bir Excel hata metni mi (`"#VALUE!"`, `"#REF!"`, `"#N/A"`, `"#DIV/0!"`, `"#NAME?"`)
  - `parse_decimal(v) -> float | None` — `int/float` → `float`; `str` → karışık ayıraç normalizasyonu (`"1.234,56"`→`1234.56`, `"1,234.56"`→`1234.56`, `"1234,5"`→`1234.5`, `"1234.5"`→`1234.5`); hata/boş/None → `None`
  - `parse_date(v) -> str | None` — `datetime`/`date` → `"YYYY-MM-DD"`; Excel serisi (int/float > 59) → tarih; `str` (`"2020-01-06"`, `"06.01.2020"`, `"6/1/2020"`) → ISO; aksi halde `None`
  - `parse_action(v) -> str | None` — `"BUY"/"AL"/"ALIS"` → `"AL"`, `"SELL"/"SAT"/"SATIS"` → `"SAT"` (case-insensitive), aksi `None`

- [ ] **Step 1: Failing test yaz — `migration/tests/test_normalize.py`**

```python
import datetime as dt
import pytest
from bbb_migration import normalize as n


@pytest.mark.parametrize("v,expected", [
    ("#VALUE!", True), ("#REF!", True), ("#N/A", True), ("#DIV/0!", True),
    ("normal", False), ("", False), (None, False), (12.3, False),
])
def test_is_error_value(v, expected):
    assert n.is_error_value(v) is expected


@pytest.mark.parametrize("v,expected", [
    (1234.56, 1234.56),
    (1234, 1234.0),
    ("1.234,56", 1234.56),
    ("1,234.56", 1234.56),
    ("1234,5", 1234.5),
    ("1234.5", 1234.5),
    ("  7,19 ", 7.19),
    ("1.000.000,00", 1000000.0),
    ("#VALUE!", None),
    ("", None),
    (None, None),
])
def test_parse_decimal(v, expected):
    assert n.parse_decimal(v) == expected


@pytest.mark.parametrize("v,expected", [
    (dt.datetime(2020, 1, 6), "2020-01-06"),
    (dt.date(2020, 1, 6), "2020-01-06"),
    ("2020-01-06", "2020-01-06"),
    ("06.01.2020", "2020-01-06"),
    ("6/1/2020", "2020-01-06"),
    (43836, "2020-01-06"),          # Excel serial for 2020-01-06
    ("", None),
    ("#REF!", None),
    (None, None),
])
def test_parse_date(v, expected):
    assert n.parse_date(v) == expected


@pytest.mark.parametrize("v,expected", [
    ("BUY", "AL"), ("buy", "AL"), (" AL ", "AL"), ("Alış", "AL"),
    ("SELL", "SAT"), ("sat", "SAT"), ("Satış", "SAT"),
    ("", None), (None, None), ("HOLD", None),
])
def test_parse_action(v, expected):
    assert n.parse_action(v) == expected
```

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError` / `AttributeError`

- [ ] **Step 3: `normalize.py` yaz**

```python
"""Saf normalizasyon fonksiyonları — I/O yok. Tasarım dokümanı §8."""
from __future__ import annotations

import datetime as dt
import re

_ERROR_STRINGS = {"#VALUE!", "#REF!", "#N/A", "#DIV/0!", "#NAME?", "#NULL!", "#NUM!"}
_EPOCH = dt.date(1899, 12, 30)  # Excel 1900 tarih sistemi


def is_error_value(v) -> bool:
    return isinstance(v, str) and v.strip().upper() in _ERROR_STRINGS


def parse_decimal(v):
    if v is None or is_error_value(v):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if not isinstance(v, str):
        return None
    s = v.strip()
    if not s:
        return None
    s = s.replace("%", "").replace("₺", "").replace("$", "").strip()
    has_dot, has_comma = "." in s, "," in s
    if has_dot and has_comma:
        # son görülen ayıraç ondalık ayıracıdır
        dec = "," if s.rfind(",") > s.rfind(".") else "."
        thou = "." if dec == "," else ","
        s = s.replace(thou, "").replace(dec, ".")
    elif has_comma:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(v):
    if v is None or is_error_value(v):
        return None
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if v > 59:
            return (_EPOCH + dt.timedelta(days=int(v))).isoformat()
        return None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                return dt.datetime.strptime(s, fmt).date().isoformat()
            except ValueError:
                continue
    return None


def parse_action(v):
    if not isinstance(v, str):
        return None
    s = v.strip().lower()
    if s in {"buy", "al", "alış", "alis"}:
        return "AL"
    if s in {"sell", "sat", "satış", "satis"}:
        return "SAT"
    return None
```

> Not: `"6/1/2020"` testinin `%d/%m/%Y` ile `2020-01-06` vermesi için gün-önce sırası önce denenir. Excel'de tarihler zaten `datetime` geldiği için string yolu nadir; belirsiz `MM/DD` vs `DD/MM` durumunu Task 12 gerçek veri kontrolünde doğrula.

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_normalize.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migration/bbb_migration/normalize.py migration/tests/test_normalize.py
git commit -m "feat(migration): number/date/action normalization"
```

---

## Task 3: Fixture üretici + XLSX çıkarımı (`xlsx_extract.py`)

**Files:**
- Create: `migration/tests/fixtures/build_fixture.py`, `migration/tests/fixtures/mini.xlsm` (script çıktısı), `migration/bbb_migration/xlsx_extract.py`
- Test: `migration/tests/test_xlsx_extract.py`

**Interfaces:**
- Consumes: `constants.TRADE_LOG_COLS`, `constants.DATA_START_ROW`
- Produces:
  - `extract_trades(path) -> list[dict]` — her dict: `{"row_no": int, "portfoy_raw": str, "tarih_raw", "kod_raw": str, "yon_raw", "tl_raw", "fiyat_raw", "lot_raw", "komisyon_raw"}` (ham hücre değerleri, normalize edilmemiş). Sadece `F` (kod) sütunu dolu satırlar.
  - `extract_bank_transfers(path) -> list[dict]` — `{"row_no", "tarih_raw", "action_raw", "gross_raw", "fees_raw", "net_raw", "notes_raw"}`. Sadece `C` (action) veya `B` (tarih) dolu satırlar.
  - `extract_dividends(path) -> list[dict]` — `{"row_no", "kod_raw", "tur_raw", "value_raw", "usdtry_raw", "exdiv_raw", "paid_usd_raw"}`. Sadece `B` (kod) dolu satırlar.
  - `extract_reference(path) -> dict` — mutabakat için: `{"stock_position": [...], "monthly_report": [...], "portfoyler": [...]}` ham satır listeleri (Task 8–10 kullanır; bu task'ta yalnız `stock_position` doldurulur, diğerleri boş liste bırakılır ve Task 9/10'da genişletilir).

- [ ] **Step 1: `build_fixture.py` yaz — deterministik mini.xlsm**

```python
"""Deterministik test workbook'u. Çalıştır: python tests/fixtures/build_fixture.py"""
import datetime as dt
from pathlib import Path
import openpyxl

OUT = Path(__file__).with_name("mini.xlsm")


def _set(ws, cell, val):
    ws[cell] = val


def build():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    tl = wb.create_sheet("Trade Log")
    _set(tl, "C14", "No."); _set(tl, "E14", "Date"); _set(tl, "F14", "Stock Code")
    _set(tl, "G14", "Action"); _set(tl, "H14", "TL"); _set(tl, "I14", "Price")
    _set(tl, "J14", "Total Shares"); _set(tl, "K14", "Manual Fees")
    rows = [
        # row, portfoy, date, code, action, tl, price_usd, lot, fee
        (15, "M.Alfa", dt.datetime(2020, 1, 6), "ASTOR", "BUY", None, 1.00, 100, 0),
        (16, "M.Alfa", dt.datetime(2020, 6, 10), "ASTOR", "BUY", None, 2.00, 100, 0),
        (17, "M.Alfa", dt.datetime(2021, 3, 15), "ASTOR", "SELL", None, 5.00, 50, 0),
        (18, "KASA", dt.datetime(2019, 7, 1), "XAU", "BUY", None, 50.00, 10, 0),
        (19, "QNB.F", dt.datetime(2022, 2, 3), "AFT.F", "BUY", None, 1.00, 1000, 0),
        (20, "GARAN", dt.datetime(2023, 11, 20), "THYAO", "BUY", 1200.00, 40.00, 25, 1.5),
        (21, "M.Alfa", dt.datetime(2021, 3, 15), "ASTOR", "SELL", None, 6.00, 200, 0),  # aşırı satış → recon hata
    ]
    for r, pf, d, code, act, tl_, px, lot, fee in rows:
        _set(tl, f"A{r}", "#VALUE!")
        _set(tl, f"C{r}", r - 14); _set(tl, f"D{r}", pf); _set(tl, f"E{r}", d)
        _set(tl, f"F{r}", code); _set(tl, f"G{r}", act)
        if tl_ is not None:
            _set(tl, f"H{r}", tl_)
        _set(tl, f"I{r}", px); _set(tl, f"J{r}", lot); _set(tl, f"K{r}", fee)
    # gürültü satırı: sadece yardımcı sütun dolu
    _set(tl, "A25", "#VALUE!")

    bt = wb.create_sheet("Bank Transfers")
    _set(bt, "A14", "No."); _set(bt, "B14", "Date"); _set(bt, "C14", "Action")
    _set(bt, "D14", "Gross Amount"); _set(bt, "E14", "Fees"); _set(bt, "F14", "Net Amount"); _set(bt, "G14", "Notes")
    bt_rows = [
        (15, dt.datetime(2019, 1, 2), "Deposit", 1000.00, 0, 1000.00, "ilk"),
        (16, dt.datetime(2021, 5, 5), "Withdraw", 200.00, 0, 200.00, "cekim"),
    ]
    for r, d, act, g, f, net, note in bt_rows:
        _set(bt, f"A{r}", r - 14); _set(bt, f"B{r}", d); _set(bt, f"C{r}", act)
        _set(bt, f"D{r}", g); _set(bt, f"E{r}", f); _set(bt, f"F{r}", net); _set(bt, f"G{r}", note)

    dv = wb.create_sheet("Dividends")
    _set(dv, "A14", "No."); _set(dv, "B14", "Stock Code"); _set(dv, "C14", "Type")
    _set(dv, "D14", "Value / Description"); _set(dv, "E14", "usdtry"); _set(dv, "F14", "Ex-Div Date")
    _set(dv, "I14", "Paid Value")
    _set(dv, "A15", 1); _set(dv, "B15", "ASTOR"); _set(dv, "C15", "Cash")
    _set(dv, "D15", 100.00); _set(dv, "E15", 25.00); _set(dv, "F15", dt.datetime(2023, 4, 10)); _set(dv, "I15", 4.00)

    sp = wb.create_sheet("Stock Position")
    _set(sp, "B14", "Stock Code"); _set(sp, "C14", "Total\nShares"); _set(sp, "D14", "Ave.\nPrice"); _set(sp, "E14", "Amount")
    # ASTOR migration sonrası: 100+100-50-200 = -150 (fixture kasıtlı hatalı); referans "doğru" değeri 150 lot der
    _set(sp, "B15", "ASTOR"); _set(sp, "C15", 150); _set(sp, "D15", 1.5); _set(sp, "E15", 225.0)
    _set(sp, "B16", "XAU"); _set(sp, "C16", 10); _set(sp, "D16", 50.0); _set(sp, "E16", 500.0)
    _set(sp, "B17", "AFT.F"); _set(sp, "C17", 1000); _set(sp, "D17", 1.0); _set(sp, "E17", 1000.0)
    _set(sp, "B18", "THYAO"); _set(sp, "C18", 25); _set(sp, "D18", 40.06); _set(sp, "E18", 1001.5)

    wb.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
```

- [ ] **Step 2: Fixture üret**

Run: `cd migration && .venv/bin/python tests/fixtures/build_fixture.py`
Expected: `wrote .../mini.xlsm`

- [ ] **Step 3: Failing test yaz — `migration/tests/test_xlsx_extract.py`**

```python
from pathlib import Path
from bbb_migration import xlsx_extract as x

MINI = Path(__file__).parent / "fixtures" / "mini.xlsm"


def test_extract_trades_skips_noise_and_keeps_code_rows():
    trades = x.extract_trades(MINI)
    assert len(trades) == 7
    assert [t["row_no"] for t in trades] == [15, 16, 17, 18, 19, 20, 21]
    first = trades[0]
    assert first["portfoy_raw"] == "M.Alfa"
    assert first["kod_raw"] == "ASTOR"
    assert first["yon_raw"] == "BUY"
    assert first["fiyat_raw"] == 1.0
    assert first["lot_raw"] == 100
    assert first["tl_raw"] is None
    assert trades[5]["tl_raw"] == 1200.0  # row 20, H dolu


def test_extract_bank_transfers():
    bt = x.extract_bank_transfers(MINI)
    assert len(bt) == 2
    assert bt[0]["action_raw"] == "Deposit"
    assert bt[0]["gross_raw"] == 1000.0
    assert bt[1]["action_raw"] == "Withdraw"


def test_extract_dividends():
    dv = x.extract_dividends(MINI)
    assert len(dv) == 1
    assert dv[0]["kod_raw"] == "ASTOR"
    assert dv[0]["usdtry_raw"] == 25.0
    assert dv[0]["paid_usd_raw"] == 4.0


def test_extract_reference_stock_position():
    ref = x.extract_reference(MINI)
    sp = {r["kod"]: r for r in ref["stock_position"]}
    assert sp["ASTOR"]["lot"] == 150
    assert sp["XAU"]["lot"] == 10
    assert sp["THYAO"]["amount"] == 1001.5
```

- [ ] **Step 4: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_xlsx_extract.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 5: `xlsx_extract.py` yaz**

```python
"""xlsm ham satır çıkarımı — okuma dışında iş kuralı yok."""
from __future__ import annotations

import openpyxl

from .constants import DATA_START_ROW


def _load(path):
    return openpyxl.load_workbook(path, data_only=True, read_only=True)


def _cell(ws, col, row):
    return ws[f"{col}{row}"].value


def extract_trades(path) -> list[dict]:
    wb = _load(path)
    ws = wb["Trade Log"]
    out = []
    for row in range(DATA_START_ROW, ws.max_row + 1):
        code = _cell(ws, "F", row)
        if code is None or (isinstance(code, str) and not code.strip()):
            continue
        out.append({
            "row_no": row,
            "portfoy_raw": _cell(ws, "D", row),
            "tarih_raw": _cell(ws, "E", row),
            "kod_raw": code,
            "yon_raw": _cell(ws, "G", row),
            "tl_raw": _cell(ws, "H", row),
            "fiyat_raw": _cell(ws, "I", row),
            "lot_raw": _cell(ws, "J", row),
            "komisyon_raw": _cell(ws, "K", row),
        })
    wb.close()
    return out


def extract_bank_transfers(path) -> list[dict]:
    wb = _load(path)
    ws = wb["Bank Transfers"]
    out = []
    for row in range(DATA_START_ROW, ws.max_row + 1):
        action = _cell(ws, "C", row)
        date = _cell(ws, "B", row)
        if action is None and date is None:
            continue
        out.append({
            "row_no": row,
            "tarih_raw": date,
            "action_raw": action,
            "gross_raw": _cell(ws, "D", row),
            "fees_raw": _cell(ws, "E", row),
            "net_raw": _cell(ws, "F", row),
            "notes_raw": _cell(ws, "G", row),
        })
    wb.close()
    return out


def extract_dividends(path) -> list[dict]:
    wb = _load(path)
    ws = wb["Dividends"]
    out = []
    for row in range(DATA_START_ROW, ws.max_row + 1):
        code = _cell(ws, "B", row)
        if code is None or (isinstance(code, str) and not code.strip()):
            continue
        out.append({
            "row_no": row,
            "kod_raw": code,
            "tur_raw": _cell(ws, "C", row),
            "value_raw": _cell(ws, "D", row),
            "usdtry_raw": _cell(ws, "E", row),
            "exdiv_raw": _cell(ws, "F", row),
            "paid_usd_raw": _cell(ws, "I", row),
        })
    wb.close()
    return out


def extract_reference(path) -> dict:
    wb = _load(path)
    out = {"stock_position": [], "monthly_report": [], "portfoyler": []}
    if "Stock Position" in wb.sheetnames:
        ws = wb["Stock Position"]
        for row in range(DATA_START_ROW, ws.max_row + 1):
            code = _cell(ws, "B", row)
            if not isinstance(code, str) or not code.strip():
                continue
            out["stock_position"].append({
                "kod": code.strip(),
                "lot": _cell(ws, "C", row),
                "ave_price": _cell(ws, "D", row),
                "amount": _cell(ws, "E", row),
            })
    wb.close()
    return out
```

- [ ] **Step 6: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_xlsx_extract.py -v`
Expected: PASS (4 test)

- [ ] **Step 7: Commit**

```bash
git add migration/tests/fixtures/build_fixture.py migration/tests/fixtures/mini.xlsm migration/bbb_migration/xlsx_extract.py migration/tests/test_xlsx_extract.py
git commit -m "feat(migration): xlsm row extraction + deterministic test fixture"
```

---

## Task 4: TCMB kur istemcisi (`tcmb.py`)

**Files:**
- Create: `migration/bbb_migration/tcmb.py`, `migration/tests/fixtures/tcmb_sample.xml`
- Test: `migration/tests/test_tcmb.py`

**Interfaces:**
- Consumes: `overrides/fxrates_seed.json` (opsiyonel yol parametresi)
- Produces:
  - `parse_tcmb_xml(text: str) -> float | None` — XML'den `USD` `ForexBuying` değeri
  - `TcmbClient(cache_path, seed_path=None, fetch=None)` — `fetch(yyyymmdd: str) -> str | None` enjekte edilebilir (test için). `fetch=None` ise stdlib `urllib` ile gerçek TCMB.
  - `TcmbClient.get_rate(date_iso: str) -> float` — cache → seed → geriye doğru en fazla 10 iş günü yürü → hâlâ yoksa `LookupError`
  - `TcmbClient.build_fxrates(dates: Iterable[str]) -> dict[str, float]` — benzersiz tarihler için `{date_iso: rate}`, artan sırada
  - `TcmbClient.save_cache()` — cache'i diske yaz

- [ ] **Step 1: Örnek XML fixture — `migration/tests/fixtures/tcmb_sample.xml`**

```xml
<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="06.01.2020" Date="01/06/2020">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <ForexBuying>5.9410</ForexBuying>
    <ForexSelling>5.9517</ForexSelling>
  </Currency>
  <Currency Kod="EUR" CurrencyCode="EUR">
    <ForexBuying>6.6320</ForexBuying>
  </Currency>
</Tarih_Date>
```

- [ ] **Step 2: Failing test yaz — `migration/tests/test_tcmb.py`**

```python
import json
from pathlib import Path
import pytest
from bbb_migration import tcmb

SAMPLE = (Path(__file__).parent / "fixtures" / "tcmb_sample.xml").read_text(encoding="latin-1")


def test_parse_tcmb_xml_reads_usd_forex_buying():
    assert tcmb.parse_tcmb_xml(SAMPLE) == 5.9410


def test_parse_tcmb_xml_missing_returns_none():
    assert tcmb.parse_tcmb_xml("<Tarih_Date></Tarih_Date>") is None


def test_get_rate_uses_cache_first(tmp_path):
    cache = tmp_path / "cache.json"
    cache.write_text(json.dumps({"2020-01-06": 5.941}))
    calls = []
    client = tcmb.TcmbClient(cache, fetch=lambda ymd: calls.append(ymd) or None)
    assert client.get_rate("2020-01-06") == 5.941
    assert calls == []


def test_get_rate_walks_back_to_previous_business_day(tmp_path):
    # 2020-01-05 pazar; fetch yalnızca 05 ve 04 için None, 03 için sample döndürür
    def fake_fetch(ymd):
        return SAMPLE if ymd == "03012020" else None
    client = tcmb.TcmbClient(tmp_path / "c.json", fetch=fake_fetch)
    assert client.get_rate("2020-01-05") == 5.9410


def test_get_rate_falls_back_to_seed(tmp_path):
    seed = tmp_path / "seed.json"
    seed.write_text(json.dumps({"1999-01-04": 0.31}))
    client = tcmb.TcmbClient(tmp_path / "c.json", seed_path=seed, fetch=lambda ymd: None)
    assert client.get_rate("1999-01-04") == 0.31


def test_get_rate_raises_when_nothing_found(tmp_path):
    client = tcmb.TcmbClient(tmp_path / "c.json", fetch=lambda ymd: None)
    with pytest.raises(LookupError):
        client.get_rate("1990-01-01")


def test_build_fxrates_dedupes_and_sorts(tmp_path):
    client = tcmb.TcmbClient(tmp_path / "c.json", fetch=lambda ymd: SAMPLE)
    out = client.build_fxrates(["2020-03-02", "2020-01-06", "2020-03-02"])
    assert list(out.keys()) == ["2020-01-06", "2020-03-02"]
    assert all(v == 5.9410 for v in out.values())
```

- [ ] **Step 3: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_tcmb.py -v`
Expected: FAIL

- [ ] **Step 4: `tcmb.py` yaz**

```python
"""TCMB günlük döviz kuru (USD Döviz Alış). Kaynak: tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml"""
from __future__ import annotations

import datetime as dt
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

_URL = "https://www.tcmb.gov.tr/kurlar/{yyyymm}/{ddmmyyyy}.xml"
_MAX_WALKBACK = 10


def parse_tcmb_xml(text: str):
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return None
    for cur in root.findall("Currency"):
        if cur.get("Kod") == "USD" or cur.get("CurrencyCode") == "USD":
            node = cur.find("ForexBuying")
            if node is not None and node.text and node.text.strip():
                return float(node.text.strip())
    return None


def _http_fetch(ymd: str):
    d = dt.datetime.strptime(ymd, "%d%m%Y").date()
    url = _URL.format(yyyymm=d.strftime("%Y%m"), ddmmyyyy=ymd)
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            return resp.read().decode("latin-1")
    except Exception:
        return None


class TcmbClient:
    def __init__(self, cache_path, seed_path=None, fetch=None):
        self.cache_path = Path(cache_path)
        self.fetch = fetch or _http_fetch
        self.cache = {}
        if self.cache_path.exists():
            self.cache = json.loads(self.cache_path.read_text())
        self.seed = {}
        if seed_path and Path(seed_path).exists():
            self.seed = {k: v for k, v in json.loads(Path(seed_path).read_text()).items()
                         if not k.startswith("_")}

    def get_rate(self, date_iso: str) -> float:
        if date_iso in self.cache:
            return self.cache[date_iso]
        d0 = dt.date.fromisoformat(date_iso)
        for i in range(_MAX_WALKBACK + 1):
            d = d0 - dt.timedelta(days=i)
            key = d.isoformat()
            if key in self.cache:
                self.cache[date_iso] = self.cache[key]
                return self.cache[key]
            text = self.fetch(d.strftime("%d%m%Y"))
            rate = parse_tcmb_xml(text) if text else None
            if rate is not None:
                self.cache[key] = rate
                self.cache[date_iso] = rate
                return rate
        if date_iso in self.seed:
            self.cache[date_iso] = self.seed[date_iso]
            return self.seed[date_iso]
        raise LookupError(f"USD/TRY bulunamadı: {date_iso}")

    def build_fxrates(self, dates):
        out = {}
        for d in sorted(set(dates)):
            out[d] = self.get_rate(d)
        return out

    def save_cache(self):
        self.cache_path.write_text(json.dumps(self.cache, indent=2, sort_keys=True))
```

- [ ] **Step 5: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_tcmb.py -v`
Expected: PASS (7 test)

- [ ] **Step 6: Commit**

```bash
git add migration/bbb_migration/tcmb.py migration/tests/fixtures/tcmb_sample.xml migration/tests/test_tcmb.py
git commit -m "feat(migration): TCMB historical USD/TRY client with cache and business-day walkback"
```

---

## Task 5: Enstrüman iskeleti + overrides (`instruments.py`)

**Files:**
- Create: `migration/bbb_migration/instruments.py`
- Test: `migration/tests/test_instruments.py`

**Interfaces:**
- Consumes: `extract_trades` çıktısı (kod listesi), `overrides/instruments.json`
- Produces:
  - `distinct_codes(trades: list[dict]) -> list[str]` — sıralı benzersiz `kod_raw.strip()`
  - `build_instruments(codes, overrides: dict) -> tuple[list[dict], list[str]]` — `(instruments, unclassified)`. Her instrument: `{"kod", "ad": kod, "sinif": <override|None>, "girisParaBirimi": <override| sınıftan türet | None>, "fiyatKaynagi": <override|None>, "fiyatSembolu": <override|None>, "seviyeler": None}`. `unclassified` = `sinif`'ı `None` olan kodlar.
  - `VALID_SINIF = {"BIST","ALTIN","FON_PARA","FON_HISSE","USA"}`
  - `default_giris_para_birimi(sinif) -> str` — `USA` → `"USD"`, aksi `"TL"`

- [ ] **Step 1: Failing test — `migration/tests/test_instruments.py`**

```python
import pytest
from bbb_migration import instruments as im


def _trades(*codes):
    return [{"kod_raw": c} for c in codes]


def test_distinct_codes_sorted_unique():
    assert im.distinct_codes(_trades("XAU", "ASTOR", "XAU", " ASTOR ")) == ["ASTOR", "XAU"]


def test_build_instruments_applies_overrides():
    ov = {"ASTOR": {"sinif": "BIST", "fiyatSembolu": "ASTOR.IS",
                    "fiyatKaynagi": "yahoo", "girisParaBirimi": "TL"}}
    insts, unclassified = im.build_instruments(["ASTOR", "MYSTERY"], ov)
    by = {i["kod"]: i for i in insts}
    assert by["ASTOR"]["sinif"] == "BIST"
    assert by["ASTOR"]["fiyatSembolu"] == "ASTOR.IS"
    assert by["ASTOR"]["girisParaBirimi"] == "TL"
    assert by["MYSTERY"]["sinif"] is None
    assert unclassified == ["MYSTERY"]


def test_build_instruments_derives_giris_para_birimi_when_missing():
    ov = {"SPCX.USA": {"sinif": "USA", "fiyatSembolu": "SPCX", "fiyatKaynagi": "yahoo"}}
    insts, _ = im.build_instruments(["SPCX.USA"], ov)
    assert insts[0]["girisParaBirimi"] == "USD"


def test_build_instruments_rejects_bad_sinif():
    with pytest.raises(ValueError):
        im.build_instruments(["X"], {"X": {"sinif": "CRYPTO"}})
```

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_instruments.py -v`
Expected: FAIL

- [ ] **Step 3: `instruments.py` yaz**

```python
"""Enstrüman iskeleti — distinct kodlar + overrides/instruments.json birleşimi."""
from __future__ import annotations

VALID_SINIF = {"BIST", "ALTIN", "FON_PARA", "FON_HISSE", "USA"}


def distinct_codes(trades) -> list[str]:
    seen = {t["kod_raw"].strip() for t in trades if isinstance(t["kod_raw"], str)}
    return sorted(seen)


def default_giris_para_birimi(sinif) -> str:
    return "USD" if sinif == "USA" else "TL"


def build_instruments(codes, overrides):
    overrides = {k: v for k, v in overrides.items() if not k.startswith("_")}
    insts, unclassified = [], []
    for code in codes:
        ov = overrides.get(code, {})
        sinif = ov.get("sinif")
        if sinif is not None and sinif not in VALID_SINIF:
            raise ValueError(f"{code}: geçersiz sinif {sinif!r}")
        giris = ov.get("girisParaBirimi") or (default_giris_para_birimi(sinif) if sinif else None)
        inst = {
            "kod": code,
            "ad": ov.get("ad", code),
            "sinif": sinif,
            "girisParaBirimi": giris,
            "fiyatKaynagi": ov.get("fiyatKaynagi"),
            "fiyatSembolu": ov.get("fiyatSembolu"),
            "seviyeler": ov.get("seviyeler"),
        }
        if "altinKatsayi" in ov:
            inst["altinKatsayi"] = ov["altinKatsayi"]
        insts.append(inst)
        if sinif is None:
            unclassified.append(code)
    return insts, unclassified
```

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_instruments.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migration/bbb_migration/instruments.py migration/tests/test_instruments.py
git commit -m "feat(migration): instrument skeleton with overrides merge"
```

---

## Task 6: İşlem dönüşümü (`transform.py` — transactions)

**Files:**
- Create: `migration/bbb_migration/transform.py`
- Test: `migration/tests/test_transform.py`

**Interfaces:**
- Consumes: `extract_trades` çıktısı, `constants.LABEL_MAP`, `constants.normalize_label`, `normalize.*`, fx sözlüğü `{date_iso: rate}`, instrument sözlüğü `{kod: instrument dict}`
- Produces:
  - `TransformError(Exception)` — `.row_no`, `.reason` alanlı
  - `build_transaction(raw: dict, fx: dict, instruments: dict) -> dict` — spec §5.1 kaydı:
    `{"id","tarih","hesap","portfoy","enstruman","yon","lot","girisParaBirimi","fiyat_tl","fiyat_usd","kur","komisyon_usd","brut_usd","net_usd","not":"","kaynak":"migration","olusturulma": None}`
    - `id = "t_" + sha1(f"trades:{raw['row_no']}").hexdigest()[:16]`
    - `fiyat_usd = parse_decimal(fiyat_raw)`; `tl = parse_decimal(tl_raw)`; `fiyat_tl = tl if tl is not None else round(fiyat_usd * kur, 6)`
    - `brut_usd = round(lot * fiyat_usd, 6)`; `komisyon_usd = parse_decimal(komisyon_raw) or 0.0`
    - `net_usd = round(brut_usd + komisyon_usd, 6)` (AL) / `round(brut_usd - komisyon_usd, 6)` (SAT)
    - Hata durumları → `TransformError`: bilinmeyen etiket, `yon` çözülemedi, `tarih` çözülemedi, `fiyat_usd is None`, `lot` yok/≤0, `fx`'te tarih yok, `enstruman` `instruments`'ta yok.
  - `build_transactions(raws, fx, instruments) -> tuple[list[dict], list[TransformError]]` — hatalı satırlar atlanır ve listelenir.

- [ ] **Step 1: Failing test — `migration/tests/test_transform.py`**

```python
import pytest
from bbb_migration import transform as tr

FX = {"2020-01-06": 5.94, "2023-11-20": 28.0}
INST = {
    "ASTOR": {"kod": "ASTOR", "sinif": "BIST", "girisParaBirimi": "TL"},
    "THYAO": {"kod": "THYAO", "sinif": "BIST", "girisParaBirimi": "TL"},
}


def _raw(**kw):
    base = dict(row_no=15, portfoy_raw="M.Alfa", tarih_raw="2020-01-06",
               kod_raw="ASTOR", yon_raw="BUY", tl_raw=None, fiyat_raw=1.0,
               lot_raw=100, komisyon_raw=0)
    base.update(kw)
    return base


def test_build_transaction_happy_path_buy():
    t = tr.build_transaction(_raw(), FX, INST)
    assert t["hesap"] == "MIDAS" and t["portfoy"] == "ALFA"
    assert t["enstruman"] == "ASTOR" and t["yon"] == "AL"
    assert t["fiyat_usd"] == 1.0
    assert t["kur"] == 5.94
    assert t["fiyat_tl"] == round(1.0 * 5.94, 6)
    assert t["brut_usd"] == 100.0
    assert t["net_usd"] == 100.0
    assert t["girisParaBirimi"] == "TL"
    assert t["id"] == "t_" + __import__("hashlib").sha1(b"trades:15").hexdigest()[:16]
    assert t["kaynak"] == "migration"


def test_build_transaction_uses_tl_column_when_present():
    t = tr.build_transaction(_raw(row_no=20, kod_raw="THYAO", tarih_raw="2023-11-20",
                                  tl_raw=1200.0, fiyat_raw=40.0, lot_raw=25,
                                  komisyon_raw=1.5, portfoy_raw="GARAN"), FX, INST)
    assert t["fiyat_tl"] == 1200.0
    assert t["fiyat_usd"] == 40.0
    assert t["brut_usd"] == 1000.0
    assert t["net_usd"] == 1001.5   # AL: brut + komisyon


def test_build_transaction_sell_subtracts_commission():
    t = tr.build_transaction(_raw(yon_raw="SELL", fiyat_raw=5.0, lot_raw=50, komisyon_raw=2.0),
                             FX, INST)
    assert t["yon"] == "SAT"
    assert t["net_usd"] == 248.0   # 250 - 2


@pytest.mark.parametrize("kw,reason_part", [
    (dict(portfoy_raw="BILINMEYEN"), "etiket"),
    (dict(yon_raw="HOLD"), "yön"),
    (dict(tarih_raw="#REF!"), "tarih"),
    (dict(fiyat_raw="#VALUE!"), "fiyat"),
    (dict(lot_raw=0), "lot"),
    (dict(tarih_raw="2011-11-11"), "kur"),
    (dict(kod_raw="YOKENSTRUMAN"), "enstrüman"),
])
def test_build_transaction_errors(kw, reason_part):
    with pytest.raises(tr.TransformError) as ei:
        tr.build_transaction(_raw(**kw), FX, INST)
    assert reason_part.lower() in ei.value.reason.lower()


def test_build_transactions_collects_errors_and_skips():
    raws = [_raw(row_no=15), _raw(row_no=16, yon_raw="HOLD")]
    txns, errors = tr.build_transactions(raws, FX, INST)
    assert len(txns) == 1 and len(errors) == 1
    assert errors[0].row_no == 16
```

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_transform.py -v`
Expected: FAIL

- [ ] **Step 3: `transform.py` yaz (transactions bölümü)**

```python
"""Ham Excel satırları → spec §5.1 / §5.2 kayıtları."""
from __future__ import annotations

import hashlib

from .constants import LABEL_MAP, MONEY_ROUND, normalize_label
from . import normalize as n


class TransformError(Exception):
    def __init__(self, row_no, reason):
        super().__init__(f"row {row_no}: {reason}")
        self.row_no = row_no
        self.reason = reason


def _rid(prefix, key):
    return prefix + hashlib.sha1(key.encode()).hexdigest()[:MONEY_ROUND + 10]


def _r(x):
    return round(x, MONEY_ROUND)


def build_transaction(raw, fx, instruments):
    rn = raw["row_no"]
    label = raw["portfoy_raw"]
    if not isinstance(label, str) or normalize_label(label) not in LABEL_MAP:
        raise TransformError(rn, f"bilinmeyen portföy etiketi: {label!r}")
    hesap, portfoy = LABEL_MAP[normalize_label(label)]

    yon = n.parse_action(raw["yon_raw"])
    if yon is None:
        raise TransformError(rn, f"yön çözülemedi: {raw['yon_raw']!r}")

    tarih = n.parse_date(raw["tarih_raw"])
    if tarih is None:
        raise TransformError(rn, f"tarih çözülemedi: {raw['tarih_raw']!r}")

    fiyat_usd = n.parse_decimal(raw["fiyat_raw"])
    if fiyat_usd is None:
        raise TransformError(rn, f"fiyat çözülemedi: {raw['fiyat_raw']!r}")

    lot = n.parse_decimal(raw["lot_raw"])
    if lot is None or lot <= 0:
        raise TransformError(rn, f"lot geçersiz: {raw['lot_raw']!r}")

    if tarih not in fx:
        raise TransformError(rn, f"kur yok: {tarih}")
    kur = fx[tarih]

    kod = raw["kod_raw"].strip()
    if kod not in instruments:
        raise TransformError(rn, f"enstrüman tanımsız: {kod}")
    inst = instruments[kod]

    tl = n.parse_decimal(raw["tl_raw"])
    fiyat_tl = tl if tl is not None else _r(fiyat_usd * kur)
    brut_usd = _r(lot * fiyat_usd)
    komisyon_usd = n.parse_decimal(raw["komisyon_raw"]) or 0.0
    net_usd = _r(brut_usd + komisyon_usd) if yon == "AL" else _r(brut_usd - komisyon_usd)

    return {
        "id": _rid("t_", f"trades:{rn}"),
        "tarih": tarih,
        "hesap": hesap,
        "portfoy": portfoy,
        "enstruman": kod,
        "yon": yon,
        "lot": lot,
        "girisParaBirimi": inst.get("girisParaBirimi") or "TL",
        "fiyat_tl": fiyat_tl,
        "fiyat_usd": _r(fiyat_usd),
        "kur": kur,
        "komisyon_usd": _r(komisyon_usd),
        "brut_usd": brut_usd,
        "net_usd": net_usd,
        "not": "",
        "kaynak": "migration",
        "olusturulma": None,
    }


def build_transactions(raws, fx, instruments):
    txns, errors = [], []
    for raw in raws:
        try:
            txns.append(build_transaction(raw, fx, instruments))
        except TransformError as e:
            errors.append(e)
    return txns, errors
```

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_transform.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migration/bbb_migration/transform.py migration/tests/test_transform.py
git commit -m "feat(migration): transaction transform with USD conversion and row-level errors"
```

---

## Task 7: Nakit akışı dönüşümü (`transform.py` — cashflows)

**Files:**
- Modify: `migration/bbb_migration/transform.py` (yeni fonksiyonlar ekle)
- Test: `migration/tests/test_transform_cashflows.py`

**Interfaces:**
- Consumes: `extract_bank_transfers` / `extract_dividends` çıktıları, fx sözlüğü
- Produces:
  - `build_bank_cashflow(raw: dict) -> dict` — spec §5.2. Bank Transfers **USD** (Global Constraints). `tur`: `"Deposit"→"YATIRMA"`, `"Withdraw"/"Withdrawal"→"CEKME"` (case-insensitive). `tutar_usd = parse_decimal(gross_raw)`, `tutar_tl=None`, `kur=None`, `hesap="?"` (Bank Transfers'ta hesap kolonu yok → `"TOPLU"`), `portfoy=None`, `enstruman=None`. `id = "c_" + sha1("bank:{row_no}")`.
  - `build_dividend_cashflow(raw: dict, fx: dict) -> dict` — `tur="TEMETTU"`, `enstruman=kod_raw.strip()`, `tutar_tl=parse_decimal(value_raw)`, `usdtry=parse_decimal(usdtry_raw)`, `tutar_usd`: `paid_usd_raw` doluysa o, değilse `tutar_tl/usdtry`, o da yoksa `TransformError`. `tarih = parse_date(exdiv_raw)`. `kur = usdtry or fx.get(tarih)`. `id = "c_" + sha1("div:{row_no}")`.
  - `build_cashflows(bank_raws, div_raws, fx) -> tuple[list[dict], list[TransformError]]`

- [ ] **Step 1: Failing test — `migration/tests/test_transform_cashflows.py`**

```python
import pytest
from bbb_migration import transform as tr

FX = {"2023-04-10": 24.9}


def test_bank_deposit():
    raw = dict(row_no=15, tarih_raw="2019-01-02", action_raw="Deposit",
               gross_raw=1000.0, fees_raw=0, net_raw=1000.0, notes_raw="ilk")
    c = tr.build_bank_cashflow(raw)
    assert c["tur"] == "YATIRMA"
    assert c["tutar_usd"] == 1000.0
    assert c["hesap"] == "TOPLU"
    assert c["kur"] is None
    assert c["id"].startswith("c_")


def test_bank_withdraw_variants():
    for w in ("Withdraw", "withdrawal", "WITHDRAW"):
        raw = dict(row_no=16, tarih_raw="2021-05-05", action_raw=w,
                   gross_raw=200.0, fees_raw=0, net_raw=200.0, notes_raw="")
        assert tr.build_bank_cashflow(raw)["tur"] == "CEKME"


def test_dividend_prefers_paid_usd():
    raw = dict(row_no=15, kod_raw="ASTOR", tur_raw="Cash", value_raw=100.0,
               usdtry_raw=25.0, exdiv_raw="2023-04-10", paid_usd_raw=4.0)
    c = tr.build_dividend_cashflow(raw, FX)
    assert c["tur"] == "TEMETTU"
    assert c["enstruman"] == "ASTOR"
    assert c["tutar_usd"] == 4.0
    assert c["tutar_tl"] == 100.0
    assert c["kur"] == 25.0


def test_dividend_computes_usd_from_tl_and_rate():
    raw = dict(row_no=16, kod_raw="KLKIM", tur_raw="Cash", value_raw=968.25,
               usdtry_raw=38.5529, exdiv_raw="2025-05-08", paid_usd_raw=None)
    c = tr.build_dividend_cashflow(raw, FX)
    assert round(c["tutar_usd"], 2) == 25.11


def test_dividend_without_amount_errors():
    raw = dict(row_no=17, kod_raw="X", tur_raw="Cash", value_raw=None,
               usdtry_raw=None, exdiv_raw="2025-05-08", paid_usd_raw=None)
    with pytest.raises(tr.TransformError):
        tr.build_dividend_cashflow(raw, FX)


def test_build_cashflows_aggregates():
    bank = [dict(row_no=15, tarih_raw="2019-01-02", action_raw="Deposit",
                 gross_raw=1000.0, fees_raw=0, net_raw=1000.0, notes_raw="")]
    div = [dict(row_no=15, kod_raw="ASTOR", tur_raw="Cash", value_raw=100.0,
                usdtry_raw=25.0, exdiv_raw="2023-04-10", paid_usd_raw=4.0)]
    flows, errors = tr.build_cashflows(bank, div, FX)
    assert len(flows) == 2 and errors == []
```

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_transform_cashflows.py -v`
Expected: FAIL

- [ ] **Step 3: `transform.py`'a cashflow fonksiyonlarını ekle**

```python
_DEP = {"deposit", "yatırma", "yatirma"}
_WD = {"withdraw", "withdrawal", "çekme", "cekme"}


def build_bank_cashflow(raw):
    rn = raw["row_no"]
    act = (raw["action_raw"] or "").strip().lower()
    if act in _DEP:
        tur = "YATIRMA"
    elif act in _WD:
        tur = "CEKME"
    else:
        raise TransformError(rn, f"bank action çözülemedi: {raw['action_raw']!r}")
    tarih = n.parse_date(raw["tarih_raw"])
    if tarih is None:
        raise TransformError(rn, f"tarih çözülemedi: {raw['tarih_raw']!r}")
    tutar = n.parse_decimal(raw["gross_raw"])
    if tutar is None:
        raise TransformError(rn, f"tutar çözülemedi: {raw['gross_raw']!r}")
    return {
        "id": _rid("c_", f"bank:{rn}"),
        "tarih": tarih, "hesap": "TOPLU", "portfoy": None, "tur": tur,
        "enstruman": None, "tutar_tl": None, "tutar_usd": _r(tutar),
        "kur": None, "aciklama": (raw["notes_raw"] or ""), "kaynak": "migration",
    }


def build_dividend_cashflow(raw, fx):
    rn = raw["row_no"]
    tarih = n.parse_date(raw["exdiv_raw"])
    if tarih is None:
        raise TransformError(rn, f"temettü tarihi çözülemedi: {raw['exdiv_raw']!r}")
    tutar_tl = n.parse_decimal(raw["value_raw"])
    usdtry = n.parse_decimal(raw["usdtry_raw"])
    paid_usd = n.parse_decimal(raw["paid_usd_raw"])
    if paid_usd is not None:
        tutar_usd = paid_usd
    elif tutar_tl is not None and usdtry:
        tutar_usd = tutar_tl / usdtry
    else:
        raise TransformError(rn, "temettü tutarı hesaplanamadı (paid_usd / value+usdtry yok)")
    kur = usdtry if usdtry else fx.get(tarih)
    return {
        "id": _rid("c_", f"div:{rn}"),
        "tarih": tarih, "hesap": "TOPLU", "portfoy": None, "tur": "TEMETTU",
        "enstruman": raw["kod_raw"].strip(),
        "tutar_tl": _r(tutar_tl) if tutar_tl is not None else None,
        "tutar_usd": _r(tutar_usd),
        "kur": kur, "aciklama": (raw["tur_raw"] or ""), "kaynak": "migration",
    }


def build_cashflows(bank_raws, div_raws, fx):
    flows, errors = [], []
    for raw in bank_raws:
        try:
            flows.append(build_bank_cashflow(raw))
        except TransformError as e:
            errors.append(e)
    for raw in div_raws:
        try:
            flows.append(build_dividend_cashflow(raw, fx))
        except TransformError as e:
            errors.append(e)
    return flows, errors
```

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_transform_cashflows.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migration/bbb_migration/transform.py migration/tests/test_transform_cashflows.py
git commit -m "feat(migration): cashflow transform for bank transfers and dividends"
```

---

## Task 8: Pozisyon + gerçekleşmiş K/Z türetimi (`positions.py`)

**Files:**
- Create: `migration/bbb_migration/positions.py`
- Test: `migration/tests/test_positions.py`

**Interfaces:**
- Consumes: `build_transactions` çıktısı (transaction dict listesi), `build_cashflows` çıktısı
- Produces:
  - `derive_positions(txns: list[dict]) -> dict` — enstrüman bazında kronolojik (tarih, sonra `id`) işlem uygulaması:
    - `{"open": {kod: {"lot","ort_maliyet_usd","toplam_maliyet_usd"}}, "closed": [{"kod","alis_lot","alis_tutar_usd","satis_lot","satis_tutar_usd","gerceklesmis_kz_usd"}], "realized_total_usd": float, "errors": [str]}`
    - `AL`: `toplam_maliyet += net_usd`; `lot += lot`; `ort_maliyet = toplam_maliyet / lot`
    - `SAT`: `lot > mevcut` → `errors`'a `"row/id: aşırı satış <kod>"` ekle, satışı mevcut lota clamp et (negatife düşme). `gerceklesmis_kz = (fiyat_usd - ort_maliyet) * satilan_lot - komisyon_usd`. `toplam_maliyet -= ort_maliyet * satilan_lot`. `ort_maliyet` sabit.
    - `lot` 1e-9 altına inince pozisyon `open`'dan silinir.
    - `closed` her enstrüman için tek toplu kayıt (tüm satışların agregesi).
  - `derive_cash_by_account(txns, cashflows) -> dict[str, float]` — Global Constraints formülü. Bank cashflow `hesap="TOPLU"` → `"TOPLU"` anahtarında toplanır (Bank Transfers hesap kırılımı yok; bu P0 sınırlaması, `meta.json`'a not).

- [ ] **Step 1: Failing test — `migration/tests/test_positions.py`**

```python
from bbb_migration import positions as p


def _t(id_, tarih, kod, yon, lot, fiyat, net, komisyon=0.0, hesap="MIDAS"):
    return {"id": id_, "tarih": tarih, "enstruman": kod, "yon": yon, "lot": lot,
            "fiyat_usd": fiyat, "net_usd": net, "komisyon_usd": komisyon,
            "hesap": hesap, "portfoy": "ALFA"}


def test_moving_average_and_realized_pl():
    txns = [
        _t("a", "2020-01-06", "ASTOR", "AL", 100, 1.0, 100.0),
        _t("b", "2020-06-10", "ASTOR", "AL", 100, 2.0, 200.0),
        _t("c", "2021-03-15", "ASTOR", "SAT", 50, 5.0, 250.0),
    ]
    res = p.derive_positions(txns)
    astor = res["open"]["ASTOR"]
    assert astor["lot"] == 150
    assert round(astor["ort_maliyet_usd"], 6) == 1.5
    assert round(astor["toplam_maliyet_usd"], 6) == 225.0
    assert round(res["realized_total_usd"], 6) == 175.0   # (5-1.5)*50
    closed = res["closed"][0]
    assert closed["kod"] == "ASTOR"
    assert round(closed["gerceklesmis_kz_usd"], 6) == 175.0


def test_full_exit_removes_open_position():
    txns = [
        _t("a", "2019-07-01", "XAU", "AL", 10, 50.0, 500.0),
        _t("b", "2024-01-01", "XAU", "SAT", 10, 80.0, 800.0),
    ]
    res = p.derive_positions(txns)
    assert "XAU" not in res["open"]
    assert round(res["realized_total_usd"], 6) == 300.0


def test_oversell_is_flagged_and_clamped():
    txns = [
        _t("a", "2020-01-01", "ASTOR", "AL", 100, 1.0, 100.0),
        _t("b", "2020-02-01", "ASTOR", "SAT", 250, 2.0, 500.0),
    ]
    res = p.derive_positions(txns)
    assert any("aşırı satış" in e for e in res["errors"])
    assert "ASTOR" not in res["open"]           # 100 clamp → tam çıkış
    assert round(res["realized_total_usd"], 6) == 100.0   # (2-1)*100


def test_cash_by_account():
    txns = [_t("a", "2020-01-06", "ASTOR", "AL", 100, 1.0, 100.0, hesap="MIDAS")]
    flows = [
        {"tur": "YATIRMA", "tutar_usd": 1000.0, "hesap": "TOPLU"},
        {"tur": "CEKME", "tutar_usd": 200.0, "hesap": "TOPLU"},
        {"tur": "TEMETTU", "tutar_usd": 4.0, "hesap": "TOPLU"},
    ]
    cash = p.derive_cash_by_account(txns, flows)
    assert cash["TOPLU"] == 804.0     # 1000 - 200 + 4
    assert cash["MIDAS"] == -100.0    # alış
```

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_positions.py -v`
Expected: FAIL

- [ ] **Step 3: `positions.py` yaz**

```python
"""İşlemlerden pozisyon, gerçekleşmiş K/Z, nakit türetimi — spec §11."""
from __future__ import annotations

from collections import defaultdict

_EPS = 1e-9


def derive_positions(txns):
    ordered = sorted(txns, key=lambda t: (t["tarih"], t["id"]))
    open_pos = {}
    closed = defaultdict(lambda: {"kod": None, "alis_lot": 0.0, "alis_tutar_usd": 0.0,
                                  "satis_lot": 0.0, "satis_tutar_usd": 0.0,
                                  "gerceklesmis_kz_usd": 0.0})
    realized_total = 0.0
    errors = []

    for t in ordered:
        kod, yon, lot = t["enstruman"], t["yon"], t["lot"]
        pos = open_pos.setdefault(kod, {"lot": 0.0, "ort_maliyet_usd": 0.0,
                                        "toplam_maliyet_usd": 0.0})
        if yon == "AL":
            pos["toplam_maliyet_usd"] += t["net_usd"]
            pos["lot"] += lot
            pos["ort_maliyet_usd"] = pos["toplam_maliyet_usd"] / pos["lot"]
            c = closed[kod]; c["kod"] = kod
            c["alis_lot"] += lot; c["alis_tutar_usd"] += t["net_usd"]
        else:  # SAT
            sell_lot = lot
            if sell_lot > pos["lot"] + _EPS:
                errors.append(f'{t["id"]}: aşırı satış {kod} (istenen {sell_lot}, mevcut {pos["lot"]})')
                sell_lot = pos["lot"]
            if sell_lot <= _EPS:
                continue
            ort = pos["ort_maliyet_usd"]
            kz = (t["fiyat_usd"] - ort) * sell_lot - t["komisyon_usd"]
            realized_total += kz
            pos["lot"] -= sell_lot
            pos["toplam_maliyet_usd"] -= ort * sell_lot
            c = closed[kod]; c["kod"] = kod
            c["satis_lot"] += sell_lot
            c["satis_tutar_usd"] += t["fiyat_usd"] * sell_lot - t["komisyon_usd"]
            c["gerceklesmis_kz_usd"] += kz
            if pos["lot"] <= _EPS:
                open_pos.pop(kod, None)

    return {
        "open": open_pos,
        "closed": [closed[k] for k in sorted(closed) if closed[k]["satis_lot"] > _EPS],
        "realized_total_usd": realized_total,
        "errors": errors,
    }


def derive_cash_by_account(txns, cashflows):
    cash = defaultdict(float)
    for t in txns:
        if t["yon"] == "AL":
            cash[t["hesap"]] -= t["net_usd"]
        else:
            cash[t["hesap"]] += t["net_usd"]
    for f in cashflows:
        amt = f["tutar_usd"]
        acc = f.get("hesap") or "TOPLU"
        if f["tur"] == "YATIRMA":
            cash[acc] += amt
        elif f["tur"] == "CEKME":
            cash[acc] -= amt
        elif f["tur"] == "TEMETTU":
            cash[acc] += amt
    return dict(cash)
```

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_positions.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migration/bbb_migration/positions.py migration/tests/test_positions.py
git commit -m "feat(migration): position derivation, realized P/L, cash balances"
```

---

## Task 9: Aylık snapshot çıkarımı (`snapshots.py`)

**Files:**
- Create: `migration/bbb_migration/snapshots.py`
- Modify: `migration/bbb_migration/xlsx_extract.py` (`extract_reference` içine `monthly_report` doldur)
- Modify: `migration/tests/fixtures/build_fixture.py` (Monthly Report sayfası ekle) → `mini.xlsm` yeniden üret
- Test: `migration/tests/test_snapshots.py`

**Rationale:** Geçmiş aylar için enstrüman bazında tarihsel kapanış fiyatı ucuz bir kaynaktan gelmiyor. Excel'in **Monthly Report** sayfası bu değerleri zaten hesaplamış. P0'da aylık snapshot'lar bu sayfadan **çıkarılır** ve doğrulanır; canlı hesaplama P1+ uygulamada. (spec §5.8, §11 "Migration geçmiş ayları üretir")

**Interfaces:**
- Consumes: `extract_reference(path)["monthly_report"]` — ham satırlar `{"ay": "YYYY-MM", "beg_capital", "deposits", "withdrawals", "gain", "loss", "cash_div", "end_capital", "tax_fees"}`
- Produces:
  - `build_snapshots(monthly_rows: list[dict]) -> list[dict]` — spec §5.8 şekli, `tarih` = ayın son günü (`YYYY-MM-<son>`), artan sırada. Alanlar: `{"tarih","toplamOzkaynak_usd": end_capital, "nakit_usd": None, "gerceklesmemisKZ_usd": None, "hesapBazli": {}, "portfoyBazli": {}, "sinifBazli": {}, "kaynak": "excel-monthly-report", "netKZ_usd": gain+loss, "vergiKomisyon_usd": tax_fees}`. (Hesap/portföy/sınıf kırılımı P0'da boş — Monthly Report'ta yok; P1 canlı üretir.)
  - `month_end(ym: str) -> str`

- [ ] **Step 1: `build_fixture.py`'a Monthly Report ekle, mini.xlsm yeniden üret**

`build()` içine, `wb.save(OUT)` öncesi:

```python
    mr = wb.create_sheet("Monthly Report")
    _set(mr, "B20", "Month"); _set(mr, "C20", "BEGINNING CAPITAL")
    _set(mr, "D20", "Net Deposits/ Withdr"); _set(mr, "F20", "Withdrawals")
    _set(mr, "G20", "Gain"); _set(mr, "H20", "Loss"); _set(mr, "I20", "Cash Dividends")
    _set(mr, "J20", "END CAPITAL"); _set(mr, "K20", "TAX & FEES")
    mr_rows = [
        (22, dt.datetime(2020, 1, 1), 1000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 900.0, 0.0),
        (23, dt.datetime(2021, 3, 1), 900.0, 0.0, 0.0, 175.0, 0.0, 0.0, 1075.0, 0.0),
    ]
    for r, m, beg, nd, wd, gn, ls, cd, endc, tf in mr_rows:
        _set(mr, f"B{r}", m); _set(mr, f"C{r}", beg); _set(mr, f"D{r}", nd)
        _set(mr, f"F{r}", wd); _set(mr, f"G{r}", gn); _set(mr, f"H{r}", ls)
        _set(mr, f"I{r}", cd); _set(mr, f"J{r}", endc); _set(mr, f"K{r}", tf)
```

Run: `.venv/bin/python tests/fixtures/build_fixture.py`

- [ ] **Step 2: `xlsx_extract.extract_reference`'a monthly_report çıkarımı ekle**

`extract_reference` içine (`Stock Position` bloğundan sonra):

```python
    if "Monthly Report" in wb.sheetnames:
        ws = wb["Monthly Report"]
        for row in range(21, ws.max_row + 1):
            m = _cell(ws, "B", row)
            if not hasattr(m, "year"):
                continue
            out["monthly_report"].append({
                "ay": f"{m.year:04d}-{m.month:02d}",
                "beg_capital": _cell(ws, "C", row),
                "deposits": _cell(ws, "D", row),
                "withdrawals": _cell(ws, "F", row),
                "gain": _cell(ws, "G", row),
                "loss": _cell(ws, "H", row),
                "cash_div": _cell(ws, "I", row),
                "end_capital": _cell(ws, "J", row),
                "tax_fees": _cell(ws, "K", row),
            })
```

- [ ] **Step 3: Failing test — `migration/tests/test_snapshots.py`**

```python
from pathlib import Path
from bbb_migration import snapshots as s
from bbb_migration import xlsx_extract as x

MINI = Path(__file__).parent / "fixtures" / "mini.xlsm"


def test_month_end():
    assert s.month_end("2020-01") == "2020-01-31"
    assert s.month_end("2020-02") == "2020-02-29"   # artık yıl
    assert s.month_end("2021-02") == "2021-02-28"


def test_build_snapshots_from_monthly_report():
    rows = x.extract_reference(MINI)["monthly_report"]
    snaps = s.build_snapshots(rows)
    assert [snap["tarih"] for snap in snaps] == ["2020-01-31", "2021-03-31"]
    assert snaps[0]["toplamOzkaynak_usd"] == 900.0
    assert snaps[1]["netKZ_usd"] == 175.0
    assert snaps[1]["kaynak"] == "excel-monthly-report"
```

- [ ] **Step 4: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_snapshots.py -v`
Expected: FAIL

- [ ] **Step 5: `snapshots.py` yaz**

```python
"""Aylık snapshot'lar — P0'da Excel Monthly Report sayfasından çıkarılır."""
from __future__ import annotations

import calendar

from .normalize import parse_decimal


def month_end(ym: str) -> str:
    y, m = (int(p) for p in ym.split("-"))
    return f"{ym}-{calendar.monthrange(y, m)[1]:02d}"


def build_snapshots(monthly_rows):
    out = []
    for row in monthly_rows:
        gain = parse_decimal(row.get("gain")) or 0.0
        loss = parse_decimal(row.get("loss")) or 0.0
        out.append({
            "tarih": month_end(row["ay"]),
            "toplamOzkaynak_usd": parse_decimal(row.get("end_capital")),
            "nakit_usd": None,
            "gerceklesmemisKZ_usd": None,
            "hesapBazli": {},
            "portfoyBazli": {},
            "sinifBazli": {},
            "netKZ_usd": round(gain + loss, 6),
            "vergiKomisyon_usd": parse_decimal(row.get("tax_fees")),
            "kaynak": "excel-monthly-report",
        })
    out.sort(key=lambda s: s["tarih"])
    return out
```

- [ ] **Step 6: Tüm testleri çalıştır (fixture değişti), PASS**

Run: `.venv/bin/pytest -v`
Expected: PASS — `test_xlsx_extract` dahil hepsi (fixture'a sayfa eklendi, mevcut assert'ler etkilenmez)

- [ ] **Step 7: Commit**

```bash
git add migration/bbb_migration/snapshots.py migration/bbb_migration/xlsx_extract.py migration/tests/fixtures/build_fixture.py migration/tests/fixtures/mini.xlsm migration/tests/test_snapshots.py
git commit -m "feat(migration): monthly snapshots from Excel Monthly Report sheet"
```

---

## Task 10: Mutabakat raporu (`reconcile.py`)

**Files:**
- Create: `migration/bbb_migration/reconcile.py`
- Test: `migration/tests/test_reconcile.py`

**Interfaces:**
- Consumes: `derive_positions` çıktısı, `extract_reference(path)["stock_position"]`, `build_transactions`/`build_cashflows` çıktıları, `transform` hata listeleri, `derive_positions`'ın `errors`'ı
- Produces:
  - `reconcile_positions(derived_open: dict, stock_position_rows: list[dict], lot_tol=0.5, amt_tol_pct=0.01) -> list[dict]` — her enstrüman için `{"kod","alan":"lot|amount","derived","excel","fark","gecti": bool}`. Excel'de olup türetilmede olmayan / tersi de satır üretir.
  - `anchor_checks(derived: dict, cashflows: list[dict], ref: dict) -> list[dict]` — `[{"capa": "toplam_yatirma", "derived", "excel", "gecti"}, {"capa": "gerceklesmis_kz_toplam", ...}]`. `toplam_yatirma` = Σ YATIRMA cashflow vs Bank Transfers "Total Deposits" (ref'te yoksa atla). `gerceklesmis_kz_toplam` = `derived["realized_total_usd"]` vs Stock Position toplam realized (ref'te varsa).
  - `render_report(*, position_rows, anchors, transform_errors, position_errors, unclassified, fx_missing) -> str` — Markdown. Başlık, "GEÇTİ/KALDI" özet satırı, sonra bölümler. Hiç sorun yoksa "✅ Tüm çapalar geçti."

- [ ] **Step 1: Failing test — `migration/tests/test_reconcile.py`**

```python
from bbb_migration import reconcile as rc


def test_reconcile_positions_pass_and_fail():
    derived_open = {
        "ASTOR": {"lot": 150, "ort_maliyet_usd": 1.5, "toplam_maliyet_usd": 225.0},
        "XAU": {"lot": 10, "ort_maliyet_usd": 50.0, "toplam_maliyet_usd": 500.0},
    }
    sp = [
        {"kod": "ASTOR", "lot": 150, "ave_price": 1.5, "amount": 225.0},
        {"kod": "XAU", "lot": 12, "ave_price": 50.0, "amount": 600.0},   # lot uyuşmaz
        {"kod": "THYAO", "lot": 25, "ave_price": 40.0, "amount": 1000.0},  # türetmede yok
    ]
    rows = rc.reconcile_positions(derived_open, sp)
    by = {(r["kod"], r["alan"]): r for r in rows}
    assert by[("ASTOR", "lot")]["gecti"] is True
    assert by[("XAU", "lot")]["gecti"] is False
    assert by[("THYAO", "lot")]["gecti"] is False
    assert by[("THYAO", "lot")]["derived"] == 0


def test_anchor_checks_total_deposits():
    flows = [{"tur": "YATIRMA", "tutar_usd": 1000.0}, {"tur": "CEKME", "tutar_usd": 200.0}]
    ref = {"total_deposits": 1000.0}
    anchors = rc.anchor_checks({"realized_total_usd": 0.0}, flows, ref)
    dep = [a for a in anchors if a["capa"] == "toplam_yatirma"][0]
    assert dep["derived"] == 1000.0 and dep["gecti"] is True


def test_render_report_clean():
    txt = rc.render_report(position_rows=[], anchors=[], transform_errors=[],
                           position_errors=[], unclassified=[], fx_missing=[])
    assert "✅" in txt


def test_render_report_lists_problems():
    txt = rc.render_report(
        position_rows=[{"kod": "XAU", "alan": "lot", "derived": 10, "excel": 12,
                        "fark": -2, "gecti": False}],
        anchors=[{"capa": "toplam_yatirma", "derived": 900.0, "excel": 1000.0, "gecti": False}],
        transform_errors=["row 21: aşırı satış"],
        position_errors=["t_x: aşırı satış ASTOR"],
        unclassified=["MYSTERY"],
        fx_missing=["2011-11-11"])
    for needle in ["XAU", "toplam_yatirma", "aşırı satış", "MYSTERY", "2011-11-11"]:
        assert needle in txt
```

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_reconcile.py -v`
Expected: FAIL

- [ ] **Step 3: `reconcile.py` yaz**

```python
"""Türetilen değerler vs Excel referans sayfaları — mutabakat raporu."""
from __future__ import annotations

from .normalize import parse_decimal


def reconcile_positions(derived_open, stock_position_rows, lot_tol=0.5, amt_tol_pct=0.01):
    rows = []
    excel = {}
    for r in stock_position_rows:
        excel[r["kod"]] = r
    keys = sorted(set(derived_open) | set(excel))
    for kod in keys:
        d = derived_open.get(kod)
        e = excel.get(kod)
        d_lot = d["lot"] if d else 0
        e_lot = parse_decimal(e["lot"]) if e else 0
        rows.append({"kod": kod, "alan": "lot", "derived": d_lot, "excel": e_lot,
                     "fark": round(d_lot - (e_lot or 0), 6),
                     "gecti": abs(d_lot - (e_lot or 0)) <= lot_tol})
        d_amt = d["toplam_maliyet_usd"] if d else 0
        e_amt = parse_decimal(e["amount"]) if e else 0
        base = max(abs(e_amt or 0), 1.0)
        rows.append({"kod": kod, "alan": "amount", "derived": round(d_amt, 6),
                     "excel": e_amt, "fark": round(d_amt - (e_amt or 0), 6),
                     "gecti": abs(d_amt - (e_amt or 0)) / base <= amt_tol_pct})
    return rows


def anchor_checks(derived, cashflows, ref):
    out = []
    total_dep = round(sum(f["tutar_usd"] for f in cashflows if f["tur"] == "YATIRMA"), 6)
    if ref.get("total_deposits") is not None:
        exc = parse_decimal(ref["total_deposits"])
        out.append({"capa": "toplam_yatirma", "derived": total_dep, "excel": exc,
                    "gecti": abs(total_dep - exc) <= 0.01 * max(abs(exc), 1.0)})
    if ref.get("realized_total") is not None:
        exc = parse_decimal(ref["realized_total"])
        d = round(derived["realized_total_usd"], 6)
        out.append({"capa": "gerceklesmis_kz_toplam", "derived": d, "excel": exc,
                    "gecti": abs(d - exc) <= 0.01 * max(abs(exc), 1.0)})
    return out


def render_report(*, position_rows, anchors, transform_errors, position_errors,
                  unclassified, fx_missing):
    fails = ([r for r in position_rows if not r["gecti"]]
             + [a for a in anchors if not a["gecti"]]
             + list(transform_errors) + list(position_errors)
             + list(unclassified) + list(fx_missing))
    lines = ["# Migration Mutabakat Raporu", ""]
    if not fails:
        lines.append("✅ Tüm çapalar geçti, çözülmemiş sorun yok.")
        return "\n".join(lines) + "\n"

    lines.append(f"⚠️ {len(fails)} açık sorun.\n")

    if unclassified:
        lines += ["## Sınıflandırılmamış enstrümanlar", ""]
        lines += [f"- `{c}` → `overrides/instruments.json`'a `sinif` gir" for c in unclassified]
        lines.append("")
    if fx_missing:
        lines += ["## Kuru bulunamayan tarihler", ""]
        lines += [f"- {d} → `overrides/fxrates_seed.json`" for d in fx_missing]
        lines.append("")
    if transform_errors:
        lines += ["## Dönüşüm hataları (atlanan satırlar)", ""]
        lines += [f"- {e}" for e in transform_errors]
        lines.append("")
    if position_errors:
        lines += ["## Pozisyon hataları", ""]
        lines += [f"- {e}" for e in position_errors]
        lines.append("")

    bad_pos = [r for r in position_rows if not r["gecti"]]
    if bad_pos:
        lines += ["## Pozisyon uyuşmazlıkları (türetilen vs Excel)", "",
                  "| Kod | Alan | Türetilen | Excel | Fark |", "|---|---|---:|---:|---:|"]
        lines += [f'| {r["kod"]} | {r["alan"]} | {r["derived"]:.4f} | '
                  f'{(r["excel"] or 0):.4f} | {r["fark"]:.4f} |' for r in bad_pos]
        lines.append("")

    bad_anchor = [a for a in anchors if not a["gecti"]]
    if bad_anchor:
        lines += ["## Çapa kontrolleri", "", "| Çapa | Türetilen | Excel |", "|---|---:|---:|"]
        lines += [f'| {a["capa"]} | {a["derived"]:.4f} | {(a["excel"] or 0):.4f} |'
                  for a in bad_anchor]
        lines.append("")

    return "\n".join(lines) + "\n"
```

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_reconcile.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migration/bbb_migration/reconcile.py migration/tests/test_reconcile.py
git commit -m "feat(migration): reconciliation report against Excel reference sheets"
```

---

## Task 11: CLI orkestrasyon (`cli.py`)

**Files:**
- Create: `migration/bbb_migration/cli.py`, `migration/bbb_migration/__main__.py`
- Test: `migration/tests/test_cli_integration.py`

**Interfaces:**
- Consumes: tüm önceki modüller
- Produces:
  - `run(xlsm_path, out_dir, overrides_dir, cache_path, *, tcmb_fetch=None) -> dict` — özet `{"transactions": n, "cashflows": n, "unclassified": [...], "fx_missing": [...], "report_path": str, "ok": bool}`. Şunları yazar: `out_dir/{transactions,cashflows,brokers,portfolios,instruments,fxrates,snapshots,meta}.json` + `out_dir/reconciliation-report.md`. `ok` = rapor temiz mi.
  - `main(argv=None) -> int` — `argparse`: `--xlsm`, `--out` (default `data/`), `--overrides` (default `migration/overrides`), `--cache` (default `migration/overrides/fxrates_cache.json`). `ok` değilse çıkış kodu `1` ama dosyalar yine yazılır (iteratif çalışma için).
- `meta.json`: `{"semaVersiyonu": 1, "olusturulma": <iso now>, "kaynak": "BigBlackBook_2026v15 kopyası.xlsm", "p0Sinirlari": ["Bank Transfers hesap kırılımı yok → nakit 'TOPLU' altında", "aylık snapshot Excel Monthly Report'tan, hesap/portföy/sınıf kırılımı boş"]}`

- [ ] **Step 1: Failing test — `migration/tests/test_cli_integration.py`**

```python
import json
from pathlib import Path
from bbb_migration import cli

FIX = Path(__file__).parent / "fixtures"
SAMPLE_XML = (FIX / "tcmb_sample.xml").read_text(encoding="latin-1")


def _overrides(tmp_path):
    d = tmp_path / "ov"
    d.mkdir()
    (d / "instruments.json").write_text(json.dumps({
        "ASTOR": {"sinif": "BIST", "fiyatKaynagi": "yahoo", "fiyatSembolu": "ASTOR.IS", "girisParaBirimi": "TL"},
        "XAU": {"sinif": "ALTIN", "fiyatKaynagi": "altin-turev", "fiyatSembolu": "XAUUSD", "girisParaBirimi": "TL"},
        "AFT.F": {"sinif": "FON_PARA", "fiyatKaynagi": "tefas", "fiyatSembolu": "AFT", "girisParaBirimi": "TL"},
        "THYAO": {"sinif": "BIST", "fiyatKaynagi": "yahoo", "fiyatSembolu": "THYAO.IS", "girisParaBirimi": "TL"},
    }))
    (d / "fxrates_seed.json").write_text(json.dumps({}))
    return d


def test_run_produces_all_files(tmp_path):
    out = tmp_path / "data"
    summary = cli.run(FIX / "mini.xlsm", out, _overrides(tmp_path),
                      tmp_path / "cache.json", tcmb_fetch=lambda ymd: SAMPLE_XML)
    for name in ["transactions", "cashflows", "brokers", "portfolios",
                 "instruments", "fxrates", "snapshots", "meta"]:
        assert (out / f"{name}.json").exists(), name
    assert (out / "reconciliation-report.md").exists()

    txns = json.loads((out / "transactions.json").read_text())
    assert len(txns) == 6            # 7 satır, row 21 aşırı satış değil ama geçerli işlem → aslında 7
    # row 21 geçerli bir SAT kaydı (transform onu üretir); recon "aşırı satış" der
    assert len(txns) == 7
    assert {t["hesap"] for t in txns} == {"MIDAS", "KASA", "QNB", "GARAN"}

    cf = json.loads((out / "cashflows.json").read_text())
    assert {c["tur"] for c in cf} == {"YATIRMA", "CEKME", "TEMETTU"}

    fx = json.loads((out / "fxrates.json").read_text())
    assert all(v == 5.941 for v in fx.values())


def test_run_is_deterministic(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    ov = _overrides(tmp_path)
    for o in (a, b):
        cli.run(FIX / "mini.xlsm", o, ov, tmp_path / f"c_{o.name}.json",
                tcmb_fetch=lambda ymd: SAMPLE_XML)
    for name in ["transactions", "cashflows", "instruments", "snapshots"]:
        assert (a / f"{name}.json").read_text() == (b / f"{name}.json").read_text()


def test_run_flags_oversell_in_report(tmp_path):
    out = tmp_path / "data"
    cli.run(FIX / "mini.xlsm", out, _overrides(tmp_path), tmp_path / "c.json",
            tcmb_fetch=lambda ymd: SAMPLE_XML)
    report = (out / "reconciliation-report.md").read_text()
    assert "aşırı satış" in report
```

> Not: fixture row 21 (ASTOR SAT 200) — `build_transaction` bunu geçerli üretir (200 lot, fiyat 6.0). Toplam ASTOR: +100 +100 −50 −200 → `derive_positions` net −50 → clamp, "aşırı satış" hatası. `transactions.json` 7 kayıt içerir; mutabakat raporu sorunu yakalar. Test bunu doğrular.

- [ ] **Step 2: Testi çalıştır, fail**

Run: `.venv/bin/pytest tests/test_cli_integration.py -v`
Expected: FAIL

- [ ] **Step 3: `cli.py` + `__main__.py` yaz**

```python
"""Migration orkestrasyonu."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from . import constants, instruments as im, positions as pos, reconcile as rc
from . import snapshots as snap, tcmb, transform as tr, xlsx_extract as xx


def _write(path: Path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False))


def run(xlsm_path, out_dir, overrides_dir, cache_path, *, tcmb_fetch=None):
    xlsm_path, out_dir = Path(xlsm_path), Path(out_dir)
    overrides_dir, cache_path = Path(overrides_dir), Path(cache_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    trades_raw = xx.extract_trades(xlsm_path)
    bank_raw = xx.extract_bank_transfers(xlsm_path)
    div_raw = xx.extract_dividends(xlsm_path)
    ref = xx.extract_reference(xlsm_path)

    inst_ov = json.loads((overrides_dir / "instruments.json").read_text())
    codes = im.distinct_codes(trades_raw)
    inst_list, unclassified = im.build_instruments(codes, inst_ov)
    inst_map = {i["kod"]: i for i in inst_list}

    seed = overrides_dir / "fxrates_seed.json"
    client = tcmb.TcmbClient(cache_path, seed_path=seed if seed.exists() else None,
                             fetch=tcmb_fetch)
    dates = set()
    for r in trades_raw:
        d = tr.n.parse_date(r["tarih_raw"])
        if d:
            dates.add(d)
    for r in bank_raw:
        d = tr.n.parse_date(r["tarih_raw"])
        if d:
            dates.add(d)
    fx, fx_missing = {}, []
    for d in sorted(dates):
        try:
            fx[d] = client.get_rate(d)
        except LookupError:
            fx_missing.append(d)
    client.save_cache()

    txns, terrors = tr.build_transactions(trades_raw, fx, inst_map)
    flows, cerrors = tr.build_cashflows(bank_raw, div_raw, fx)
    pos_res = pos.derive_positions(txns)
    cash = pos.derive_cash_by_account(txns, flows)
    snaps = snap.build_snapshots(ref.get("monthly_report", []))

    pos_rows = rc.reconcile_positions(pos_res["open"], ref.get("stock_position", []))
    anchors = rc.anchor_checks(pos_res, flows, {
        "total_deposits": ref.get("total_deposits"),
        "realized_total": ref.get("realized_total"),
    })
    report = rc.render_report(
        position_rows=pos_rows, anchors=anchors,
        transform_errors=[str(e) for e in terrors] + [str(e) for e in cerrors],
        position_errors=pos_res["errors"], unclassified=unclassified,
        fx_missing=fx_missing)

    _write(out_dir / "transactions.json", txns)
    _write(out_dir / "cashflows.json", flows)
    _write(out_dir / "brokers.json", constants.BROKERS)
    _write(out_dir / "portfolios.json", constants.PORTFOLIOS)
    _write(out_dir / "instruments.json", inst_list)
    _write(out_dir / "fxrates.json", fx)
    _write(out_dir / "snapshots.json", snaps)
    _write(out_dir / "meta.json", {
        "semaVersiyonu": 1,
        "olusturulma": dt.datetime.now().isoformat(timespec="seconds"),
        "kaynak": xlsm_path.name,
        "nakitHesapBazli": cash,
        "p0Sinirlari": [
            "Bank Transfers hesap kırılımı yok → nakit 'TOPLU' altında",
            "aylık snapshot Excel Monthly Report'tan; hesap/portföy/sınıf kırılımı boş",
        ],
    })
    (out_dir / "reconciliation-report.md").write_text(report)

    ok = report.startswith("# Migration Mutabakat Raporu\n\n✅")
    return {
        "transactions": len(txns), "cashflows": len(flows),
        "unclassified": unclassified, "fx_missing": fx_missing,
        "report_path": str(out_dir / "reconciliation-report.md"), "ok": ok,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(prog="bbb_migration")
    ap.add_argument("--xlsm", required=True)
    ap.add_argument("--out", default="data")
    ap.add_argument("--overrides", default="migration/overrides")
    ap.add_argument("--cache", default="migration/overrides/fxrates_cache.json")
    args = ap.parse_args(argv)
    summary = run(args.xlsm, args.out, args.overrides, args.cache)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

`migration/bbb_migration/__main__.py`:

```python
from .cli import main

raise SystemExit(main())
```

> Not: `tr.n` — `transform.py` zaten `from . import normalize as n` yapıyor, `tr.n` ile erişilir. Erişilemezse `from . import normalize` ekleyip `normalize.parse_date` kullan.

- [ ] **Step 4: Testi çalıştır, PASS**

Run: `.venv/bin/pytest tests/test_cli_integration.py -v`
Expected: PASS (3 test)

- [ ] **Step 5: Tüm suite + commit**

```bash
.venv/bin/pytest -v
git add migration/bbb_migration/cli.py migration/bbb_migration/__main__.py migration/tests/test_cli_integration.py
git commit -m "feat(migration): CLI orchestration producing full JSON output set"
```

---

## Task 12: Gerçek workbook üzerinde çalıştırma + prosedür dokümanı

**Files:**
- Create: `migration/README.md`
- Modify: `migration/overrides/instruments.json` (gerçek 46 kod), `migration/overrides/fxrates_seed.json` (gerekirse)
- Modify: `docs/superpowers/specs/2026-09-02-bbb-tracker-design.md` §15 (çözülen maddeleri işaretle)

**Bu task interaktif** — çıktı, tekrar tekrar çalıştırılıp `overrides/` doldurularak yakınsanan bir veri seti. Adımlar bir prosedür; "test" = mutabakat raporunun temizlenmesi.

- [ ] **Step 1: `migration/README.md` yaz**

````markdown
# BBB Migration

Excel geçmişini `../data/` altına doğrulanmış JSON'a çevirir.

## Kurulum
```bash
cd migration && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Çalıştırma döngüsü
1. `.venv/bin/python -m bbb_migration --xlsm "../BigBlackBook_2026v15 kopyası.xlsm"`
2. `../data/reconciliation-report.md` oku.
3. Rapordaki "Sınıflandırılmamış enstrümanlar" → `overrides/instruments.json`'a
   `sinif` (`BIST|ALTIN|FON_PARA|FON_HISSE|USA`), `fiyatSembolu`, `fiyatKaynagi`,
   gerekiyorsa `girisParaBirimi` ve altın için `altinKatsayi` gir.
4. "Kuru bulunamayan tarihler" → `overrides/fxrates_seed.json`'a TCMB Döviz Alış değeri.
5. "Dönüşüm / pozisyon hataları" ve "Pozisyon uyuşmazlıkları" → Enis ile satır satır incele
   (Excel'de kaynak satırı aç, gerçek değeri doğrula, gerekirse `overrides/` veya
   fixture-dışı düzeltme notu).
6. Rapor `✅` verene kadar 1–5'i tekrarla.
7. Temizlenince: `fxrates_cache.json` ve `data/` P1'de Drive'a yüklenecek.

## Notlar
- TCMB günlük XML'i ~2600 iş günü için ilk çalıştırmada indirilir; `fxrates_cache.json`
  sonraki çalıştırmaları hızlandırır (commit'lenir).
- `data/` git-ignore'dur; ham finansal veri depoya girmez.
````

- [ ] **Step 2: İlk gerçek çalıştırma — sınıflandırma boşluklarını gör**

Run:
```bash
cd migration
.venv/bin/python -m bbb_migration --xlsm "../BigBlackBook_2026v15 kopyası.xlsm"
```
Expected: çıkış kodu `1`; `../data/reconciliation-report.md` "Sınıflandırılmamış enstrümanlar" listeler (46 koda yakın).

- [ ] **Step 3: `overrides/instruments.json`'u 46 kod için doldur**

Referans: workbook `Varlik Siniflari` sayfası (kod → kategori: BIST / Altin / Para Fonlari / Hisse Fonlari / USA) ve `Stock Position` / `Portföyler`. Kategori eşlemesi:
`Altin→ALTIN`, `BIST→BIST`, `Para Fonlari→FON_PARA`, `Hisse Fonlari→FON_HISSE`, `USA→USA`.
`fiyatSembolu`: BIST → `<KOD>.IS`, USA → çıplak sembol, ALTIN → `XAUUSD` + `altinKatsayi`
(gram=1, çeyrek≈1.75g, yarım≈3.5g, tam/ATA≈7.2g — Enis ile netleştir), FON_* → TEFAS fon kodu.
`.F` ekli kodlar için `sinif` `FON_PARA` veya `FON_HISSE`.

- [ ] **Step 4: XAU giriş para birimini netleştir (spec §15)**

`XAU` kayıtlarının Excel `I` sütunu USD mi? `overrides/instruments.json`'da `XAU` için
`girisParaBirimi` ayarla (`ALTIN` → varsayılan `TL`; fiziki XAU USD ise `"USD"`). Enis onaylar.

- [ ] **Step 5: Yeniden çalıştır, kur boşluklarını doldur**

Run: aynı komut. `fxrates_seed.json`'a rapordaki eksik tarihleri gir (varsa — TCMB 2016+ için genelde tam).

- [ ] **Step 6: Pozisyon uyuşmazlıklarını Enis ile çöz**

Rapordaki her `gecti: False` pozisyon satırı için: Excel `Stock Position` vs türetilen lot/tutar.
Beklenen küçük farklar: komisyon modeli, `Manual Fees` sütunu, tarihsel bölünme/temettü-hisse.
Büyük farklar → kaynak satır hatası; `overrides/` veya (gerekirse) `constants` düzeltmesi +
yeni test.

- [ ] **Step 7: Rapor temiz — doğrulama**

Run: `.venv/bin/python -m bbb_migration --xlsm "../BigBlackBook_2026v15 kopyası.xlsm"`
Expected: çıkış kodu `0`; rapor `✅`. `../data/` içinde 8 JSON + rapor.

Manuel göz kontrolü (Enis):
- `data/transactions.json` kayıt sayısı ≈ 154
- `data/meta.json` → `nakitHesapBazli` toplamı Excel Dashboard "Nakit Bakiyesi" (49403.89) ile ±%1
- `data/snapshots.json` son ay `toplamOzkaynak_usd` ≈ Excel Monthly Report son `END CAPITAL`

- [ ] **Step 8: spec §15 güncelle + commit**

`docs/superpowers/specs/2026-09-02-bbb-tracker-design.md` §15: madde 3 (TCMB kuru → "Döviz Alış" sabitlendi), madde 5 (altın katsayıları → `overrides/instruments.json`'da), madde varsa XAU para birimi — çözüldü olarak işaretle.

```bash
cd /Users/enisuslu/Desktop/Market/BBB
git add migration/README.md migration/overrides/instruments.json migration/overrides/fxrates_seed.json migration/overrides/fxrates_cache.json docs/superpowers/specs/2026-09-02-bbb-tracker-design.md
git commit -m "chore(migration): real-data overrides, cached FX, procedure doc; reconciliation clean"
```

---

## Self-Review

**1. Spec coverage:**

| Spec bölümü | Task |
|---|---|
| §5.1 `transactions.json` | Task 6 |
| §5.2 `cashflows.json` | Task 7 |
| §5.3 `brokers.json` | Task 1 (statik) + Task 11 (yazım) |
| §5.4 `portfolios.json` | Task 1 + Task 11 |
| §5.5 `instruments.json` | Task 5 + Task 12 (gerçek doldurma) |
| §5.6 `fxrates.json` | Task 4 + Task 11 |
| §5.7 `prices.json` | **Kapsam dışı (P0)** — P3'te Worker üretir; migration boş bırakır |
| §5.8 `snapshots.json` | Task 9 |
| §5.9 `meta.json` | Task 11 |
| §8.1 çıkarma | Task 3 |
| §8.2 eşleme tablosu | Task 1 (`LABEL_MAP`) + Task 6 |
| §8.3 fiyat para birimi | Task 6 + Task 12 Step 4 |
| §8.4 kur doldurma | Task 4 + Task 11 |
| §8.5 türetme | Task 8 (pozisyon/K-Z/nakit) + Task 9 (snapshot) |
| §8.6 mutabakat raporu | Task 10 + Task 12 |
| §8.7 doğrulama çapaları | Task 10 (`anchor_checks`) + Task 12 Step 7 |
| §11 hesaplama kuralları | Task 8 |
| §15 açık sorular (TCMB kuru, altın katsayı, XAU birimi) | Task 12 Step 4/8 |

`prices.json` P0 kapsamı dışında (spec §14: P3). Bu bilinçli — plan yalnızca P0'ı kapsıyor. Diğer tüm §5 şemaları ve §8 adımları bir task'a bağlı.

**2. Placeholder scan:** "Add error handling / validation / edge cases" ifadeleri yok; hata yolları test parametrelerinde ve `TransformError`/`errors` listelerinde somut. Her kod adımında gerçek kod bloğu var. Task 12 doğası gereği prosedürel ama her adımı çalıştırılabilir komut veya somut dosya düzenlemesi.

**3. Type consistency:**
- `LABEL_MAP` anahtarı: her yerde `normalize_label(...)` sonucu (Task 1, 6).
- transaction dict alan adları: Task 6'da tanımlı, Task 8/10/11'de aynı (`net_usd`, `fiyat_usd`, `komisyon_usd`, `enstruman`, `hesap`, `yon`, `lot`, `tarih`, `id`).
- cashflow dict alanları: Task 7'de tanımlı (`tur`, `tutar_usd`, `hesap`), Task 8 `derive_cash_by_account` ve Task 10 `anchor_checks` aynı kullanır.
- `derive_positions` dönüşü `{"open","closed","realized_total_usd","errors"}` — Task 10 `reconcile_positions(pos_res["open"], ...)` ve `anchor_checks(pos_res, ...)` ile Task 11'de tutarlı.
- `extract_reference` dönüşü `{"stock_position","monthly_report","portfoyler"}` — Task 3'te iskelet, Task 9'da `monthly_report` doldurulur, Task 10/11 tüketir.
- `TcmbClient(cache_path, seed_path, fetch)` imzası Task 4 ↔ Task 11 aynı.
- `render_report` kwargs Task 10 ↔ Task 11 aynı (`position_rows, anchors, transform_errors, position_errors, unclassified, fx_missing`).

Tutarsızlık bulunmadı.

---

## Execution Handoff

Plan `docs/superpowers/plans/2026-09-02-bbb-p0-migration.md` altına kaydedildi. İki yürütme seçeneği:

**1. Subagent-Driven (önerilen)** — her task için taze subagent, task'lar arası inceleme, hızlı iterasyon.

**2. Inline Execution** — bu oturumda executing-plans ile, kontrol noktalarında toplu yürütme.

Hangisi?
