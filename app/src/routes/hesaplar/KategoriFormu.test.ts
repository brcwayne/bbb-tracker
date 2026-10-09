import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import KategoriFormu from './KategoriFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Category } from '../../lib/data/types'
import type { AppState } from '../../lib/data/store'

describe('KategoriFormu', () => {
  const makeDataset = () => structuredClone(fixture)

  it('yeni kategori ekler ve slug üretir', async () => {
    const dataset = makeDataset()
    let saved: any = null
    const save = vi.fn(async (_name: string, data: unknown) => {
      saved = data
    })
    const onSaved = vi.fn()
    const { container, getByText } = render(KategoriFormu, {
      dataset,
      source: { id: 'drive', load: async () => dataset, save },
      store: writable<AppState>({ status: 'ready', dataset }),
      onSaved,
    })

    const input = container.querySelector('#kf-ad') as HTMLInputElement
    input.value = 'Sağlık & Bakım'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()

    const kodInput = container.querySelector('#kf-kod') as HTMLInputElement
    expect(kodInput.placeholder).toBe('saglik-bakim')

    const submitBtn = getByText('Kategori Ekle') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)
    submitBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(save).toHaveBeenCalledWith('categories', expect.anything())
    const added = (saved as Category[]).find((c) => c.kod === 'saglik-bakim')
    expect(added).toMatchObject({
      kod: 'saglik-bakim',
      ad: 'Sağlık & Bakım',
      tur: 'GIDER',
      aktif: true,
    })
    expect(onSaved).toHaveBeenCalledWith(added)
  })

  it('boş isimle kaydetmez', async () => {
    const dataset = makeDataset()
    const onSaved = vi.fn()
    const { getByText } = render(KategoriFormu, {
      dataset,
      onSaved,
    })

    const submitBtn = getByText('Kategori Ekle') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)
  })

  it('aynı kod varsa benzersiz kod üretir', async () => {
    const dataset = makeDataset()
    let saved: any = null
    const save = vi.fn(async (_name: string, data: unknown) => {
      saved = data
    })
    const onSaved = vi.fn()
    const { container, getByText } = render(KategoriFormu, {
      dataset,
      source: { id: 'drive', load: async () => dataset, save },
      store: writable<AppState>({ status: 'ready', dataset }),
      onSaved,
    })

    const input = container.querySelector('#kf-ad') as HTMLInputElement
    // 'market' zaten var
    await fireEvent.input(input, { target: { value: 'Market' } })

    const kodInput = container.querySelector('#kf-kod') as HTMLInputElement
    expect(kodInput.placeholder).toBe('market-2')

    const submitBtn = getByText('Kategori Ekle') as HTMLButtonElement
    await fireEvent.click(submitBtn)

    const added = (saved as Category[]).find((c) => c.kod === 'market-2')
    expect(added).toBeDefined()
  })
})
