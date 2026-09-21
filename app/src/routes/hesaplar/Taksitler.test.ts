import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Taksitler from './Taksitler.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset, PaymentPlan } from '../../lib/data/types'

const emptyDataset: Dataset = {
  ...fixture,
  paymentPlans: [],
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

  describe('kişi boyutu (Görev 1)', () => {
    it('tek sahip varken planda kişi adı gösterilmez', () => {
      const { container } = render(Taksitler, { dataset: fixture, today: '2026-09-08' })
      const meta = container.querySelector('.plan-meta')
      expect(meta?.textContent).not.toContain('Enis')
      expect(meta?.textContent).not.toContain('ENIS')
    })

    it('birden fazla sahip varken planda kişi adı gösterilir', () => {
      const twoOwnersDataset: Dataset = {
        ...fixture,
        people: [
          { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
          { kod: 'ZEK', ad: 'Zek', haneUyesi: false, aktif: true },
        ],
        paymentPlans: [
          ...(fixture.paymentPlans ?? []),
          {
            id: 'pp_zek',
            alisTarihi: '2026-08-01',
            aciklama: 'Zek Laptop',
            toplamTutar: 30000,
            paraBirimi: 'TRY',
            taksitSayisi: 3,
            taksitTutari: 10000,
            sonTaksitTutari: 10000,
            kategori: 'ev',
            hesap: 'NAKIT',
            sahip: 'ZEK',
            durum: 'AKTIF',
            kaynak: 'manual',
            olusturulma: '2026-08-01T10:00:00Z',
          },
        ],
        personalTx: [
          ...(fixture.personalTx ?? []),
          {
            id: 'px_zek_1',
            tarih: '2026-08-01',
            tur: 'GIDER',
            tutar: 10000,
            paraBirimi: 'TRY',
            kategori: 'ev',
            aciklama: 'Zek Laptop 1/3',
            hesap: 'NAKIT',
            sahip: 'ZEK',
            taksitPlaniId: 'pp_zek',
            taksitNo: 1,
            taksitToplam: 3,
            not: '',
            kaynak: 'manual',
            olusturulma: '2026-08-01T10:00:00Z',
          },
        ],
      }
      const { container } = render(Taksitler, { dataset: twoOwnersDataset, today: '2026-09-08' })
      const metas = Array.from(container.querySelectorAll('.plan-meta')).map((el) => el.textContent)
      expect(metas.some((m) => m?.includes('Enis'))).toBe(true)
      expect(metas.some((m) => m?.includes('Zek'))).toBe(true)
    })
  })
})

