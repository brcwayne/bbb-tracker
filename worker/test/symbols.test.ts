import { describe, it, expect } from 'vitest'
import { yahooSymbolFor, usdPerGramFromOunce, GOLD_YAHOO_SYMBOL } from '../src/symbols'

describe('yahooSymbolFor', () => {
  it('passes BIST/USA symbols through for source "yahoo"', () => {
    expect(yahooSymbolFor('yahoo', 'THYAO.IS')).toBe('THYAO.IS')
    expect(yahooSymbolFor('yahoo', 'SPCX')).toBe('SPCX')
  })
  it('maps every gold instrument to the single gold future', () => {
    expect(yahooSymbolFor('altin-turev', 'XAUUSD')).toBe(GOLD_YAHOO_SYMBOL)
  })
  it('returns null for tefas / unknown (not priced in P3)', () => {
    expect(yahooSymbolFor('tefas', 'MAC')).toBeNull()
    expect(yahooSymbolFor('whatever', 'X')).toBeNull()
  })
})

describe('usdPerGramFromOunce', () => {
  it('divides by grams per troy ounce', () => {
    expect(usdPerGramFromOunce(4516.9)).toBeCloseTo(145.222, 3)
  })
})
