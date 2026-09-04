import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fixture } from '../fixtures/dataset'
import { prices, refreshPrices, hydratePrices, symbolsForHeldInstruments, priceApiEnabled } from './prices.svelte'
import { settings } from './settings.svelte'

beforeEach(() => {
  sessionStorage.clear()
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
    expect(syms).toContain('GC=F') // XAU is fully exited in the fixture… see note
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
    expect(JSON.parse(sessionStorage.getItem('bbb-prices')!).asOf).toBe('2999-01-01T00:00:00Z')
  })

  it('sets status "error" when the request fails', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })))
    await refreshPrices(fixture)
    expect(prices.status).toBe('error')
  })
})

describe('hydratePrices', () => {
  it('restores a fresh snapshot', () => {
    sessionStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: { 'THYAO.IS': { price: 1, currency: 'TRY', priceUsd: 0.02 } },
      usdPerGram: 90, usdtry: 41, asOf: new Date().toISOString(),
    }))
    hydratePrices()
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBe(0.02)
  })

  it('ignores a snapshot older than 30 minutes', () => {
    sessionStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: {}, usdPerGram: null, usdtry: null,
      asOf: new Date(Date.now() - 31 * 60_000).toISOString(),
    }))
    hydratePrices()
    expect(prices.status).toBe('idle')
  })

  it('ignores an unparseable snapshot', () => {
    sessionStorage.setItem('bbb-prices', 'not json')
    hydratePrices()
    expect(prices.status).toBe('idle')
  })
})
