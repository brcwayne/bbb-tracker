/**
 * vergi.ts
 *
 * Dalga 4, Görev I7: Yıllık vergi özeti raporu veri katmanı.
 * SaleEvent ve cashflows (temettü) verilerini kullanarak yıllık işlem
 * ve kâr/zarar özetini sınıf bazında derler.
 *
 * ÖNEMLİ: Bu modülde vergi oranı, stopaj veya "ödenecek vergi" hesaplanmaz.
 * Sadece defterdeki gerçekleşmiş rakamlar raporlanır.
 */

import type { Dataset } from './types'
import type { SaleEvent } from './ledger'
import { SINIF_ETIKET } from './allocation'

export interface VergiSatisi {
  txId: string
  tarih: string
  kod: string
  ad: string
  sinif: string
  sinifEtiket: string
  lot: number
  ortMaliyetUsd: number
  maliyetUsd: number
  satisFiyatUsd: number
  hasilatUsd: number
  komisyonUsd: number
  kzUsd: number
  tutmaGunu: number | null
}

export interface VergiSinifOzeti {
  sinif: string
  sinifEtiket: string
  satisSayisi: number
  toplamMaliyetUsd: number
  toplamHasilatUsd: number
  toplamKarUsd: number
  toplamZararUsd: number
  netKzUsd: number
  komisyonUsd: number
}

export interface VergiYilOzeti {
  yil: number
  satisSayisi: number
  toplamHasilatUsd: number
  toplamMaliyetUsd: number
  gerceklesenKzUsd: number
  toplamKarUsd: number
  toplamZararUsd: number
  komisyonUsd: number
  temettuUsd: number
  siniflar: VergiSinifOzeti[]
  satislar: VergiSatisi[]
}

/**
 * Belirli bir yıl için SaleEvent ve temettü kayıtlarını toplar,
 * varlık sınıflarına göre ayrıştırır.
 */
export function buildVergiOzeti(
  ds: Dataset,
  allSales: SaleEvent[],
  yil: number,
): VergiYilOzeti {
  const yilStr = String(yil)
  const byKod = new Map(ds.instruments.map((i) => [i.kod, i]))

  const yearSales = allSales.filter((s) => s.tarih.startsWith(yilStr))

  const satislar: VergiSatisi[] = yearSales.map((s) => {
    const inst = byKod.get(s.kod)
    const sinif = inst?.sinif ?? 'DIGER'
    const sinifEtiket = SINIF_ETIKET[sinif] ?? sinif
    const ad = inst?.ad ?? s.kod

    return {
      txId: s.txId,
      tarih: s.tarih,
      kod: s.kod,
      ad,
      sinif,
      sinifEtiket,
      lot: s.lot,
      ortMaliyetUsd: s.ortMaliyetUsd,
      maliyetUsd: s.maliyetUsd,
      satisFiyatUsd: s.satisFiyatUsd,
      hasilatUsd: s.hasilatUsd,
      komisyonUsd: s.komisyonUsd,
      kzUsd: s.kzUsd,
      tutmaGunu: s.tutmaGunu,
    }
  })

  // Sınıf kırılımı
  const sinifMap = new Map<string, VergiSinifOzeti>()

  for (const s of satislar) {
    let entry = sinifMap.get(s.sinif)
    if (!entry) {
      entry = {
        sinif: s.sinif,
        sinifEtiket: s.sinifEtiket,
        satisSayisi: 0,
        toplamMaliyetUsd: 0,
        toplamHasilatUsd: 0,
        toplamKarUsd: 0,
        toplamZararUsd: 0,
        netKzUsd: 0,
        komisyonUsd: 0,
      }
      sinifMap.set(s.sinif, entry)
    }

    entry.satisSayisi++
    entry.toplamMaliyetUsd += s.maliyetUsd
    entry.toplamHasilatUsd += s.hasilatUsd
    entry.komisyonUsd += s.komisyonUsd
    entry.netKzUsd += s.kzUsd

    if (s.kzUsd > 0) {
      entry.toplamKarUsd += s.kzUsd
    } else if (s.kzUsd < 0) {
      entry.toplamZararUsd += s.kzUsd
    }
  }

  const siniflar = [...sinifMap.values()].sort((a, b) => b.toplamHasilatUsd - a.toplamHasilatUsd)

  // Toplamlar
  let toplamMaliyetUsd = 0
  let toplamHasilatUsd = 0
  let gerceklesenKzUsd = 0
  let toplamKarUsd = 0
  let toplamZararUsd = 0
  let komisyonUsd = 0

  for (const s of satislar) {
    toplamMaliyetUsd += s.maliyetUsd
    toplamHasilatUsd += s.hasilatUsd
    gerceklesenKzUsd += s.kzUsd
    komisyonUsd += s.komisyonUsd

    if (s.kzUsd > 0) {
      toplamKarUsd += s.kzUsd
    } else if (s.kzUsd < 0) {
      toplamZararUsd += s.kzUsd
    }
  }

  // O yılın temettüleri
  const temettuUsd = ds.cashflows
    .filter((c) => c.tur === 'TEMETTU' && c.tarih.startsWith(yilStr))
    .reduce((sum, c) => sum + c.tutar_usd, 0)

  return {
    yil,
    satisSayisi: satislar.length,
    toplamHasilatUsd,
    toplamMaliyetUsd,
    gerceklesenKzUsd,
    toplamKarUsd,
    toplamZararUsd,
    komisyonUsd,
    temettuUsd,
    siniflar,
    satislar,
  }
}

/**
 * Satışları CSV formatına dönüştürür.
 * Kolonlar: tarih,kod,sinif,lot,maliyet,hasilat,kz,tutmaGunu
 */
export function exportVergiCsv(satislar: VergiSatisi[]): string {
  const header = 'tarih,kod,sinif,lot,maliyet,hasilat,kz,tutmaGunu'
  const rows = satislar.map((s) => {
    const tutma = s.tutmaGunu != null ? s.tutmaGunu : ''
    return `${s.tarih},${s.kod},${s.sinif},${s.lot},${s.maliyetUsd.toFixed(2)},${s.hasilatUsd.toFixed(2)},${s.kzUsd.toFixed(2)},${tutma}`
  })
  return [header, ...rows].join('\n') + '\n'
}

/**
 * Veri tabanında satış veya nakit hareketi bulunan yılları listeler.
 */
export function getMevcutYillar(ds: Dataset, allSales: SaleEvent[]): number[] {
  const yillar = new Set<number>()

  for (const s of allSales) {
    const y = parseInt(s.tarih.slice(0, 4), 10)
    if (!Number.isNaN(y)) yillar.add(y)
  }

  for (const c of ds.cashflows) {
    const y = parseInt(c.tarih.slice(0, 4), 10)
    if (!Number.isNaN(y)) yillar.add(y)
  }

  for (const t of ds.transactions) {
    const y = parseInt(t.tarih.slice(0, 4), 10)
    if (!Number.isNaN(y)) yillar.add(y)
  }

  // Varsayılan olarak 2026'yı içersin
  yillar.add(2026)

  return [...yillar].sort((a, b) => b - a)
}
