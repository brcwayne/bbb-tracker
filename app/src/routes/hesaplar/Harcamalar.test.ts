import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Harcamalar from './Harcamalar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'
import { createAppStore, load } from '../../lib/data/store'

const emptyDataset: Dataset = {
  ...fixture,
  personal_tx: [],
  personalTx: [],
}

describe('Harcamalar sayfası', () => {
  it('boş defterde boş durum gösterir', () => {
    const { container } = render(Harcamalar, { dataset: emptyDataset })
    expect(container.textContent).toMatch(/henüz kayıt yok/i)
  })

  it('kayıtları yeniden eskiye sıralar', () => {
    const { container } = render(Harcamalar, { dataset: fixture, today: '2026-09-08' })
    const cells = container.querySelectorAll('[data-col="tarih"]')
    expect(cells.length).toBeGreaterThan(1)
    expect(cells[0].textContent).toContain('2026-12-07')
  })

  it('kategoriye göre süzer', async () => {
    const { getByLabelText, container } = render(Harcamalar, { dataset: fixture, today: '2026-09-08' })
    const select = getByLabelText(/kategori/i) as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'kira' } })
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Kira ödemesi')
  })

  it('açıklamada arar', async () => {
    const { getByPlaceholderText, container } = render(Harcamalar, { dataset: fixture, today: '2026-09-08' })
    const input = getByPlaceholderText(/ara/i)
    await fireEvent.input(input, { target: { value: 'Benzin' } })
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Benzin')
  })

  it('taksit satırını 3/6 olarak gösterir', () => {
    const { container } = render(Harcamalar, { dataset: fixture, today: '2026-09-08' })
    expect(container.textContent).toContain('3/6')
  })

  it('gelecek tarihli satırı işaretler', () => {
    const { container } = render(Harcamalar, { dataset: fixture, today: '2026-09-08' })
    const futureMarkers = container.querySelectorAll('.future-marker')
    expect(futureMarkers.length).toBeGreaterThan(0)
  })

  it('kaydı siler', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let savedData: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        savedData = data
      },
    }
    const { getAllByTitle, getByText } = render(Harcamalar, {
      props: { dataset: fixture, source, store, today: '2026-09-08' },
    })

    const deleteButtons = getAllByTitle('Sil')
    await fireEvent.click(deleteButtons[0])

    const confirmBtn = getByText('Evet, Sil')
    await fireEvent.click(confirmBtn)

    expect(savedData).toBeDefined()
    expect((savedData as any[]).some((r: any) => r.id === 'px_p6')).toBe(false)
  })

  it('Drive bağlı değilken düzenleme kapalı', () => {
    const store = createAppStore()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { container, getAllByTitle, getByText } = render(Harcamalar, {
      props: { dataset: fixture, source, store, today: '2026-09-08' },
    })

    const addBtn = getByText('+ Harcama Ekle') as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)

    const editButtons = getAllByTitle('Düzenle') as HTMLButtonElement[]
    expect(editButtons[0].disabled).toBe(true)
    expect(container.textContent).toMatch(/drive bağlantısı gerekiyor/i)
  })
})

