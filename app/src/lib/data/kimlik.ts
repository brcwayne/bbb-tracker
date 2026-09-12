import type { Dataset } from './types'
import type { SaleEvent } from './ledger'

export interface KimlikKontrol {
  mevduat: number
  cekim: number
  temettu: number
  gerceklesenKz: number
  beklenenVarlik: number // mevduat − cekim + gerceklesenKz + temettu
  acikMaliyet: number
  nakit: number
  gercekVarlik: number // acikMaliyet + nakit + (ds.meta.gocNakitDuzeltmesi ?? 0)
  fark: number // gercekVarlik − beklenenVarlik
  farkOrani: number // |fark| / beklenenVarlik
}

export function kimlikKontrol(
  ds: Dataset,
  sales: SaleEvent[],
  openPositions: { toplamMaliyetUsd: number }[],
  nakit: number,
): KimlikKontrol {
  let mevduat = 0
  let cekim = 0
  let temettu = 0

  for (const c of ds.cashflows) {
    if (c.tur === 'YATIRMA') mevduat += c.tutar_usd
    else if (c.tur === 'CEKME') cekim += c.tutar_usd
    else if (c.tur === 'TEMETTU') temettu += c.tutar_usd
  }

  const gerceklesenKz = sales.reduce((s, p) => s + p.kzUsd, 0)
  const beklenenVarlik = mevduat - cekim + gerceklesenKz + temettu

  const acikMaliyet = openPositions.reduce((s, p) => s + p.toplamMaliyetUsd, 0)
  const duzeltme = ds.meta.gocNakitDuzeltmesi ?? 0
  const gercekVarlik = acikMaliyet + nakit + duzeltme

  const fark = gercekVarlik - beklenenVarlik
  const farkOrani = beklenenVarlik !== 0 ? Math.abs(fark) / beklenenVarlik : 0

  return {
    mevduat,
    cekim,
    temettu,
    gerceklesenKz,
    beklenenVarlik,
    acikMaliyet,
    nakit,
    gercekVarlik,
    fark,
    farkOrani,
  }
}
