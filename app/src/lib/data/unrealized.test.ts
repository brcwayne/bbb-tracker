import { describe, it, expect } from 'vitest'
import { unrealizedByKod, unrealizedTotalUsd, type PriceLookup } from './unrealized'
import type { OpenPosition } from './derive'
import type { Instrument } from './types'

const inst = (over: Partial<Instrument>): Instrument => ({
  kod: 'X', ad: 'X', sinif: 'BIST', girisParaBirimi: 'TL',
  fiyatKaynagi: 'yahoo', fiyatSembolu: 'X.IS', seviyeler: null, ...over,
})

const open: OpenPosition[] = [
  { kod: 'THYAO', lot: 10, ortMaliyetUsd: 5, toplamMaliyetUsd: 50 },
  { kod: 'XAU', lot: 4, ortMaliyetUsd: 100, toplamMaliyetUsd: 400 },
  { kod: 'NOPRICE', lot: 2, ortMaliyetUsd: 3, toplamMaliyetUsd: 6 },
]
const instruments: Instrument[] = [
  inst({ kod: 'THYAO', fiyatSembolu: 'THYAO.IS' }),
  inst({ kod: 'XAU', sinif: 'ALTIN', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'XAUUSD', altinKatsayi: 1 }),
  inst({ kod: 'NOPRICE', fiyatSembolu: 'NP.IS' }),
]
const p: PriceLookup = { bySymbol: { 'THYAO.IS': { priceUsd: 8 } }, usdPerGram: 130 }

describe('unrealizedByKod', () => {
  it('computes K/Z for a BIST holding with a price', () => {
    const m = unrealizedByKod(open, instruments, p)
    expect(m.get('THYAO')).toEqual({ kod: 'THYAO', guncelFiyatUsd: 8, kzUsd: (8 - 5) * 10, kzPct: 30 / 50 })
  })
  it('prices gold from usdPerGram × altinKatsayi', () => {
    const m = unrealizedByKod(open, instruments, p)
    expect(m.get('XAU')).toEqual({ kod: 'XAU', guncelFiyatUsd: 130, kzUsd: (130 - 100) * 4, kzPct: 120 / 400 })
  })
  it('leaves a priceless holding null', () => {
    const m = unrealizedByKod(open, instruments, p)
    expect(m.get('NOPRICE')).toEqual({ kod: 'NOPRICE', guncelFiyatUsd: null, kzUsd: null, kzPct: null })
  })
})

describe('unrealizedTotalUsd', () => {
  it('sums only the priced positions', () => {
    expect(unrealizedTotalUsd(open, instruments, p)).toBe((8 - 5) * 10 + (130 - 100) * 4)
  })
  it('is null when nothing is priced', () => {
    expect(unrealizedTotalUsd(open, instruments, { bySymbol: {}, usdPerGram: null })).toBeNull()
  })
})
