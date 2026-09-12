export const DASH = '—'

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function nullish(n: unknown): n is null | undefined {
  return n == null || (typeof n === 'number' && Number.isNaN(n))
}

export function usd(n: number, opts: { sign?: boolean; whole?: boolean } = {}): string {
  if (nullish(n)) return DASH
  const neg = n < 0
  const d = opts.whole ? 0 : 2
  const body =
    '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (neg) return '-' + body
  return opts.sign ? '+' + body : body
}

export function tryFmt(n: number, opts: { sign?: boolean; whole?: boolean } = {}): string {
  if (nullish(n)) return DASH
  const neg = n < 0
  const d = opts.whole ? 0 : 2
  const body =
    '₺' +
    Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (neg) return '-' + body
  return opts.sign ? '+' + body : body
}

/** Lot count — strips float noise (e.g. 56.330807992000004) and groups. */
export function lot(n: number): string {
  if (nullish(n)) return DASH
  return Number(n.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function pct(n: number, digits = 1): string {
  if (nullish(n)) return DASH
  return (n * 100).toFixed(digits) + '%'
}

export function dateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${AY[m - 1]} ${y}`
}

/** "Eki" — month name only. For axes where twelve months sit side by side and
 *  "Eki 2025" would collide with its neighbour. */
export function monthShort(iso: string): string {
  const m = Number(iso.split('-')[1])
  return AY[m - 1]
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${AY[m - 1]} ${y}`
}

/** Formats ISO timestamp to "12 Eyl 2026 14:20". Falls back to dateShort if no time. */
export function dateTimeShort(iso: string): string {
  if (!iso) return DASH
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return dateShort(iso.slice(0, 10))
    const day = d.getDate()
    const m = AY[d.getMonth()]
    const y = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${m} ${y} ${hh}:${mm}`
  } catch {
    return dateShort(iso.slice(0, 10))
  }
}
