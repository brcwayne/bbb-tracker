import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DriveSource, NeedsAuthError } from './drive'

/**
 * Elle giriş, insanın hesap seçip şifre yazıp izin vermesini bekler; bu
 * 8 saniyede bitmez. Saha: Enis yeni Google hesabıyla girmeye çalıştı ve
 * "yetki zaman aşımı" aldı. Sessiz yenilemede (prompt:'none') arayüz
 * açılmadığı için kısa süre doğrudur — asılı kalmamalı.
 */
function stubGoogle(cevapGecikmesiMs: number, onPrompt?: (p: string) => void) {
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient: () => {
          const client: any = { callback: () => {} }
          client.requestAccessToken = (opts: { prompt: string }) => {
            onPrompt?.(opts?.prompt ?? '')
            setTimeout(() => client.callback({ access_token: 'tok', expires_in: 3600 }), cevapGecikmesiMs)
          }
          return client
        },
      },
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('yetkilendirme süresi', () => {
  it('elle giriş 8 saniyeden uzun sürse de başarılı olur', async () => {
    stubGoogle(45_000) // kullanıcı 45 saniyede hesabını seçip onayladı
    const d = new DriveSource('cid')
    const p = d.connect()
    await vi.advanceTimersByTimeAsync(46_000)
    await expect(p).resolves.toBeUndefined()
  })

  it('elle giriş yine de sonsuza kadar asılı kalmaz', async () => {
    stubGoogle(10 * 60_000) // hiç cevap gelmiyor gibi
    const d = new DriveSource('cid')
    const p = d.connect()
    const yakalanan = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    const e = await yakalanan
    expect(e).toBeInstanceOf(NeedsAuthError)
  })

  it('elle girişte zaman aşımı mesajı ne yapılacağını söyler', async () => {
    stubGoogle(10 * 60_000)
    const d = new DriveSource('cid')
    const yakalanan = d.connect().catch((e) => e)
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    const e = await yakalanan
    expect(String(e.message)).toMatch(/açılır pencere|pencere|engel/i)
  })

  it('sessiz yenileme kısa sürede vazgeçer, kullanıcıyı bekletmez', async () => {
    let istenen = ''
    stubGoogle(10 * 60_000, (p) => (istenen = p))
    localStorage.setItem('bbb-drive-folder', 'f1')
    const d = new DriveSource('cid')
    const yakalanan = d.load().catch((e) => e)
    await vi.advanceTimersByTimeAsync(15_000)
    const e = await yakalanan
    expect(istenen).toBe('none')
    expect(e).toBeInstanceOf(NeedsAuthError)
  })
})
