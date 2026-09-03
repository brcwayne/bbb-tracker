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
