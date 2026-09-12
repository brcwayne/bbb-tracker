import type { Dataset } from './types'
import type { SaleEvent } from './ledger'
import { turetilmisNakit } from './cashBalances'

export interface KimlikKontrol {
  mevduat: number
  cekim: number
  temettu: number
  gerceklesenKz: number
  beklenenVarlik: number // mevduat − cekim + gerceklesenKz + temettu
  acikMaliyet: number
  nakit: number
  /**
   * turetilmisNakit(ds) − nakit. Göç (migration) sınırındaki kurum ekstre bakiyesi
   * (nakit — çağıran taraftan gelen, tipik olarak cashBalanceByHesap toplamı) ile
   * defterin kendi işlem+nakit akışlarından türettiği nakit arasındaki farktır.
   * Kimlikten (beklenenVarlik'ten) GERİYE ÇÖZÜLMEZ — turetilmisNakit ve nakit'ten
   * bağımsız olarak hesaplanır.
   */
  gocNakitDuzeltmesi: number
  /**
   * Σ satış.hasilatUsd (ledger.ts'te fiyat_usd × lot − komisyon_usd ile
   * yeniden hesaplanan satış hasılatı) − Σ SAT işlem.net_usd (işlemin kendi
   * kayıtlı nakit değeri). fiyat_usd, net_usd'nin türetildiği daha hassas
   * kaynaktan (fiyat_tl/kur) yuvarlanarak elde edildiği için 47 satış üzerinden
   * birikince kuruş-altı bir kalıntı oluşur. Satış/işlem çiftlerinden bağımsız
   * ölçülür, kimlikten geriye çözülmez.
   */
  yuvarlamaArtigi: number
  gercekVarlik: number // acikMaliyet + nakit + gocNakitDuzeltmesi + yuvarlamaArtigi
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

  const gocNakitDuzeltmesi = turetilmisNakit(ds) - nakit

  const txById = new Map(ds.transactions.map((t) => [t.id, t]))
  let yuvarlamaArtigi = 0
  for (const s of sales) {
    const t = txById.get(s.txId)
    if (t) yuvarlamaArtigi += s.hasilatUsd - t.net_usd
  }

  const gercekVarlik = acikMaliyet + nakit + gocNakitDuzeltmesi + yuvarlamaArtigi

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
    gocNakitDuzeltmesi,
    yuvarlamaArtigi,
    gercekVarlik,
    fark,
    farkOrani,
  }
}
