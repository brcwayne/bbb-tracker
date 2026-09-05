import type { OpenPosition } from './derive'
import type { Transaction, Instrument, Broker, AssetTransfer } from './types'
import { unrealizedByKod, type PriceLookup } from './unrealized'

export interface HoldingRow {
  kod: string
  sinif: string
  lot: number
  ortMaliyetUsd: number
  toplamMaliyetUsd: number
  guncelFiyatUsd: number | null
  degerUsd: number | null
  kzUsd: number | null
  kzPct: number | null
}

export interface HoldingGroup {
  key: string
  sahip?: string
  rows: HoldingRow[]
  totalCostUsd: number
  totalValueUsd: number | null
  unrealUsd: number | null
}

interface AttrEvent {
  kod: string
  tarih: string
  id: string
  /** Which record kind this event came from — used to break same-date ties (a transfer
   *  always "happens after" a transaction dated the same day, since the id prefix (`t_`
   *  vs `at_`) is not a reliable chronological tie-break). */
  kind: 'txn' | 'transfer'
  hesap: string
  /** `null` for a transfer whose `hedefPortfoy` was left unset — meaning "portfolio
   *  unchanged by this transfer". Such an event must not participate in the `'portfoy'`
   *  attribution stream at all (see `latestFieldByKod`). */
  portfoy: string | null
}

function attributionEvents(txns: Transaction[], transfers: AssetTransfer[]): AttrEvent[] {
  return [
    ...txns.map((t) => ({
      kod: t.enstruman,
      tarih: t.tarih,
      id: t.id,
      kind: 'txn' as const,
      hesap: t.hesap,
      portfoy: t.portfoy,
    })),
    ...transfers.map((tr) => ({
      kod: tr.enstruman,
      tarih: tr.tarih,
      id: tr.id,
      kind: 'transfer' as const,
      hesap: tr.hedefHesap,
      portfoy: tr.hedefPortfoy,
    })),
  ]
}

function latestFieldByKod<K extends 'portfoy' | 'hesap'>(
  events: AttrEvent[],
  field: K,
): Map<string, string> {
  const latest = new Map<string, AttrEvent>()
  for (const e of events) {
    // A transfer that left this field untouched (only meaningful for 'portfoy': a transfer
    // always carries a `hedefHesap`) must never override an earlier attribution.
    if (field === 'portfoy' && e.portfoy == null) continue
    const prev = latest.get(e.kod)
    let replace: boolean
    if (!prev) {
      replace = true
    } else if (e.tarih !== prev.tarih) {
      replace = e.tarih > prev.tarih
    } else if (e.kind !== prev.kind) {
      // Same-date tie between a transaction and a transfer: the transfer wins, since all
      // record-entry forms stamp "today" as `tarih`, and a same-day buy-then-transfer is a
      // plausible real workflow whose transfer must not be silently shadowed by id ordering.
      replace = e.kind === 'transfer'
    } else {
      replace = e.id > prev.id
    }
    if (replace) latest.set(e.kod, e)
  }
  const out = new Map<string, string>()
  for (const [kod, e] of latest) {
    const v = field === 'portfoy' ? e.portfoy : e.hesap
    if (v != null) out.set(kod, v)
  }
  return out
}

function rowsFor(
  positions: OpenPosition[],
  instruments: Instrument[],
  p: PriceLookup,
): HoldingRow[] {
  const instByKod = new Map(instruments.map((i) => [i.kod, i]))
  const unreal = unrealizedByKod(positions, instruments, p)
  return positions.map((pos) => {
    const u = unreal.get(pos.kod)
    const guncelFiyatUsd = u?.guncelFiyatUsd ?? null
    return {
      kod: pos.kod,
      sinif: instByKod.get(pos.kod)?.sinif ?? '?',
      lot: pos.lot,
      ortMaliyetUsd: pos.ortMaliyetUsd,
      toplamMaliyetUsd: pos.toplamMaliyetUsd,
      guncelFiyatUsd,
      degerUsd: guncelFiyatUsd == null ? null : guncelFiyatUsd * pos.lot,
      kzUsd: u?.kzUsd ?? null,
      kzPct: u?.kzPct ?? null,
    }
  })
}

function summarise(key: string, rows: HoldingRow[], sahip?: string): HoldingGroup {
  const totalCostUsd = rows.reduce((s, r) => s + r.toplamMaliyetUsd, 0)
  const anyPriced = rows.some((r) => r.degerUsd != null)
  const totalValueUsd = anyPriced
    ? rows.reduce((s, r) => s + (r.degerUsd ?? r.toplamMaliyetUsd), 0)
    : null
  return {
    key,
    sahip,
    rows,
    totalCostUsd,
    totalValueUsd,
    unrealUsd: totalValueUsd == null ? null : totalValueUsd - totalCostUsd,
  }
}

export function holdingsByPortfolio(
  open: OpenPosition[],
  txns: Transaction[],
  instruments: Instrument[],
  transfers: AssetTransfer[],
  p: PriceLookup,
): HoldingGroup[] {
  const byKod = latestFieldByKod(attributionEvents(txns, transfers), 'portfoy')
  const groups = new Map<string, OpenPosition[]>()
  for (const pos of open) {
    const key = byKod.get(pos.kod) ?? '?'
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(pos)
  }
  return [...groups.entries()]
    .map(([key, positions]) => summarise(key, rowsFor(positions, instruments, p)))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
}

export function holdingsByBroker(
  open: OpenPosition[],
  txns: Transaction[],
  instruments: Instrument[],
  brokers: Broker[],
  transfers: AssetTransfer[],
  p: PriceLookup,
): HoldingGroup[] {
  const byKod = latestFieldByKod(attributionEvents(txns, transfers), 'hesap')
  const byBrokerKod = new Map<string, OpenPosition[]>()
  for (const pos of open) {
    const key = byKod.get(pos.kod) ?? '?'
    ;(byBrokerKod.get(key) ?? byBrokerKod.set(key, []).get(key)!).push(pos)
  }
  return brokers.map((b) =>
    summarise(b.ad, rowsFor(byBrokerKod.get(b.kod) ?? [], instruments, p), b.sahip),
  )
}
