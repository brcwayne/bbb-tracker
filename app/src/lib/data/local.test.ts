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
    const name = url.split('/').pop()!.replace('.json', '')
    if (name === 'assetTransfers') return Promise.resolve({ ok: false, status: 404 })
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[name as keyof typeof map]) })
  })
}

const SAMPLE_ASSET_TRANSFERS = [
  { id: 'at_a', tarih: '2022-05-01', enstruman: 'ASTOR', lot: 10, kaynakHesap: 'MIDAS', hedefHesap: 'GARAN', kaynakPortfoy: 'ALFA', hedefPortfoy: 'ALFA', aciklama: 'test', kaynak: 'manual' },
]

function mockFetchOkWithAssetTransfers() {
  return vi.fn((url: string) => {
    const map = {
      transactions: fixture.transactions, cashflows: fixture.cashflows, snapshots: fixture.snapshots,
      instruments: fixture.instruments, brokers: fixture.brokers, portfolios: fixture.portfolios,
      meta: fixture.meta, fxrates: fixture.fxrates,
    }
    const name = url.split('/').pop()!.replace('.json', '')
    if (name === 'assetTransfers') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SAMPLE_ASSET_TRANSFERS) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[name as keyof typeof map]) })
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('LocalFileSource', () => {
  it('loads and assembles a Dataset from 8 files', async () => {
    vi.stubGlobal('fetch', mockFetchOk())
    const ds = await new LocalFileSource('./data').load()
    expect(ds.transactions).toHaveLength(7)
    expect(ds.meta.olusturulma).toBe('2026-09-03T16:24:37')
    expect(Object.keys(ds.fxrates)).toContain('2020-01-06')
    expect(fetch).toHaveBeenCalledTimes(9)
  })

  it('throws a clear error on a missing file', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    await expect(new LocalFileSource().load()).rejects.toThrow(/okunamadı \(404\)/)
  })

  it('defaults assetTransfers to [] when assetTransfers.json is missing (404)', async () => {
    vi.stubGlobal('fetch', mockFetchOk())
    const ds = await new LocalFileSource('./data').load()
    expect(ds.assetTransfers).toEqual([])
  })

  it('returns real assetTransfers content when assetTransfers.json is present', async () => {
    vi.stubGlobal('fetch', mockFetchOkWithAssetTransfers())
    const ds = await new LocalFileSource('./data').load()
    expect(ds.assetTransfers).toEqual(SAMPLE_ASSET_TRANSFERS)
  })
})
