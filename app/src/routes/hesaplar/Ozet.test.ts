import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Ozet from './Ozet.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'

const emptyDataset: Dataset = {
  ...fixture,
  personalTx: [],
  paymentPlans: [],
  debts: [],
}

const tryOnlyDataset: Dataset = {
  ...fixture,
  personalTx: fixture.personalTx!.filter((tx) => tx.paraBirimi === 'TRY'),
}

describe('Ozet sayfası', () => {
  it('boş defterde çökmeden boş durum gösterir', () => {
    const { container } = render(Ozet, { dataset: emptyDataset })
    expect(container.textContent).toMatch(/henüz kayıt yok/i)
  })

  it('bu ayın toplamını ve kayıt sayısını gösterir', () => {
    const { container } = render(Ozet, { dataset: fixture })
    expect(container.textContent).toContain('Bu ay')
  })

  it('sadece TRY varsa tek grafik çizer', () => {
    const { container } = render(Ozet, { dataset: tryOnlyDataset })
    expect(container.querySelectorAll('[data-chart="aylik-seyir"]')).toHaveLength(1)
  })

  it('USD kaydı varsa ikinci grafiği ekler', () => {
    const { container } = render(Ozet, { dataset: fixture })
    expect(container.querySelectorAll('[data-chart="aylik-seyir"]')).toHaveLength(2)
  })
})
