import type { Dataset } from './types'
import { tryFmt, usd } from '../format'

export interface BrokerCashSplit {
  tl: number
  usd: number
  totalUsd: number
}

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
    // DUZELTME stores the signed delta directly (positive or negative),
    // unlike YATIRMA/CEKME's always-positive tutar_usd with sign implied by
    // tur — same "row stores the delta, not the target" convention as the
    // personal ledger's balance correction.
    else if (c.tur === 'DUZELTME') {
      bump(c.hesap, c.tutar_usd)
      // When broker accounts are corrected from negative baseline (caused by
      // historical migration having all deposits under 'TOPLU' while trades were
      // under individual brokers), offset the delta against TOPLU so total cash
      // does not double count.
      if (c.tutar_usd > 0 && c.hesap !== 'TOPLU' && (bal['TOPLU'] ?? 0) > 0) {
        bal['TOPLU'] = Math.max(0, bal['TOPLU'] - c.tutar_usd)
      }
    }
  }
  return bal
}

export function cashSplitByHesap(
  ds: Dataset,
  rate: number,
): Record<string, BrokerCashSplit> {
  const splits: Record<string, { tl: number; usd: number }> = {}

  const getEntry = (hesap: string) => {
    if (!splits[hesap]) {
      splits[hesap] = {
        tl: 0,
        usd: ds.meta.nakitHesapBazli[hesap] ?? 0,
      }
    }
    return splits[hesap]
  }

  for (const b of ds.brokers) {
    getEntry(b.kod)
  }
  for (const k of Object.keys(ds.meta.nakitHesapBazli)) {
    getEntry(k)
  }

  for (const t of ds.transactions) {
    if (t.kaynak === 'migration' || !t.hesap) continue
    const e = getEntry(t.hesap)
    const isTl = t.girisParaBirimi === 'TL'
    if (isTl) {
      const costTl =
        t.fiyat_tl != null && t.fiyat_tl > 0
          ? t.fiyat_tl * t.lot
          : t.net_usd * (t.kur && t.kur > 0 ? t.kur : rate)
      if (t.yon === 'AL') e.tl -= costTl
      else e.tl += costTl
    } else {
      if (t.yon === 'AL') e.usd -= t.net_usd
      else e.usd += t.net_usd
    }
  }

  for (const c of ds.cashflows) {
    if (c.kaynak === 'migration' || !c.hesap) continue
    const e = getEntry(c.hesap)
    const isTl = c.tutar_tl != null
    if (c.tur === 'DUZELTME') {
      if (isTl) e.tl += c.tutar_tl!
      else e.usd += c.tutar_usd

      if (c.tutar_usd > 0 && c.hesap !== 'TOPLU' && splits['TOPLU'] && splits['TOPLU'].usd > 0) {
        splits['TOPLU'].usd = Math.max(0, splits['TOPLU'].usd - c.tutar_usd)
      }
    } else if (c.tur === 'YATIRMA' || c.tur === 'TEMETTU') {
      if (isTl) e.tl += c.tutar_tl!
      else e.usd += c.tutar_usd
    } else if (c.tur === 'CEKME') {
      if (isTl) e.tl -= c.tutar_tl!
      else e.usd -= c.tutar_usd
    } else if (c.tur === 'TRANSFER' && c.hedefHesap) {
      const target = getEntry(c.hedefHesap)
      if (isTl) {
        e.tl -= c.tutar_tl!
        target.tl += c.tutar_tl!
      } else {
        e.usd -= c.tutar_usd
        target.usd += c.tutar_usd
      }
    }
  }

  const out: Record<string, BrokerCashSplit> = {}
  for (const [k, v] of Object.entries(splits)) {
    const tl = Math.round(v.tl * 100) / 100
    const usdVal = Math.round(v.usd * 100) / 100
    const totalUsd = Math.round((usdVal + (rate > 0 ? tl / rate : 0)) * 100) / 100
    out[k] = { tl, usd: usdVal, totalUsd }
  }
  return out
}

export function formatBrokerCash(
  split: BrokerCashSplit | undefined,
  currency: 'TRY' | 'USD' = 'TRY',
  rate: number = 1,
): string {
  if (!split) return currency === 'TRY' ? tryFmt(0) : usd(0)
  const hasTl = Math.abs(split.tl) >= 0.005
  const hasUsd = Math.abs(split.usd) >= 0.005

  if (hasTl && hasUsd) {
    const total =
      currency === 'TRY'
        ? tryFmt(split.tl + split.usd * rate)
        : usd(split.usd + (rate > 0 ? split.tl / rate : 0))
    return `${tryFmt(split.tl)} · ${usd(split.usd)} (Toplam: ${total})`
  }
  if (hasTl) return tryFmt(split.tl)
  if (hasUsd) return usd(split.usd)
  return currency === 'TRY' ? tryFmt(0) : usd(0)
}

export function formatBrokerCashTable(
  split: BrokerCashSplit | undefined,
  currency: 'TRY' | 'USD' = 'TRY',
  _rate: number = 1,
): string {
  if (!split) return currency === 'TRY' ? tryFmt(0) : usd(0)
  const hasTl = Math.abs(split.tl) >= 0.005
  const hasUsd = Math.abs(split.usd) >= 0.005

  if (hasTl && hasUsd) {
    return `${tryFmt(split.tl)} · ${usd(split.usd)}`
  }
  if (hasTl) return tryFmt(split.tl)
  if (hasUsd) return usd(split.usd)
  return currency === 'TRY' ? tryFmt(0) : usd(0)
}
