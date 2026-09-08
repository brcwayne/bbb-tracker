import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Ozet from './Ozet.svelte'
import Harcamalar from './Harcamalar.svelte'
import Taksitler from './Taksitler.svelte'
import Borclar from './Borclar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'

const emptyDataset: Dataset = {
  ...fixture,
  personal_tx: [],
  personalTx: [],
  payment_plans: [],
  paymentPlans: [],
  debts: [],
}

describe('Kişisel Defter — boş durumlar', () => {
  it('her sayfanın boş durumu ne yapılacağını söyler', () => {
    for (const Page of [Ozet, Harcamalar, Taksitler, Borclar]) {
      const { container } = render(Page, { dataset: emptyDataset })
      expect(container.textContent).toMatch(/Telegram/i)
    }
  })

  it('boş grafik eksenleriyle çizilir, yüksekliği çökmez', () => {
    const { container } = render(Ozet, { dataset: emptyDataset })
    const svg = container.querySelector('[data-chart="aylik-seyir"] svg')!
    expect(svg).not.toBeNull()
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0)
  })
})
