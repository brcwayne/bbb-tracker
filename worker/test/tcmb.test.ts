import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseUsdBuying, parseTcmbRates, fetchUsdTry, fetchTcmbRates } from '../src/tcmb'

const xml = readFileSync(new URL('./fixtures/tcmb-today.xml', import.meta.url), 'utf8')

describe('parseUsdBuying', () => {
  it('extracts the USD ForexBuying value', () => {
    expect(parseUsdBuying(xml)).toBeCloseTo(48.2238, 4)
  })
  it('returns null when USD is missing or zero', () => {
    expect(parseUsdBuying('<Tarih_Date></Tarih_Date>')).toBeNull()
    expect(parseUsdBuying('<Currency Kod="USD"><ForexBuying>0</ForexBuying></Currency>')).toBeNull()
  })
  it('extracts EUR, GBP, CHF, and unit-normalized JPY via parseTcmbRates', () => {
    const rates = parseTcmbRates(xml)
    expect(rates).not.toBeNull()
    expect(rates!.USD).toBeCloseTo(48.2238, 4)
    expect(rates!.EUR).toBeCloseTo(55.9713, 4)
    expect(rates!.GBP).toBeCloseTo(64.9761, 4)
    expect(rates!.CHF).toBeCloseTo(59.4529, 4)
    expect(rates!.JPY).toBeCloseTo(30.7136 / 100, 6)
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
