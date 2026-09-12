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
    const byKod = new Map(ds.instruments.map((i) => [i.kod, i]))
    const sourceStats: Record<string, { total: number; missing: number }> = {}

    for (const pos of derived.positions.open) {
      const inst = byKod.get(pos.kod)
      const kaynak = inst?.fiyatKaynagi ?? 'diger'
      if (!sourceStats[kaynak]) sourceStats[kaynak] = { total: 0, missing: 0 }
      sourceStats[kaynak].total++

      let hasPrice = false
      if (inst) {
        if (inst.fiyatKaynagi === 'altin-turev') {
          hasPrice = prices.usdPerGram != null && inst.altinKatsayi != null
        } else if (inst.fiyatSembolu && prices.bySymbol[inst.fiyatSembolu]?.priceUsd != null) {
          hasPrice = true
        }
      }
      if (!hasPrice) {
        sourceStats[kaynak].missing++
      }
    }

    const trSuffix = (n: number) => {
      const last = n % 10
      if (n === 10) return "'u"
      if (last === 1 || last === 5 || last === 8) return "'i"
      if (last === 2 || last === 7) return "'si"
      if (last === 3 || last === 4) return "'ü"
      if (last === 6) return "'sı"
      if (last === 9) return "'u"
      return "'si"
    }

    const sourceMessages: string[] = []
    for (const [kaynak, stats] of Object.entries(sourceStats)) {
      if (stats.missing > 0) {
        if (kaynak === 'tefas') {
          sourceMessages.push(`TEFAS'tan ${stats.total} fonun ${stats.missing}${trSuffix(stats.missing)} alınamadı`)
        } else if (kaynak === 'yahoo') {
          sourceMessages.push(`Yahoo'dan ${stats.total} hissenin ${stats.missing}${trSuffix(stats.missing)} alınamadı`)
        } else if (kaynak === 'altin-turev') {
          sourceMessages.push('Altın/Türev fiyatı alınamadı')
        } else if (kaynak === 'tradingview') {
          sourceMessages.push(`TradingView'dan ${stats.total} sembolün ${stats.missing}${trSuffix(stats.missing)} alınamadı`)
        } else {
          sourceMessages.push(`${stats.missing} pozisyonun fiyatı alınamadı`)
        }
      }
    }

    const mesaj = sourceMessages.length > 0
      ? sourceMessages.join(', ')
      : `${live.fiyatsizPozisyon} pozisyonun güncel fiyatı alınamadı`

    warnings.push({
      id: 'fiyatsiz-pozisyon',
      seviye: 'uyari',
      mesaj,
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

  // 7. Oto-senkron gecikmesi veya hatası (I9)
  if (ds.syncState) {
    if (ds.syncState.hata || ds.syncState.sonucu === 'hata') {
      warnings.push({
        id: 'sync-hata',
        seviye: 'uyari',
        mesaj: `Oto-senkron hatası: ${ds.syncState.hata || 'başarısız'}`,
        sayfa: 'panorama',
      })
    } else if (ds.syncState.sonKosu) {
      const runTime = Date.parse(ds.syncState.sonKosu)
      if (!Number.isNaN(runTime) && Date.now() - runTime > 2 * 60 * 60 * 1000) {
        warnings.push({
          id: 'sync-gecikti',
          seviye: 'uyari',
          mesaj: 'Oto-senkron 2 saatten uzun süredir çalışmadı',
          sayfa: 'panorama',
        })
      }
    }
  }

  return warnings
}
