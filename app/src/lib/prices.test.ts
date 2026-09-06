import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fixture } from '../fixtures/dataset'
import {
  prices,
  refreshPrices,
  hydratePrices,
  pricesStale,
  symbolsForHeldInstruments,
  priceApiEnabled,
} from './prices.svelte'
import { settings, isLiveRate } from './settings.svelte'

beforeEach(() => {
  localStorage.clear()
  prices.bySymbol = {}
  prices.usdPerGram = null
  prices.usdtry = null
  prices.asOf = null
  prices.status = 'idle'
  prices.error = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('symbolsForHeldInstruments', () => {
  it('collects API symbols for open holdings, gold folded to GC=F', () => {
    const syms = symbolsForHeldInstruments(fixture)
    expect(syms).toContain('THYAO.IS')
    expect(syms).toContain('GC=F') // XAU is held (fixture t_g) → gold folds to GC=F
  })

  it('marks a held TEFAS fund as tefas:<code>', () => {
    const ds = {
      ...fixture,
      transactions: [
        { ...fixture.transactions[0], id: 't_mac', enstruman: 'MAC', yon: 'AL' as const, lot: 1000 },
      ],
      instruments: [
        {
          kod: 'MAC',
          ad: 'MAC',
          sinif: 'FON_HISSE' as const,
          girisParaBirimi: 'TL',
          fiyatKaynagi: 'tefas',
          fiyatSembolu: 'MAC',
          seviyeler: null,
        },
      ],
    }
    expect(symbolsForHeldInstruments(ds)).toEqual(['tefas:MAC'])
  })

  it('marks a held TradingView instrument as tv:<code>', () => {
    const ds = {
      ...fixture,
      transactions: [
        { ...fixture.transactions[0], id: 't_dmlkt', enstruman: 'DMLKT', yon: 'AL' as const, lot: 100 },
      ],
      instruments: [
        {
          kod: 'DMLKT',
          ad: 'DMLKT',
          sinif: 'BIST' as const,
          girisParaBirimi: 'TL',
          fiyatKaynagi: 'tradingview',
          fiyatSembolu: 'DMLKT',
          seviyeler: null,
        },
      ],
    }
    expect(symbolsForHeldInstruments(ds)).toEqual(['tv:DMLKT'])
  })
})

describe('refreshPrices', () => {
  it('is a no-op without VITE_PRICE_API', async () => {
    await refreshPrices(fixture)
    expect(prices.status).toBe('idle')
    expect(priceApiEnabled()).toBe(false)
  })

  it('fills the store and the live rate on success', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      asOf: '2999-01-01T00:00:00Z',
      usdtry: 40,
      prices: {
        'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 10 },
        'GC=F': { price: 3110.34768, currency: 'USD', priceUsd: 3110.34768, usdPerGram: 100 },
        'BAD.IS': { error: 'kaynak' },
      },
    }))))
    await refreshPrices(fixture)
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBe(10)
    expect(prices.bySymbol['BAD.IS']).toBeUndefined()
    expect(prices.usdPerGram).toBe(100)
    expect(settings.rate).toBe(40)
    expect(JSON.parse(localStorage.getItem('bbb-prices')!).asOf).toBe('2999-01-01T00:00:00Z')
  })

  it('de-prefixes a tefas:<code> entry into bySymbol by its bare code', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      asOf: '2999-01-01T00:00:00Z',
      usdtry: 40,
      prices: {
        'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 10 },
        'GC=F': { price: 3110.34768, currency: 'USD', priceUsd: 3110.34768, usdPerGram: 100 },
        'tefas:MAC': { price: 12.5, currency: 'TRY', priceUsd: 0.3125 },
      },
    }))))
    await refreshPrices(fixture)
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['MAC'].priceUsd).toBe(0.3125)
    expect(prices.bySymbol['tefas:MAC']).toBeUndefined()
  })

  it('de-prefixes a tv:<code> entry into bySymbol by its bare code', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      asOf: '2999-01-01T00:00:00Z',
      usdtry: 40,
      prices: {
        'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 10 },
        'GC=F': { price: 3110.34768, currency: 'USD', priceUsd: 3110.34768, usdPerGram: 100 },
        'tv:DMLKT': { price: 12.5, currency: 'TRY', priceUsd: 0.3125 },
      },
    }))))
    await refreshPrices(fixture)
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['DMLKT'].priceUsd).toBe(0.3125)
    expect(prices.bySymbol['tv:DMLKT']).toBeUndefined()
  })

  it('sets status "error" when the request fails', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })))
    await refreshPrices(fixture)
    expect(prices.status).toBe('error')
  })

  it('sets status "error" when no symbol could be priced (Fix 6)', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      asOf: '2999-01-01T00:00:00Z',
      usdtry: 40,
      prices: { 'THYAO.IS': { error: 'kaynak' }, 'GC=F': { error: 'kaynak' } },
    }))))
    await refreshPrices(fixture)
    expect(prices.status).toBe('error')
    expect(prices.error).toBe('hiçbir sembol fiyatlanamadı')
  })

  it('keeps an entry whose priceUsd is null (Fix 7)', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      asOf: '2999-01-01T00:00:00Z',
      usdtry: null,
      prices: {
        'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: null },
        'GC=F': { price: 3110, currency: 'USD', priceUsd: 3110, usdPerGram: 100 },
      },
    }))))
    await refreshPrices(fixture)
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBeNull()
  })
})

describe('hydratePrices', () => {
  it('restores a fresh snapshot', () => {
    localStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: { 'THYAO.IS': { price: 1, currency: 'TRY', priceUsd: 0.02 } },
      usdPerGram: 90, usdtry: 41, asOf: new Date().toISOString(),
    }))
    hydratePrices()
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBe(0.02)
  })

  it('restores an old snapshot too, so last-known prices survive a relaunch', () => {
    const old = new Date(Date.now() - 20 * 60 * 60_000).toISOString()
    localStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: { 'THYAO.IS': { price: 1, currency: 'TRY', priceUsd: 0.02 } },
      usdPerGram: null, usdtry: 41, asOf: old,
    }))
    hydratePrices()
    expect(prices.status).toBe('ready')
    expect(prices.asOf).toBe(old)
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBe(0.02)
  })

  it('ignores an unparseable snapshot', () => {
    localStorage.setItem('bbb-prices', 'not json')
    hydratePrices()
    expect(prices.status).toBe('idle')
  })

  it('ignores a snapshot with no usable asOf', () => {
    localStorage.setItem('bbb-prices', JSON.stringify({ bySymbol: {}, asOf: null }))
    hydratePrices()
    expect(prices.status).toBe('idle')
  })

  it('re-applies the snapshot usdtry as a live rate (Fix 8)', () => {
    localStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: {}, usdPerGram: null, usdtry: 42.5, asOf: new Date().toISOString(),
    }))
    hydratePrices()
    expect(settings.rate).toBe(42.5)
    expect(isLiveRate()).toBe(true)
  })
})

describe('pricesStale', () => {
  it('is stale with no data loaded', () => {
    expect(pricesStale()).toBe(true)
  })

  it('is fresh right after a refresh', () => {
    prices.asOf = new Date().toISOString()
    expect(pricesStale()).toBe(false)
  })

  it('is stale once the snapshot is hours old', () => {
    prices.asOf = new Date(Date.now() - 7 * 60 * 60_000).toISOString()
    expect(pricesStale()).toBe(true)
  })
})
