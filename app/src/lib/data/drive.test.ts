import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DriveSource, NeedsAuthError, ConflictError } from './drive'
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

describe('DriveSource.save', () => {
  // A fetch mock shared by the checksum-match and checksum-mismatch tests: `load()` populates
  // the fileIds cache from a listing that carries an md5Checksum per file, then `save('meta', ...)`
  // re-checks that checksum before PATCHing. `checksumOnRecheck` controls what the recheck sees.
  function stubFetchWithChecksums(checksumOnRecheck: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        const method = options?.method
        if (url.includes('fields=files(id,name,md5Checksum)')) {
          // load() file listing — every file carries a checksum.
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                files: Object.keys(FILE_MAP).map((n) => ({ id: n, name: `${n}.json`, md5Checksum: `${n}-sum` })),
              }),
          })
        }
        if (url.includes('alt=media')) {
          const id = url.match(/files\/(\w+)/)![1]
          return Promise.resolve({ ok: true, json: () => Promise.resolve(FILE_MAP[id]) })
        }
        if (method === 'PATCH') {
          // media-upload overwrite
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ md5Checksum: 'meta-sum-v2' }) })
        }
        if (url.includes('fields=md5Checksum')) {
          // pre-write checksum recheck
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ md5Checksum: checksumOnRecheck }) })
        }
        throw new Error('unexpected fetch in save() test: ' + url)
      }),
    )
  }

  it('overwrites an existing file when checksums match, updates cache', async () => {
    stubFetchWithChecksums('meta-sum')
    const src = new DriveSource('CID')
    await src.connect()
    ;(src as any).folderId = 'FOLDER'
    await src.load()
    await expect(src.save('meta', { foo: 1 })).resolves.toBeUndefined()
    expect((src as any).fileIds.meta).toEqual({ id: 'meta', md5Checksum: 'meta-sum-v2' })
  })

  it('throws ConflictError when the remote checksum changed since last read', async () => {
    stubFetchWithChecksums('meta-sum-CHANGED-ELSEWHERE')
    const src = new DriveSource('CID')
    await src.connect()
    ;(src as any).folderId = 'FOLDER'
    await src.load()
    await expect(src.save('meta', { foo: 1 })).rejects.toBeInstanceOf(ConflictError)
  })

  it('creates the file via multipart upload when it does not exist yet (assetTransfers)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        const method = options?.method
        if (url.includes('fields=files(id,name,md5Checksum)')) {
          // load() listing — assetTransfers.json is absent, same as the default beforeEach mock.
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ files: Object.keys(FILE_MAP).map((n) => ({ id: n, name: `${n}.json` })) }),
          })
        }
        if (url.includes('alt=media')) {
          const id = url.match(/files\/(\w+)/)![1]
          return Promise.resolve({ ok: true, json: () => Promise.resolve(FILE_MAP[id]) })
        }
        if (method === 'POST') {
          // multipart create
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'newAT', md5Checksum: 'at-sum' }) })
        }
        if (url.includes('fields=files(id,md5Checksum)')) {
          // save()'s by-name lookup, since assetTransfers isn't cached from load() — not found.
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) })
        }
        throw new Error('unexpected fetch in save() test: ' + url)
      }),
    )
    const src = new DriveSource('CID')
    await src.connect()
    ;(src as any).folderId = 'FOLDER'
    await src.load()
    await expect(src.save('assetTransfers', [])).resolves.toBeUndefined()
    expect((src as any).fileIds.assetTransfers).toEqual({ id: 'newAT', md5Checksum: 'at-sum' })
  })
})
