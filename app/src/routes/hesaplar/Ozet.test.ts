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

  it('kategori dağılımında seçili kategorinin harcama detayını listeler ve tıklamayla değiştirir', async () => {
    const { container, getAllByText } = render(Ozet, { dataset: fixture, today: '2026-09-08' })
    const { fireEvent } = await import('@testing-library/svelte')

    // Varsayılan olarak kategori dağılımı iki sütunlu görünür
    expect(container.querySelector('.breakdown-split')).not.toBeNull()
    expect(container.querySelector('.detail-tx-list')).not.toBeNull()

    // Market çipine tıklanınca Market harcaması sağdaki listede belirir
    const marketChips = getAllByText('Market')
    const marketChip = marketChips.find((el) => el.closest('.cat-chip'))
    expect(marketChip).toBeDefined()
    await fireEvent.click(marketChip!.closest('.cat-chip')!)

    expect(container.querySelector('.detail-cat-title')?.textContent).toContain('Market')
    expect(container.textContent).toContain('Haftalık pazar')
  })

  it('aylık seyir grafiğinde bir aya tıklayınca kategori dağılımı o aya göre değişir', async () => {
    const { container, getByText } = render(Ozet, { dataset: fixture, today: '2026-09-08' })
    const { fireEvent } = await import('@testing-library/svelte')

    // Başlangıçta Eylül 2026 (bu ay) aktif
    expect(container.textContent).toContain('Eyl 2026')
    expect(container.textContent).not.toContain('Kira ödemesi') // Kira Ağustos'ta

    // Aylık seyir grafiğindeki "Ağu" çubuğuna tıkla
    const aguBar = container.querySelector('[data-bar="Ağu"]')
    expect(aguBar).not.toBeNull()
    await fireEvent.click(aguBar!)

    // Kategori dağılımı Ağustos 2026'ya güncellenir
    expect(container.textContent).toContain('Ağu 2026')
    expect(container.textContent).toContain('Kira ödemesi') // 25.000 TL Kira

    // "Bu aya dön" butonuna tıkla
    const resetBtn = getByText(/bu aya dön/i)
    await fireEvent.click(resetBtn)

    // Tekrar Eylül 2026'ya döner
    expect(container.textContent).toContain('Eyl 2026')
    expect(container.textContent).not.toContain('Kira ödemesi')
  })

  describe('kişi / hesap seçicisi (Görev 3)', () => {
    it('tek kişi veya tek hesap varken seçici gizlenir', () => {
      // fixture has only 1 person (ENIS)
      const { container } = render(Ozet, { dataset: fixture })
      expect(container.querySelector('[data-testid="dimension-selector"]')).toBeNull()
    })

    it('çoklu kişi ve çoklu hesap varken seçici görünür ve geçiş yapılabilir', async () => {
      const multiDataset: Dataset = {
        ...fixture,
        people: [
          { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
          { kod: 'ZEK', ad: 'Zek', haneUyesi: false, aktif: true },
        ],
        personalAccounts: [
          { kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true },
          { kod: 'GARANTI-BANKA', ad: 'Garanti Bankası', tur: 'BANKA', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true },
        ],
        personalTx: [
          {
            id: 'tx_enis',
            tarih: '2026-09-02',
            tur: 'GIDER',
            tutar: 100,
            paraBirimi: 'TRY',
            kategori: 'market',
            aciklama: 'Enis Market',
            hesap: 'NAKIT',
            sahip: 'ENIS',
            taksitPlaniId: null,
            taksitNo: null,
            taksitToplam: null,
            not: '',
            kaynak: 'manual',
            olusturulma: '2026-09-02T10:00:00Z',
          },
          {
            id: 'tx_zek',
            tarih: '2026-09-03',
            tur: 'GIDER',
            tutar: 300,
            paraBirimi: 'TRY',
            kategori: 'kira',
            aciklama: 'Zek Kira',
            hesap: 'GARANTI-BANKA',
            sahip: 'ZEK',
            taksitPlaniId: null,
            taksitNo: null,
            taksitToplam: null,
            not: '',
            kaynak: 'manual',
            olusturulma: '2026-09-03T10:00:00Z',
          },
        ],
      }
      const { container, getByText } = render(Ozet, { dataset: multiDataset, today: '2026-09-08' })
      const sel = container.querySelector('[data-testid="dimension-selector"]')
      expect(sel).not.toBeNull()

      // Varsayılan kişi modunda her iki kişinin isimleri görünür
      expect(container.textContent).toContain('Enis')
      expect(container.textContent).toContain('Zek')

      // Hesap moduna geçilince hesap adları görünür
      const { fireEvent } = await import('@testing-library/svelte')
      await fireEvent.click(getByText('Hesap'))
      expect(container.textContent).toContain('Nakit')
      expect(container.textContent).toContain('Garanti Bankası')
    })
  })
})
