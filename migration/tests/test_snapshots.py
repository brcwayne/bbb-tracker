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
    # Gerçek düzen: iterasyon satır 21'den başlar ama satır 21 = YTD TOTALS (C boş) → dışlanır.
    # mini.xlsm'de kalan veri satırları 22 = 2020-01, 23 = 2021-03 → tarihe göre sıralı.
    assert [snap["tarih"] for snap in snaps] == ["2020-01-31", "2021-03-31"]
    assert snaps[0]["toplamOzkaynak_usd"] == 900.0
    assert snaps[1]["netKZ_usd"] == 175.0
    assert snaps[1]["kaynak"] == "excel-monthly-report"
    assert not any(s["tarih"] == "2022-06-30" for s in snaps)  # TOTALS satırı hariç
    # F8: dört Monthly Report sütunu snapshot'a taşınır
    assert snaps[0]["baslangicSermayesi_usd"] == 1000.0
    assert snaps[0]["netMevduatCekim_usd"] == 250.0
    assert snaps[0]["cekim_usd"] == 30.0
    assert snaps[0]["nakitTemettu_usd"] == 12.0
    assert snaps[1]["baslangicSermayesi_usd"] == 900.0
    assert snaps[1]["cekim_usd"] == 40.0
    assert snaps[1]["nakitTemettu_usd"] == 7.0


def test_extract_reference_monthly_report_excludes_totals_row():
    ref = x.extract_reference(MINI)
    mr = ref["monthly_report"]
    # Satır 21 (C boş, TOTALS) hariç → yalnızca 2 gerçek veri satırı
    assert [r["ay"] for r in mr] == ["2020-01", "2021-03"]
    jan = mr[0]
    # Gerçek veri satırının sütunları doğru anahtarlara oturur (hepsi ayrı değerler)
    assert jan["beg_capital"] == 1000
    assert jan["withdrawals"] == 30
    assert jan["cash_div"] == 12
    assert jan["tax_fees"] == 4
