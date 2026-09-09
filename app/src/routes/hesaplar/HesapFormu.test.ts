import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import HesapFormu from './HesapFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState } from '../../lib/data/store'
import type { Dataset } from '../../lib/data/types'

const makeStore = (ds: Dataset) => writable<AppState>({ status: 'ready', dataset: structuredClone(ds) })

const driveSource = (save: any, ds: Dataset) => ({ id: 'drive' as const, load: async () => ds, save })

describe('HesapFormu', () => {
  it('düzenlemede bilinmeyen alanları korur', async () => {
    // The bot's alias list, plus a field this app has never heard of.
    const ds: Dataset = {
      ...fixture,
      personalAccounts: [
        {
          kod: 'NAKIT',
          ad: 'Nakit',
          tur: 'NAKIT',
          paraBirimi: 'TRY',
          sahip: 'ENIS',
          aktif: true,
          takmaAdlar: ['nakit', 'elden'],
          botAyari: 'gelecekte-eklenen-alan',
        } as any,
      ],
    }
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const { container, getByText } = render(HesapFormu, {
      dataset: ds,
      store: makeStore(ds),
      source: driveSource(save, ds),
      editing: ds.personalAccounts![0],
    })
    const ad = container.querySelector('#h-ad') as HTMLInputElement
    ad.value = 'Cüzdan'
    ad.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(save).toHaveBeenCalledWith('personal_accounts', expect.anything())
    expect(yazilan[0]).toMatchObject({
      kod: 'NAKIT',
      ad: 'Cüzdan',
      takmaAdlar: ['nakit', 'elden'],
      botAyari: 'gelecekte-eklenen-alan',
    })
  })

  it('takma adları virgülle düzenletir', async () => {
    const ds: Dataset = {
      ...fixture,
      personalAccounts: [
        {
          kod: 'NAKIT',
          ad: 'Nakit',
          tur: 'NAKIT',
          paraBirimi: 'TRY',
          sahip: 'ENIS',
          aktif: true,
          takmaAdlar: ['nakit'],
        },
      ],
    }
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const { container, getByText } = render(HesapFormu, {
      dataset: ds,
      store: makeStore(ds),
      source: driveSource(save, ds),
      editing: ds.personalAccounts![0],
    })
    const t = container.querySelector('#h-takma') as HTMLInputElement
    expect(t.value).toBe('nakit')
    t.value = 'nakit, elden, peşin'
    t.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(yazilan[0].takmaAdlar).toEqual(['nakit', 'elden', 'peşin'])
  })

  it('yeni hesapta koddan slug üretir', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const { container, getByText } = render(HesapFormu, {
      dataset: fixture,
      store: makeStore(fixture),
      source: driveSource(save, fixture),
    })
    const ad = container.querySelector('#h-ad') as HTMLInputElement
    ad.value = 'Şeker Bankası'
    ad.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(yazilan[yazilan.length - 1].kod).toBe('SEKER-BANKASI')
  })

  it('düzenlemede kod değiştirilemez', () => {
    const { container } = render(HesapFormu, {
      dataset: fixture,
      editing: fixture.personalAccounts![0],
    })
    expect((container.querySelector('#h-kod') as HTMLInputElement).disabled).toBe(true)
  })

  it('adı boş hesabı kaydetmez', async () => {
    const save = vi.fn()
    const { getByText, container } = render(HesapFormu, {
      dataset: fixture,
      store: makeStore(fixture),
      source: driveSource(save, fixture),
    })
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/ad girilmeli/i)
  })

  it('hareketi olan hesabı silmez, pasifleştirmeyi önerir', async () => {
    const save = vi.fn()
    const { getByText, container } = render(HesapFormu, {
      dataset: fixture,
      store: makeStore(fixture),
      source: driveSource(save, fixture),
      editing: fixture.personalAccounts!.find((a) => a.kod === 'NAKIT'),
    })
    ;(getByText(/sil/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(container.textContent).toMatch(/pasifleştir/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('hareketi olmayan hesabı siler', async () => {
    const ds: Dataset = {
      ...fixture,
      personalAccounts: [
        ...fixture.personalAccounts!,
        {
          kod: 'BOS',
          ad: 'Boş Hesap',
          tur: 'BANKA',
          paraBirimi: 'TRY',
          sahip: 'ENIS',
          aktif: true,
        },
      ],
    }
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const { getByText } = render(HesapFormu, {
      dataset: ds,
      store: makeStore(ds),
      source: driveSource(save, ds),
      editing: ds.personalAccounts!.find((a) => a.kod === 'BOS'),
    })
    ;(getByText(/sil/i) as HTMLButtonElement).click()
    await Promise.resolve()
    ;(getByText(/evet, sil/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(yazilan.some((a: any) => a.kod === 'BOS')).toBe(false)
  })
})
