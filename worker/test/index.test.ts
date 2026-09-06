import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import thyao from './fixtures/yahoo-thyao.json'

// Force a stray synchronous throw from the symbol fan-out for one magic symbol,
// so the outer try/catch in `fetch` can be exercised. All other calls delegate.
vi.mock('../src/yahoo', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/yahoo')>()
  return {
    ...mod,
    fetchQuotes: (symbols: string[], fetchImpl?: typeof fetch) => {
      if (symbols.includes('__BOOM__')) throw new Error('boom')
      return mod.fetchQuotes(symbols, fetchImpl as typeof fetch)
    },
  }
})

const env = { ALLOWED_ORIGIN: 'https://example.test' }
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

const tcmbXml = readFileSync(new URL('./fixtures/tcmb-today.xml', import.meta.url), 'utf8')

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
    const s = String(u)
    if (s.includes('tcmb.gov.tr')) return new Response(tcmbXml)
    if (s.includes('THYAO')) return new Response(JSON.stringify(thyao))
    if (s.includes('GC%3DF') || s.includes('GC=F'))
      return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 4516.9, currency: 'USD' } }] } }))
    return new Response('x', { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('worker routing', () => {
  it('GET /health → 200 {ok:true} with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/health'), env, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('OPTIONS → 204 with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/prices', { method: 'OPTIONS' }), env, ctx)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('unknown route → 404 {error}', async () => {
    const res = await worker.fetch(new Request('https://w/nope'), env, ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'bilinmeyen uç' })
  })
})

describe('/fx/latest', () => {
  it('returns the TCMB rate', async () => {
    const res = await worker.fetch(new Request('https://w/fx/latest'), env, ctx)
    expect(res.status).toBe(200)
    const b = await res.json() as any
    expect(b.usdtry).toBeCloseTo(48.2238, 4)
    expect(b.date).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe('/prices', () => {
  it('400 without symbols', async () => {
    const res = await worker.fetch(new Request('https://w/prices'), env, ctx)
    expect(res.status).toBe(400)
  })

  it('400 without symbols has the exact Turkish error body', async () => {
    const res = await worker.fetch(new Request('https://w/prices'), env, ctx)
    expect(await res.json()).toEqual({ error: 'symbols parametresi gerekli' })
  })

  it('degrades gracefully when TCMB is down: 200 with CORS, usdtry null, TRY priceUsd null, gold unaffected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
      const s = String(u)
      if (s.includes('tcmb.gov.tr')) return new Response('', { status: 503 })
      if (s.includes('THYAO')) return new Response(JSON.stringify(thyao))
      if (s.includes('GC%3DF') || s.includes('GC=F'))
        return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 4516.9, currency: 'USD' } }] } }))
      return new Response('x', { status: 404 })
    }))
    const res = await worker.fetch(new Request('https://w/prices?symbols=THYAO.IS,GC=F'), env, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test')
    const b = await res.json() as any
    expect(b.usdtry).toBeNull()
    expect(b.prices['THYAO.IS'].priceUsd).toBeNull()
    expect(b.prices['GC=F'].priceUsd).toBe(4516.9)
  })

  it('returns priceUsd per symbol and folds in usdtry + usdPerGram', async () => {
    const res = await worker.fetch(new Request('https://w/prices?symbols=THYAO.IS,GC=F'), env, ctx)
    expect(res.status).toBe(200)
    const b = await res.json() as any
    expect(b.usdtry).toBeCloseTo(48.2238, 4)
    expect(b.prices['THYAO.IS'].currency).toBe('TRY')
    const thyaoPrice = (thyao as { chart: { result: { meta: { regularMarketPrice: number } }[] } }).chart.result[0].meta.regularMarketPrice
    expect(b.prices['THYAO.IS'].priceUsd).toBeCloseTo(thyaoPrice / 48.2238, 4)
    expect(b.prices['GC=F'].priceUsd).toBe(4516.9)
    expect(b.prices['GC=F'].usdPerGram).toBeCloseTo(4516.9 / 31.1034768, 3)
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
  })

  it('rejects more than 45 symbols', async () => {
    const many = Array.from({ length: 46 }, (_, i) => `S${i}`).join(',')
    const res = await worker.fetch(new Request('https://w/prices?symbols=' + many), env, ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'en fazla 45 sembol' })
  })

  it('dedupes before the cap check: 46 raw / 3 unique passes', async () => {
    const many = ['THYAO.IS', 'GC=F', 'THYAO.IS', ...Array(43).fill('GC=F')].join(',')
    const res = await worker.fetch(new Request('https://w/prices?symbols=' + many), env, ctx)
    expect(res.status).toBe(200)
  })

  it('a stray throw in the fan-out still returns 500 with the CORS header', async () => {
    const res = await worker.fetch(new Request('https://w/prices?symbols=__BOOM__'), env, ctx)
    expect(res.status).toBe(500)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test')
    expect(await res.json()).toEqual({ error: 'boom' })
  })
})

describe('/prices — TEFAS funds (tefas: prefix)', () => {
  function stubFetch(fundOk = true) {
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
      const s = String(u)
      if (s.includes('tcmb.gov.tr')) return new Response(tcmbXml)
      if (s.includes('THYAO')) return new Response(JSON.stringify(thyao))
      if (s.includes('fonoloji.com/v1/funds/MAC'))
        return fundOk
          ? new Response(JSON.stringify({ fund: { current_price: 12.5 } }))
          : new Response('nope', { status: 401 })
      return new Response('x', { status: 404 })
    }))
  }

  it('prices a fund via fonoloji, keyed by its tefas: symbol, converted at the TCMB rate', async () => {
    stubFetch()
    const withKey = { ...env, FONOLOJI_API_KEY: 'k-123' }
    const res = await worker.fetch(
      new Request('https://w/prices?symbols=THYAO.IS,tefas:MAC'),
      withKey,
      ctx,
    )
    expect(res.status).toBe(200)
    const b = (await res.json()) as any
    expect(b.prices['tefas:MAC'].currency).toBe('TRY')
    expect(b.prices['tefas:MAC'].price).toBe(12.5)
    expect(b.prices['tefas:MAC'].priceUsd).toBeCloseTo(12.5 / 48.2238, 5)
    // Yahoo symbols still resolve alongside
    expect(b.prices['THYAO.IS'].currency).toBe('TRY')
  })

  it('without FONOLOJI_API_KEY the fund is {error} and the rest still 200', async () => {
    stubFetch()
    const res = await worker.fetch(
      new Request('https://w/prices?symbols=THYAO.IS,tefas:MAC'),
      env,
      ctx,
    )
    expect(res.status).toBe(200)
    const b = (await res.json()) as any
    expect(b.prices['tefas:MAC']).toEqual({ error: 'fon anahtarı yok' })
    expect(b.prices['THYAO.IS'].priceUsd).not.toBeNull()
  })

  it('a fonoloji failure degrades to {error} for that fund only', async () => {
    stubFetch(false)
    const withKey = { ...env, FONOLOJI_API_KEY: 'k-123' }
    const res = await worker.fetch(new Request('https://w/prices?symbols=tefas:MAC'), withKey, ctx)
    expect(res.status).toBe(200)
    const b = (await res.json()) as any
    expect(b.prices['tefas:MAC']).toEqual({ error: 'fon 401' })
  })
})

describe('/prices — TradingView BIST (tv: prefix)', () => {
  function stubFetch(scanOk = true) {
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL, init?: RequestInit) => {
      const s = String(u)
      if (s.includes('tcmb.gov.tr')) return new Response(tcmbXml)
      if (s.includes('THYAO')) return new Response(JSON.stringify(thyao))
      if (s.includes('scanner.tradingview.com')) {
        expect(init?.method).toBe('POST')
        return scanOk
          ? new Response(JSON.stringify({ data: [{ s: 'BIST:DMLKT', d: [12.5] }] }))
          : new Response('no', { status: 500 })
      }
      return new Response('x', { status: 404 })
    }))
  }

  it('prices DMLKT via the scanner, keyed by tv:DMLKT, converted at the TCMB rate', async () => {
    stubFetch()
    const res = await worker.fetch(new Request('https://w/prices?symbols=THYAO.IS,tv:DMLKT'), env, ctx)
    expect(res.status).toBe(200)
    const b = (await res.json()) as any
    expect(b.prices['tv:DMLKT'].currency).toBe('TRY')
    expect(b.prices['tv:DMLKT'].price).toBe(12.5)
    expect(b.prices['tv:DMLKT'].priceUsd).toBeCloseTo(12.5 / 48.2238, 5)
    expect(b.prices['THYAO.IS'].currency).toBe('TRY')
  })

  it('a scanner failure degrades to {error} for that symbol only', async () => {
    stubFetch(false)
    const res = await worker.fetch(new Request('https://w/prices?symbols=THYAO.IS,tv:DMLKT'), env, ctx)
    expect(res.status).toBe(200)
    const b = (await res.json()) as any
    expect(b.prices['tv:DMLKT']).toEqual({ error: 'tradingview 500' })
    expect(b.prices['THYAO.IS'].priceUsd).not.toBeNull()
  })
})
