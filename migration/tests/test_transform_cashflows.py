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


def test_bank_cashflow_id_is_content_derived():
    raw = dict(row_no=15, tarih_raw="2019-01-02", action_raw="Deposit",
               gross_raw=1000.0, fees_raw=0, net_raw=1000.0, notes_raw="ilk")
    c = tr.build_bank_cashflow(raw)
    import hashlib
    # payload: hesap=TOPLU, portfoy/enstruman/yon/lot/fiyat_usd=None, tur NOT in payload
    payload = "2019-01-02|TOPLU|None|None|None|None|None|0"
    assert c["id"] == "c_" + hashlib.sha1(payload.encode()).hexdigest()[:16]
    assert "bank:" not in payload  # satır numarası artık id'ye girmiyor


def test_dividend_cashflow_id_is_content_derived():
    raw = dict(row_no=16, kod_raw="ASTOR", tur_raw="Cash", value_raw=100.0,
               usdtry_raw=25.0, exdiv_raw="2023-04-10", paid_usd_raw=4.0)
    c = tr.build_dividend_cashflow(raw, FX)
    import hashlib
    payload = "2023-04-10|TOPLU|None|ASTOR|None|None|None|0"
    assert c["id"] == "c_" + hashlib.sha1(payload.encode()).hexdigest()[:16]


def test_build_cashflows_disambiguates_identical_records():
    bank = [
        dict(row_no=15, tarih_raw="2019-01-02", action_raw="Deposit",
             gross_raw=1000.0, fees_raw=0, net_raw=1000.0, notes_raw="a"),
        dict(row_no=16, tarih_raw="2019-01-02", action_raw="Deposit",
             gross_raw=1000.0, fees_raw=0, net_raw=1000.0, notes_raw="b"),
    ]
    flows, errors = tr.build_cashflows(bank, [], FX)
    assert errors == []
    assert flows[0]["id"] != flows[1]["id"]
    flows2, _ = tr.build_cashflows(bank, [], FX)
    assert [f["id"] for f in flows] == [f["id"] for f in flows2]
