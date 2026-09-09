import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Hesaplar from './Hesaplar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'

const TODAY = '2026-09-08'

describe('Hesaplar listesi', () => {
  it('hesap yoksa boş durum gösterir', () => {
    const ds: Dataset = { ...fixture, personalAccounts: [], debts: [] }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    expect(container.textContent).toMatch(/henüz hesap yok/i)
  })

  it('grupları sabit sırada başlıklarıyla yazar', () => {
    const ds: Dataset = { ...fixture, debts: [] }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    const basliklar = [...container.querySelectorAll('[data-group]')].map((e) => e.getAttribute('data-group'))
    expect(basliklar).toEqual(['NAKIT', 'BANKA', 'KREDI_KARTI'])
  })

  it('varlıklar / borçlar / toplam bandını gösterir', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    const band = container.querySelector('[data-testid="net-worth"]')!
    expect(band.textContent).toContain('Varlıklar')
    expect(band.textContent).toContain('Borçlar')
    expect(band.textContent).toContain('Toplam')
  })

  it('USD kaydı yoksa dolar satırını hiç çizmez', () => {
    const ds: Dataset = {
      ...fixture,
      personalTx: fixture.personalTx!.filter((r) => r.paraBirimi === 'TRY'),
      personalAccounts: fixture.personalAccounts!.filter((a) => a.paraBirimi === 'TRY'),
    }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    expect(container.querySelectorAll('[data-currency]')).toHaveLength(1)
  })

  it('kredi kartı grubunda Bu Ay / Gelecek Ay sütunları var', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    const kart = container.querySelector('[data-group="KREDI_KARTI"]')!
    expect(kart.textContent).toContain('Bu Ay')
    expect(kart.textContent).toContain('Gelecek Ay')
  })

  it('pasif hesabı gizler, anahtar açılınca gösterir', async () => {
    const { container, getByLabelText } = render(Hesaplar, { dataset: fixture, today: TODAY })
    expect(container.textContent).not.toContain('Kapanmış Hesap')
    const toggle = getByLabelText(/pasif hesapları göster/i) as HTMLInputElement
    toggle.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Kapanmış Hesap')
  })

  it('hesap satırı detay adresine bağlanır', () => {
    const { container } = render(Hesaplar, { dataset: fixture, today: TODAY })
    expect(container.querySelector('a[href="#/h/hesap/NAKIT"]')).toBeTruthy()
  })

  it('açık borç varsa Alacak / Verecek grubunu ekler', () => {
    const ds: Dataset = {
      ...fixture,
      debts: [{ id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' }],
    }
    const { container } = render(Hesaplar, { dataset: ds, today: TODAY })
    expect(container.querySelector('[data-group="KISI"]')).toBeTruthy()
    expect(container.querySelector('a[href="#/h/borclar/BORA"]')).toBeTruthy()
  })

  it('Drive yoksa ekleme düğmesi pasif', () => {
    const { getByLabelText } = render(Hesaplar, { dataset: fixture, today: TODAY })
    expect((getByLabelText(/hesap ekle/i) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Drive varsa ekleme düğmesi yeni hesap formunu açar', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { getByLabelText, container } = render(Hesaplar, { dataset: fixture, today: TODAY, source })
    const btn = getByLabelText(/hesap ekle/i) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    btn.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Yeni Hesap Ekle')
  })

  it('düzenleme modunda hesaplarda düzenleme düğmesi çıkar ama kişi satırında çıkmaz', async () => {
    const ds: Dataset = {
      ...fixture,
      debts: [{ id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 2000, paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK', kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z' }],
    }
    const source = { id: 'drive' as const, load: async () => ds, save: async () => {} }
    const { getByLabelText, container } = render(Hesaplar, { dataset: ds, today: TODAY, source })
    const toggle = getByLabelText(/hesapları düzenle/i) as HTMLButtonElement
    toggle.click()
    await Promise.resolve()
    expect(container.querySelector('[aria-label="Nakit hesabını düzenle"]')).toBeTruthy()
    const kisiGroup = container.querySelector('[data-group="KISI"]')!
    expect(kisiGroup.querySelector('.row-edit-btn')).toBeFalsy()
  })
})
