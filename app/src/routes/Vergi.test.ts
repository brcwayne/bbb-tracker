import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Vergi from './Vergi.svelte'
import { fixture } from '../fixtures/dataset'
import { deriveAll } from '../lib/data/store'
import type { SaleEvent } from '../lib/data/ledger'
import type { Dataset } from '../lib/data/types'

describe('Vergi.svelte (I7)', () => {
  const mockDataset: Dataset = {
    ...fixture,
    cashflows: [
      { id: 'c1', tarih: '2026-03-15', hesap: 'GARAN', portfoy: null, tur: 'TEMETTU', enstruman: 'THYAO', tutar_tl: null, tutar_usd: 120, kur: null, aciklama: '', kaynak: 'migration' },
    ],
    instruments: [
      { kod: 'THYAO', ad: 'Türk Hava Yolları', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'THYAO.IS', seviyeler: null },
      { kod: 'PPZ', ad: 'Para Piyasası Fonu', sinif: 'FON_PARA', girisParaBirimi: 'TL', fiyatKaynagi: 'tefas', fiyatSembolu: 'PPZ', seviyeler: null },
    ],
  }

  const mockSales: SaleEvent[] = [
    {
      txId: 's1',
      tarih: '2026-02-10',
      kod: 'THYAO',
      hesap: 'GARAN',
      portfoy: 'ALFA',
      lot: 100,
      satisFiyatUsd: 10,
      ortMaliyetUsd: 8,
      maliyetUsd: 800,
      hasilatUsd: 990,
      komisyonUsd: 10,
      kzUsd: 190,
      kzPct: 0.2375,
      kalanLot: 0,
      pozisyonKapandi: true,
      ilkAlisTarih: '2025-10-01',
      tutmaGunu: 132,
      oduncAlindi: false,
    },
    {
      txId: 's2',
      tarih: '2026-05-15',
      kod: 'THYAO',
      hesap: 'GARAN',
      portfoy: 'ALFA',
      lot: 50,
      satisFiyatUsd: 6,
      ortMaliyetUsd: 8,
      maliyetUsd: 400,
      hasilatUsd: 295,
      komisyonUsd: 5,
      kzUsd: -105,
      kzPct: -0.2625,
      kalanLot: 0,
      pozisyonKapandi: true,
      ilkAlisTarih: '2026-01-01',
      tutmaGunu: 134,
      oduncAlindi: false,
    },
  ]

  it('renders top permanent disclaimer note in Turkish', () => {
    const derived = deriveAll(mockDataset)
    derived.positions.sales = mockSales

    const { getByTestId } = render(Vergi, { props: { dataset: mockDataset, derived } })
    const disclaimer = getByTestId('vergi-disclaimer')
    expect(disclaimer).toBeInTheDocument()
    expect(disclaimer.textContent).toContain('Bu sayfa bir vergi beyanı değil, defterden çıkarılmış bir özettir. Stopaj, istisna ve mahsup kuralları hesaplanmaz.')
  })

  it('renders 2026 year totals matching SaleEvent rows, showing profit and loss separately', () => {
    const derived = deriveAll(mockDataset)
    derived.positions.sales = mockSales

    const { container } = render(Vergi, { props: { dataset: mockDataset, derived } })
    const text = container.textContent ?? ''

    // 2 sales
    expect(text).toContain('Satış Sayısı 2026 2')
    // Maliyet $1,200.00
    expect(text).toContain('$1,200.00')
    // Hasılat $1,285.00
    expect(text).toContain('$1,285.00')
    // Gerçekleşen Net K/Z +$85.00
    expect(text).toContain('+$85.00')
    // Kâr ve zarar ayrı
    expect(text).toContain('Toplam Kâr 2026 kârlı işlemler +$190.00')
    expect(text).toContain('Toplam Zarar 2026 zararlı işlemler -$105.00')
    // Komisyon $15.00
    expect(text).toContain('$15.00')
    // Temettü $120.00
    expect(text).toContain('$120.00')

    // Instrument class breakdown present
    expect(text).toContain('Varlık Sınıfı Kırılımı')
    expect(text).toContain('BIST Hisse')
  })

  it('shows empty state when a year with no sales is selected and does not crash', async () => {
    const derived = deriveAll(mockDataset)
    derived.positions.sales = mockSales

    const { getByLabelText, getByTestId, container } = render(Vergi, { props: { dataset: mockDataset, derived } })

    const select = getByLabelText('Vergilendirme Yılı:') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: '2024' } })

    const empty = getByTestId('empty-year-msg')
    expect(empty).toBeInTheDocument()
    expect(empty.textContent).toContain('Bu yılda satış işlemi bulunmuyor.')
    expect(container.textContent).toContain('Satış Sayısı 2024 0')
  })

  it('triggers CSV download with exact row count matching sales count', async () => {
    const derived = deriveAll(mockDataset)
    derived.positions.sales = mockSales

    // Mock URL.createObjectURL
    const createObjectURL = vi.fn().mockReturnValue('blob:test')
    const revokeObjectURL = vi.fn()
    window.URL.createObjectURL = createObjectURL
    window.URL.revokeObjectURL = revokeObjectURL

    const { getByTestId } = render(Vergi, { props: { dataset: mockDataset, derived } })
    const csvBtn = getByTestId('vergi-csv-btn')
    expect(csvBtn).toBeInTheDocument()
    expect(csvBtn.textContent).toContain('2 işlem')

    await fireEvent.click(csvBtn)
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalled()
  })

  it('AUDIT: confirms no tax rate, withholding or "ödenecek" appears as computed values anywhere on page', () => {
    const derived = deriveAll(mockDataset)
    derived.positions.sales = mockSales

    const { container } = render(Vergi, { props: { dataset: mockDataset, derived } })
    const html = container.innerHTML

    // Checking that no computed tax fields exist
    expect(html).not.toContain('vergi oranı')
    expect(html).not.toContain('vergi orani')
    expect(html).not.toContain('ödenecek vergi')
    expect(html).not.toContain('odenecek vergi')
    expect(html).not.toContain('ödenecek')
    expect(html).not.toContain('odenecek')
  })
})
