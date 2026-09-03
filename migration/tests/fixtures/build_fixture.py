"""Deterministik test workbook'u. Çalıştır: python tests/fixtures/build_fixture.py"""
import datetime as dt
from pathlib import Path
import openpyxl

OUT = Path(__file__).with_name("mini.xlsm")


def _set(ws, cell, val):
    ws[cell] = val


def build():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    tl = wb.create_sheet("Trade Log")
    _set(tl, "C14", "No."); _set(tl, "E14", "Date"); _set(tl, "F14", "Stock Code")
    _set(tl, "G14", "Action"); _set(tl, "H14", "TL"); _set(tl, "I14", "Price")
    _set(tl, "J14", "Total Shares"); _set(tl, "K14", "Manual Fees")
    rows = [
        # row, portfoy, date, code, action, tl, price_usd, lot, fee
        (15, "M.Alfa", dt.datetime(2020, 1, 6), "ASTOR", "BUY", None, 1.00, 100, 0),
        (16, "M.Alfa", dt.datetime(2020, 6, 10), "ASTOR", "BUY", None, 2.00, 100, 0),
        (17, "M.Alfa", dt.datetime(2021, 3, 15), "ASTOR", "SELL", None, 5.00, 50, 0),
        (18, "KASA", dt.datetime(2019, 7, 1), "XAU", "BUY", None, 50.00, 10, 0),
        (19, "QNB.F", dt.datetime(2022, 2, 3), "AFT.F", "BUY", None, 1.00, 1000, 0),
        (20, "GARAN", dt.datetime(2023, 11, 20), "THYAO", "BUY", 1200.00, 40.00, 25, 1.5),
        (21, "M.Alfa", dt.datetime(2021, 3, 15), "ASTOR", "SELL", None, 6.00, 200, 0),  # aşırı satış → recon hata
    ]
    for r, pf, d, code, act, tl_, px, lot, fee in rows:
        _set(tl, f"A{r}", "#VALUE!")
        _set(tl, f"C{r}", r - 14); _set(tl, f"D{r}", pf); _set(tl, f"E{r}", d)
        _set(tl, f"F{r}", code); _set(tl, f"G{r}", act)
        if tl_ is not None:
            _set(tl, f"H{r}", tl_)
        _set(tl, f"I{r}", px); _set(tl, f"J{r}", lot); _set(tl, f"K{r}", fee)
    # gürültü satırı: sadece yardımcı sütun dolu
    _set(tl, "A25", "#VALUE!")

    bt = wb.create_sheet("Bank Transfers")
    _set(bt, "A14", "No."); _set(bt, "B14", "Date"); _set(bt, "C14", "Action")
    _set(bt, "D14", "Gross Amount"); _set(bt, "E14", "Fees"); _set(bt, "F14", "Net Amount"); _set(bt, "G14", "Notes")
    bt_rows = [
        (15, dt.datetime(2019, 1, 2), "Deposit", 1000.00, 0, 1000.00, "ilk"),
        (16, dt.datetime(2021, 5, 5), "Withdraw", 200.00, 0, 200.00, "cekim"),
    ]
    for r, d, act, g, f, net, note in bt_rows:
        _set(bt, f"A{r}", r - 14); _set(bt, f"B{r}", d); _set(bt, f"C{r}", act)
        _set(bt, f"D{r}", g); _set(bt, f"E{r}", f); _set(bt, f"F{r}", net); _set(bt, f"G{r}", note)

    dv = wb.create_sheet("Dividends")
    _set(dv, "A14", "No."); _set(dv, "B14", "Stock Code"); _set(dv, "C14", "Type")
    _set(dv, "D14", "Value / Description"); _set(dv, "E14", "usdtry"); _set(dv, "F14", "Ex-Div Date")
    _set(dv, "I14", "Paid Value")
    _set(dv, "A15", 1); _set(dv, "B15", "ASTOR"); _set(dv, "C15", "Cash")
    _set(dv, "D15", 100.00); _set(dv, "E15", 25.00); _set(dv, "F15", dt.datetime(2023, 4, 10)); _set(dv, "I15", 4.00)

    sp = wb.create_sheet("Stock Position")
    _set(sp, "B14", "Stock Code"); _set(sp, "C14", "Total\nShares"); _set(sp, "D14", "Ave.\nPrice"); _set(sp, "E14", "Amount")
    # ASTOR migration sonrası: 100+100-50-200 = -150 (fixture kasıtlı hatalı); referans "doğru" değeri 150 lot der
    _set(sp, "B15", "ASTOR"); _set(sp, "C15", 150); _set(sp, "D15", 1.5); _set(sp, "E15", 225.0)
    _set(sp, "B16", "XAU"); _set(sp, "C16", 10); _set(sp, "D16", 50.0); _set(sp, "E16", 500.0)
    _set(sp, "B17", "AFT.F"); _set(sp, "C17", 1000); _set(sp, "D17", 1.0); _set(sp, "E17", 1000.0)
    _set(sp, "B18", "THYAO"); _set(sp, "C18", 25); _set(sp, "D18", 40.06); _set(sp, "E18", 1001.5)

    wb.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
