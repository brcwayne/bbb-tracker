import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Harcamalar from './Harcamalar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'

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
})
