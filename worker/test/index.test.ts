import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import thyao from './fixtures/yahoo-thyao.json'

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

  it('rejects more than 60 symbols', async () => {
    const many = Array.from({ length: 61 }, (_, i) => `S${i}`).join(',')
    const res = await worker.fetch(new Request('https://w/prices?symbols=' + many), env, ctx)
    expect(res.status).toBe(400)
  })
})
