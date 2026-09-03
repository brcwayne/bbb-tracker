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
