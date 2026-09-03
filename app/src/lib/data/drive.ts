import type { Dataset } from './types'
import { type DataSource, NAMES } from './source'

/** Thrown when the user still needs to authorise or pick a Drive folder. */
export class NeedsAuthError extends Error {}

// Provided by the GIS + Picker scripts in index.html; stubbed in tests.
declare const google: any
declare const gapi: any

const FOLDER_KEY = 'bbb-drive-folder'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

function readStoredFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY)
  } catch {
    return null
  }
}

/**
 * Reads the 8 dataset JSON files from a folder in the user's Google Drive.
 * `connect()` runs the GIS OAuth token flow (scope `drive.file`); `chooseFolder()`
 * opens the Google Picker to select the `BBB/` folder; `load()` fetches the files.
 */
export class DriveSource implements DataSource {
  readonly id = 'drive' as const
  private token: string | null = null
  folderId: string | null = null

  constructor(private clientId: string) {}

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: DRIVE_SCOPE,
          callback: (resp: { access_token?: string; error?: string }) => {
            if (resp && resp.access_token) {
              this.token = resp.access_token
              resolve()
            } else {
              reject(new NeedsAuthError(resp?.error || 'yetki alınamadı'))
            }
          },
        })
        client.requestAccessToken()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
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
          const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(this.token)
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
    if (!this.token) throw new NeedsAuthError()
    const folderId = this.folderId ?? readStoredFolder()
    if (!folderId) throw new NeedsAuthError('klasör seçilmedi')

    const headers = { Authorization: `Bearer ${this.token}` }
    const q = `'${folderId}' in parents and mimeType='application/json'`
    const listRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)',
      { headers },
    )
    if (!listRes.ok) throw new Error(`Drive: dosya listesi alınamadı (${listRes.status})`)
    const { files } = (await listRes.json()) as { files: { id: string; name: string }[] }

    const parts = await Promise.all(
      NAMES.map(async (n) => {
        const file = files.find((f) => f.name === `${n}.json`)
        if (!file) throw new Error(`Drive: ${n}.json bulunamadı`)
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers })
        if (!res.ok) throw new Error(`Drive: ${n}.json okunamadı (${res.status})`)
        return [n, await res.json()] as const
      }),
    )
    return Object.fromEntries(parts) as unknown as Dataset
  }
}
