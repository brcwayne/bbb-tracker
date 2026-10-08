import { describe, it, expect } from 'vitest'
import * as f from './format'

describe('usd', () => {
  it('formats positive', () => expect(f.usd(1234.56)).toBe('$1,234.56'))
  it('formats negative', () => expect(f.usd(-12)).toBe('-$12.00'))
  it('sign option', () => expect(f.usd(12, { sign: true })).toBe('+$12.00'))
  it('rounds to cents', () => expect(f.usd(115018.974)).toBe('$115,018.97'))
  it('nullish -> dash', () => {
    expect(f.usd(NaN)).toBe('—')
    // @ts-expect-error test
    expect(f.usd(null)).toBe('—')
  })
})

describe('pct', () => {
  it('fraction to percent', () => expect(f.pct(0.1234)).toBe('12.3%'))
  it('negative', () => expect(f.pct(-0.02)).toBe('-2.0%'))
  it('digits', () => expect(f.pct(0.6483, 2)).toBe('64.83%'))
  // @ts-expect-error test
  it('nullish -> dash', () => expect(f.pct(null)).toBe('—'))
})

describe('dates', () => {
  it('dateShort', () => expect(f.dateShort('2026-08-31')).toBe('31 Ağu 2026'))
  it('monthLabel', () => expect(f.monthLabel('2026-08-31')).toBe('Ağu 2026'))
})

describe('eur & fmtCurrency', () => {
  it('formats positive EUR', () => expect(f.eur(1234.56)).toBe('€1.234,56'))
  it('formats negative EUR', () => expect(f.eur(-50)).toBe('-€50,00'))
  it('fmtCurrency picks correct formatter', () => {
    expect(f.fmtCurrency(100, 'TRY')).toBe('₺100,00')
    expect(f.fmtCurrency(100, 'USD')).toBe('$100.00')
    expect(f.fmtCurrency(100, 'EUR')).toBe('€100,00')
  })
})

