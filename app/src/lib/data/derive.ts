import type { Transaction } from './types'

export interface OpenPosition { kod: string; lot: number; ortMaliyetUsd: number; toplamMaliyetUsd: number }
export interface ClosedPosition {
  kod: string; alisLot: number; alisTutarUsd: number
  satisLot: number; satisTutarUsd: number; gerceklesmisKzUsd: number
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
    closed.set(kod, { kod, alisLot: 0, alisTutarUsd: 0, satisLot: 0, satisTutarUsd: 0, gerceklesmisKzUsd: 0 }).get(kod)!

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
      c.gerceklesmisKzUsd += kz
      if (pos.lot <= EPS) open.delete(x.enstruman)
    }
  }

  return {
    open: [...open.values()].sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    closed: [...closed.values()].filter((c) => c.satisLot > EPS).sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    realizedTotalUsd,
    errors,
  }
}
