import type { Transaction, Snapshot, Instrument } from './types'

export interface OpenPosition { kod: string; lot: number; ortMaliyetUsd: number; toplamMaliyetUsd: number }
export interface ClosedPosition {
  kod: string; alisLot: number; alisTutarUsd: number
  satisLot: number; satisTutarUsd: number; satisMaliyetUsd: number; gerceklesmisKzUsd: number
}
export interface Positions {
  open: OpenPosition[]; closed: ClosedPosition[]; realizedTotalUsd: number; errors: string[]
}

const EPS = 1e-9

export function derivePositions(txns: Transaction[]): Positions {
  const ordered = [...txns].sort((a, b) =>
    a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const open = new Map<string, OpenPosition>()
  const closed = new Map<string, ClosedPosition>()
  let realizedTotalUsd = 0
  const errors: string[] = []

  const cl = (kod: string) =>
    closed.get(kod) ??
    closed.set(kod, { kod, alisLot: 0, alisTutarUsd: 0, satisLot: 0, satisTutarUsd: 0, satisMaliyetUsd: 0, gerceklesmisKzUsd: 0 }).get(kod)!

  for (const x of ordered) {
    const pos = open.get(x.enstruman) ?? { kod: x.enstruman, lot: 0, ortMaliyetUsd: 0, toplamMaliyetUsd: 0 }
    if (!open.has(x.enstruman)) open.set(x.enstruman, pos)

    if (x.yon === 'AL') {
      pos.toplamMaliyetUsd += x.net_usd
      pos.lot += x.lot
      pos.ortMaliyetUsd = pos.toplamMaliyetUsd / pos.lot
      const c = cl(x.enstruman)
      c.alisLot += x.lot
      c.alisTutarUsd += x.net_usd
    } else {
      let sell = x.lot
      if (sell > pos.lot + EPS) {
        errors.push(`${x.id}: aşırı satış ${x.enstruman} (istenen ${sell}, mevcut ${pos.lot})`)
        sell = pos.lot
      }
      if (sell <= EPS) continue
      const ort = pos.ortMaliyetUsd
      const kz = (x.fiyat_usd - ort) * sell - x.komisyon_usd
      realizedTotalUsd += kz
      pos.lot -= sell
      pos.toplamMaliyetUsd -= ort * sell
      const c = cl(x.enstruman)
      c.satisLot += sell
      c.satisTutarUsd += x.fiyat_usd * sell - x.komisyon_usd
      c.satisMaliyetUsd += ort * sell
      c.gerceklesmisKzUsd += kz
      if (pos.lot <= EPS) open.delete(x.enstruman)
    }
  }

  return {
    open: [...open.values()].filter((p) => p.lot > EPS).sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    closed: [...closed.values()].filter((c) => c.satisLot > EPS).sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    realizedTotalUsd,
    errors,
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

export function allocationByPortfolio(open: OpenPosition[], txns: Transaction[]) {
  const last = new Map<string, { tarih: string; portfoy: string }>()
  for (const x of txns) {
    const prev = last.get(x.enstruman)
    if (!prev || x.tarih >= prev.tarih) last.set(x.enstruman, { tarih: x.tarih, portfoy: x.portfoy })
  }
  return allocation(open, (kod) => last.get(kod)?.portfoy ?? '?')
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
    }
  })
  for (const c of closed) {
    if (c.satisMaliyetUsd <= 0) continue
    const r = c.gerceklesmisKzUsd / c.satisMaliyetUsd
    const b = buckets.find((b) => r > b.lo && r <= b.hi) ?? buckets.at(-1)!
    b.count++
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
