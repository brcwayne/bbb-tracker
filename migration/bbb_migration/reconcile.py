"""Türetilen değerler vs Excel referans sayfaları — mutabakat raporu."""
from __future__ import annotations

from .normalize import parse_decimal


def reconcile_positions(derived_open, stock_position_rows, lot_tol=0.5, amt_tol_pct=0.01):
    rows = []
    excel = {}
    for r in stock_position_rows:
        excel[r["kod"]] = r
    keys = sorted(set(derived_open) | set(excel))
    for kod in keys:
        d = derived_open.get(kod)
        e = excel.get(kod)
        d_lot = d["lot"] if d else 0
        e_lot = parse_decimal(e["lot"]) if e else 0
        rows.append({"kod": kod, "alan": "lot", "derived": d_lot, "excel": e_lot,
                     "fark": round(d_lot - (e_lot or 0), 6),
                     "gecti": abs(d_lot - (e_lot or 0)) <= lot_tol})
        d_amt = d["toplam_maliyet_usd"] if d else 0
        e_amt = parse_decimal(e["amount"]) if e else 0
        base = max(abs(e_amt or 0), 1.0)
        rows.append({"kod": kod, "alan": "amount", "derived": round(d_amt, 6),
                     "excel": e_amt, "fark": round(d_amt - (e_amt or 0), 6),
                     "gecti": abs(d_amt - (e_amt or 0)) / base <= amt_tol_pct})
    return rows


def anchor_checks(derived, cashflows, ref):
    out = []
    total_dep = round(sum(f["tutar_usd"] for f in cashflows if f["tur"] == "YATIRMA"), 6)
    if ref.get("total_deposits") is not None:
        exc = parse_decimal(ref["total_deposits"])
        out.append({"capa": "toplam_yatirma", "derived": total_dep, "excel": exc,
                    "gecti": abs(total_dep - exc) <= 0.01 * max(abs(exc), 1.0)})
    if ref.get("realized_total") is not None:
        exc = parse_decimal(ref["realized_total"])
        d = round(derived["realized_total_usd"], 6)
        out.append({"capa": "gerceklesmis_kz_toplam", "derived": d, "excel": exc,
                    "gecti": abs(d - exc) <= 0.01 * max(abs(exc), 1.0)})
    return out


def render_report(*, position_rows, anchors, transform_errors, position_errors,
                  unclassified, fx_missing):
    fails = ([r for r in position_rows if not r["gecti"]]
             + [a for a in anchors if not a["gecti"]]
             + list(transform_errors) + list(position_errors)
             + list(unclassified) + list(fx_missing))
    lines = ["# Migration Mutabakat Raporu", ""]
    if not fails:
        lines.append("✅ Tüm çapalar geçti, çözülmemiş sorun yok.")
        return "\n".join(lines) + "\n"

    lines.append(f"⚠️ {len(fails)} açık sorun.\n")

    if unclassified:
        lines += ["## Sınıflandırılmamış enstrümanlar", ""]
        lines += [f"- `{c}` → `overrides/instruments.json`'a `sinif` gir" for c in unclassified]
        lines.append("")
    if fx_missing:
        lines += ["## Kuru bulunamayan tarihler", ""]
        lines += [f"- {d} → `overrides/fxrates_seed.json`" for d in fx_missing]
        lines.append("")
    if transform_errors:
        lines += ["## Dönüşüm hataları (atlanan satırlar)", ""]
        lines += [f"- {e}" for e in transform_errors]
        lines.append("")
    if position_errors:
        lines += ["## Pozisyon hataları", ""]
        lines += [f"- {e}" for e in position_errors]
        lines.append("")

    bad_pos = [r for r in position_rows if not r["gecti"]]
    if bad_pos:
        lines += ["## Pozisyon uyuşmazlıkları (türetilen vs Excel)", "",
                  "| Kod | Alan | Türetilen | Excel | Fark |", "|---|---|---:|---:|---:|"]
        lines += [f'| {r["kod"]} | {r["alan"]} | {r["derived"]:.4f} | '
                  f'{(r["excel"] or 0):.4f} | {r["fark"]:.4f} |' for r in bad_pos]
        lines.append("")

    bad_anchor = [a for a in anchors if not a["gecti"]]
    if bad_anchor:
        lines += ["## Çapa kontrolleri", "", "| Çapa | Türetilen | Excel |", "|---|---:|---:|"]
        lines += [f'| {a["capa"]} | {a["derived"]:.4f} | {(a["excel"] or 0):.4f} |'
                  for a in bad_anchor]
        lines.append("")

    return "\n".join(lines) + "\n"
