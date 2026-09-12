import { describe, it, expect } from 'vitest'
import { allocationByClassWithCash, cashRatios, SINIF_ETIKET } from './allocation'
import type { OpenPosition } from './derive'
import type { Instrument } from './types'
import type { PriceLookup } from './unrealized'

describe('allocationByClassWithCash (G3)', () => {
  const instruments: Instrument[] = [
    { kod: 'THYAO', ad: 'Türk Hava Yolları', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'bist', fiyatSembolu: 'THYAO.IS', seviyeler: null },
    { kod: 'TP2', ad: 'Tera Para Piyasası', sinif: 'FON_PARA', girisParaBirimi: 'TL', fiyatKaynagi: 'tefas', fiyatSembolu: 'TP2', seviyeler: null },
    { kod: 'ALTIN_S1', ad: 'Darphane Altın', sinif: 'ALTIN', girisParaBirimi: 'TL', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'ALTIN.S1', seviyeler: null, altinKatsayi: 0.01 },
  ]

  const p: PriceLookup = {
    bySymbol: {
      'THYAO.IS': { priceUsd: 10 },
      'TP2': { priceUsd: 2 },
    },
    usdPerGram: 80,
  }

  it('merges cash and FON_PARA into NAKIT, uses current value, sums to 1', () => {
    const open: OpenPosition[] = [
      { kod: 'THYAO', lot: 100, ortMaliyetUsd: 8, toplamMaliyetUsd: 800 }, // value: 100 * 10 = 1000
      { kod: 'TP2', lot: 50, ortMaliyetUsd: 1.8, toplamMaliyetUsd: 90 },     // value: 50 * 2 = 100
      { kod: 'ALTIN_S1', lot: 100, ortMaliyetUsd: 0.7, toplamMaliyetUsd: 70 }, // value: 80 * 0.01 * 100 = 80
    ]
    const nakitUsd = 400

    const res = allocationByClassWithCash(open, instruments, nakitUsd, p)

    expect(res.nakitNegatif).toBe(false)
    // NAKIT = 400 (cash) + 100 (TP2) = 500
    // BIST = 1000
    // ALTIN = 80
    // Total = 1580
    expect(res.toplamUsd).toBe(1580)
    expect(res.slices).toHaveLength(3)
    expect(res.slices[0].key).toBe('BIST')
    expect(res.slices[0].tutarUsd).toBe(1000)
    expect(res.slices[0].etiket).toBe('BIST Hisse')

    expect(res.slices[1].key).toBe('NAKIT')
    expect(res.slices[1].tutarUsd).toBe(500)
    expect(res.slices[1].etiket).toBe('Nakit & Para Piyasası')

    expect(res.slices[2].key).toBe('ALTIN')
    expect(res.slices[2].tutarUsd).toBe(80)

    const paySum = res.slices.reduce((s, r) => s + r.pay, 0)
    expect(paySum).toBeCloseTo(1, 9)
  })

  it('falls back to cost when current prices are unavailable and flags unpricedFallback', () => {
    const open: OpenPosition[] = [
      { kod: 'THYAO', lot: 100, ortMaliyetUsd: 8, toplamMaliyetUsd: 800 },
    ]
    const emptyPrices: PriceLookup = { bySymbol: {}, usdPerGram: null }
    const res = allocationByClassWithCash(open, instruments, 200, emptyPrices, 'deger')
    expect(res.toplamUsd).toBe(1000) // 800 cost + 200 cash
    expect(res.slices[0].tutarUsd).toBe(800)
    expect(res.unpricedFallback).toBe(true)
  })

  it('uses cost strictly when basis is maliyet even if prices are available', () => {
    const open: OpenPosition[] = [
      { kod: 'THYAO', lot: 100, ortMaliyetUsd: 8, toplamMaliyetUsd: 800 }, // value would be 1000
    ]
    const res = allocationByClassWithCash(open, instruments, 200, p, 'maliyet')
    expect(res.toplamUsd).toBe(1000) // 800 cost + 200 cash
    expect(res.slices[0].tutarUsd).toBe(800)
    expect(res.unpricedFallback).toBe(false)
  })

  it('flags negative cash and sets cash slice to 0', () => {
    const open: OpenPosition[] = [
      { kod: 'THYAO', lot: 100, ortMaliyetUsd: 10, toplamMaliyetUsd: 1000 },
    ]
    const emptyPrices: PriceLookup = { bySymbol: {}, usdPerGram: null }
    const res = allocationByClassWithCash(open, instruments, -5000, emptyPrices)
    expect(res.nakitNegatif).toBe(true)
    expect(res.slices.find((s) => s.key === 'NAKIT')).toBeUndefined()
    expect(res.toplamUsd).toBe(1000)
  })
})

describe('cashRatios (G4)', () => {
  const instruments: Instrument[] = [
    { kod: 'THYAO', ad: 'Türk Hava Yolları', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'bist', fiyatSembolu: 'THYAO.IS', seviyeler: null },
    { kod: 'TP2', ad: 'Tera Para Piyasası', sinif: 'FON_PARA', girisParaBirimi: 'TL', fiyatKaynagi: 'tefas', fiyatSembolu: 'TP2', seviyeler: null },
    { kod: 'ALTIN_S1', ad: 'Darphane Altın', sinif: 'ALTIN', girisParaBirimi: 'TL', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'ALTIN.S1', seviyeler: null },
  ]
  const p: PriceLookup = { bySymbol: {}, usdPerGram: null }

  it('computes nakitOrani without XAU as cash / total', () => {
    const open: OpenPosition[] = [
      { kod: 'THYAO', lot: 10, ortMaliyetUsd: 80, toplamMaliyetUsd: 800 },
      { kod: 'TP2', lot: 20, ortMaliyetUsd: 10, toplamMaliyetUsd: 200 },
    ]
    const nakitUsd = 1000 // total = 800 + 200 + 1000 = 2000

    const res = cashRatios(open, instruments, nakitUsd, p)
    expect(res.paydaUsd).toBe(2000)
    // nakit + fonPara = 1000 + 200 = 1200 / 2000 = 60%
    expect(res.nakitOrani).toBeCloseTo(0.60, 4)
    // sadece nakit = 1000 / 2000 = 50%
    expect(res.sadeceNakitOrani).toBeCloseTo(0.50, 4)
  })

  it('excludes XAU from both numerator and denominator', () => {
    const open: OpenPosition[] = [
      { kod: 'THYAO', lot: 10, ortMaliyetUsd: 50, toplamMaliyetUsd: 500 },
      { kod: 'ALTIN_S1', lot: 10, ortMaliyetUsd: 100, toplamMaliyetUsd: 1000 },
    ]
    const nakitUsd = 500
    // total = 500 (THY) + 1000 (XAU) + 500 (cash) = 2000
    // payda = 2000 - 1000 = 1000
    // nakitOrani = 500 / 1000 = 50%
    const res = cashRatios(open, instruments, nakitUsd, p)
    expect(res.paydaUsd).toBe(1000)
    expect(res.nakitOrani).toBeCloseTo(0.50, 4)
    expect(res.sadeceNakitOrani).toBeCloseTo(0.50, 4)
  })

  it('returns null when paydaUsd <= 0', () => {
    const open: OpenPosition[] = []
    const res = cashRatios(open, instruments, 0, p)
    expect(res.paydaUsd).toBe(0)
    expect(res.nakitOrani).toBeNull()
    expect(res.sadeceNakitOrani).toBeNull()
  })

  it('when entire portfolio is XAU, payda is cash and ratio is 100%', () => {
    const open: OpenPosition[] = [
      { kod: 'ALTIN_S1', lot: 10, ortMaliyetUsd: 100, toplamMaliyetUsd: 1000 },
    ]
    const nakitUsd = 200
    // payda = 1000 + 200 - 1000 = 200
    const res = cashRatios(open, instruments, nakitUsd, p)
    expect(res.paydaUsd).toBe(200)
    expect(res.nakitOrani).toBeCloseTo(1.0, 4)
    expect(res.sadeceNakitOrani).toBeCloseTo(1.0, 4)
  })
})
