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
  hesap: string
  portfoy: string
}

function attributionEvents(txns: Transaction[], transfers: AssetTransfer[]): AttrEvent[] {
  return [
    ...txns.map((t) => ({ kod: t.enstruman, tarih: t.tarih, id: t.id, hesap: t.hesap, portfoy: t.portfoy })),
    ...transfers.map((tr) => ({
      kod: tr.enstruman,
      tarih: tr.tarih,
      id: tr.id,
      hesap: tr.hedefHesap,
      portfoy: tr.hedefPortfoy ?? '',
    })),
  ]
}

function latestFieldByKod<K extends 'portfoy' | 'hesap'>(
  events: AttrEvent[],
  field: K,
): Map<string, string> {
  const latest = new Map<string, AttrEvent>()
  for (const e of events) {
    const prev = latest.get(e.kod)
    if (!prev || e.tarih > prev.tarih || (e.tarih === prev.tarih && e.id > prev.id)) {
      latest.set(e.kod, e)
    }
  }
  const out = new Map<string, string>()
  for (const [kod, e] of latest) out.set(kod, e[field])
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
