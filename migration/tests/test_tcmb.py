import json
from pathlib import Path
import pytest
from bbb_migration import tcmb

SAMPLE = (Path(__file__).parent / "fixtures" / "tcmb_sample.xml").read_text(encoding="latin-1")


def test_parse_tcmb_xml_reads_usd_forex_buying():
    assert tcmb.parse_tcmb_xml(SAMPLE) == 5.9410


def test_parse_tcmb_xml_missing_returns_none():
    assert tcmb.parse_tcmb_xml("<Tarih_Date></Tarih_Date>") is None


def test_get_rate_uses_cache_first(tmp_path):
    cache = tmp_path / "cache.json"
    cache.write_text(json.dumps({"2020-01-06": 5.941}))
    calls = []
    client = tcmb.TcmbClient(cache, fetch=lambda ymd: calls.append(ymd) or None)
    assert client.get_rate("2020-01-06") == 5.941
    assert calls == []


def test_get_rate_walks_back_to_previous_business_day(tmp_path):
    # 2020-01-05 pazar; fetch yalnızca 05 ve 04 için None, 03 için sample döndürür
    def fake_fetch(ymd):
        return SAMPLE if ymd == "03012020" else None
    client = tcmb.TcmbClient(tmp_path / "c.json", fetch=fake_fetch)
    assert client.get_rate("2020-01-05") == 5.9410


def test_get_rate_falls_back_to_seed(tmp_path):
    # F6: seed cache'ten hemen sonra danışılır; walk-back HTTP denenmez
    seed = tmp_path / "seed.json"
    seed.write_text(json.dumps({"1999-01-04": 0.31}))
    calls = []
    client = tcmb.TcmbClient(tmp_path / "c.json", seed_path=seed,
                             fetch=lambda ymd: calls.append(ymd) or None)
    assert client.get_rate("1999-01-04") == 0.31
    assert calls == []  # seed kapsıyorsa fetch hiç çağrılmaz


def test_get_rate_raises_when_nothing_found(tmp_path):
    client = tcmb.TcmbClient(tmp_path / "c.json", fetch=lambda ymd: None)
    with pytest.raises(LookupError):
        client.get_rate("1990-01-01")


def test_build_fxrates_dedupes_and_sorts(tmp_path):
    client = tcmb.TcmbClient(tmp_path / "c.json", fetch=lambda ymd: SAMPLE)
    out = client.build_fxrates(["2020-03-02", "2020-01-06", "2020-03-02"])
    assert list(out.keys()) == ["2020-01-06", "2020-03-02"]
    assert all(v == 5.9410 for v in out.values())
