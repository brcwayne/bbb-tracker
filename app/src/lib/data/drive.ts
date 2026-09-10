import type { Dataset } from './types'
import { type DataSource, NAMES, PERSONAL_NAMES, PERSONAL_KEY_MAP } from './source'

/** Thrown when the user still needs to authorise or pick a Drive folder. */
export class NeedsAuthError extends Error {}

/** Thrown by `save()` when the remote file changed since it was last read (optimistic-concurrency check). */
export class ConflictError extends Error {
  constructor(public readonly fileName: string) {
    super(`Drive: ${fileName}.json başka bir yerden değişmiş, tekrar denenmeli`)
  }
}

// Provided by the GIS + Picker scripts in index.html; stubbed in tests.
declare const google: any
declare const gapi: any

const FOLDER_KEY = 'bbb-drive-folder'
const TOKEN_KEY = 'bbb-drive-token'
// Not `drive.file` (own-files-only): the 8 dataset files are placed in Drive
// by the migration toolchain / a manual upload — a different origin than this
// app — so `drive.file` can't list or read them. P2 adds `save()`, which
// writes those same files, so the scope is full read-write whole-Drive access.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

// Google access tokens live ~1h; renew a minute early to dodge clock skew.
const TOKEN_SKEW_MS = 60_000
const DEFAULT_TOKEN_TTL_S = 3600

function readStoredFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY)
  } catch {
    return null
  }
}

/**
 * The token lives in `localStorage` (not `sessionStorage`) so it survives the
 * PWA being closed — otherwise every cold launch falls back to the silent
 * `prompt: 'none'` grant, which iOS/Safari block, and the connect button shows
 * every time. Stored with an expiry; a stale entry is dropped on read.
 */
function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const { t, exp } = JSON.parse(raw) as { t?: string; exp?: number }
    if (typeof t === 'string' && typeof exp === 'number' && exp > Date.now()) return t
    localStorage.removeItem(TOKEN_KEY)
    return null
  } catch {
    return null
  }
}
function writeStoredToken(t: string | null, expiresInS = DEFAULT_TOKEN_TTL_S): void {
  try {
    if (t) {
      const exp = Date.now() + expiresInS * 1000 - TOKEN_SKEW_MS
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ t, exp }))
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Reads the 8 dataset JSON files from a folder in the user's Google Drive.
 * `connect()` runs the GIS OAuth token flow (scope `drive`, read-write),
 * `chooseFolder()` opens the Google Picker, `load()` fetches the files.
 * The access token is kept in `localStorage` with its expiry and refreshed
 * silently (`prompt: 'none'`) once it lapses, so a return visit within the
 * hour needs no click at all.
 */
export class DriveSource implements DataSource {
  readonly id = 'drive' as const
  private token: string | null = readStoredToken()
  private tokenClient: any = null
  folderId: string | null = null
  /** Cache of `{id, md5Checksum}` per file basename, populated by `load()` and refreshed by `save()`. */
  private fileIds: Record<string, { id: string; md5Checksum: string }> = {}

  constructor(
    private clientId: string,
    private apiKey?: string,
    private appId?: string,
  ) {}

  /** True once a folder has been picked (this session or a prior one). */
  hasFolder(): boolean {
    return !!(this.folderId ?? readStoredFolder())
  }

  private setToken(t: string | null, expiresInS?: number) {
    this.token = t
    writeStoredToken(t, expiresInS)
  }

  private requestToken(prompt: '' | 'none' | 'consent'): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (!this.tokenClient) {
          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: DRIVE_SCOPE,
            callback: () => {},
          })
        }
        let done = false
        const timer = setTimeout(() => {
          if (!done) {
            done = true
            reject(new NeedsAuthError('yetki zaman aşımı'))
          }
        }, 8000)
        this.tokenClient.callback = (resp: {
          access_token?: string
          expires_in?: number
          error?: string
        }) => {
          if (done) return
          done = true
          clearTimeout(timer)
          if (resp && resp.access_token) {
            this.setToken(resp.access_token, resp.expires_in)
            resolve()
          } else {
            reject(new NeedsAuthError(resp?.error || 'yetki alınamadı'))
          }
        }
        this.tokenClient.requestAccessToken({ prompt })
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  /** Interactive — behind the "Google ile bağlan" button. */
  connect(): Promise<void> {
    return this.requestToken('')
  }

  /** Silent refresh on load; rejects (no UI) when a real sign-in is needed. */
  private trySilent(): Promise<void> {
    return this.requestToken('none')
  }

  chooseFolder(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.token) {
        reject(new NeedsAuthError())
        return
      }
      const build = () => {
        try {
          const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder')
          let builder = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(this.token)
          // Picker needs the developer key (Picker API) and the Cloud project
          // number (App ID); harmless to pass alongside the drive-scope token.
          if (this.apiKey) builder = builder.setDeveloperKey(this.apiKey)
          if (this.appId) builder = builder.setAppId(this.appId)
          const picker = builder
            .setCallback((data: any) => {
              if (data.action === google.picker.Action.PICKED) {
                const id: string = data.docs[0].id
                this.folderId = id
                try {
                  localStorage.setItem(FOLDER_KEY, id)
                } catch {
                  /* ignore storage failures */
                }
                resolve(id)
              } else if (data.action === google.picker.Action.CANCEL) {
                reject(new NeedsAuthError('klasör seçilmedi'))
              }
            })
            .build()
          picker.setVisible(true)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      }
      if (typeof google !== 'undefined' && google.picker) build()
      else gapi.load('picker', build)
    })
  }

  async load(): Promise<Dataset> {
    const folderId = this.folderId ?? readStoredFolder()
    if (!folderId) throw new NeedsAuthError('klasör seçilmedi')
    if (!this.token) {
      // Stored token gone/expired — try a silent grant before nagging the user.
      try {
        await this.trySilent()
      } catch {
        throw new NeedsAuthError()
      }
    }

    const headers = { Authorization: `Bearer ${this.token}` }
    // No mimeType filter — a browser upload can land as text/plain or
    // application/octet-stream. Selection is by filename below.
    const q = `'${folderId}' in parents and trashed = false`
    const listRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,md5Checksum)',
      { headers, cache: 'no-store' },
    )
    if (listRes.status === 401 || listRes.status === 403) {
      this.setToken(null)
      throw new NeedsAuthError('oturum süresi doldu')
    }
    if (!listRes.ok) throw new Error(`Drive: dosya listesi alınamadı (${listRes.status})`)
    const { files } = (await listRes.json()) as { files: { id: string; name: string; md5Checksum?: string }[] }
    for (const f of files) {
      const base = f.name.replace(/\.json$/, '')
      if (f.md5Checksum) this.fileIds[base] = { id: f.id, md5Checksum: f.md5Checksum }
    }

    const parts = await Promise.all(
      NAMES.map(async (n) => {
        const file = files.find((f) => f.name === `${n}.json`)
        if (!file) throw new Error(`Drive: ${n}.json bulunamadı`)
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers,
          cache: 'no-store',
        })
        if (res.status === 401 || res.status === 403) {
          this.setToken(null)
          throw new NeedsAuthError('oturum süresi doldu')
        }
        if (!res.ok) throw new Error(`Drive: ${n}.json okunamadı (${res.status})`)
        return [n, await res.json()] as const
      }),
    )
    const dataset = Object.fromEntries(parts) as unknown as Dataset
    const atFile = files.find((f) => f.name === 'assetTransfers.json')
    if (atFile) {
      // assetTransfers.json is optional (Ruling P2-4): a transient read failure on this one
      // file shouldn't break the whole dataset load, so fall back to [] rather than throwing.
      const atRes = await fetch(`https://www.googleapis.com/drive/v3/files/${atFile.id}?alt=media`, {
        headers,
        cache: 'no-store',
      })
      dataset.assetTransfers = atRes.ok ? await atRes.json() : []
    } else {
      dataset.assetTransfers = []
    }

    await Promise.all(
      PERSONAL_NAMES.map(async (name) => {
        const key = PERSONAL_KEY_MAP[name]
        const file = files.find((f) => f.name === `${name}.json`)
        if (!file) {
          dataset[key] = []
          return
        }
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers,
            cache: 'no-store',
          })
          if (res.status === 401 || res.status === 403) {
            this.setToken(null)
            throw new NeedsAuthError('oturum süresi doldu')
          }
          const data = res.ok ? await res.json() : null
          dataset[key] = Array.isArray(data) ? data : []
        } catch (e) {
          if (e instanceof NeedsAuthError) throw e
          console.warn(`Drive: ${name}.json okunamadı:`, e)
          dataset[key] = []
        }
      }),
    )

    return dataset
  }

  /**
   * Writes `data` to `${name}.json` in the Drive folder. Optimistic concurrency: if the file
   * was already seen by `load()` (or a prior `save()`), the remote `md5Checksum` is re-checked
   * immediately before overwriting — a mismatch means someone else changed the file since it was
   * last read, and `ConflictError` is thrown rather than clobbering it. If the file isn't cached
   * at all, it's looked up by name; if that also comes up empty, it's created via multipart upload.
   */
  async save(name: string, data: unknown): Promise<void> {
    const folderId = this.folderId ?? readStoredFolder()
    if (!folderId || !this.token) throw new NeedsAuthError()
    const headers = { Authorization: `Bearer ${this.token}` }

    let cached = this.fileIds[name]
    if (!cached) {
      const q = `'${folderId}' in parents and trashed = false and name = '${name}.json'`
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,md5Checksum)`,
        { headers },
      )
      if (res.status === 401 || res.status === 403) {
        this.setToken(null)
        throw new NeedsAuthError('oturum süresi doldu')
      }
      if (!res.ok) throw new Error(`Drive: ${name}.json aranamadı (${res.status})`)
      const { files } = (await res.json()) as { files: { id: string; md5Checksum?: string }[] }
      if (files[0]) cached = { id: files[0].id, md5Checksum: files[0].md5Checksum ?? '' }
    }

    if (!cached) {
      const boundary = 'bbb_' + Math.random().toString(36).slice(2)
      const metaPart = JSON.stringify({ name: `${name}.json`, parents: [folderId] })
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum',
        { method: 'POST', headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
      )
      if (res.status === 401 || res.status === 403) {
        this.setToken(null)
        throw new NeedsAuthError('oturum süresi doldu')
      }
      if (!res.ok) throw new Error(`Drive: ${name}.json oluşturulamadı (${res.status})`)
      const created = (await res.json()) as { id: string; md5Checksum: string }
      this.fileIds[name] = { id: created.id, md5Checksum: created.md5Checksum }
      return
    }

    const currentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cached.id}?fields=md5Checksum`, {
      headers,
    })
    if (currentRes.status === 401 || currentRes.status === 403) {
      this.setToken(null)
      throw new NeedsAuthError('oturum süresi doldu')
    }
    if (!currentRes.ok) throw new Error(`Drive: ${name}.json kontrol edilemedi (${currentRes.status})`)
    const current = (await currentRes.json()) as { md5Checksum: string }
    if (current.md5Checksum !== cached.md5Checksum) {
      throw new ConflictError(name)
    }

    const updateRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${cached.id}?uploadType=media&fields=md5Checksum`,
      { method: 'PATCH', headers, body: JSON.stringify(data) },
    )
    if (updateRes.status === 401 || updateRes.status === 403) {
      this.setToken(null)
      throw new NeedsAuthError('oturum süresi doldu')
    }
    if (!updateRes.ok) throw new Error(`Drive: ${name}.json yazılamadı (${updateRes.status})`)
    const updated = (await updateRes.json()) as { md5Checksum: string }
    this.fileIds[name] = { id: cached.id, md5Checksum: updated.md5Checksum }
  }
}
