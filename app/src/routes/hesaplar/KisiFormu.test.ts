import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import KisiFormu, { slugifyPerson } from './KisiFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Person } from '../../lib/data/types'
import type { AppState } from '../../lib/data/store'

describe('KisiFormu', () => {
  const makeDataset = () => structuredClone(fixture)

  it('slugifyPerson Türkçe harfleri ve boşlukları dönüştürür', () => {
    expect(slugifyPerson('Ahmet Şahin')).toBe('AHMET-SAHIN')
    expect(slugifyPerson('Özlem Çiçek')).toBe('OZLEM-CICEK')
    expect(slugifyPerson('İpek Gök')).toBe('IPEK-GOK')
  })

  it('yeni kişi ekler ve slug kod üretir', async () => {
    const dataset = makeDataset()
    let saved: any = null
    const save = vi.fn(async (_name: string, data: unknown) => {
      saved = data
    })
    const onSaved = vi.fn()
    const { container, getByText } = render(KisiFormu, {
      dataset,
      source: { id: 'drive', load: async () => dataset, save },
      store: writable<AppState>({ status: 'ready', dataset }),
      onSaved,
    })

    const input = container.querySelector('#per-ad') as HTMLInputElement
    await fireEvent.input(input, { target: { value: 'Ali Veli' } })

    const submitBtn = getByText('Kişiyi Kaydet') as HTMLButtonElement
    await fireEvent.click(submitBtn)

    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledWith('people', expect.anything())
    })

    const added = (saved as Person[]).find((p) => p.kod === 'ALI-VELI')
    expect(added).toMatchObject({
      kod: 'ALI-VELI',
      ad: 'Ali Veli',
      haneUyesi: true,
      aktif: true,
    })
    expect(onSaved).toHaveBeenCalledWith(added)
  })

  it('vazgeç butonuna basınca onCancel çağrılır', async () => {
    const dataset = makeDataset()
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    const { getByText } = render(KisiFormu, {
      dataset,
      onSaved,
      onCancel,
    })

    const cancelBtn = getByText('Vazgeç') as HTMLButtonElement
    await fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalled()
  })
})
