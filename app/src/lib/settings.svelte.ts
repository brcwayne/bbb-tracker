import type { Dataset } from './data/types'
import { DASH, usd, tryFmt } from './format'

export type Currency = 'USD' | 'TRY'
export type PeriodKey = 'all' | 'ytd' | '1y' | '6m' | '3m' | '1m'

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
  period: ((): PeriodKey => {
    const p = pref('bbb-period')
    return (PERIODS.find((x) => x.key === p)?.key ?? 'all') as PeriodKey
  })(),
  rate: 1,
  rateDate: '',
})

export function setCurrency(c: Currency) {
  settings.currency = c
  save('bbb-currency', c)
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
export function applyLiveRate(usdtry: number): void {
  if (!Number.isFinite(usdtry) || usdtry <= 0) return
  settings.rate = usdtry
  settings.rateDate = new Date().toISOString().slice(0, 10)
  liveRateApplied = true
}

/** True once a live TCMB rate has been adopted this session (Fix 9 caption). */
export function isLiveRate(): boolean {
  return liveRateApplied
}

/** Format a USD amount in the active display currency. */
export function money(nUsd: number | null | undefined, opts: { sign?: boolean } = {}): string {
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
  const to = today.toISOString().slice(0, 10)
  const d = new Date(today)
  const y = today.getFullYear()
  switch (period) {
    case 'ytd':
      return { from: `${y}-01-01`, to }
    case '1y':
      d.setFullYear(y - 1)
      return { from: d.toISOString().slice(0, 10), to }
    case '6m':
      d.setMonth(d.getMonth() - 6)
      return { from: d.toISOString().slice(0, 10), to }
    case '3m':
      d.setMonth(d.getMonth() - 3)
      return { from: d.toISOString().slice(0, 10), to }
    case '1m':
      d.setMonth(d.getMonth() - 1)
      return { from: d.toISOString().slice(0, 10), to }
    default:
      return { from: '0000-01-01', to: '9999-12-31' }
  }
}
