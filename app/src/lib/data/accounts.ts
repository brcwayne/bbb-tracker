import type { PersonalAccount, PersonalTx } from './types'

/** Two decimals, and never `-0`. `Math.round(-0.001 * 100) / 100` yields `-0`,
 *  which `toEqual(0)` rejects — an empty statement window would fail a test
 *  that is otherwise correct. */
export const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

/**
 * What one row contributes to one account's balance, in that account's own
 * currency. This is the single sign rule (spec §3.3) — a credit card needs no
 * special case: spending pushes it negative, an incoming transfer pulls it
 * back toward zero.
 *
 * Both sides are accumulated rather than returned early, so a row whose
 * `hesap` and `karsiHesap` are the same account nets to zero instead of
 * counting once.
 */
export function txDelta(row: PersonalTx, kod: string, para: string): number {
  if (row.paraBirimi !== para) return 0
  let d = 0
  if (row.hesap === kod) {
    if (row.tur === 'GIDER') d -= row.tutar
    else if (row.tur === 'GELIR') d += row.tutar
    else if (row.tur === 'TRANSFER') d -= row.tutar
    else if (row.tur === 'DUZELTME') d += row.tutar // already signed
  }
  if (row.tur === 'TRANSFER' && row.karsiHesap === kod) d += row.tutar
  return d
}

/** Balance per account code, counting only `tarih <= today` (H9). */
export function accountBalances(
  rows: PersonalTx[],
  accounts: PersonalAccount[],
  today: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of accounts) {
    let sum = 0
    for (const r of rows) {
      if (r.tarih > today) continue
      sum += txDelta(r, a.kod, a.paraBirimi)
    }
    out.set(a.kod, round2(sum))
  }
  return out
}
