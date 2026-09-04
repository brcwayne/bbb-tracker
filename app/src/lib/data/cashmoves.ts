import type { Cashflow, Transaction, Instrument } from './types'

const byDateDesc = <T extends { tarih: string }>(xs: T[]) =>
  [...xs].sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0))

export interface TransferRow {
  tarih: string
  tur: 'YATIRMA' | 'CEKME'
  tutarUsd: number
  aciklama: string
  hesap: string
}

export function bankTransfers(cashflows: Cashflow[]): {
  rows: TransferRow[]
  totalIn: number
  totalOut: number
  net: number
} {
  const moves = cashflows.filter((c) => c.tur === 'YATIRMA' || c.tur === 'CEKME')
  const rows: TransferRow[] = byDateDesc(moves).map((c) => ({
    tarih: c.tarih,
    tur: c.tur as 'YATIRMA' | 'CEKME',
    tutarUsd: c.tutar_usd,
    aciklama: c.aciklama,
    hesap: c.hesap,
  }))
  const totalIn = moves.filter((c) => c.tur === 'YATIRMA').reduce((s, c) => s + c.tutar_usd, 0)
  const totalOut = moves.filter((c) => c.tur === 'CEKME').reduce((s, c) => s + c.tutar_usd, 0)
  return { rows, totalIn, totalOut, net: totalIn - totalOut }
}

export interface MMoveRow {
  tarih: string
  kod: string
  yon: 'AL' | 'SAT'
  lot: number
  tutarUsd: number
}

export function moneyMarketMoves(txns: Transaction[], instruments: Instrument[]): MMoveRow[] {
  const mm = new Set(instruments.filter((i) => i.sinif === 'FON_PARA').map((i) => i.kod))
  return byDateDesc(txns.filter((t) => mm.has(t.enstruman))).map((t) => ({
    tarih: t.tarih,
    kod: t.enstruman,
    yon: t.yon,
    lot: t.lot,
    tutarUsd: t.net_usd,
  }))
}

export interface DivRow {
  tarih: string
  enstruman: string
  tutarUsd: number
  aciklama: string
  reinvestKod: string | null
}

const DAY = 86_400_000
function reinvestFor(tarih: string, tutarUsd: number, buys: Transaction[]): string | null {
  const t0 = Date.parse(tarih)
  const cands = buys
    .filter((b) => b.yon === 'AL')
    .map((b) => ({ b, dd: Math.abs(Date.parse(b.tarih) - t0) }))
    .filter((x) => x.dd <= 3 * DAY && Math.abs(x.b.net_usd - tutarUsd) <= 0.15 * tutarUsd)
    .sort(
      (x, y) =>
        x.dd - y.dd || Math.abs(x.b.net_usd - tutarUsd) - Math.abs(y.b.net_usd - tutarUsd),
    )
  return cands.length ? cands[0].b.enstruman : null
}

export function dividends(
  cashflows: Cashflow[],
  txns: Transaction[],
): { rows: DivRow[]; byInstrument: { kod: string; toplamUsd: number }[]; total: number } {
  const divs = cashflows.filter((c) => c.tur === 'TEMETTU')
  const rows: DivRow[] = byDateDesc(divs).map((c) => ({
    tarih: c.tarih,
    enstruman: c.enstruman ?? '?',
    tutarUsd: c.tutar_usd,
    aciklama: c.aciklama,
    reinvestKod: reinvestFor(c.tarih, c.tutar_usd, txns),
  }))
  const byKod = new Map<string, number>()
  for (const d of rows) byKod.set(d.enstruman, (byKod.get(d.enstruman) ?? 0) + d.tutarUsd)
  const byInstrument = [...byKod.entries()]
    .map(([kod, toplamUsd]) => ({ kod, toplamUsd }))
    .sort((a, b) => b.toplamUsd - a.toplamUsd)
  return { rows, byInstrument, total: divs.reduce((s, c) => s + c.tutar_usd, 0) }
}
