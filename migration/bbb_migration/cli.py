"""Migration orkestrasyonu."""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from . import constants, instruments as im, positions as pos, reconcile as rc
from . import snapshots as snap, tcmb, transform as tr, xlsx_extract as xx


def _write(path: Path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False))


def run(xlsm_path, out_dir, overrides_dir, cache_path, *, tcmb_fetch=None):
    xlsm_path, out_dir = Path(xlsm_path), Path(out_dir)
    overrides_dir, cache_path = Path(overrides_dir), Path(cache_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    trades_raw = xx.extract_trades(xlsm_path)
    bank_raw = xx.extract_bank_transfers(xlsm_path)
    div_raw = xx.extract_dividends(xlsm_path)
    ref = xx.extract_reference(xlsm_path)

    inst_ov = json.loads((overrides_dir / "instruments.json").read_text())
    codes = im.distinct_codes(trades_raw)
    inst_list, unclassified = im.build_instruments(codes, inst_ov)
    inst_map = {i["kod"]: i for i in inst_list}

    seed = overrides_dir / "fxrates_seed.json"
    client = tcmb.TcmbClient(cache_path, seed_path=seed if seed.exists() else None,
                             fetch=tcmb_fetch)
    dates = set()
    for r in trades_raw:
        d = tr.n.parse_date(r["tarih_raw"])
        if d:
            dates.add(d)
    for r in bank_raw:
        d = tr.n.parse_date(r["tarih_raw"])
        if d:
            dates.add(d)
    fx, fx_missing = {}, []
    for d in sorted(dates):
        try:
            fx[d] = client.get_rate(d)
        except LookupError:
            fx_missing.append(d)
    client.save_cache()

    txns, terrors = tr.build_transactions(trades_raw, fx, inst_map)
    flows, cerrors = tr.build_cashflows(bank_raw, div_raw, fx)
    pos_res = pos.derive_positions(txns)
    cash = pos.derive_cash_by_account(txns, flows)
    snaps = snap.build_snapshots(ref.get("monthly_report", []))

    pos_rows = rc.reconcile_positions(pos_res["open"], ref.get("stock_position", []))
    anchors = rc.anchor_checks(pos_res, flows, {
        "total_deposits": ref.get("total_deposits"),
        "realized_total": ref.get("realized_total"),
    })
    report = rc.render_report(
        position_rows=pos_rows, anchors=anchors,
        transform_errors=[str(e) for e in terrors] + [str(e) for e in cerrors],
        position_errors=pos_res["errors"], unclassified=unclassified,
        fx_missing=fx_missing,
        realized_total_usd=pos_res["realized_total_usd"],
        counts={"transactions": len(txns), "cashflows": len(flows),
                "snapshots": len(snaps)})

    _write(out_dir / "transactions.json", txns)
    _write(out_dir / "cashflows.json", flows)
    _write(out_dir / "brokers.json", constants.BROKERS)
    _write(out_dir / "portfolios.json", constants.PORTFOLIOS)
    _write(out_dir / "instruments.json", inst_list)
    _write(out_dir / "fxrates.json", fx)
    _write(out_dir / "snapshots.json", snaps)
    _write(out_dir / "meta.json", {
        "semaVersiyonu": 1,
        "olusturulma": dt.datetime.now().isoformat(timespec="seconds"),
        "kaynak": xlsm_path.name,
        "nakitHesapBazli": cash,
        "p0Sinirlari": [
            "Bank Transfers hesap kırılımı yok → nakit 'TOPLU' altında",
            "aylık snapshot Excel Monthly Report'tan; hesap/portföy/sınıf kırılımı boş",
            "nakitHesapBazli yalnızca TOPLAM olarak geçerli — mevduatlar 'TOPLU' "
            "altında toplu, alımlar hesap bazlı, dolayısıyla tek tek hesap "
            "bakiyeleri anlamlı değil",
        ],
    })
    (out_dir / "reconciliation-report.md").write_text(report)

    ok = report.startswith("# Migration Mutabakat Raporu\n\n✅")
    return {
        "transactions": len(txns), "cashflows": len(flows),
        "unclassified": unclassified, "fx_missing": fx_missing,
        "report_path": str(out_dir / "reconciliation-report.md"), "ok": ok,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(prog="bbb_migration")
    ap.add_argument("--xlsm", required=True)
    ap.add_argument("--out", default="data")
    ap.add_argument("--overrides", default="migration/overrides")
    ap.add_argument("--cache", default="migration/overrides/fxrates_cache.json")
    args = ap.parse_args(argv)
    summary = run(args.xlsm, args.out, args.overrides, args.cache)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
