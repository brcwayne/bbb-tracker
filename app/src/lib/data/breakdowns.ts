import type { OpenPosition } from './derive'
import type { Transaction, Instrument, Broker, AssetTransfer } from './types'
import { unrealizedByKod, type PriceLookup } from './unrealized'
import { buildLedger } from './ledger'

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
  const ledger = buildLedger(txns, transfers, 'portfoy')
  const groups: HoldingGroup[] = []
  for (const [scopeName, scope] of ledger.byScope) {
    if (!scopeName) continue
    const positions = scope.open.filter((pos) => pos.lot > 1e-9)
    if (positions.length > 0) {
      groups.push(summarise(scopeName, rowsFor(positions, instruments, p)))
    }
  }
  return groups.sort((a, b) => b.totalCostUsd - a.totalCostUsd)
}

export function holdingsByBroker(
  open: OpenPosition[],
  txns: Transaction[],
  instruments: Instrument[],
  brokers: Broker[],
  transfers: AssetTransfer[],
  p: PriceLookup,
): HoldingGroup[] {
  const ledger = buildLedger(txns, transfers, 'hesap')
  return brokers.map((b) => {
    const scope = ledger.byScope.get(b.kod)
    const positions = (scope?.open ?? []).filter((pos) => pos.lot > 1e-9)
    return summarise(b.ad, rowsFor(positions, instruments, p), b.sahip)
  })
}
