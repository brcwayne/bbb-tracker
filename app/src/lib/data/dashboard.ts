import type { Positions } from './derive'
import type { Dataset, Snapshot } from './types'
import { monthLabel } from '../format'

export interface DashboardTotals {
  toplamSermaye: number
  icerideKalan: number
  cekimler: number
  donemSonu: number
  gerceklesmemisKz: number | null
  gerceklesmemisOzkaynak: number | null
  nakitBakiyesi: number
  realized: number
  temettu: number
  totalGain: number
  totalLoss: number
  gainLoss: number
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

export function dashboardTotals(
  ds: Dataset,
  positions: Positions,
  unrealTotal: number | null,
): DashboardTotals {
  const cf = ds.cashflows
  const toplamSermaye = sumBy(cf.filter((c) => c.tur === 'YATIRMA'), (c) => c.tutar_usd)
  const cekimler = sumBy(cf.filter((c) => c.tur === 'CEKME'), (c) => c.tutar_usd)
  const temettu = sumBy(cf.filter((c) => c.tur === 'TEMETTU'), (c) => c.tutar_usd)
  const realized = positions.realizedTotalUsd
  const icerideKalan = realized + temettu - cekimler
  const donemSonu = toplamSermaye + icerideKalan - cekimler
  const openCost = sumBy(positions.open, (p) => p.toplamMaliyetUsd)
  const totalGain = sumBy(positions.closed.filter((c) => c.gerceklesmisKzUsd > 0), (c) => c.gerceklesmisKzUsd)
  const totalLoss = sumBy(positions.closed.filter((c) => c.gerceklesmisKzUsd < 0), (c) => c.gerceklesmisKzUsd)
  return {
    toplamSermaye,
    icerideKalan,
    cekimler,
    donemSonu,
    gerceklesmemisKz: unrealTotal,
    gerceklesmemisOzkaynak: unrealTotal == null ? null : donemSonu + unrealTotal,
    nakitBakiyesi: donemSonu - openCost,
    realized,
    temettu,
    totalGain,
    totalLoss,
    gainLoss: totalGain + totalLoss,
  }
}

export interface MonthPerf {
  ay: string
  begCapital: number | null
  addDeposit: number
  divReceived: number
  netKz: number
  withdrawal: number
  endCapital: number
}

export function thisMonthPerf(snapshots: Snapshot[]): MonthPerf | null {
  if (snapshots.length === 0) return null
  const s = [...snapshots].sort((a, b) => (a.tarih < b.tarih ? -1 : 1)).at(-1)!
  return {
    ay: monthLabel(s.tarih),
    begCapital: s.baslangicSermayesi_usd,
    addDeposit: s.netMevduatCekim_usd > 0 ? s.netMevduatCekim_usd : 0,
    divReceived: s.nakitTemettu_usd,
    netKz: s.netKZ_usd,
    withdrawal: s.cekim_usd,
    endCapital: s.toplamOzkaynak_usd,
  }
}
