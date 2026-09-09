import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Borclar from './Borclar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset, Debt } from '../../lib/data/types'

const emptyDataset: Dataset = {
  ...fixture,
  debts: [],
}

const withClosedDebtDataset: Dataset = {
  ...fixture,
  debts: [
    ...(fixture.debts ?? []),
    {
      id: 'db_closed',
      tarih: '2026-08-01',
      yon: 'VERDIM',
      kisi: 'MEHMET',
      tutar: 1500,
      paraBirimi: 'TRY',
      aciklama: 'Kapanan borç',
      hesap: 'NAKIT',
      durum: 'KAPALI',
      kapatanKayitlar: ['px_1'],
      kaynak: 'telegram',
      olusturulma: '2026-08-01T10:00:00Z',
    } as Debt,
  ],
}

describe('Borçlar sayfası', () => {
  it('borç yoksa boş durum gösterir', () => {
    const { container } = render(Borclar, { dataset: emptyDataset })
    expect(container.textContent).toMatch(/henüz.*kayıt yok|borç yok/i)
  })

  it('kişi başına alacak, borç ve net gösterir', () => {
    const { container } = render(Borclar, { dataset: fixture })
    expect(container.textContent).toContain('AHMET')
    expect(container.textContent).toContain('AYSE')
    expect(container.textContent).toMatch(/5[.,]000|5000/)
    expect(container.textContent).toMatch(/800/)
  })

  it('alacak ile borcu görsel olarak ayırır', () => {
    const { container } = render(Borclar, { dataset: fixture })
    const alacakEls = container.querySelectorAll('.alacak, .gain')
    const borcEls = container.querySelectorAll('.borc, .loss')
    expect(alacakEls.length).toBeGreaterThan(0)
    expect(borcEls.length).toBeGreaterThan(0)
  })

  it('kapanmış borcu listelemez', () => {
    const { container } = render(Borclar, { dataset: withClosedDebtDataset })
    expect(container.textContent).not.toContain('MEHMET')
  })

  it('borcu kapatır ama silmez', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let savedDebts: Debt[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
      },
    }
    const { getAllByRole } = render(Borclar, {
      props: { dataset: fixture, source, store },
    })

    const kapatBtns = getAllByRole('button', { name: /Kapat/i })
    await fireEvent.click(kapatBtns[0])

    expect(savedDebts).toBeDefined()
    const target = savedDebts!.find((d) => d.id === 'db_1')
    expect(target).toBeDefined()
    expect(target!.durum).toBe('KAPALI')
  })

  it('kapanan borç listeden çıkar', async () => {
    const { container } = render(Borclar, { dataset: withClosedDebtDataset })
    // withClosedDebtDataset has db_closed with description 'Kapanan borç'
    const openDebts = container.querySelectorAll('[data-debt-row]')
    const hasClosedInList = Array.from(openDebts).some((el) => el.textContent?.includes('Kapanan borç'))
    expect(hasClosedInList).toBe(false)
  })

  it('tutarı düzeltir', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let savedDebts: Debt[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
      },
    }
    const { getAllByRole, getByLabelText, getByRole } = render(Borclar, {
      props: { dataset: fixture, source, store },
    })

    const editBtns = getAllByRole('button', { name: /Düzenle/i })
    await fireEvent.click(editBtns[0])

    const amountInput = getByLabelText(/Tutar/i)
    await fireEvent.input(amountInput, { target: { value: '6000' } })

    const saveBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(saveBtn)

    expect(savedDebts).toBeDefined()
    const target = savedDebts!.find((d) => d.id === 'db_1')
    expect(target!.tutar).toBe(6000)
  })

  it('silmeden önce onay ister', async () => {
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
    const { getAllByRole, getByRole } = render(Borclar, {
      props: { dataset: fixture, source, store },
    })

    const deleteBtns = getAllByRole('button', { name: /Sil/i })
    await fireEvent.click(deleteBtns[0])

    expect(saved).toBe(false)

    const dismissBtn = getByRole('button', { name: /Vazgeç/i })
    await fireEvent.click(dismissBtn)

    expect(saved).toBe(false)
  })

  it('borcu siler', async () => {
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let savedDebts: Debt[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
      },
    }
    const { getAllByRole, getByRole } = render(Borclar, {
      props: { dataset: fixture, source, store },
    })

    const deleteBtns = getAllByRole('button', { name: /Sil/i })
    await fireEvent.click(deleteBtns[0])

    const confirmBtn = getByRole('button', { name: 'Evet, Sil' })
    await fireEvent.click(confirmBtn)

    expect(savedDebts).toBeDefined()
    expect(savedDebts!.some((d) => d.id === 'db_1')).toBe(false)
  })

  it('param verilince sadece o kişinin kayıtlarını gösterir', () => {
    const ds: Dataset = {
      ...fixture,
      people: [
        { kod: 'BORA', ad: 'Bora', haneUyesi: false, aktif: true },
        { kod: 'ALPER', ad: 'Alper', haneUyesi: false, aktif: true },
      ],
      debts: [
        { id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: 'Bora borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' },
        { id: 'db_2', tarih: '2026-09-02', yon: 'ALDIM', kisi: 'ALPER', tutar: 500, paraBirimi: 'TRY', aciklama: 'Alper borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z' },
      ],
    }
    const { container } = render(Borclar, { dataset: ds, param: 'BORA' })
    expect(container.textContent).toContain('Bora borcu')
    expect(container.textContent).not.toContain('Alper borcu')
  })

  it('filtre rozetinden tüm kişilere dönülür', async () => {
    const ds: Dataset = {
      ...fixture,
      people: [
        { kod: 'BORA', ad: 'Bora', haneUyesi: false, aktif: true },
        { kod: 'ALPER', ad: 'Alper', haneUyesi: false, aktif: true },
      ],
      debts: [
        { id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: 'Bora borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' },
        { id: 'db_2', tarih: '2026-09-02', yon: 'ALDIM', kisi: 'ALPER', tutar: 500, paraBirimi: 'TRY', aciklama: 'Alper borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z' },
      ],
    }
    const { container } = render(Borclar, { dataset: ds, param: 'BORA' })
    const rozet = container.querySelector('[data-testid="kisi-rozeti"]') as HTMLButtonElement
    expect(rozet).toBeTruthy()
    rozet.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Alper borcu')
  })

  it('param yoksa herkesi gösterir', () => {
    const ds: Dataset = {
      ...fixture,
      people: [
        { kod: 'BORA', ad: 'Bora', haneUyesi: false, aktif: true },
        { kod: 'ALPER', ad: 'Alper', haneUyesi: false, aktif: true },
      ],
      debts: [
        { id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: 'Bora borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' },
        { id: 'db_2', tarih: '2026-09-02', yon: 'ALDIM', kisi: 'ALPER', tutar: 500, paraBirimi: 'TRY', aciklama: 'Alper borcu', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z' },
      ],
    }
    const { container } = render(Borclar, { dataset: ds })
    expect(container.textContent).toContain('Bora borcu')
    expect(container.textContent).toContain('Alper borcu')
  })
})

