import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DriveSource, NeedsAuthError } from './drive'
import { fixture } from '../../fixtures/dataset'

const FILE_MAP: Record<string, unknown> = {
  transactions: fixture.transactions, cashflows: fixture.cashflows, snapshots: fixture.snapshots,
  instruments: fixture.instruments, brokers: fixture.brokers, portfolios: fixture.portfolios,
  meta: fixture.meta, fxrates: fixture.fxrates,
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: () => {
          const client: any = { callback: () => {} }
          client.requestAccessToken = () => client.callback({ access_token: 'tok' })
          return client
        },
      },
    },
  })
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('files?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: Object.keys(FILE_MAP).map((n) => ({ id: n, name: `${n}.json` })) }) })
    }
    const id = url.match(/files\/(\w+)/)![1]
    return Promise.resolve({ ok: true, json: () => Promise.resolve(FILE_MAP[id]) })
  }))
})

describe('DriveSource', () => {
  it('load throws NeedsAuthError before connect', async () => {
    await expect(new DriveSource('CID').load()).rejects.toBeInstanceOf(NeedsAuthError)
  })
  it('after connect + folder, load assembles a Dataset', async () => {
    const s = new DriveSource('CID')
    await s.connect()
    ;(s as any).folderId = 'FOLDER'
    const ds = await s.load()
    expect(ds.transactions).toHaveLength(7)
    expect(ds.meta.olusturulma).toBe('2026-09-03T16:24:37')
  })

  it('defaults assetTransfers to [] when assetTransfers.json is not in the Drive listing', async () => {
    const s = new DriveSource('CID')
    await s.connect()
    ;(s as any).folderId = 'FOLDER'
    const ds = await s.load()
    expect(ds.assetTransfers).toEqual([])
  })

  it('returns real assetTransfers content when assetTransfers.json is in the Drive listing', async () => {
    const SAMPLE_ASSET_TRANSFERS = [
      { id: 'at_a', tarih: '2022-05-01', enstruman: 'ASTOR', lot: 10, kaynakHesap: 'MIDAS', hedefHesap: 'GARAN', kaynakPortfoy: 'ALFA', hedefPortfoy: 'ALFA', aciklama: 'test', kaynak: 'manual' },
    ]
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('files?')) {
        const names = [...Object.keys(FILE_MAP), 'assetTransfers']
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: names.map((n) => ({ id: n, name: `${n}.json` })) }) })
      }
      const id = url.match(/files\/(\w+)/)![1]
      const data = id === 'assetTransfers' ? SAMPLE_ASSET_TRANSFERS : FILE_MAP[id]
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }))
    const s = new DriveSource('CID')
    await s.connect()
    ;(s as any).folderId = 'FOLDER'
    const ds = await s.load()
    expect(ds.assetTransfers).toEqual(SAMPLE_ASSET_TRANSFERS)
  })
})
