export const GRAMS_PER_TROY_OUNCE = 31.1034768
export const GOLD_YAHOO_SYMBOL = 'GC=F'
export const SILVER_YAHOO_SYMBOL = 'SI=F'

export type PriceSource = 'yahoo' | 'altin-turev' | 'gumus-turev' | 'kripto' | 'tefas' | 'tradingview'

/**
 * Yahoo chart symbol for an instrument, or null when another source handles it
 * (`tefas` → fonoloji, `tradingview` → scanner) or P3 does not price it.
 */
export function yahooSymbolFor(fiyatKaynagi: string, fiyatSembolu: string): string | null {
  if (fiyatKaynagi === 'yahoo' || fiyatKaynagi === 'kripto') return fiyatSembolu
  if (fiyatKaynagi === 'altin-turev') return GOLD_YAHOO_SYMBOL
  if (fiyatKaynagi === 'gumus-turev') return SILVER_YAHOO_SYMBOL
  return null
}

export function usdPerGramFromOunce(ouncePriceUsd: number): number {
  return ouncePriceUsd / GRAMS_PER_TROY_OUNCE
}
