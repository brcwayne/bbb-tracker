import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import TransferFormu from './TransferFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState } from '../../lib/data/store'
import type { PersonalTx } from '../../lib/data/types'

const makeStore = () => writable<AppState>({ status: 'ready', dataset: structuredClone(fixture) })

describe('TransferFormu', () => {
  it('kaynak ve hedefi önden doldurur', () => {
    const { container } = render(TransferFormu, {
      dataset: fixture,
      kaynakHesap: 'GARANTI-BANKA',
      hedefHesap: 'GARANTI-DIJI',
    })
    expect((container.querySelector('#t-kaynak') as HTMLSelectElement).value).toBe('GARANTI-BANKA')
    expect((container.querySelector('#t-hedef') as HTMLSelectElement).value).toBe('GARANTI-DIJI')
  })

  it('verilen başlığı gösterir', () => {
    const { container } = render(TransferFormu, { dataset: fixture, baslik: 'Kart Ödemesi' })
    expect(container.textContent).toContain('Kart Ödemesi')
  })

  it('aynı hesabı seçince kaydetmez ve uyarır', async () => {
    const store = makeStore()
    const save = vi.fn()
    const { container, getByText } = render(TransferFormu, {
      dataset: fixture,
      store,
      source: { id: 'drive', load: async () => fixture, save },
      kaynakHesap: 'NAKIT',
      hedefHesap: 'NAKIT',
    })
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/aynı hesap/i)
  })

  it('tutar sıfır veya negatifse kaydetmez', async () => {
    const save = vi.fn()
    const { container, getByText } = render(TransferFormu, {
      dataset: fixture,
      store: makeStore(),
      source: { id: 'drive', load: async () => fixture, save },
      kaynakHesap: 'NAKIT',
      hedefHesap: 'GARANTI-BANKA',
    })
    const tutar = container.querySelector('#t-tutar') as HTMLInputElement
    tutar.value = '0'
    tutar.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
  })

  it('iki hesap farklı para birimindeyse kaydetmez', async () => {
    const dsWithUsd = {
      ...fixture,
      personalAccounts: [
        ...(fixture.personalAccounts ?? []),
        { kod: 'USD-HESAP', ad: 'Dolar Hesabı', tur: 'BANKA' as const, paraBirimi: 'USD' as const, sahip: 'ENIS', aktif: true },
      ],
    }
    const save = vi.fn()
    const { container, getByText } = render(TransferFormu, {
      dataset: dsWithUsd,
      store: writable<AppState>({ status: 'ready', dataset: dsWithUsd }),
      source: { id: 'drive', load: async () => dsWithUsd, save },
      kaynakHesap: 'NAKIT',
      hedefHesap: 'USD-HESAP',
    })
    const tutar = container.querySelector('#t-tutar') as HTMLInputElement
    tutar.value = '100'
    tutar.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/para birimi farklı/i)
  })

  it('geçerli transferi TRANSFER satırı olarak yazar', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_name: string, data: unknown) => {
      yazilan = data
    })
    const { container, getByText } = render(TransferFormu, {
      dataset: fixture,
      store: makeStore(),
      source: { id: 'drive', load: async () => fixture, save },
      kaynakHesap: 'NAKIT',
      hedefHesap: 'GARANTI-BANKA',
      tarih: '2026-09-08',
    })
    const tutar = container.querySelector('#t-tutar') as HTMLInputElement
    tutar.value = '1500'
    tutar.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(save).toHaveBeenCalledWith('personal_tx', expect.anything())
    const eklenen = yazilan[yazilan.length - 1]
    expect(eklenen).toMatchObject({
      tur: 'TRANSFER',
      tutar: 1500,
      hesap: 'NAKIT',
      karsiHesap: 'GARANTI-BANKA',
      kategori: 'transfer',
      tarih: '2026-09-08',
      kaynak: 'manual',
    })
    expect(eklenen.id).toMatch(/^px_[0-9a-f]{12}$/)
  })

  it('mevcut transferi günceller', async () => {
    const existingTx: PersonalTx = {
      id: 'px_trans1',
      tarih: '2026-09-05',
      tur: 'TRANSFER',
      tutar: 500,
      paraBirimi: 'TRY',
      kategori: 'transfer',
      aciklama: 'Eski Açıklama',
      hesap: 'NAKIT',
      karsiHesap: 'GARANTI-BANKA',
      sahip: 'ENIS',
      taksitPlaniId: null,
      taksitNo: null,
      taksitToplam: null,
      not: '',
      kaynak: 'manual',
      olusturulma: '2026-09-05T10:00:00Z',
    }
    const ds = {
      ...fixture,
      personalTx: [...(fixture.personalTx ?? []), existingTx],
    }
    let yazilan: any = null
    const save = vi.fn(async (_name: string, data: unknown) => {
      yazilan = data
    })
    const onSaved = vi.fn()
    const { container, getByText } = render(TransferFormu, {
      dataset: ds,
      store: writable<AppState>({ status: 'ready', dataset: ds }),
      source: { id: 'drive', load: async () => ds, save },
      editing: existingTx,
      onSaved,
    })

    const tutar = container.querySelector('#t-tutar') as HTMLInputElement
    expect(tutar.value).toBe('500')
    tutar.value = '750'
    tutar.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))

    expect(save).toHaveBeenCalledWith('personal_tx', expect.anything())
    const guncellenen = (yazilan as PersonalTx[]).find((r) => r.id === 'px_trans1')
    expect(guncellenen?.tutar).toBe(750)
    expect(onSaved).toHaveBeenCalled()
  })

  it('iptal butonuna basınca onCancel çağrılır', async () => {
    const onCancel = vi.fn()
    const { getByText } = render(TransferFormu, {
      dataset: fixture,
      onCancel,
    })
    ;(getByText(/vazgeç/i) as HTMLButtonElement).click()
    expect(onCancel).toHaveBeenCalled()
  })
})
