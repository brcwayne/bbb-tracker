import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import SahipAktarimFormu from './SahipAktarimFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import type { AppState } from '../../lib/data/store'
import type { Dataset } from '../../lib/data/types'

const ds: Dataset = {
  ...fixture,
  people: [
    { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
    { kod: 'ANNE', ad: 'Anne', haneUyesi: false, aktif: true },
  ],
}
const makeStore = () => writable<AppState>({ status: 'ready', dataset: structuredClone(ds) })

function setValue(el: Element | null, value: string, event: 'input' | 'change') {
  const node = el as HTMLInputElement | HTMLSelectElement
  node.value = value
  node.dispatchEvent(new Event(event, { bubbles: true }))
}

describe('SahipAktarimFormu', () => {
  it('aynı kişiyi seçince kaydetmez ve uyarır', async () => {
    const save = vi.fn()
    const { container, getByText } = render(SahipAktarimFormu, {
      dataset: ds,
      store: makeStore(),
      source: { id: 'drive', load: async () => ds, save },
    })
    setValue(container.querySelector('#sa-gonderen'), 'ANNE', 'change')
    setValue(container.querySelector('#sa-alan'), 'ANNE', 'change')
    setValue(container.querySelector('#sa-tutar'), '100', 'input')
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/aynı kişi/i)
  })

  it('tutar sıfırsa kaydetmez', async () => {
    const save = vi.fn()
    const { container, getByText } = render(SahipAktarimFormu, {
      dataset: ds,
      store: makeStore(),
      source: { id: 'drive', load: async () => ds, save },
    })
    setValue(container.querySelector('#sa-gonderen'), 'ANNE', 'change')
    setValue(container.querySelector('#sa-alan'), 'ENIS', 'change')
    setValue(container.querySelector('#sa-tutar'), '0', 'input')
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
  })

  it('geçerli aktarımı SAHIP_AKTARIM satırı olarak yazar', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_name: string, data: unknown) => {
      yazilan = data
    })
    const { container, getByText } = render(SahipAktarimFormu, {
      dataset: ds,
      store: makeStore(),
      source: { id: 'drive', load: async () => ds, save },
    })
    setValue(container.querySelector('#sa-gonderen'), 'ANNE', 'change')
    setValue(container.querySelector('#sa-alan'), 'ENIS', 'change')
    setValue(container.querySelector('#sa-tutar'), '5000', 'input')
    setValue(container.querySelector('#sa-tarih'), '2026-09-08', 'input')
    await Promise.resolve()
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(save).toHaveBeenCalledWith('personal_tx', expect.anything())
    const eklenen = yazilan[yazilan.length - 1]
    expect(eklenen).toMatchObject({
      tur: 'SAHIP_AKTARIM',
      tutar: 5000,
      sahip: 'ANNE',
      karsiSahip: 'ENIS',
      hesap: '',
      kategori: 'sahip-aktarim',
      paraBirimi: 'TRY',
      tarih: '2026-09-08',
      kaynak: 'manual',
    })
    expect(eklenen.id).toMatch(/^px_[0-9a-f]{12}$/)
  })
})
