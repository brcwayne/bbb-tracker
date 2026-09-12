import type { Dataset } from './types'
import type { DerivedBundle } from './store'
import type { PriceLookup } from './unrealized'
import { liveEquity } from './dashboard'
import { kimlikKontrol } from './kimlik'

export type WarningLevel = 'bilgi' | 'uyari' | 'hata'

export interface WarningItem {
  id: string
  seviye: WarningLevel
  mesaj: string
  sayfa?: string
}

function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('tr-TR')
}

export function collectWarnings(
  ds: Dataset,
  derived: DerivedBundle,
  prices: PriceLookup,
): WarningItem[] {
  const warnings: WarningItem[] = []

  const nakitUsd = Object.values(derived.cashByHesap).reduce((s, v) => s + v, 0)
  const live = liveEquity(ds, derived.positions, prices, nakitUsd)

  // 1. Mutabakat farkı (Panorama)
  if (
    live.snapshotOzkaynakUsd != null &&
    live.farkUsd != null &&
    live.snapshotOzkaynakUsd > 0 &&
    Math.abs(live.farkUsd) / live.snapshotOzkaynakUsd > 0.05
  ) {
    const diff = Math.abs(live.farkUsd)
    warnings.push({
      id: 'mutabakat-farki',
      seviye: 'bilgi',
      mesaj: `Aylık rapor ile defter arasında ${fmtUsd(diff)} fark var`,
      sayfa: 'panorama',
    })
  }

  // 2. Negatif nakit (Panorama donut altı)
  if (nakitUsd < -1e-6) {
    warnings.push({
      id: 'negatif-nakit',
      seviye: 'uyari',
      mesaj: `Nakit bakiyesi negatif (−${fmtUsd(Math.abs(nakitUsd))}) — kurum bazlı düzeltme gerekiyor`,
      sayfa: 'panorama',
    })
  }

  // 3. Fiyatı alınamayan pozisyonlar (Panorama)
  if (live.fiyatsizPozisyon > 0) {
    warnings.push({
      id: 'fiyatsiz-pozisyon',
      seviye: 'uyari',
      mesaj: `${live.fiyatsizPozisyon} pozisyonun güncel fiyatı alınamadı`,
    })
  }

  // 4 & 5. Portföy ödünç alma ve aşırı satış (Pozisyonlar sayfa dibi)
  if (derived.positions?.errors && derived.positions.errors.length > 0) {
    derived.positions.errors.forEach((err, idx) => {
      const isOverSell = err.includes('aşırı satış')
      const isBorrow = err.includes('portföyünde yok') || err.includes('alındı')
      warnings.push({
        id: isOverSell ? `asiri-satis-${idx}` : isBorrow ? `odunc-${idx}` : `ledger-err-${idx}`,
        seviye: isOverSell ? 'hata' : 'uyari',
        mesaj: err,
        sayfa: 'pozisyonlar',
      })
    })
  }

  // 6. Muhasebe kimliği sapması (kimlik %0,5'ten fazla sapıyorsa 'hata')
  if (derived.positions) {
    const kimlik = kimlikKontrol(
      ds,
      derived.positions.sales ?? [],
      derived.positions.open ?? [],
      nakitUsd,
    )
    if (kimlik.farkOrani > 0.005) {
      warnings.push({
        id: 'kimlik-farki',
        seviye: 'hata',
        mesaj: `Muhasebe kimliği tutmuyor: fark ${fmtUsd(Math.abs(kimlik.fark))} (%${(kimlik.farkOrani * 100).toFixed(1)})`,
        sayfa: 'panorama',
      })
    }
  }

  return warnings
}
