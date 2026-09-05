import { describe, it, expect, vi } from 'vitest'
import { parseFund, fetchFundQuotes } from '../src/fonoloji'

const ok = (price: number) =>
  new Response(JSON.stringify({ fund: { code: 'X', current_price: price, current_date: '2026-09-04' } }))

describe('parseFund', () => {
  it('reads current_price from a fund body', () => {
    expect(parseFund({ fund: { current_price: 2.8161 } })).toEqual({ price: 2.8161 })
  })
  it('returns null when the price is missing or non-positive', () => {
    expect(parseFund({ fund: {} })).toBeNull()
    expect(parseFund({ fund: { current_price: 0 } })).toBeNull()
    expect(parseFund({})).toBeNull()
    expect(parseFund({ fund: { current_price: 'x' } })).toBeNull()
  })
})

describe('fetchFundQuotes', () => {
  it('resolves each code to a TRY quote and sends the key header', async () => {
    const seen: Record<string, string | null> = {}
    const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const code = String(url).split('/').pop()!
      seen[code] = new Headers(init?.headers).get('x-api-key')
      if (code === 'MAC') return ok(1.2345)
      if (code === 'PTS') return ok(0.599)
      return new Response('no', { status: 404 })
    }) as unknown as typeof fetch

    const out = await fetchFundQuotes(['MAC', 'PTS', 'BAD'], 'k-123', f)
    expect(out.MAC).toEqual({ price: 1.2345, currency: 'TRY' })
    expect(out.PTS).toEqual({ price: 0.599, currency: 'TRY' })
    expect(out.BAD).toEqual({ error: 'fon 404' })
    expect(seen.MAC).toBe('k-123')
  })

  it('dedupes codes', async () => {
    const f = vi.fn(async () => ok(3)) as unknown as typeof fetch
    await fetchFundQuotes(['MAC', 'MAC', 'MAC'], 'k', f)
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1)
  })

  it('reports {error} for a network throw', async () => {
    const f = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    const out = await fetchFundQuotes(['MAC'], 'k', f)
    expect(out.MAC).toEqual({ error: 'fon kaynağı' })
  })

  it('without a key every code is {error} and no request is made', async () => {
    const f = vi.fn() as unknown as typeof fetch
    const out = await fetchFundQuotes(['MAC', 'PTS'], '', f)
    expect(out).toEqual({ MAC: { error: 'fon anahtarı yok' }, PTS: { error: 'fon anahtarı yok' } })
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
  })
})
