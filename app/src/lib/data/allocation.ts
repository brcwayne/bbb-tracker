import type { OpenPosition } from './derive'
import type { Instrument } from './types'
import type { PriceLookup } from './unrealized'

export const SINIF_ETIKET: Record<string, string> = {
  BIST: 'BIST Hisse',
  FON_HISSE: 'Hisse Fonu',
  FON_FON: 'Fon Sepeti',
  ALTIN: 'Altın',
  USA: 'ABD Hisse',
  NAKIT: 'Nakit & Para Piyasası',
}

export interface ClassSlice {
  key: string
  etiket: string
  tutarUsd: number
  pay: number
}

function getPosValue(
  pos: OpenPosition,
  inst: Instrument | undefined,
  p: PriceLookup,
  basis: 'maliyet' | 'deger' = 'deger',
): { val: number; isUnpricedFallback: boolean } {
  if (basis === 'maliyet') {
    return { val: pos.toplamMaliyetUsd, isUnpricedFallback: false }
  }
  if (!inst) return { val: pos.toplamMaliyetUsd, isUnpricedFallback: true }
  let cur: number | null = null
  if (inst.fiyatKaynagi === 'altin-turev') {
    if (p.usdPerGram != null && inst.altinKatsayi != null) {
      cur = p.usdPerGram * inst.altinKatsayi
    }
  } else if (inst.fiyatSembolu && p.bySymbol[inst.fiyatSembolu]?.priceUsd != null) {
    cur = p.bySymbol[inst.fiyatSembolu].priceUsd
  }
  if (cur != null) {
    return { val: cur * pos.lot, isUnpricedFallback: false }
  }
  return { val: pos.toplamMaliyetUsd, isUnpricedFallback: true }
}

export function allocationByClassWithCash(
  open: OpenPosition[],
  instruments: Instrument[],
  nakitUsd: number,
  p: PriceLookup,
  basis: 'maliyet' | 'deger' = 'deger',
): { slices: ClassSlice[]; toplamUsd: number; nakitNegatif: boolean; unpricedFallback: boolean } {
  const byKod = new Map(instruments.map((i) => [i.kod, i]))
  const groups = new Map<string, number>()
  let unpricedFallback = false

  const nakitNegatif = nakitUsd < 0
  const effectiveNakit = nakitNegatif ? 0 : nakitUsd
  if (effectiveNakit > 0) {
    groups.set('NAKIT', effectiveNakit)
  }

  for (const pos of open) {
    const inst = byKod.get(pos.kod)
    const rawSinif = inst?.sinif ?? '?'
    // Sınıf birleştirme: FON_PARA -> NAKIT
    const targetSinif = rawSinif === 'FON_PARA' ? 'NAKIT' : rawSinif
    const { val, isUnpricedFallback } = getPosValue(pos, inst, p, basis)
    if (isUnpricedFallback) {
      unpricedFallback = true
    }
    groups.set(targetSinif, (groups.get(targetSinif) ?? 0) + val)
  }

  const toplamUsd = [...groups.values()].reduce((s, v) => s + v, 0)
  const safeTotal = toplamUsd || 1

  const slices: ClassSlice[] = [...groups.entries()]
    .map(([key, tutarUsd]) => ({
      key,
      etiket: SINIF_ETIKET[key] ?? key,
      tutarUsd,
      pay: tutarUsd / safeTotal,
    }))
    .sort((a, b) => b.tutarUsd - a.tutarUsd)

  return { slices, toplamUsd, nakitNegatif, unpricedFallback }
}

export interface CashRatioResult {
  nakitVeFonParaUsd: number
  sadeceNakitUsd: number
  paydaUsd: number
  nakitOrani: number | null
  sadeceNakitOrani: number | null
}

export function cashRatios(
  open: OpenPosition[],
  instruments: Instrument[],
  nakitUsd: number,
  p: PriceLookup,
  xauOpenPositions?: OpenPosition[],
): CashRatioResult {
  const byKod = new Map(instruments.map((i) => [i.kod, i]))

  let totalOpenVal = 0
  let fonParaVal = 0
  for (const pos of open) {
    const inst = byKod.get(pos.kod)
    const val = getPosValue(pos, inst, p).val
    totalOpenVal += val
    if (inst?.sinif === 'FON_PARA') {
      fonParaVal += val
    }
  }

  let xauVal = 0
  if (xauOpenPositions) {
    for (const pos of xauOpenPositions) {
      const inst = byKod.get(pos.kod)
      xauVal += getPosValue(pos, inst, p).val
    }
  } else {
    for (const pos of open) {
      const inst = byKod.get(pos.kod)
      if (inst?.sinif === 'ALTIN') {
        xauVal += getPosValue(pos, inst, p).val
      }
    }
  }

  const toplamUsd = totalOpenVal + nakitUsd
  const paydaUsd = toplamUsd - xauVal

  const nakitVeFonParaUsd = nakitUsd + fonParaVal
  const sadeceNakitUsd = nakitUsd

  if (paydaUsd <= 0) {
    return {
      nakitVeFonParaUsd,
      sadeceNakitUsd,
      paydaUsd,
      nakitOrani: null,
      sadeceNakitOrani: null,
    }
  }

  return {
    nakitVeFonParaUsd,
    sadeceNakitUsd,
    paydaUsd,
    nakitOrani: nakitVeFonParaUsd / paydaUsd,
    sadeceNakitOrani: sadeceNakitUsd / paydaUsd,
  }
}
