"""Ham Excel satırları → spec §5.1 / §5.2 kayıtları."""
from __future__ import annotations

import hashlib

from .constants import LABEL_MAP, MONEY_ROUND, normalize_label
from . import normalize as n


class TransformError(Exception):
    def __init__(self, row_no, reason):
        super().__init__(f"row {row_no}: {reason}")
        self.row_no = row_no
        self.reason = reason


def _rid(prefix, key):
    return prefix + hashlib.sha1(key.encode()).hexdigest()[:MONEY_ROUND + 10]


def _r(x):
    return round(x, MONEY_ROUND)


def build_transaction(raw, fx, instruments):
    rn = raw["row_no"]
    label = raw["portfoy_raw"]
    if not isinstance(label, str) or normalize_label(label) not in LABEL_MAP:
        raise TransformError(rn, f"bilinmeyen portföy etiketi: {label!r}")
    hesap, portfoy = LABEL_MAP[normalize_label(label)]

    yon = n.parse_action(raw["yon_raw"])
    if yon is None:
        raise TransformError(rn, f"yön çözülemedi: {raw['yon_raw']!r}")

    tarih = n.parse_date(raw["tarih_raw"])
    if tarih is None:
        raise TransformError(rn, f"tarih çözülemedi: {raw['tarih_raw']!r}")

    fiyat_usd = n.parse_decimal(raw["fiyat_raw"])
    if fiyat_usd is None:
        raise TransformError(rn, f"fiyat çözülemedi: {raw['fiyat_raw']!r}")

    lot = n.parse_decimal(raw["lot_raw"])
    if lot is None or lot <= 0:
        raise TransformError(rn, f"lot geçersiz: {raw['lot_raw']!r}")

    if tarih not in fx:
        raise TransformError(rn, f"kur yok: {tarih}")
    kur = fx[tarih]

    kod = str(raw["kod_raw"]).strip()
    if kod not in instruments:
        raise TransformError(rn, f"enstrüman tanımsız: {kod}")
    inst = instruments[kod]

    tl = n.parse_decimal(raw["tl_raw"])
    fiyat_tl = tl if tl is not None else _r(fiyat_usd * kur)
    brut_usd = _r(lot * fiyat_usd)
    komisyon_usd = n.parse_decimal(raw["komisyon_raw"]) or 0.0
    net_usd = _r(brut_usd + komisyon_usd) if yon == "AL" else _r(brut_usd - komisyon_usd)

    return {
        "id": _rid("t_", f"trades:{rn}"),
        "tarih": tarih,
        "hesap": hesap,
        "portfoy": portfoy,
        "enstruman": kod,
        "yon": yon,
        "lot": lot,
        "girisParaBirimi": inst.get("girisParaBirimi") or "TL",
        "fiyat_tl": fiyat_tl,
        "fiyat_usd": _r(fiyat_usd),
        "kur": kur,
        "komisyon_usd": _r(komisyon_usd),
        "brut_usd": brut_usd,
        "net_usd": net_usd,
        "not": "",
        "kaynak": "migration",
        "olusturulma": None,
    }


def build_transactions(raws, fx, instruments):
    txns, errors = [], []
    for raw in raws:
        try:
            txns.append(build_transaction(raw, fx, instruments))
        except TransformError as e:
            errors.append(e)
    return txns, errors


_DEP = {"deposit", "yatırma", "yatirma"}
_WD = {"withdraw", "withdrawal", "çekme", "cekme"}


def build_bank_cashflow(raw):
    rn = raw["row_no"]
    act = (raw["action_raw"] or "").strip().lower()
    if act in _DEP:
        tur = "YATIRMA"
    elif act in _WD:
        tur = "CEKME"
    else:
        raise TransformError(rn, f"bank action çözülemedi: {raw['action_raw']!r}")
    tarih = n.parse_date(raw["tarih_raw"])
    if tarih is None:
        raise TransformError(rn, f"tarih çözülemedi: {raw['tarih_raw']!r}")
    tutar = n.parse_decimal(raw["gross_raw"])
    if tutar is None:
        raise TransformError(rn, f"tutar çözülemedi: {raw['gross_raw']!r}")
    return {
        "id": _rid("c_", f"bank:{rn}"),
        "tarih": tarih, "hesap": "TOPLU", "portfoy": None, "tur": tur,
        "enstruman": None, "tutar_tl": None, "tutar_usd": _r(tutar),
        "kur": None, "aciklama": (raw["notes_raw"] or ""), "kaynak": "migration",
    }


def build_dividend_cashflow(raw, fx):
    rn = raw["row_no"]
    tarih = n.parse_date(raw["exdiv_raw"])
    if tarih is None:
        raise TransformError(rn, f"temettü tarihi çözülemedi: {raw['exdiv_raw']!r}")
    tutar_tl = n.parse_decimal(raw["value_raw"])
    usdtry = n.parse_decimal(raw["usdtry_raw"])
    paid_usd = n.parse_decimal(raw["paid_usd_raw"])
    if paid_usd is not None:
        tutar_usd = paid_usd
    elif tutar_tl is not None and usdtry:
        tutar_usd = tutar_tl / usdtry
    else:
        raise TransformError(rn, "temettü tutarı hesaplanamadı (paid_usd / value+usdtry yok)")
    kur = usdtry if usdtry else fx.get(tarih)
    return {
        "id": _rid("c_", f"div:{rn}"),
        "tarih": tarih, "hesap": "TOPLU", "portfoy": None, "tur": "TEMETTU",
        "enstruman": str(raw["kod_raw"]).strip(),
        "tutar_tl": _r(tutar_tl) if tutar_tl is not None else None,
        "tutar_usd": _r(tutar_usd),
        "kur": kur, "aciklama": (raw["tur_raw"] or ""), "kaynak": "migration",
    }


def build_cashflows(bank_raws, div_raws, fx):
    flows, errors = [], []
    for raw in bank_raws:
        try:
            flows.append(build_bank_cashflow(raw))
        except TransformError as e:
            errors.append(e)
    for raw in div_raws:
        try:
            flows.append(build_dividend_cashflow(raw, fx))
        except TransformError as e:
            errors.append(e)
    return flows, errors
