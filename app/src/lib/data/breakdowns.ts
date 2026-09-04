import type { OpenPosition } from './derive'
import type { Transaction, Instrument, Broker } from './types'
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

function latestFieldByKod<K extends 'portfoy' | 'hesap'>(
  txns: Transaction[],
  field: K,
): Map<string, string> {
  const latest = new Map<string, Transaction>()
  for (const t of txns) {
    const prev = latest.get(t.enstruman)
    if (!prev || t.tarih > prev.tarih || (t.tarih === prev.tarih && t.id > prev.id)) {
      latest.set(t.enstruman, t)
    }
  }
  const out = new Map<string, string>()
  for (const [kod, t] of latest) out.set(kod, t[field] as string)
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
  p: PriceLookup,
): HoldingGroup[] {
  const byKod = latestFieldByKod(txns, 'portfoy')
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
  p: PriceLookup,
): HoldingGroup[] {
  const byKod = latestFieldByKod(txns, 'hesap')
  const byBrokerKod = new Map<string, OpenPosition[]>()
  for (const pos of open) {
    const key = byKod.get(pos.kod) ?? '?'
    ;(byBrokerKod.get(key) ?? byBrokerKod.set(key, []).get(key)!).push(pos)
  }
  return brokers.map((b) =>
    summarise(b.ad, rowsFor(byBrokerKod.get(b.kod) ?? [], instruments, p), b.sahip),
  )
}
