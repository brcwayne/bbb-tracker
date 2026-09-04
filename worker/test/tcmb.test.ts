import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseUsdBuying, fetchUsdTry } from '../src/tcmb'

const xml = readFileSync(new URL('./fixtures/tcmb-today.xml', import.meta.url), 'utf8')

describe('parseUsdBuying', () => {
  it('extracts the USD ForexBuying value', () => {
    expect(parseUsdBuying(xml)).toBeCloseTo(48.2238, 4)
  })
  it('returns null when USD is missing', () => {
    expect(parseUsdBuying('<Tarih_Date></Tarih_Date>')).toBeNull()
  })
})

describe('fetchUsdTry', () => {
  it('uses today.xml when it succeeds', async () => {
    const f = vi.fn(async (u: string | URL) =>
      String(u).endsWith('today.xml') ? new Response(xml) : new Response('x', { status: 404 }),
    ) as unknown as typeof fetch
    const out = await fetchUsdTry(f, new Date('2026-09-03T10:00:00Z'))
    expect(out).toEqual({ date: '2026-09-03', usdtry: expect.closeTo(48.2238, 4) })
  })

  it('walks back to the previous business day when today 404s', async () => {
    const f = vi.fn(async (u: string | URL) => {
      const s = String(u)
      if (s.endsWith('today.xml')) return new Response('', { status: 404 })
      if (s.includes('/202609/01092026.xml')) return new Response(xml)
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch
    const out = await fetchUsdTry(f, new Date('2026-09-02T10:00:00Z'))
    expect(out.date).toBe('2026-09-01')
    expect(out.usdtry).toBeCloseTo(48.2238, 4)
  })

  it('throws after 7 misses', async () => {
    const f = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    await expect(fetchUsdTry(f, new Date('2026-09-02T10:00:00Z'))).rejects.toThrow('TCMB kuru alınamadı')
  })
})
