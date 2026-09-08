import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
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

  it('iptal, sadece gelecek taksitleri siler', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let savedTx: any[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'personal_tx') savedTx = data as any[]
      },
    }
    const { getByRole } = render(Taksitler, {
      props: { dataset: fixture, source, store, today: '2026-09-08' },
    })

    const cancelBtn = getByRole('button', { name: /Planı İptal Et|İptal Et/i })
    await fireEvent.click(cancelBtn)

    const confirmBtn = getByRole('button', { name: /Evet.*İptal/i })
    await fireEvent.click(confirmBtn)

    expect(savedTx).toBeDefined()
    // Past instalments remain
    expect(savedTx!.some((r) => r.id === 'px_p1')).toBe(true)
    expect(savedTx!.some((r) => r.id === 'px_p2')).toBe(true)
    expect(savedTx!.some((r) => r.id === 'px_p3')).toBe(true)
    // Future instalments removed
    expect(savedTx!.some((r) => r.id === 'px_p4')).toBe(false)
    expect(savedTx!.some((r) => r.id === 'px_p5')).toBe(false)
    expect(savedTx!.some((r) => r.id === 'px_p6')).toBe(false)
  })

  it('iptal, plan kaydını da siler', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let savedPlans: any[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'payment_plans') savedPlans = data as any[]
      },
    }
    const { getByRole } = render(Taksitler, {
      props: { dataset: fixture, source, store, today: '2026-09-08' },
    })

    const cancelBtn = getByRole('button', { name: /Planı İptal Et|İptal Et/i })
    await fireEvent.click(cancelBtn)

    const confirmBtn = getByRole('button', { name: /Evet.*İptal/i })
    await fireEvent.click(confirmBtn)

    expect(savedPlans).toBeDefined()
    expect(savedPlans!.some((p) => p.id === 'pp_1')).toBe(false)
  })

  it('iptal, kaç satır silineceğini söyleyip onay ister', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let saved = false
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {
        saved = true
      },
    }
    const { getByRole, container } = render(Taksitler, {
      props: { dataset: fixture, source, store, today: '2026-09-08' },
    })

    const cancelBtn = getByRole('button', { name: /Planı İptal Et|İptal Et/i })
    await fireEvent.click(cancelBtn)

    // Confirmation message mentions 3 future instalments
    expect(container.textContent).toMatch(/3.*gelecek taksit.*silinecek|3.*silinecek/i)
    expect(saved).toBe(false)
  })

  it('onaylanmazsa hiçbir şey silinmez', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let saved = false
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {
        saved = true
      },
    }
    const { getByRole } = render(Taksitler, {
      props: { dataset: fixture, source, store, today: '2026-09-08' },
    })

    const cancelBtn = getByRole('button', { name: /Planı İptal Et|İptal Et/i })
    await fireEvent.click(cancelBtn)

    const dismissBtn = getByRole('button', { name: /vazgeç/i })
    await fireEvent.click(dismissBtn)

    expect(saved).toBe(false)
  })
})

