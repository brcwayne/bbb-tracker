import { describe, it, expect, vi } from 'vitest'
import thyao from './fixtures/yahoo-thyao.json'
import spcx from './fixtures/yahoo-spcx.json'
import { parseChart, fetchQuotes } from '../src/yahoo'

describe('parseChart', () => {
  it('reads price + currency from a chart response', () => {
    expect(parseChart(thyao)).toEqual({
      price: (thyao as any).chart.result[0].meta.regularMarketPrice,
      currency: 'TRY',
    })
    expect(parseChart(spcx)?.currency).toBe('USD')
  })
  it('returns null for a malformed body', () => {
    expect(parseChart({ chart: { result: null } })).toBeNull()
    expect(parseChart({})).toBeNull()
  })
})

describe('fetchQuotes', () => {
  it('resolves each symbol, falling back to query2 on a bad query1', async () => {
    const f = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('query1') && u.includes('THYAO')) return new Response('nope', { status: 503 })
      if (u.includes('THYAO')) return new Response(JSON.stringify(thyao))
      if (u.includes('SPCX')) return new Response(JSON.stringify(spcx))
      return new Response('x', { status: 404 })
    }) as unknown as typeof fetch

    const out = await fetchQuotes(['THYAO.IS', 'SPCX'], f)
    expect(out['THYAO.IS']).toEqual({ price: (thyao as any).chart.result[0].meta.regularMarketPrice, currency: 'TRY' })
    expect(out['SPCX']).toEqual({ price: (spcx as any).chart.result[0].meta.regularMarketPrice, currency: 'USD' })
  })

  it('reports {error} for a symbol that fails on both hosts', async () => {
    const f = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch
    const out = await fetchQuotes(['BAD.IS'], f)
    expect(out['BAD.IS']).toEqual({ error: 'kaynak' })
  })
})
