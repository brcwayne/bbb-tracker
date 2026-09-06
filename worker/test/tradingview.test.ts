import { describe, it, expect, vi } from 'vitest'
import { parseScan, fetchTvQuotes, TV_SCAN_URL } from '../src/tradingview'

const scanBody = (rows: Array<{ s: string; d: [number] }>) =>
  new Response(JSON.stringify({ totalCount: rows.length, data: rows }))

describe('parseScan', () => {
  it('maps BIST:<code> rows to bare-code TRY quotes', () => {
    const out = parseScan({ data: [{ s: 'BIST:DMLKT', d: [12.34] }] })
    expect(out).toEqual({ DMLKT: { price: 12.34, currency: 'TRY' } })
  })

  it('skips rows with a non-positive or missing close', () => {
    const out = parseScan({ data: [{ s: 'BIST:DMLKT', d: [0] }, { s: 'BIST:AAA', d: [] }] })
    expect(out).toEqual({})
  })

  it('tolerates a shapeless body', () => {
    expect(parseScan(null)).toEqual({})
    expect(parseScan({})).toEqual({})
  })
})

describe('fetchTvQuotes', () => {
  it('POSTs the tickers to the scanner and resolves each code', async () => {
    let sentBody: any
    const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(TV_SCAN_URL)
      expect(init?.method).toBe('POST')
      sentBody = JSON.parse(String(init?.body))
      return scanBody([
        { s: 'BIST:DMLKT', d: [12.34] },
        { s: 'BIST:DMLKTG', d: [56.78] },
      ])
    }) as unknown as typeof fetch

    const out = await fetchTvQuotes(['DMLKT', 'DMLKTG'], f)
    expect(sentBody).toEqual({
      symbols: { tickers: ['BIST:DMLKT', 'BIST:DMLKTG'] },
      columns: ['close'],
    })
    expect(out.DMLKT).toEqual({ price: 12.34, currency: 'TRY' })
    expect(out.DMLKTG).toEqual({ price: 56.78, currency: 'TRY' })
  })

  it('reports {error} for a code the scanner omits', async () => {
    const f = vi.fn(async () => scanBody([{ s: 'BIST:DMLKT', d: [12.34] }])) as unknown as typeof fetch
    const out = await fetchTvQuotes(['DMLKT', 'MISSING'], f)
    expect(out.DMLKT).toEqual({ price: 12.34, currency: 'TRY' })
    expect(out.MISSING).toEqual({ error: 'tradingview yanıtı' })
  })

  it('dedupes codes', async () => {
    const f = vi.fn(async () => scanBody([{ s: 'BIST:DMLKT', d: [1] }])) as unknown as typeof fetch
    await fetchTvQuotes(['DMLKT', 'DMLKT'], f)
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1)
  })

  it('every code is {error} on a non-OK response', async () => {
    const f = vi.fn(async () => new Response('no', { status: 500 })) as unknown as typeof fetch
    const out = await fetchTvQuotes(['DMLKT'], f)
    expect(out.DMLKT).toEqual({ error: 'tradingview 500' })
  })

  it('every code is {error} on a network throw', async () => {
    const f = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    const out = await fetchTvQuotes(['DMLKT'], f)
    expect(out.DMLKT).toEqual({ error: 'tradingview kaynağı' })
  })

  it('no codes → no request', async () => {
    const f = vi.fn() as unknown as typeof fetch
    const out = await fetchTvQuotes([], f)
    expect(out).toEqual({})
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
  })
})
