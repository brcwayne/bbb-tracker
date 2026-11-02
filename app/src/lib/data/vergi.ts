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

export interface FifoTlVergiSatisi {
  txId: string
  tarih: string
  ilkAlisTarih: string
  kod: string
  ad: string
  sinif: string
  sinifEtiket: string
  lot: number
  alisKurOrt: number
  satisKur: number
  maliyetTl: number
  endeksliMaliyetTl: number
  hasilatTl: number
  nominalKzTl: number
  kurFarkiKzTl: number
  endeksliKzTl: number
  endekslemeUygulandi: boolean
  endeksKatsayisi: number
}

export interface FifoTlVergiOzeti {
  yil: number
  satisSayisi: number
  toplamMaliyetTl: number
  toplamEndeksliMaliyetTl: number
  toplamHasilatTl: number
  toplamNominalKzTl: number
  toplamKurFarkiKzTl: number
  toplamEndeksliKzTl: number
  temettuTl: number
  satislar: FifoTlVergiSatisi[]
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
  fifoTl?: FifoTlVergiOzeti
}

/**
 * TÜİK Yİ-ÜFE aylık endeks tablosu (2003=100, YYYY-MM -> endeks).
 * GVK Mükerrer Madde 80/81 kapsamında alış ve satıştan bir önceki ayın Yİ-ÜFE artış oranı
 * %10 veya üzerindeyse TL maliyet endekslenir. Tabloda bulunmayan aylar için katsayı 1 alınır.
 */
export const YI_UFE_ENDEKSI: Record<string, number> = {
  '2022-01': 1129.03, '2022-02': 1210.60, '2022-03': 1321.90, '2022-04': 1423.27,
  '2022-05': 1548.01, '2022-06': 1652.75, '2022-07': 1738.21, '2022-08': 1780.05,
  '2022-09': 1865.09, '2022-10': 1978.30, '2022-11': 1993.01, '2022-12': 1988.16,
  '2023-01': 2070.68, '2023-02': 2103.07, '2023-03': 2112.24, '2023-04': 2129.40,
  '2023-05': 2143.25, '2023-06': 2282.59, '2023-07': 2470.49, '2023-08': 2616.09,
  '2023-09': 2705.05, '2023-10': 2757.52, '2023-11': 2835.06, '2023-12': 2867.38,
  '2024-01': 2986.08, '2024-02': 3097.77, '2024-03': 3199.78, '2024-04': 3315.05,
  '2024-05': 3380.02, '2024-06': 3426.73, '2024-07': 3493.26, '2024-08': 3551.83,
  '2024-09': 3600.49, '2024-10': 3646.97, '2024-11': 3671.03, '2024-12': 3685.72,
  '2025-01': 3798.50, '2025-02': 3879.03, '2025-03': 3951.96, '2025-04': 4061.03,
  '2025-05': 4161.74, '2025-06': 4264.12, '2025-07': 4338.00, '2025-08': 4401.20,
  '2025-09': 4467.80, '2025-10': 4530.35, '2025-11': 4584.71, '2025-12': 4630.56,
  '2026-01': 4746.32, '2026-02': 4841.25, '2026-03': 4928.39, '2026-04': 5017.10,
  '2026-05': 5097.38, '2026-06': 5178.94, '2026-07': 5256.62, '2026-08': 5330.21,
  '2026-09': 5404.83, '2026-10': 5475.10,
}

function prevYearMonth(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4))
  const m = Number(isoDate.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ''
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function yiUfeMultiplier(
  alisTarihi: string,
  satisTarihi: string,
  table: Record<string, number> = YI_UFE_ENDEKSI,
): { katsayi: number; uygulandi: boolean } {
  const alisPrev = prevYearMonth(alisTarihi)
  const satisPrev = prevYearMonth(satisTarihi)
  if (!alisPrev || !satisPrev || satisPrev <= alisPrev) return { katsayi: 1, uygulandi: false }
  const idxAlis = table[alisPrev]
  const idxSatis = table[satisPrev]
  if (!idxAlis || !idxSatis || idxAlis <= 0) return { katsayi: 1, uygulandi: false }
  const ratio = idxSatis / idxAlis
  if (ratio - 1 >= 0.1) {
    return { katsayi: ratio, uygulandi: true }
  }
  return { katsayi: 1, uygulandi: false }
}

export function lookupHistoricalUsdTry(
  ds: Dataset,
  tarih: string,
  explicitKur?: number | null,
): number {
  if (explicitKur != null && Number.isFinite(explicitKur) && explicitKur > 0) {
    return explicitKur
  }
  const fx = ds.fxrates ?? {}
  const exact = fx[tarih]
  if (typeof exact === 'number' && Number.isFinite(exact) && exact > 0) return exact

  const dateKeys = Object.keys(fx)
    .filter((k) => !k.startsWith('_') && typeof fx[k] === 'number' && Number.isFinite(fx[k]) && fx[k] > 0)
    .sort()
  if (dateKeys.length === 0) return 1

  let best = dateKeys[0]
  for (const k of dateKeys) {
    if (k <= tarih) best = k
    else break
  }
  return fx[best]
}

/**
 * Türk Gelir Vergisi mevzuatına uygun olarak her enstrüman için FIFO sırasıyla
 * işlem günü TCMB döviz kuru üzerinden TL maliyet, TL hasılat, kur farkı kazancı ve
 * %10 üzeri Yİ-ÜFE endeksli kazanç özetini üretir (vergi oranı/stopaj hesaplamaz).
 */
export function buildFifoTlVergiOzeti(
  ds: Dataset,
  yil: number,
  yiUfeTable: Record<string, number> = YI_UFE_ENDEKSI,
): FifoTlVergiOzeti {
  const yilStr = String(yil)
  const byKod = new Map(ds.instruments.map((i) => [i.kod, i]))
  const EPS = 1e-9

  interface FifoLot {
    tarih: string
    kalanLot: number
    birimMaliyetTl: number
    birimMaliyetUsd: number
    kur: number
  }

  const queues = new Map<string, FifoLot[]>()
  const sortedTxns = [...ds.transactions].sort((a, b) => {
    if (a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1
    if (a.yon !== b.yon) return a.yon === 'AL' ? -1 : 1
    if (a.olusturulma && b.olusturulma && a.olusturulma !== b.olusturulma) {
      return a.olusturulma < b.olusturulma ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const allFifoSales: FifoTlVergiSatisi[] = []

  for (const t of sortedTxns) {
    if (t.lot <= EPS) continue
    const kur = lookupHistoricalUsdTry(ds, t.tarih, t.kur)
    let q = queues.get(t.enstruman)
    if (!q) {
      q = []
      queues.set(t.enstruman, q)
    }

    if (t.yon === 'AL') {
      const toplamMaliyetTl =
        t.girisParaBirimi === 'TL' && t.fiyat_tl != null && t.fiyat_tl > 0
          ? t.fiyat_tl * t.lot + (t.komisyon_usd || 0) * kur
          : t.net_usd * kur
      q.push({
        tarih: t.tarih,
        kalanLot: t.lot,
        birimMaliyetTl: toplamMaliyetTl / t.lot,
        birimMaliyetUsd: t.net_usd / t.lot,
        kur,
      })
    } else {
      let remainingToSell = t.lot
      let matchedLot = 0
      let maliyetTl = 0
      let endeksliMaliyetTl = 0
      let maliyetUsd = 0
      let weightedAlisKur = 0
      let ilkAlisTarih = ''
      let anyEndeks = false

      while (remainingToSell > EPS && q.length > 0) {
        const head = q[0]
        const take = Math.min(remainingToSell, head.kalanLot)
        if (!ilkAlisTarih) ilkAlisTarih = head.tarih
        const { katsayi, uygulandi } = yiUfeMultiplier(head.tarih, t.tarih, yiUfeTable)
        if (uygulandi) anyEndeks = true

        const sliceTl = take * head.birimMaliyetTl
        maliyetTl += sliceTl
        endeksliMaliyetTl += sliceTl * katsayi
        maliyetUsd += take * head.birimMaliyetUsd
        weightedAlisKur += take * head.kur
        matchedLot += take
        head.kalanLot -= take
        remainingToSell -= take
        if (head.kalanLot <= EPS) q.shift()
      }

      if (matchedLot <= EPS) continue

      const commScale = matchedLot / t.lot
      const commUsd = (t.komisyon_usd || 0) * commScale
      const hasilatUsd = matchedLot * t.fiyat_usd - commUsd
      const hasilatTl =
        t.girisParaBirimi === 'TL' && t.fiyat_tl != null && t.fiyat_tl > 0
          ? matchedLot * t.fiyat_tl - commUsd * kur
          : hasilatUsd * kur

      const nominalKzTl = hasilatTl - maliyetTl
      const usdBazliKzTl = (hasilatUsd - maliyetUsd) * kur
      const kurFarkiKzTl = nominalKzTl - usdBazliKzTl
      const endeksliKzTl = hasilatTl - endeksliMaliyetTl
      const inst = byKod.get(t.enstruman)
      const sinif = inst?.sinif ?? 'DIGER'

      allFifoSales.push({
        txId: t.id,
        tarih: t.tarih,
        ilkAlisTarih: ilkAlisTarih || t.tarih,
        kod: t.enstruman,
        ad: inst?.ad ?? t.enstruman,
        sinif,
        sinifEtiket: SINIF_ETIKET[sinif] ?? sinif,
        lot: matchedLot,
        alisKurOrt: weightedAlisKur / matchedLot,
        satisKur: kur,
        maliyetTl,
        endeksliMaliyetTl,
        hasilatTl,
        nominalKzTl,
        kurFarkiKzTl,
        endeksliKzTl,
        endekslemeUygulandi: anyEndeks,
        endeksKatsayisi: maliyetTl > EPS ? endeksliMaliyetTl / maliyetTl : 1,
      })
    }
  }

  const satislar = allFifoSales.filter((s) => s.tarih.startsWith(yilStr))
  let toplamMaliyetTl = 0
  let toplamEndeksliMaliyetTl = 0
  let toplamHasilatTl = 0
  let toplamNominalKzTl = 0
  let toplamKurFarkiKzTl = 0
  let toplamEndeksliKzTl = 0

  for (const s of satislar) {
    toplamMaliyetTl += s.maliyetTl
    toplamEndeksliMaliyetTl += s.endeksliMaliyetTl
    toplamHasilatTl += s.hasilatTl
    toplamNominalKzTl += s.nominalKzTl
    toplamKurFarkiKzTl += s.kurFarkiKzTl
    toplamEndeksliKzTl += s.endeksliKzTl
  }

  const temettuTl = ds.cashflows
    .filter((c) => c.tur === 'TEMETTU' && c.tarih.startsWith(yilStr))
    .reduce((sum, c) => {
      if (c.tutar_tl != null && c.tutar_tl > 0) return sum + c.tutar_tl
      const k = lookupHistoricalUsdTry(ds, c.tarih, c.kur)
      return sum + c.tutar_usd * k
    }, 0)

  return {
    yil,
    satisSayisi: satislar.length,
    toplamMaliyetTl,
    toplamEndeksliMaliyetTl,
    toplamHasilatTl,
    toplamNominalKzTl,
    toplamKurFarkiKzTl,
    toplamEndeksliKzTl,
    temettuTl,
    satislar,
  }
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
    fifoTl: buildFifoTlVergiOzeti(ds, yil),
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

  // Varsayılan olarak içinde bulunulan yılı içersin
  yillar.add(new Date().getFullYear())

  return [...yillar].sort((a, b) => b - a)
}
