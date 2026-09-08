import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Taksitler from './Taksitler.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset, PaymentPlan } from '../../lib/data/types'

const emptyDataset: Dataset = {
  ...fixture,
  payment_plans: [],
  paymentPlans: [],
  personal_tx: [],
  personalTx: [],
}

const withFinishedPlanDataset: Dataset = {
  ...fixture,
  paymentPlans: [
    ...(fixture.paymentPlans ?? []),
    {
      id: 'pp_done',
      alisTarihi: '2025-01-01',
      aciklama: 'Biten Telefon Taksiti',
      toplamTutar: 5000,
      paraBirimi: 'TRY',
      taksitSayisi: 5,
      taksitTutari: 1000,
      sonTaksitTutari: 1000,
      kategori: 'elektronik',
      hesap: 'NAKIT',
      sahip: 'ENIS',
      durum: 'BITTI',
      kaynak: 'telegram',
      olusturulma: '2025-01-01T10:00:00Z',
    } as PaymentPlan,
  ],
}

describe('Taksitler sayfası', () => {
  it('plan yoksa boş durum gösterir', () => {
    const { container } = render(Taksitler, { dataset: emptyDataset })
    expect(container.textContent).toMatch(/henüz.*kayıt yok|plan yok/i)
  })

  it('aktif planı ilerlemesiyle listeler', () => {
    const { container } = render(Taksitler, { dataset: fixture, today: '2026-09-08' })
    expect(container.textContent).toContain('Beyaz eşya')
    expect(container.textContent).toContain('3/6')
    expect(container.textContent).toMatch(/6[.,]000|6000/)
  })

  it('bitmiş planı listelemez', () => {
    const { container } = render(Taksitler, { dataset: withFinishedPlanDataset, today: '2026-09-08' })
    expect(container.textContent).not.toContain('Biten Telefon Taksiti')
  })

  it('önümüzdeki 12 ayın yükünü çizer', () => {
    const { container } = render(Taksitler, { dataset: fixture, today: '2026-09-08' })
    const chart = container.querySelector('[data-chart="taksit-yuk"]')
    expect(chart).not.toBeNull()
  })
})
