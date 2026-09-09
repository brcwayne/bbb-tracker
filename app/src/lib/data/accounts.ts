import type { Debt, PersonalAccount, PersonalTx } from './types'
import { debtBalances } from './personal'

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

export interface AccountRow {
  kod: string
  ad: string
  simge?: string
  paraBirimi: string
  bakiye: number
  /** Present only on credit cards. */
  kart?: { buAy: number; gelecekAy: number; toplamBorc: number }
  href?: string
  pasif?: boolean
}

export interface AccountGroup {
  baslik: string
  tur: 'NAKIT' | 'BANKA' | 'KREDI_KARTI' | 'KISI'
  satirlar: AccountRow[]
  /** currency → subtotal */
  toplam: Record<string, number>
}

const GRUP_SIRASI = [
  { tur: 'NAKIT', baslik: 'Nakit' },
  { tur: 'BANKA', baslik: 'Banka Hesapları' },
  { tur: 'KREDI_KARTI', baslik: 'Kredi Kartı' },
] as const

const trSort = (a: string, b: string) => a.localeCompare(b, 'tr')

function toplamla(satirlar: AccountRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of satirlar) out[r.paraBirimi] = round2((out[r.paraBirimi] ?? 0) + r.bakiye)
  return out
}

/**
 * The grouped list the page renders. Groups always come back in the order of
 * `GRUP_SIRASI`, with Alacak/Verecek last and omitted entirely when there are
 * no open debts. An empty account group is still returned so the page can
 * show it — an account with no movements is a true `₺ 0,00`, not an absence.
 */
export function accountGroups(
  rows: PersonalTx[],
  accounts: PersonalAccount[],
  debts: Debt[],
  today: string,
  opts: { pasifDahil?: boolean } = {},
): AccountGroup[] {
  const gorunen = accounts.filter((a) => a.aktif || opts.pasifDahil)
  const bakiyeler = accountBalances(rows, gorunen, today)

  const gruplar: AccountGroup[] = []
  for (const { tur, baslik } of GRUP_SIRASI) {
    const uyeler = gorunen
      .filter((a) => a.tur === tur)
      .sort((a, b) => (a.aktif === b.aktif ? trSort(a.ad, b.ad) : a.aktif ? -1 : 1))

    const satirlar: AccountRow[] = uyeler.map((a) => ({
      kod: a.kod,
      ad: a.ad,
      simge: a.simge,
      paraBirimi: a.paraBirimi,
      bakiye: bakiyeler.get(a.kod) ?? 0,
      kart: a.tur === 'KREDI_KARTI' ? cardStatement(rows, a, today) : undefined,
      href: `#/h/hesap/${a.kod}`,
      pasif: a.aktif ? undefined : true,
    }))

    gruplar.push({ baslik, tur, satirlar, toplam: toplamla(satirlar) })
  }

  const kisiler = debtBalances(debts)
  if (kisiler.length > 0) {
    const satirlar: AccountRow[] = kisiler.map((k) => ({
      kod: k.kisi,
      ad: k.kisi,
      paraBirimi: k.para,
      bakiye: k.net,
      href: `#/h/borclar/${k.kisi}`,
    }))
    gruplar.push({
      baslik: 'Alacak / Verecek',
      tur: 'KISI',
      satirlar,
      toplam: toplamla(satirlar),
    })
  }

  return gruplar
}

/**
 * Varlıklar / Borçlar / Toplam per currency (spec §5). `borclar` stays
 * negative and `toplam` is the sum, not the difference — that is what makes
 * the three figures reconcile on screen.
 */
export function netWorthBand(
  groups: AccountGroup[],
): Record<string, { varliklar: number; borclar: number; toplam: number }> {
  const out: Record<string, { varliklar: number; borclar: number; toplam: number }> = {}
  for (const g of groups) {
    for (const r of g.satirlar) {
      const cur = (out[r.paraBirimi] ??= { varliklar: 0, borclar: 0, toplam: 0 })
      if (r.bakiye >= 0) cur.varliklar = round2(cur.varliklar + r.bakiye)
      else cur.borclar = round2(cur.borclar + r.bakiye)
      cur.toplam = round2(cur.varliklar + cur.borclar)
    }
  }
  return out
}

export interface DayBucket {
  giris: number
  cikis: number
  adet: number
}

export interface MonthMovements {
  /** day-of-month (1-based) → that day's in/out */
  gunler: Map<number, DayBucket>
  /** the month's rows for this account, newest first */
  kayitlar: PersonalTx[]
  giris: number
  cikis: number
  net: number
  /** rows listed but excluded from every figure because their currency
   *  differs from the account's (spec §3.4) */
  yabanciParaAdedi: number
}

/**
 * One month of one account. Unlike a balance, this is NOT cut at today —
 * the calendar shows the whole month, future-dated instalments included.
 */
export function monthMovements(
  rows: PersonalTx[],
  account: PersonalAccount,
  year: number,
  month: number,
): MonthMovements {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const gunler = new Map<number, DayBucket>()
  const kayitlar: PersonalTx[] = []
  let giris = 0
  let cikis = 0
  let yabanciParaAdedi = 0

  for (const r of rows) {
    if (!r.tarih.startsWith(prefix)) continue
    const ilgili = r.hesap === account.kod || (r.tur === 'TRANSFER' && r.karsiHesap === account.kod)
    if (!ilgili) continue

    kayitlar.push(r)

    const d = txDelta(r, account.kod, account.paraBirimi)
    if (d === 0 && r.paraBirimi !== account.paraBirimi) {
      yabanciParaAdedi++
      continue
    }

    const gun = Number(r.tarih.slice(8, 10))
    const b = gunler.get(gun) ?? { giris: 0, cikis: 0, adet: 0 }
    if (d >= 0) b.giris = round2(b.giris + d)
    else b.cikis = round2(b.cikis - d)
    b.adet++
    gunler.set(gun, b)

    if (d >= 0) giris = round2(giris + d)
    else cikis = round2(cikis - d)
  }

  kayitlar.sort((a, b) => (a.tarih === b.tarih ? b.id.localeCompare(a.id) : b.tarih.localeCompare(a.tarih)))

  return { gunler, kayitlar, giris, cikis, net: round2(giris - cikis), yabanciParaAdedi }
}



