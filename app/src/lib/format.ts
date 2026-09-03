export const DASH = '—'

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function nullish(n: unknown): n is null | undefined {
  return n == null || (typeof n === 'number' && Number.isNaN(n))
}

export function usd(n: number, opts: { sign?: boolean } = {}): string {
  if (nullish(n)) return DASH
  const neg = n < 0
  const body = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (neg) return '-' + body
  return opts.sign ? '+' + body : body
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
