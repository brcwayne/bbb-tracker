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
    # mini.xlsm has 7 Trade Log data rows (15-21); all transform successfully.
    # Row 21's ASTOR oversell is caught at reconciliation, not at transform.
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
