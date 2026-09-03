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
