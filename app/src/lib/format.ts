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

export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${AY[m - 1]} ${y}`
}
