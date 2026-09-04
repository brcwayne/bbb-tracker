import type { Dataset } from './types'

export function cashBalanceByHesap(ds: Dataset): Record<string, number> {
  const bal: Record<string, number> = { ...ds.meta.nakitHesapBazli }
  const bump = (hesap: string, delta: number) => {
    bal[hesap] = (bal[hesap] ?? 0) + delta
  }

  for (const t of ds.transactions) {
    if (t.kaynak === 'migration') continue
    bump(t.hesap, t.yon === 'AL' ? -t.net_usd : t.net_usd)
  }
  for (const c of ds.cashflows) {
    if (c.kaynak === 'migration') continue
    if (c.tur === 'YATIRMA' || c.tur === 'TEMETTU') bump(c.hesap, c.tutar_usd)
    else if (c.tur === 'CEKME') bump(c.hesap, -c.tutar_usd)
    else if (c.tur === 'TRANSFER' && c.hedefHesap) {
      bump(c.hesap, -c.tutar_usd)
      bump(c.hedefHesap, c.tutar_usd)
    }
  }
  return bal
}
