"""TCMB günlük döviz kuru (USD Döviz Alış). Kaynak: tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml"""
from __future__ import annotations

import datetime as dt
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

_URL = "https://www.tcmb.gov.tr/kurlar/{yyyymm}/{ddmmyyyy}.xml"
_MAX_WALKBACK = 10


def parse_tcmb_xml(text: str):
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return None
    for cur in root.findall("Currency"):
        if cur.get("Kod") == "USD" or cur.get("CurrencyCode") == "USD":
            node = cur.find("ForexBuying")
            if node is not None and node.text and node.text.strip():
                return float(node.text.strip())
    return None


def _http_fetch(ymd: str):
    d = dt.datetime.strptime(ymd, "%d%m%Y").date()
    url = _URL.format(yyyymm=d.strftime("%Y%m"), ddmmyyyy=ymd)
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            return resp.read().decode("latin-1")
    except Exception:
        return None


class TcmbClient:
    def __init__(self, cache_path, seed_path=None, fetch=None):
        self.cache_path = Path(cache_path)
        self.fetch = fetch or _http_fetch
        self.cache = {}
        if self.cache_path.exists():
            self.cache = json.loads(self.cache_path.read_text())
        self.seed = {}
        if seed_path and Path(seed_path).exists():
            self.seed = {k: v for k, v in json.loads(Path(seed_path).read_text()).items()
                         if not k.startswith("_")}

    def get_rate(self, date_iso: str) -> float:
        if date_iso in self.cache:
            return self.cache[date_iso]
        if date_iso in self.seed:
            self.cache[date_iso] = self.seed[date_iso]
            return self.seed[date_iso]
        d0 = dt.date.fromisoformat(date_iso)
        for i in range(_MAX_WALKBACK + 1):
            d = d0 - dt.timedelta(days=i)
            key = d.isoformat()
            if key in self.cache:
                self.cache[date_iso] = self.cache[key]
                return self.cache[key]
            text = self.fetch(d.strftime("%d%m%Y"))
            rate = parse_tcmb_xml(text) if text else None
            if rate is not None:
                self.cache[key] = rate
                self.cache[date_iso] = rate
                return rate
        raise LookupError(f"USD/TRY bulunamadı: {date_iso}")

    def build_fxrates(self, dates):
        out = {}
        for d in sorted(set(dates)):
            out[d] = self.get_rate(d)
        return out

    def save_cache(self):
        self.cache_path.write_text(json.dumps(self.cache, indent=2, sort_keys=True))
