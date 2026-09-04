export const GRAMS_PER_TROY_OUNCE = 31.1034768
export const GOLD_YAHOO_SYMBOL = 'GC=F'

export type PriceSource = 'yahoo' | 'altin-turev' | 'tefas'

/** Yahoo chart symbol for an instrument, or null when P3 does not price it. */
export function yahooSymbolFor(fiyatKaynagi: string, fiyatSembolu: string): string | null {
  if (fiyatKaynagi === 'yahoo') return fiyatSembolu
  if (fiyatKaynagi === 'altin-turev') return GOLD_YAHOO_SYMBOL
  return null
}

export function usdPerGramFromOunce(ouncePriceUsd: number): number {
  return ouncePriceUsd / GRAMS_PER_TROY_OUNCE
}
