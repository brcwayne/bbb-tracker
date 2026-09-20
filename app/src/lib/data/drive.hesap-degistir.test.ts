import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DriveSource, NeedsAuthError } from './drive'

/**
 * İki Google hesabı aynı tarayıcıda: Enis kendi hesabıyla açıkken Zek'in
 * hesabına geçmek istedi ama (1) Google hiç hesap sormadan açık oturumu
 * kullandı, (2) daha önce seçilmiş klasör kalıcı hatırlandığı ve değiştirme
 * yolu olmadığı için hep eski klasör açıldı.
 */
let sonPrompt = ''

function stubGoogle() {
  sonPrompt = ''
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: () => {
          const client: any = { callback: () => {} }
          client.requestAccessToken = (o: { prompt: string }) => {
            sonPrompt = o?.prompt ?? ''
            client.callback({ access_token: 'tok', expires_in: 3600 })
          }
          return client
        },
      },
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  stubGoogle()
})
afterEach(() => vi.unstubAllGlobals())

describe('hesap ve klasör değiştirme', () => {
  it('elle bağlanırken Google hangi hesap olduğunu sorar', async () => {
    await new DriveSource('cid').connect()
    expect(sonPrompt).toBe('select_account')
  })

  it('sessiz yenileme hesap sormaz (kullanıcıyı rahatsız etmez)', async () => {
    localStorage.setItem('bbb-drive-folder', 'f1')
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) })))
    await new DriveSource('cid').load().catch(() => {})
    expect(sonPrompt).toBe('none')
  })

  it('hatırlanan klasör bu hesapta yoksa unutulur ve yeniden bağlanma istenir', async () => {
    localStorage.setItem('bbb-drive-folder', 'baskasinin-klasoru')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    // geçerli bir jeton varmış gibi: sessiz yenileme başarılı dönüyor
    const d = new DriveSource('cid')
    const e = await d.load().catch((x) => x)
    expect(e).toBeInstanceOf(NeedsAuthError)
    expect(localStorage.getItem('bbb-drive-folder')).toBeNull()
  })

  it('klasör unutulabilir, böylece başka klasör seçilebilir', () => {
    localStorage.setItem('bbb-drive-folder', 'f1')
    const d = new DriveSource('cid')
    expect(d.hasFolder()).toBe(true)
    d.forgetFolder()
    expect(d.hasFolder()).toBe(false)
    expect(localStorage.getItem('bbb-drive-folder')).toBeNull()
  })
})
