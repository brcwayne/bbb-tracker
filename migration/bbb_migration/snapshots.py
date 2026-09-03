"""Aylık snapshot'lar — P0'da Excel Monthly Report sayfasından çıkarılır."""
from __future__ import annotations

import calendar

from .normalize import parse_decimal


def month_end(ym: str) -> str:
    y, m = (int(p) for p in ym.split("-"))
    return f"{ym}-{calendar.monthrange(y, m)[1]:02d}"


def build_snapshots(monthly_rows):
    out = []
    for row in monthly_rows:
        gain = parse_decimal(row.get("gain")) or 0.0
        loss = parse_decimal(row.get("loss")) or 0.0
        out.append({
            "tarih": month_end(row["ay"]),
            "toplamOzkaynak_usd": parse_decimal(row.get("end_capital")),
            "baslangicSermayesi_usd": parse_decimal(row.get("beg_capital")),
            "netMevduatCekim_usd": parse_decimal(row.get("deposits")),
            "cekim_usd": parse_decimal(row.get("withdrawals")),
            "nakitTemettu_usd": parse_decimal(row.get("cash_div")),
            "nakit_usd": None,
            "gerceklesmemisKZ_usd": None,
            "hesapBazli": {},
            "portfoyBazli": {},
            "sinifBazli": {},
            "netKZ_usd": round(gain + loss, 6),
            "vergiKomisyon_usd": parse_decimal(row.get("tax_fees")),
            "kaynak": "excel-monthly-report",
        })
    out.sort(key=lambda s: s["tarih"])
    return out
