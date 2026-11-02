import type { Dataset } from './data/types'
import { DASH, usd, tryFmt, todayLocalIso } from './format'

export type Currency = 'USD' | 'TRY'
export type PeriodKey = 'all' | 'ytd' | '1y' | '6m' | '3m' | '1m'
export type Basis = 'maliyet' | 'deger'

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'ytd', label: 'Yılbaşından' },
  { key: '1y', label: 'Son 1 yıl' },
  { key: '6m', label: 'Son 6 ay' },
  { key: '3m', label: 'Son 3 ay' },
  { key: '1m', label: 'Son ay' },
]

function pref(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function save(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

/** App-wide display state. `rate` is TRY per USD — the latest known TCMB rate
 *  stands in as "current"; P3's refresh replaces it with a live TCMB rate. */
let liveRateApplied = false

export const settings = $state({
  currency: (pref('bbb-currency') === 'TRY' ? 'TRY' : 'USD') as Currency,
  basis: (pref('bbb-basis') === 'maliyet' ? 'maliyet' : 'deger') as Basis,
  period: ((): PeriodKey => {
    const p = pref('bbb-period')
    return (PERIODS.find((x) => x.key === p)?.key ?? 'all') as PeriodKey
  })(),
  rate: 1,
  eurRate: 0,
  rateDate: '',
})

export function setCurrency(c: Currency) {
  settings.currency = c
  save('bbb-currency', c)
}
export function setBasis(b: Basis) {
  settings.basis = b
  save('bbb-basis', b)
}
export function setPeriod(p: PeriodKey) {
  settings.period = p
  save('bbb-period', p)
}

export function initRate(ds: Dataset) {
  if (liveRateApplied) return
  const entries = Object.entries(ds.fxrates).sort(([a], [b]) => (a < b ? 1 : -1))
  if (entries.length) {
    settings.rate = entries[0][1]
    settings.rateDate = entries[0][0]
  }
}

/** Adopt a freshly fetched TCMB rate for this session (not persisted). */
export function applyLiveRate(usdtry: number, eurtry?: number | null): void {
  if (!Number.isFinite(usdtry) || usdtry <= 0) return
  settings.rate = usdtry
  if (typeof eurtry === 'number' && Number.isFinite(eurtry) && eurtry > 0) {
    settings.eurRate = eurtry
  }
  settings.rateDate = todayLocalIso()
  liveRateApplied = true
}

/** Active EUR/TRY rate: live TCMB EUR rate when available, else 1.16 × USD/TRY fallback. */
export function activeEurTryRate(): number {
  if (Number.isFinite(settings.eurRate) && settings.eurRate > 0) return settings.eurRate
  return settings.rate > 0 ? settings.rate * 1.16 : 1.16
}

/** Convert an amount in `TRY` | `USD` | `EUR` into TRY using active session rates. */
export function toTry(amount: number, paraBirimi?: string): number {
  if (!Number.isFinite(amount)) return 0
  const cur = (paraBirimi || 'TRY').toUpperCase()
  if (cur === 'USD') return amount * (settings.rate > 0 ? settings.rate : 1)
  if (cur === 'EUR') return amount * activeEurTryRate()
  return amount
}

/** Convert an amount in `TRY` | `USD` | `EUR` into USD using active session rates. */
export function toUsd(amount: number, paraBirimi?: string): number {
  if (!Number.isFinite(amount)) return 0
  const cur = (paraBirimi || 'TRY').toUpperCase()
  if (cur === 'USD') return amount
  const usdTry = settings.rate > 0 ? settings.rate : 1
  if (cur === 'EUR') return (amount * activeEurTryRate()) / usdTry
  return amount / usdTry
}

/** True once a live TCMB rate has been adopted this session (Fix 9 caption). */
export function isLiveRate(): boolean {
  return liveRateApplied
}

/** Format a USD amount in the active display currency. */
export function money(
  nUsd: number | null | undefined,
  opts: { sign?: boolean; whole?: boolean } = {},
): string {
  if (nUsd == null || Number.isNaN(nUsd)) return DASH
  return settings.currency === 'USD'
    ? usd(nUsd, opts)
    : tryFmt(nUsd * settings.rate, opts)
}

/** Inclusive ISO date window for the active period, relative to `today`. */
export function periodRange(
  period: PeriodKey,
  today = new Date(),
): { from: string; to: string } {
  const to = todayLocalIso(today)
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const y = d.getFullYear()
  switch (period) {
    case 'ytd':
      return { from: `${y}-01-01`, to }
    case '1y':
      d.setFullYear(y - 1)
      return { from: todayLocalIso(d), to }
    case '6m':
      d.setMonth(d.getMonth() - 6)
      return { from: todayLocalIso(d), to }
    case '3m':
      d.setMonth(d.getMonth() - 3)
      return { from: todayLocalIso(d), to }
    case '1m':
      d.setMonth(d.getMonth() - 1)
      return { from: todayLocalIso(d), to }
    default:
      return { from: '0000-01-01', to: '9999-12-31' }
  }
}
