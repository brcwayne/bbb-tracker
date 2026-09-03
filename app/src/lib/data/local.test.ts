import { describe, it, expect, vi, afterEach } from 'vitest'
import { LocalFileSource } from './local'
import { fixture } from '../../fixtures/dataset'

function mockFetchOk() {
  return vi.fn((url: string) => {
    const map = {
      transactions: fixture.transactions, cashflows: fixture.cashflows, snapshots: fixture.snapshots,
      instruments: fixture.instruments, brokers: fixture.brokers, portfolios: fixture.portfolios,
      meta: fixture.meta, fxrates: fixture.fxrates,
    }
    const name = url.split('/').pop()!.replace('.json', '') as keyof typeof map
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[name]) })
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('LocalFileSource', () => {
  it('loads and assembles a Dataset from 8 files', async () => {
    vi.stubGlobal('fetch', mockFetchOk())
    const ds = await new LocalFileSource('./data').load()
    expect(ds.transactions).toHaveLength(6)
    expect(ds.meta.olusturulma).toBe('2026-09-03T16:24:37')
    expect(Object.keys(ds.fxrates)).toContain('2020-01-06')
    expect(fetch).toHaveBeenCalledTimes(8)
  })

  it('throws a clear error on a missing file', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    await expect(new LocalFileSource().load()).rejects.toThrow(/okunamadı \(404\)/)
  })
})
