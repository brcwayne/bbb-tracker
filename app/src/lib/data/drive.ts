import type { Dataset } from './types'
import { type DataSource, NAMES } from './source'

/** Thrown when the user still needs to authorise or pick a Drive folder. */
export class NeedsAuthError extends Error {}

// Provided by the GIS + Picker scripts in index.html; stubbed in tests.
declare const google: any
declare const gapi: any

const FOLDER_KEY = 'bbb-drive-folder'
const TOKEN_KEY = 'bbb-drive-token'
// `drive.readonly` (not `drive.file`): the 8 dataset files are placed in Drive
// by the migration toolchain / a manual upload — a different origin than this
// app — so `drive.file` (own-files-only) can't list or read them. P1 only ever
// reads, so read-only whole-Drive access is the right least privilege here.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function readStoredFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY)
  } catch {
    return null
  }
}
function readSessionToken(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null
  } catch {
    return null
  }
}
function writeSessionToken(t: string | null): void {
  try {
    const ss = globalThis.sessionStorage
    if (!ss) return
    if (t) ss.setItem(TOKEN_KEY, t)
    else ss.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Reads the 8 dataset JSON files from a folder in the user's Google Drive.
 * `connect()` runs the GIS OAuth token flow (scope `drive.readonly`),
 * `chooseFolder()` opens the Google Picker, `load()` fetches the files.
 * The access token is kept in `sessionStorage` and refreshed silently
 * (`prompt: 'none'`) on reload, so a return visit rarely needs a click.
 */
export class DriveSource implements DataSource {
  readonly id = 'drive' as const
  private token: string | null = readSessionToken()
  private tokenClient: any = null
  folderId: string | null = null

  constructor(
    private clientId: string,
    private apiKey?: string,
    private appId?: string,
  ) {}

  /** True once a folder has been picked (this session or a prior one). */
  hasFolder(): boolean {
    return !!(this.folderId ?? readStoredFolder())
  }

  private setToken(t: string | null) {
    this.token = t
    writeSessionToken(t)
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
        this.tokenClient.callback = (resp: { access_token?: string; error?: string }) => {
          if (done) return
          done = true
          clearTimeout(timer)
          if (resp && resp.access_token) {
            this.setToken(resp.access_token)
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
          // number (App ID); harmless to pass alongside the drive.readonly token.
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
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)',
      { headers },
    )
    if (listRes.status === 401 || listRes.status === 403) {
      this.setToken(null)
      throw new NeedsAuthError('oturum süresi doldu')
    }
    if (!listRes.ok) throw new Error(`Drive: dosya listesi alınamadı (${listRes.status})`)
    const { files } = (await listRes.json()) as { files: { id: string; name: string }[] }

    const parts = await Promise.all(
      NAMES.map(async (n) => {
        const file = files.find((f) => f.name === `${n}.json`)
        if (!file) throw new Error(`Drive: ${n}.json bulunamadı`)
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers })
        if (res.status === 401 || res.status === 403) {
          this.setToken(null)
          throw new NeedsAuthError('oturum süresi doldu')
        }
        if (!res.ok) throw new Error(`Drive: ${n}.json okunamadı (${res.status})`)
        return [n, await res.json()] as const
      }),
    )
    return Object.fromEntries(parts) as unknown as Dataset
  }
}
