"""Saf normalizasyon fonksiyonları — I/O yok. Tasarım dokümanı §8."""
from __future__ import annotations

import datetime as dt
import re

_ERROR_STRINGS = {"#VALUE!", "#REF!", "#N/A", "#DIV/0!", "#NAME?", "#NULL!", "#NUM!"}
_EPOCH = dt.date(1899, 12, 30)  # Excel 1900 tarih sistemi


def is_error_value(v) -> bool:
    return isinstance(v, str) and v.strip().upper() in _ERROR_STRINGS


def parse_decimal(v):
    if v is None or is_error_value(v):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if not isinstance(v, str):
        return None
    s = v.strip()
    if not s:
        return None
    s = s.replace("%", "").replace("₺", "").replace("$", "").strip()
    has_dot, has_comma = "." in s, "," in s
    if has_dot and has_comma:
        # son görülen ayıraç ondalık ayıracıdır
        dec = "," if s.rfind(",") > s.rfind(".") else "."
        thou = "." if dec == "," else ","
        s = s.replace(thou, "").replace(dec, ".")
    elif has_comma:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(v):
    if v is None or is_error_value(v):
        return None
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if v > 59:
            return (_EPOCH + dt.timedelta(days=int(v))).isoformat()
        return None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                return dt.datetime.strptime(s, fmt).date().isoformat()
            except ValueError:
                continue
    return None


def parse_action(v):
    if not isinstance(v, str):
        return None
    s = v.strip().lower()
    if s in {"buy", "al", "alış", "alis"}:
        return "AL"
    if s in {"sell", "sat", "satış", "satis"}:
        return "SAT"
    return None
