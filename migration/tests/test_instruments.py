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
