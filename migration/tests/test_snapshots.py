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
