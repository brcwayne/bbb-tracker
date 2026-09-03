"""Enstrüman iskeleti — distinct kodlar + overrides/instruments.json birleşimi."""
from __future__ import annotations

VALID_SINIF = {"BIST", "ALTIN", "FON_PARA", "FON_HISSE", "USA"}


def distinct_codes(trades) -> list[str]:
    seen = {t["kod_raw"].strip() for t in trades if isinstance(t["kod_raw"], str)}
    return sorted(seen)


def default_giris_para_birimi(sinif) -> str:
    return "USD" if sinif == "USA" else "TL"


def build_instruments(codes, overrides):
    overrides = {k: v for k, v in overrides.items() if not k.startswith("_")}
    insts, unclassified = [], []
    for code in codes:
        ov = overrides.get(code, {})
        sinif = ov.get("sinif")
        if sinif is not None and sinif not in VALID_SINIF:
            raise ValueError(f"{code}: geçersiz sinif {sinif!r}")
        giris = ov.get("girisParaBirimi") or (default_giris_para_birimi(sinif) if sinif else None)
        inst = {
            "kod": code,
            "ad": ov.get("ad", code),
            "sinif": sinif,
            "girisParaBirimi": giris,
            "fiyatKaynagi": ov.get("fiyatKaynagi"),
            "fiyatSembolu": ov.get("fiyatSembolu"),
            "seviyeler": ov.get("seviyeler"),
        }
        if "altinKatsayi" in ov:
            inst["altinKatsayi"] = ov["altinKatsayi"]
        insts.append(inst)
        if sinif is None:
            unclassified.append(code)
    return insts, unclassified
