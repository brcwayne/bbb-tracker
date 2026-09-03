"""xlsm ham satır çıkarımı — okuma dışında iş kuralı yok."""
from __future__ import annotations

import openpyxl

from .constants import DATA_START_ROW


def _load(path):
    return openpyxl.load_workbook(path, data_only=True, read_only=True)


def _cell(ws, col, row):
    return ws[f"{col}{row}"].value


def extract_trades(path) -> list[dict]:
    wb = _load(path)
    ws = wb["Trade Log"]
    out = []
    for row in range(DATA_START_ROW, ws.max_row + 1):
        code = _cell(ws, "F", row)
        if code is None or (isinstance(code, str) and not code.strip()):
            continue
        out.append({
            "row_no": row,
            "portfoy_raw": _cell(ws, "D", row),
            "tarih_raw": _cell(ws, "E", row),
            "kod_raw": code,
            "yon_raw": _cell(ws, "G", row),
            "tl_raw": _cell(ws, "H", row),
            "fiyat_raw": _cell(ws, "I", row),
            "lot_raw": _cell(ws, "J", row),
            "komisyon_raw": _cell(ws, "K", row),
        })
    wb.close()
    return out


def extract_bank_transfers(path) -> list[dict]:
    wb = _load(path)
    ws = wb["Bank Transfers"]
    out = []
    for row in range(DATA_START_ROW, ws.max_row + 1):
        action = _cell(ws, "C", row)
        date = _cell(ws, "B", row)
        if action is None and date is None:
            continue
        out.append({
            "row_no": row,
            "tarih_raw": date,
            "action_raw": action,
            "gross_raw": _cell(ws, "D", row),
            "fees_raw": _cell(ws, "E", row),
            "net_raw": _cell(ws, "F", row),
            "notes_raw": _cell(ws, "G", row),
        })
    wb.close()
    return out


def extract_dividends(path) -> list[dict]:
    wb = _load(path)
    ws = wb["Dividends"]
    out = []
    for row in range(DATA_START_ROW, ws.max_row + 1):
        code = _cell(ws, "B", row)
        if code is None or (isinstance(code, str) and not code.strip()):
            continue
        out.append({
            "row_no": row,
            "kod_raw": code,
            "tur_raw": _cell(ws, "C", row),
            "value_raw": _cell(ws, "D", row),
            "usdtry_raw": _cell(ws, "E", row),
            "exdiv_raw": _cell(ws, "F", row),
            "paid_usd_raw": _cell(ws, "I", row),
        })
    wb.close()
    return out


def extract_reference(path) -> dict:
    wb = _load(path)
    out = {"stock_position": [], "monthly_report": [], "portfoyler": []}
    if "Stock Position" in wb.sheetnames:
        ws = wb["Stock Position"]
        for row in range(DATA_START_ROW, ws.max_row + 1):
            code = _cell(ws, "B", row)
            if not isinstance(code, str) or not code.strip():
                continue
            out["stock_position"].append({
                "kod": code.strip(),
                "lot": _cell(ws, "C", row),
                "ave_price": _cell(ws, "D", row),
                "amount": _cell(ws, "E", row),
            })
    wb.close()
    return out
