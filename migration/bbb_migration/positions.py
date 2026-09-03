"""İşlemlerden pozisyon, gerçekleşmiş K/Z, nakit türetimi — spec §11."""
from __future__ import annotations

from collections import defaultdict

_EPS = 1e-9


def derive_positions(txns):
    ordered = sorted(txns, key=lambda t: (t["tarih"], t["id"]))
    open_pos = {}
    closed = defaultdict(lambda: {"kod": None, "alis_lot": 0.0, "alis_tutar_usd": 0.0,
                                  "satis_lot": 0.0, "satis_tutar_usd": 0.0,
                                  "gerceklesmis_kz_usd": 0.0})
    realized_total = 0.0
    errors = []

    for t in ordered:
        kod, yon, lot = t["enstruman"], t["yon"], t["lot"]
        pos = open_pos.setdefault(kod, {"lot": 0.0, "ort_maliyet_usd": 0.0,
                                        "toplam_maliyet_usd": 0.0})
        if yon == "AL":
            pos["toplam_maliyet_usd"] += t["net_usd"]
            pos["lot"] += lot
            pos["ort_maliyet_usd"] = pos["toplam_maliyet_usd"] / pos["lot"]
            c = closed[kod]; c["kod"] = kod
            c["alis_lot"] += lot; c["alis_tutar_usd"] += t["net_usd"]
        else:  # SAT
            sell_lot = lot
            if sell_lot > pos["lot"] + _EPS:
                errors.append(f'{t["id"]}: aşırı satış {kod} (istenen {sell_lot}, mevcut {pos["lot"]})')
                sell_lot = pos["lot"]
            if sell_lot <= _EPS:
                continue
            ort = pos["ort_maliyet_usd"]
            kz = (t["fiyat_usd"] - ort) * sell_lot - t["komisyon_usd"]
            realized_total += kz
            pos["lot"] -= sell_lot
            pos["toplam_maliyet_usd"] -= ort * sell_lot
            c = closed[kod]; c["kod"] = kod
            c["satis_lot"] += sell_lot
            c["satis_tutar_usd"] += t["fiyat_usd"] * sell_lot - t["komisyon_usd"]
            c["gerceklesmis_kz_usd"] += kz
            if pos["lot"] <= _EPS:
                open_pos.pop(kod, None)

    return {
        "open": open_pos,
        "closed": [closed[k] for k in sorted(closed) if closed[k]["satis_lot"] > _EPS],
        "realized_total_usd": realized_total,
        "errors": errors,
    }


def derive_cash_by_account(txns, cashflows):
    cash = defaultdict(float)
    for t in txns:
        if t["yon"] == "AL":
            cash[t["hesap"]] -= t["net_usd"]
        else:
            cash[t["hesap"]] += t["net_usd"]
    for f in cashflows:
        amt = f["tutar_usd"]
        acc = f.get("hesap") or "TOPLU"
        if f["tur"] == "YATIRMA":
            cash[acc] += amt
        elif f["tur"] == "CEKME":
            cash[acc] -= amt
        elif f["tur"] == "TEMETTU":
            cash[acc] += amt
    return dict(cash)
