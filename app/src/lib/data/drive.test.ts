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

  it('reuses a fresh token from localStorage without calling requestAccessToken', async () => {
    let calls = 0
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: () => ({ callback: () => {}, requestAccessToken: () => { calls++ } }),
        },
      },
    })
    localStorage.setItem('bbb-drive-token', JSON.stringify({ t: 'stored-tok', exp: Date.now() + 600_000 }))
    localStorage.setItem('bbb-drive-folder', 'FOLDER')
    const ds = await new DriveSource('CID').load()
    expect(calls).toBe(0)
    expect(ds.transactions).toHaveLength(7)
  })

  it('drops an expired stored token and falls back to the silent grant', async () => {
    localStorage.setItem('bbb-drive-token', JSON.stringify({ t: 'old-tok', exp: Date.now() - 1000 }))
    localStorage.setItem('bbb-drive-folder', 'FOLDER')
    const s = new DriveSource('CID')
    expect((s as any).token).toBeNull()
    // beforeEach's google stub resolves the silent grant, so load() still succeeds
    const ds = await s.load()
    expect(ds.transactions).toHaveLength(7)
  })

  it('persists the token with an expiry after connect', async () => {
    const s = new DriveSource('CID')
    await s.connect()
    const raw = JSON.parse(localStorage.getItem('bbb-drive-token')!)
    expect(raw.t).toBe('tok')
    expect(raw.exp).toBeGreaterThan(Date.now())
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

  it('falls back to [] (instead of throwing) when the assetTransfers.json read comes back non-ok', async () => {
    // assetTransfers.json is optional (Ruling P2-4): a transient read failure on this one file
    // shouldn't break the whole dataset load, unlike every other file (which does throw on !ok).
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('files?')) {
        const names = [...Object.keys(FILE_MAP), 'assetTransfers']
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: names.map((n) => ({ id: n, name: `${n}.json` })) }) })
      }
      const id = url.match(/files\/(\w+)/)![1]
      if (id === 'assetTransfers') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'server error' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FILE_MAP[id]) })
    }))
    const s = new DriveSource('CID')
    await s.connect()
    ;(s as any).folderId = 'FOLDER'
    const ds = await s.load()
    expect(ds.assetTransfers).toEqual([])
  })

  it('bir kişisel dosya eksikse boş dizi döner, hata atmaz', async () => {
    const ds = await (await makeDriveSourceWithFiles(INVESTMENT_FILES_ONLY)).load()
    expect(ds.personalTx).toEqual([])
    expect(ds.debts).toEqual([])
  })

  it('bozuk bir kişisel dosya sadece kendi alanını boşaltır', async () => {
    const ds = await (await makeDriveSourceWithFiles({ ...ALL_FILES, 'personal_tx.json': '{bozuk' })).load()
    expect(ds.personalTx).toEqual([])
    expect(ds.categories!.length).toBeGreaterThan(0)
  })

  it('eksik bir YATIRIM dosyası hâlâ hata atar', async () => {
    const s = await makeDriveSourceWithFiles(without(ALL_FILES, 'transactions.json'))
    await expect(s.load()).rejects.toThrow(/bulunamadı/)
  })
})

const INVESTMENT_FILES_ONLY: Record<string, unknown> = {
  'transactions.json': fixture.transactions,
  'cashflows.json': fixture.cashflows,
  'snapshots.json': fixture.snapshots,
  'instruments.json': fixture.instruments,
  'brokers.json': fixture.brokers,
  'portfolios.json': fixture.portfolios,
  'meta.json': fixture.meta,
  'fxrates.json': fixture.fxrates,
}

const ALL_FILES: Record<string, unknown> = {
  ...INVESTMENT_FILES_ONLY,
  'personal_tx.json': [{ id: 'px_1', tutar: 100 }],
  'payment_plans.json': [],
  'personal_accounts.json': [],
  'categories.json': [{ kod: 'market', ad: 'Market', tur: 'GIDER', aktif: true }],
  'people.json': [],
  'debts.json': [],
}

function without(obj: Record<string, unknown>, key: string) {
  const copy = { ...obj }
  delete copy[key]
  return copy
}

async function makeDriveSourceWithFiles(fileContentMap: Record<string, any>): Promise<DriveSource> {
  const s = new DriveSource('CID')
  await s.connect()
  ;(s as any).folderId = 'FOLDER'
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('files?')) {
      const fileList = Object.keys(fileContentMap).map((fileName) => ({
        id: fileName.replace('.json', ''),
        name: fileName.endsWith('.json') ? fileName : `${fileName}.json`,
      }))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ files: fileList }),
      })
    }
    const match = url.match(/files\/([^?]+)/)
    const id = match ? match[1] : ''
    const content = fileContentMap[id] ?? fileContentMap[`${id}.json`]
    if (content === undefined) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('not found')) })
    }
    if (typeof content === 'string' && content.startsWith('{bozuk')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token in JSON')),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(content) })
  }))
  return s
}

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

  it('rejects (does not silently resolve) when the checksum-recheck GET fails, and leaves fileIds untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        const method = options?.method
        if (url.includes('fields=files(id,name,md5Checksum)')) {
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
          throw new Error('PATCH should not be reached when the checksum recheck fails')
        }
        if (url.includes('fields=md5Checksum')) {
          // pre-write checksum recheck fails with a real HTTP error status
          return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: 'forbidden' }) })
        }
        throw new Error('unexpected fetch in save() test: ' + url)
      }),
    )
    const src = new DriveSource('CID')
    await src.connect()
    ;(src as any).folderId = 'FOLDER'
    await src.load()
    await expect(src.save('meta', { foo: 1 })).rejects.toThrow()
    expect((src as any).fileIds.meta).toEqual({ id: 'meta', md5Checksum: 'meta-sum' })
  })

  it('rejects when the media-upload PATCH fails, without caching an undefined checksum', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: { method?: string }) => {
        const method = options?.method
        if (url.includes('fields=files(id,name,md5Checksum)')) {
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
          // media-upload overwrite fails with a real HTTP error status
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'server error' }) })
        }
        if (url.includes('fields=md5Checksum')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ md5Checksum: 'meta-sum' }) })
        }
        throw new Error('unexpected fetch in save() test: ' + url)
      }),
    )
    const src = new DriveSource('CID')
    await src.connect()
    ;(src as any).folderId = 'FOLDER'
    await src.load()
    await expect(src.save('meta', { foo: 1 })).rejects.toThrow()
    expect((src as any).fileIds.meta).toEqual({ id: 'meta', md5Checksum: 'meta-sum' })
  })
})
