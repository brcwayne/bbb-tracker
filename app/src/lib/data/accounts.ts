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

/** Last calendar day of a 1-based month. `Date.UTC`'s month argument is
 *  0-based, so `(y, m, 0)` is the last day of month `m`. */
function lastDayOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** An ISO date for `day` in month `m`, clamped to the month's real length —
 *  a cut day of 31 lands on the 30th in November and the 28th in February. */
function clampedDate(y: number, m: number, day: number): string {
  const d = Math.min(day, lastDayOf(y, m))
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function shiftMonth(y: number, m: number, delta: number): [number, number] {
  const i = y * 12 + (m - 1) + delta
  return [Math.floor(i / 12), (i % 12) + 1]
}

/**
 * The card's two statement windows and its overall debt (spec §4.1).
 *
 * `toplamBorc` is the raw balance and is negative when money is owed.
 * `buAy` / `gelecekAy` are positive magnitudes of the amount to pay, which is
 * why the window sums are negated.
 *
 * With no `hesapKesim`, a cut day of 31 clamps to the last day of every month,
 * making the windows the calendar months exactly — the fallback needs no
 * separate branch.
 */
export function cardStatement(
  rows: PersonalTx[],
  account: PersonalAccount,
  today: string,
): { buAy: number; gelecekAy: number; toplamBorc: number } {
  const kesim = account.hesapKesim ?? 31
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))

  // C0 — the first cut date on or after today.
  let c0 = clampedDate(y, m, kesim)
  if (c0 < today) {
    const [ny, nm] = shiftMonth(y, m, 1)
    c0 = clampedDate(ny, nm, kesim)
  }
  const [py, pm] = shiftMonth(Number(c0.slice(0, 4)), Number(c0.slice(5, 7)), -1)
  const [ny, nm] = shiftMonth(Number(c0.slice(0, 4)), Number(c0.slice(5, 7)), 1)
  const cPrev = clampedDate(py, pm, kesim)
  const cNext = clampedDate(ny, nm, kesim)

  const window = (from: string, to: string) => {
    let sum = 0
    for (const r of rows) {
      if (r.tarih <= from || r.tarih > to) continue
      sum += txDelta(r, account.kod, account.paraBirimi)
    }
    return round2(-sum)
  }

  let borc = 0
  for (const r of rows) {
    if (r.tarih > today) continue
    borc += txDelta(r, account.kod, account.paraBirimi)
  }

  return {
    buAy: window(cPrev, c0),
    gelecekAy: window(c0, cNext),
    toplamBorc: round2(borc),
  }
}

