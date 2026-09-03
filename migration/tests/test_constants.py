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
