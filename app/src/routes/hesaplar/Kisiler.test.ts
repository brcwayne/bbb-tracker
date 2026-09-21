import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import { writable } from 'svelte/store'
import type { AppState } from '../../lib/data/store'
import Kisiler from './Kisiler.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset, PersonalTx } from '../../lib/data/types'

const row = (o: Partial<PersonalTx>): PersonalTx => ({
  id: 'x', tarih: '2026-09-01', tur: 'DUZELTME', tutar: 0, paraBirimi: 'TRY', kategori: 'duzeltme',
  aciklama: '', hesap: 'NAKIT', sahip: 'ENIS', taksitPlaniId: null, taksitNo: null, taksitToplam: null,
  not: '', kaynak: 'manual', olusturulma: '2026-09-01T00:00:00Z', ...o,
})

const ds: Dataset = {
  ...fixture,
  people: [
    { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
    { kod: 'ANNE', ad: 'Anne', haneUyesi: false, aktif: true },
  ],
  personalAccounts: [
    { kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true },
  ],
  personalTx: [
    row({ id: 'a', tutar: 1000, sahip: 'ANNE' }),
    row({ id: 'b', tur: 'SAHIP_AKTARIM', tutar: 400, sahip: 'ANNE', karsiSahip: 'ENIS', hesap: '' }),
  ],
}

describe('Kişiler sayfası', () => {
  it('kişi başına bakiye gösterir', () => {
    const { getAllByTestId } = render(Kisiler, { dataset: ds })
    const cards = getAllByTestId('owner-card').map((c) => c.textContent ?? '')
    expect(cards).toHaveLength(2)
    const anne = cards.find((t) => t.includes('Anne'))!
    const enis = cards.find((t) => t.includes('Enis'))!
    expect(anne).toMatch(/600/)
    expect(enis).toMatch(/400/)
  })

  it('hesaplarla tutuyorsa onay gösterir', () => {
    const { container } = render(Kisiler, { dataset: ds })
    expect(container.textContent).toMatch(/tutuyor/i)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('tutmuyorsa farkı uyarı olarak gösterir', () => {
    const bad = {
      ...ds,
      personalTx: [...ds.personalTx!, row({ id: 'c', tur: 'GIDER', tutar: 50, hesap: 'YOK', sahip: 'ENIS' })],
    }
    const { container } = render(Kisiler, { dataset: bad })
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/fark/i)
  })

  it('Drive yokken düzenleme kapalı, not gösterir', () => {
    const { container, getByRole } = render(Kisiler, { dataset: ds })
    expect(container.textContent).toMatch(/Drive bağlantısı/i)
    expect((getByRole('button', { name: /aktarım ekle/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('kişi yoksa boş durum gösterir', () => {
    const { container } = render(Kisiler, { dataset: { ...ds, people: [] } })
    expect(container.textContent).toMatch(/kişi/i)
    expect(container.querySelector('[data-testid="owner-card"]')).toBeNull()
  })

  it('yeni kişiyi people dosyasına yazar', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_n: string, data: unknown) => {
      yazilan = data
    })
    const { container, getByText } = render(Kisiler, {
      dataset: ds,
      store: writable<AppState>({ status: 'ready', dataset: structuredClone(ds) }),
      source: { id: 'drive', load: async () => ds, save },
    })
    const input = container.querySelector('#yeni-kisi') as HTMLInputElement
    input.value = 'Ayşe Hanım'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText('Ekle') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(save).toHaveBeenCalledWith('people', expect.anything())
    expect(yazilan[yazilan.length - 1]).toEqual({
      kod: 'AYSE-HANIM', ad: 'Ayşe Hanım', haneUyesi: false, aktif: true,
    })
  })

  it('var olan kişiyi tekrar eklemez', async () => {
    const save = vi.fn()
    const { container, getByText } = render(Kisiler, {
      dataset: ds,
      store: writable<AppState>({ status: 'ready', dataset: structuredClone(ds) }),
      source: { id: 'drive', load: async () => ds, save },
    })
    const input = container.querySelector('#yeni-kisi') as HTMLInputElement
    input.value = 'anne'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;(getByText('Ekle') as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/zaten var/i)
  })

  it('kişi kartları #/h/kisiler/<kod> detay linki taşır', () => {
    const { getAllByTestId } = render(Kisiler, { dataset: ds })
    const cards = getAllByTestId('owner-card') as HTMLAnchorElement[]
    expect(cards[0].tagName.toLowerCase()).toBe('a')
    expect(cards.some((c) => c.getAttribute('href')?.includes('#/h/kisiler/ANNE'))).toBe(true)
    expect(cards.some((c) => c.getAttribute('href')?.includes('#/h/kisiler/ENIS'))).toBe(true)
  })
})
