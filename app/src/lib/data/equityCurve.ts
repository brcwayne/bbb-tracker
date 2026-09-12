import type { Dataset } from './types'
import type { SaleEvent } from './ledger'

export interface AylikSermaye {
  ay: string // 'YYYY-MM'
  mevduatKumulatif: number
  cekimKumulatif: number
  gerceklesenKzKumulatif: number
  temettuKumulatif: number
  sermaye: number // mevduat − cekim + gerceklesenKz + temettu
  /** Excel Monthly Report'un aynı ay için dediği — karşılaştırma çizgisi. */
  excelSermaye: number | null
  /** sermaye − excelSermaye; beklenen ≈ 113.209,43 (+ o aya kadarki K/Z ayrışması). */
  excelFarki: number | null
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Defter bazlı kümülatif sermaye eğrisini (realize sermaye) üretir.
 * Seri, Excel'in 2016-05 başlangıcından değil ilk nakit akışının ayından (2016-01) başlar.
 * Excel serisini hard-code etmez; cashflows ve SaleEvents kayıtlarından doğrudan hesaplar.
 */
export function buildEquityCurve(ds: Dataset, sales: SaleEvent[]): AylikSermaye[] {
  // İlk ay: nakit akışlarının en erken tarihi (yoksa işlem veya snapshot'lardan)
  const cfMonths = ds.cashflows.map((c) => c.tarih.slice(0, 7)).filter(Boolean)
  if (cfMonths.length === 0) {
    const allMonths = [
      ...ds.transactions.map((t) => t.tarih.slice(0, 7)),
      ...ds.snapshots.map((s) => s.tarih.slice(0, 7)),
      ...sales.map((s) => s.tarih.slice(0, 7)),
    ].filter(Boolean)
    if (allMonths.length === 0) return []
    cfMonths.push(...allMonths)
  }

  cfMonths.sort()
  const startMonth = cfMonths[0]

  // Bitiş ayı: tüm veri setindeki en son ay
  const allEndMonths = [
    ...cfMonths,
    ...ds.transactions.map((t) => t.tarih.slice(0, 7)),
    ...ds.snapshots.map((s) => s.tarih.slice(0, 7)),
    ...sales.map((s) => s.tarih.slice(0, 7)),
  ].filter(Boolean)
  allEndMonths.sort()
  const endMonth = allEndMonths[allEndMonths.length - 1]

  // Snapshot'ları YYYY-MM anahtarıyla eşle
  const snapMap = new Map<string, number>()
  for (const s of ds.snapshots) {
    snapMap.set(s.tarih.slice(0, 7), s.toplamOzkaynak_usd)
  }

  // Sıralı hareket toplamı
  const sortedCfs = [...ds.cashflows].sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0))
  const sortedSales = [...sales].sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0))

  let cfIdx = 0
  let saleIdx = 0
  let mevduat = 0
  let cekim = 0
  let temettu = 0
  let gerceklesenKz = 0

  const curve: AylikSermaye[] = []
  let cur = startMonth

  while (cur <= endMonth) {
    while (cfIdx < sortedCfs.length && sortedCfs[cfIdx].tarih.slice(0, 7) <= cur) {
      const c = sortedCfs[cfIdx]
      if (c.tur === 'YATIRMA') mevduat += c.tutar_usd
      else if (c.tur === 'CEKME') cekim += c.tutar_usd
      else if (c.tur === 'TEMETTU') temettu += c.tutar_usd
      cfIdx++
    }

    while (saleIdx < sortedSales.length && sortedSales[saleIdx].tarih.slice(0, 7) <= cur) {
      gerceklesenKz += sortedSales[saleIdx].kzUsd
      saleIdx++
    }

    const mevduatKumulatif = Math.round(mevduat * 100) / 100
    const cekimKumulatif = Math.round(cekim * 100) / 100
    const gerceklesenKzKumulatif = Math.round(gerceklesenKz * 100) / 100
    const temettuKumulatif = Math.round(temettu * 100) / 100
    const sermaye = Math.round((mevduatKumulatif - cekimKumulatif + gerceklesenKzKumulatif + temettuKumulatif) * 100) / 100
    const excelSermaye = snapMap.has(cur) ? snapMap.get(cur)! : null
    const excelFarki = excelSermaye !== null ? Math.round((sermaye - excelSermaye) * 100) / 100 : null

    curve.push({
      ay: cur,
      mevduatKumulatif,
      cekimKumulatif,
      gerceklesenKzKumulatif,
      temettuKumulatif,
      sermaye,
      excelSermaye: excelSermaye !== null ? Math.round(excelSermaye * 100) / 100 : null,
      excelFarki,
    })

    cur = nextMonth(cur)
  }

  return curve
}
