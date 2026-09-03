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
