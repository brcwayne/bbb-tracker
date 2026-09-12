import type { Transaction, Snapshot, Instrument, AssetTransfer } from './types'
import { buildLedger, type SaleEvent } from './ledger'

export interface OpenPosition { kod: string; lot: number; ortMaliyetUsd: number; toplamMaliyetUsd: number }
export interface ClosedPosition {
  kod: string; alisLot: number; alisTutarUsd: number
  satisLot: number; satisTutarUsd: number; satisMaliyetUsd: number; gerceklesmisKzUsd: number
  ilkAlisTarih: string; sonSatisTarih: string
}
export interface Positions {
  open: OpenPosition[]; closed: ClosedPosition[]; realizedTotalUsd: number; errors: string[]
  sales: SaleEvent[]
}

const EPS = 1e-9

export function derivePositions(txns: Transaction[]): Positions {
  const ledger = buildLedger(txns, [], 'global')
  const portLedger = buildLedger(txns, [], 'portfoy')
  const g = ledger.byScope.get('')!

  const borrowedTxIds = new Set(
    portLedger.allSales.filter((s) => s.oduncAlindi).map((s) => s.txId),
  )
  for (const s of ledger.allSales) {
    if (borrowedTxIds.has(s.txId)) {
      s.oduncAlindi = true
    }
  }

  const closed = new Map<string, ClosedPosition>()
  const cl = (kod: string) =>
    closed.get(kod) ??
    closed
      .set(kod, {
        kod,
        alisLot: 0,
        alisTutarUsd: 0,
        satisLot: 0,
        satisTutarUsd: 0,
        satisMaliyetUsd: 0,
        gerceklesmisKzUsd: 0,
        ilkAlisTarih: '',
        sonSatisTarih: '',
      })
      .get(kod)!

  for (const s of ledger.allSales) {
    const c = cl(s.kod)
    c.satisLot += s.lot
    c.satisTutarUsd += s.hasilatUsd
    c.satisMaliyetUsd += s.maliyetUsd
    c.gerceklesmisKzUsd += s.kzUsd
    if (!c.ilkAlisTarih && s.ilkAlisTarih) c.ilkAlisTarih = s.ilkAlisTarih
    c.sonSatisTarih = s.tarih
  }

  // Also collect alisLot / alisTutarUsd from all buy transactions for closed records
  for (const t of txns) {
    if (t.yon === 'AL') {
      const c = closed.get(t.enstruman)
      if (c) {
        c.alisLot += t.lot
        c.alisTutarUsd += t.net_usd
        if (!c.ilkAlisTarih) c.ilkAlisTarih = t.tarih
      }
    }
  }

  return {
    open: g.open,
    closed: [...closed.values()].filter((c) => c.satisLot > EPS).sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    realizedTotalUsd: g.realizedUsd,
    errors: [...new Set([...ledger.errors, ...portLedger.errors])],
    sales: ledger.allSales,
  }
}

export function allocation(open: OpenPosition[], keyOf: (kod: string) => string) {
  const groups = new Map<string, number>()
  for (const p of open) groups.set(keyOf(p.kod), (groups.get(keyOf(p.kod)) ?? 0) + p.toplamMaliyetUsd)
  const total = [...groups.values()].reduce((s, v) => s + v, 0) || 1
  return [...groups.entries()]
    .map(([key, tutarUsd]) => ({ key, tutarUsd, pay: tutarUsd / total }))
    .sort((a, b) => b.tutarUsd - a.tutarUsd)
}

export function allocationByClass(open: OpenPosition[], instruments: Instrument[]) {
  const cls = new Map(instruments.map((i) => [i.kod, i.sinif]))
  return allocation(open, (kod) => cls.get(kod) ?? '?')
}

export function allocationByPortfolio(
  open: OpenPosition[],
  txns: Transaction[],
  transfers: AssetTransfer[] = [],
) {
  if (txns.length === 0) {
    return allocation(open, () => '?')
  }
  const ledger = buildLedger(txns, transfers, 'portfoy')
  const tot = open.reduce((s, p) => s + p.toplamMaliyetUsd, 0) || 1
  const slices: { key: string; tutarUsd: number; pay: number }[] = []
  for (const [scopeName, scope] of ledger.byScope) {
    if (!scopeName) continue
    const portCost = scope.open.reduce((s, p) => s + p.toplamMaliyetUsd, 0)
    if (portCost > 1e-9) {
      slices.push({ key: scopeName, tutarUsd: portCost, pay: portCost / tot })
    }
  }
  return slices.sort((a, b) => b.tutarUsd - a.tutarUsd)
}

const BUCKET_EDGES = [
  -Infinity, -0.22, -0.20, -0.18, -0.16, -0.14, -0.12, -0.10, -0.08, -0.06, -0.04, -0.02,
  0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, Infinity,
]

export function gainBuckets(closed: ClosedPosition[]) {
  const buckets = BUCKET_EDGES.slice(0, -1).map((lo, i) => {
    const hi = BUCKET_EDGES[i + 1]
    return {
      lo,
      hi,
      label: lo === -Infinity ? '<-22%' : hi === Infinity ? '>20%' : `${(lo * 100) | 0}%–${(hi * 100) | 0}%`,
      count: 0,
      items: [] as { kod: string; r: number; tarih: string }[],
    }
  })
  for (const c of closed) {
    if (c.satisMaliyetUsd <= 0) continue
    const r = c.gerceklesmisKzUsd / c.satisMaliyetUsd
    const b = buckets.find((b) => r > b.lo && r <= b.hi) ?? buckets.at(-1)!
    b.count++
    b.items.push({ kod: c.kod, r, tarih: c.sonSatisTarih })
  }
  return buckets
}

function ym(iso: string) {
  return iso.slice(0, 7)
}

export function periodPerformance(snapshots: Snapshot[], today = new Date()) {
  const s = [...snapshots].sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
  const yr = today.getFullYear()
  const inRange = (from: string, to: string) => s.filter((x) => x.tarih >= from && x.tarih <= to)
  const row = (period: string, list: Snapshot[]) => {
    const netKzUsd = list.reduce((sum, x) => sum + x.netKZ_usd, 0)
    const base = list[0]?.baslangicSermayesi_usd
    return { period, netKzUsd, pct: base ? netKzUsd / base : null }
  }
  const thisMonth = ym(today.toISOString())
  const q = (n: number) =>
    inRange(
      `${yr}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`,
      `${yr}-${String(n * 3).padStart(2, '0')}-31`,
    )
  return [
    row('Bu Ay', s.filter((x) => ym(x.tarih) === thisMonth)),
    row('Ç1', q(1)),
    row('Ç2', q(2)),
    row('Ç3', q(3)),
    row('Ç4', q(4)),
    row('YTD', inRange(`${yr}-01-01`, `${yr}-12-31`)),
    row('Önceki YTD', inRange(`${yr - 1}-01-01`, `${yr - 1}-12-31`)),
  ]
}

export function topMovers(closed: ClosedPosition[], n = 5) {
  const byKz = [...closed].sort((a, b) => b.gerceklesmisKzUsd - a.gerceklesmisKzUsd)
  return { gainers: byKz.slice(0, n), losers: [...byKz].reverse().slice(0, n) }
}

export function winLoss(closed: ClosedPosition[]) {
  let wins = 0,
    losses = 0,
    kazancToplam = 0,
    zararToplam = 0
  for (const c of closed) {
    if (c.gerceklesmisKzUsd > 0) {
      wins++
      kazancToplam += c.gerceklesmisKzUsd
    } else if (c.gerceklesmisKzUsd < 0) {
      losses++
      zararToplam += c.gerceklesmisKzUsd
    }
  }
  return { wins, losses, kazancToplam, zararToplam }
}

export function positionStats(closed: ClosedPosition[]) {
  const pcts = closed
    .filter((c) => c.satisMaliyetUsd > 0)
    .map((c) => ({ c, r: c.gerceklesmisKzUsd / c.satisMaliyetUsd }))
  const wins = pcts.filter((p) => p.r > 0),
    losses = pcts.filter((p) => p.r < 0)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)
  const ortKazancPct = avg(wins.map((p) => p.r))
  const ortKayipPct = avg(losses.map((p) => p.r))
  return {
    win: wins.length,
    loss: losses.length,
    kazanmaOrani: pcts.length ? wins.length / pcts.length : 0,
    ortKazancPct,
    ortKayipPct,
    enBuyukKazanc: Math.max(0, ...closed.map((c) => c.gerceklesmisKzUsd)),
    enBuyukKayip: Math.min(0, ...closed.map((c) => c.gerceklesmisKzUsd)),
    riskOdul: ortKayipPct !== 0 ? Math.abs(ortKazancPct / ortKayipPct) : null,
  }
}
