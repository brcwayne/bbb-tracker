import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
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
})
