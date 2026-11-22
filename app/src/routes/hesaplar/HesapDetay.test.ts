import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import HesapDetay from './HesapDetay.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset } from '../../lib/data/types'

const TODAY = '2026-09-08'

describe('Hesap detayı', () => {
  it('bilinmeyen hesapta geri dönüş bağlantısıyla uyarı verir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'YOK', today: TODAY })
    expect(container.textContent).toMatch(/hesap bulunamadı/i)
    expect(container.querySelector('a[href="#/h/hesaplar"]')).toBeTruthy()
  })

  it('hesabın adını ve bakiyesini gösterir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Nakit')
    expect(container.querySelector('[data-testid="bakiye"]')).toBeTruthy()
  })

  it('kredi kartında Bu Ay / Gelecek Ay gösterir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'GARANTI-DIJI', today: TODAY })
    expect(container.textContent).toContain('Bu Ay')
    expect(container.textContent).toContain('Gelecek Ay')
  })

  it('takvimi bugünün ayıyla açar', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Eylül 2026')
  })

  it('ayın giriş / çıkış / net toplamını yazar', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const t = container.querySelector('[data-testid="ay-toplam"]')!
    expect(t.textContent).toContain('Giriş')
    expect(t.textContent).toContain('Çıkış')
    expect(t.textContent).toContain('Net')
  })

  it('ayın hareketlerini listeler', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Haftalık pazar')
  })

  it('güne tıklayınca listeyi o güne indirir, ay toplamı değişmez', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const oncekiToplam = container.querySelector('[data-testid="ay-toplam"]')!.textContent
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    expect(container.textContent).toContain('Haftalık pazar')
    expect(container.textContent).not.toContain('Akşam yemeği')
    expect(container.querySelector('[data-testid="ay-toplam"]')!.textContent).toBe(oncekiToplam)
  })

  it('seçili gün rozetinden seçim temizlenir', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    const rozet = container.querySelector('[data-testid="gun-rozeti"]') as HTMLButtonElement
    expect(rozet).toBeTruthy()
    rozet.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Akşam yemeği')
  })

  it('transfer satırını yönüyle okur', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Garanti Bankası')
  })

  it('Drive yoksa eylem düğmeleri pasif', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const butonlar = [...container.querySelectorAll('[data-action]')] as HTMLButtonElement[]
    expect(butonlar.length).toBeGreaterThan(0)
    expect(butonlar.every((b) => b.disabled)).toBe(true)
  })

  it('takvimde ekleme isteği formu o tarihle açar', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    ;(container.querySelector('[data-day="2"] [data-add]') as HTMLButtonElement).click()
    await Promise.resolve()
    const tarih = container.querySelector('#hf-tarih') as HTMLInputElement
    expect(tarih.value).toBe('2026-09-02')
  })

  it('transfer düğmesi transfer formunu kaynak hesapla açar', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })
    const btn = container.querySelector('[data-action="transfer"]') as HTMLButtonElement
    btn.click()
    await Promise.resolve()
    const kaynak = container.querySelector('#t-kaynak') as HTMLSelectElement
    expect(kaynak).toBeTruthy()
    expect(kaynak.value).toBe('NAKIT')
  })

  it('kart ödemesi düğmesi kartı hedef yaparak formu açar', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'GARANTI-DIJI', today: TODAY, source })
    const btn = container.querySelector('[data-action="odeme"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    btn.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Kart Ödemesi')
    const hedef = container.querySelector('#t-hedef') as HTMLSelectElement
    expect(hedef.value).toBe('GARANTI-DIJI')
  })

  it('bakiye düzelt düğmesi düzeltme formunu açar', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })
    const btn = container.querySelector('[data-action="duzeltme"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    btn.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Bakiye Düzeltmesi')
    expect(container.querySelector('#b-gercek')).toBeTruthy()
  })

  it('(a) form açıkken takvimde ikinci bir güne basınca #hf-tarih o güne güncellenmeli', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })
    ;(container.querySelector('[data-day="2"]') as HTMLElement).click()
    await Promise.resolve()
    ;(container.querySelector('[data-day="2"] [data-add]') as HTMLElement).click()
    await Promise.resolve()
    expect((container.querySelector('#hf-tarih') as HTMLInputElement).value).toBe('2026-09-02')

    ;(container.querySelector('[data-day="5"]') as HTMLElement).click()
    await Promise.resolve()
    expect((container.querySelector('#hf-tarih') as HTMLInputElement).value).toBe('2026-09-05')
  })

  it('(b) form açıkken ikinci kaydın Düzenle\'sine basınca #hf-tutar o kaydın tutarını göstermeli', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })
    const editBtns = container.querySelectorAll('.hareket .btn-icon[title="Düzenle"]')
    expect(editBtns.length).toBeGreaterThanOrEqual(2)

    ;(editBtns[0] as HTMLButtonElement).click()
    await Promise.resolve()
    const tutarInput = container.querySelector('#hf-tutar') as HTMLInputElement
    const ilkTutar = tutarInput.value
    expect(ilkTutar).toBeTruthy()

    ;(editBtns[1] as HTMLButtonElement).click()
    await Promise.resolve()
    const yeniTutar = (container.querySelector('#hf-tutar') as HTMLInputElement).value
    expect(yeniTutar).toBeTruthy()
    expect(yeniTutar).not.toBe(ilkTutar)
  })

  it('planlandı (onaylanmamış tekrarlayan) satırı Planlandı rozetiyle soluk gösterir', () => {
    const datasetWithPlanned = {
      ...fixture,
      personalTx: [
        ...(fixture.personalTx ?? []),
        {
          id: 'px_planli', tarih: '2026-09-25', tur: 'GIDER' as const, tutar: 229.9, paraBirimi: 'TRY' as const,
          kategori: 'market', aciklama: 'Netflix', hesap: 'NAKIT', sahip: 'ENIS',
          taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '',
          kaynak: 'manual' as const, olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' as const,
        },
      ],
    }
    const { container } = render(HesapDetay, { dataset: datasetWithPlanned, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Planlandı')
    const li = [...container.querySelectorAll('li.hareket')].find((el) => el.textContent?.includes('Planlandı'))
    expect(li?.classList.contains('planlandi')).toBe(true)
  })

  it('harekette düzenle butonuna basınca form hareketin hemen altında inline açılır', async () => {
    const source = { id: 'drive' as const, load: async () => fixture, save: async () => {} }
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY, source })

    const editBtns = container.querySelectorAll('.hareket .btn-icon[title="Düzenle"]')
    expect(editBtns.length).toBeGreaterThan(0)

    const clickedLi = editBtns[0].closest('li.hareket')!
    expect(container.querySelector('.inline-edit-item')).toBeNull()

    ;(editBtns[0] as HTMLButtonElement).click()
    await Promise.resolve()

    const inlineItem = container.querySelector('.inline-edit-item') as HTMLElement
    expect(inlineItem).not.toBeNull()
    expect(clickedLi.nextElementSibling).toBe(inlineItem)

    // Kapat butonuna basınca kapanmalı
    const closeBtn = inlineItem.querySelector('.inline-close') as HTMLButtonElement
    closeBtn.click()
    await Promise.resolve()
    expect(container.querySelector('.inline-edit-item')).toBeNull()
  })

  it('kredi kartında Dönem İçi en solda, Ödenecek Ekstre ortada gelir ve varsayılan olarak Dönem İçi (güncel işlemler) seçilidir', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'GARANTI-DIJI', today: TODAY })

    const tabs = container.querySelectorAll('.ekstre-tab')
    expect(tabs.length).toBeGreaterThanOrEqual(2)

    // En solda Dönem İçi, ortada Ödenecek Ekstre olmalı
    expect(tabs[0].querySelector('.tab-title')?.textContent?.trim()).toBe('Dönem İçi')
    expect(tabs[1].querySelector('.tab-title')?.textContent?.trim()).toBe('Ödenecek Ekstre')

    // Varsayılan olarak ilk sekme (Dönem İçi) seçili olmalı
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].classList.contains('active')).toBe(true)
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')

    // Dönem içi güncel işlemler listelenmeli (örn. 03.09 Kulaklık harcaması)
    expect(container.textContent).toContain('Kulaklık')
  })
})

describe('HesapDetay kredi kartı kişi bazlı filtreleme ve kopyalama', () => {
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

  function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  }

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
    } else {
      delete (navigator as any).clipboard
    }
  })

  const multiOwnerCardDs: Dataset = {
    ...fixture,
    people: [
      { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
      { kod: 'SELCUK', ad: 'Selçuk', haneUyesi: true, aktif: true },
    ],
    personalAccounts: [
      {
        kod: 'GARANTI-SANAL',
        ad: 'Garanti Sanal',
        tur: 'KREDI_KARTI',
        paraBirimi: 'TRY',
        sahip: 'ENIS',
        aktif: true,
        hesapKesim: 1,
        sonOdeme: 14,
      },
      {
        kod: 'GARANTI-BANKA',
        ad: 'Garanti Bankası',
        tur: 'BANKA',
        paraBirimi: 'TRY',
        sahip: 'ENIS',
        aktif: true,
      },
    ],
    personalTx: [
      // Dönem İçi (Ekim 2026): sadece ENIS var, SELCUK yok
      {
        id: 'tx_oct_enis',
        tarih: '2026-10-04',
        tur: 'GIDER',
        tutar: 750,
        paraBirimi: 'TRY',
        kategori: 'market',
        aciklama: 'Ekim Enis Market',
        hesap: 'GARANTI-SANAL',
        sahip: 'ENIS',
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: '',
        kaynak: 'manual',
        olusturulma: '2026-10-04T10:00:00Z',
      },
      // Ödenecek Ekstre (Eylül 2026): hem ENIS hem SELCUK var
      {
        id: 'tx_sep_selcuk_1',
        tarih: '2026-09-05',
        tur: 'GIDER',
        tutar: 1200,
        paraBirimi: 'TRY',
        kategori: 'market',
        aciklama: 'Selçuk Market',
        hesap: 'GARANTI-SANAL',
        sahip: 'SELCUK',
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: '',
        kaynak: 'manual',
        olusturulma: '2026-09-05T10:00:00Z',
      },
      {
        id: 'tx_sep_enis_1',
        tarih: '2026-09-10',
        tur: 'GIDER',
        tutar: 500,
        paraBirimi: 'TRY',
        kategori: 'yeme-icme',
        aciklama: 'Enis Yemek',
        hesap: 'GARANTI-SANAL',
        sahip: 'ENIS',
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: '',
        kaynak: 'manual',
        olusturulma: '2026-09-10T10:00:00Z',
      },
      {
        id: 'tx_sep_selcuk_pay',
        tarih: '2026-10-02',
        tur: 'TRANSFER',
        tutar: 200,
        paraBirimi: 'TRY',
        kategori: 'transfer',
        aciklama: 'Selçuk kısmi ödeme',
        hesap: 'GARANTI-BANKA',
        karsiHesap: 'GARANTI-SANAL',
        sahip: 'SELCUK',
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: '',
        kaynak: 'manual',
        olusturulma: '2026-10-02T10:00:00Z',
      },
    ],
  }

  it('kişi rozetine tıklayınca listeyi, toplamları ve üst kopyala butonunu o kişiye göre süzer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    const { container, getByRole, getByTestId } = render(HesapDetay, {
      dataset: multiOwnerCardDs,
      param: 'GARANTI-SANAL',
      today: '2026-10-08',
    })

    // Ödenecek Ekstre sekmesine geç
    await fireEvent.click(getByRole('tab', { name: /Ödenecek Ekstre/i }))
    expect(container.textContent).toContain('Selçuk Market')
    expect(container.textContent).toContain('Enis Yemek')

    const selcukFilterBtn = getByTestId('kisi-filtre-SELCUK')
    expect(selcukFilterBtn.getAttribute('aria-pressed')).toBe('false')
    await fireEvent.click(selcukFilterBtn)

    expect(selcukFilterBtn.getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('Selçuk Market')
    expect(container.textContent).not.toContain('Enis Yemek')

    // Rakam kutuları Selçuk'a özel güncellenmeli (1200 harcama, 200 ödenen, 1000 kalan)
    const rakamlar = getByTestId('ekstre-rakamlar')
    expect(rakamlar.textContent).toContain('Selçuk · Harcama')
    expect(rakamlar.textContent).toMatch(/1[.,]200/)
    expect(rakamlar.textContent).toMatch(/1[.,]000/)

    // Üst kopyala butonu Selçuk özetini kopyalamalı
    const topCopyBtn = getByTestId('ekstre-kopyala-btn')
    expect(topCopyBtn.textContent).toContain('Selçuk Özetini Kopyala')
    await fireEvent.click(topCopyBtn)

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('Garanti Sanal Ekstresi — Selçuk')
    expect(copied).toContain('Selçuk Market')
    expect(copied).not.toContain('Enis Yemek')
    expect(copied).toContain('Kalan: ₺1.000,00')

    // Tümü ✕ butonuyla filtre temizlenir
    await fireEvent.click(getByTestId('sahip-filtre-temizle'))
    expect(selcukFilterBtn.getAttribute('aria-pressed')).toBe('false')
    expect(container.textContent).toContain('Enis Yemek')

    // İkinci kez tıklamayla da açılıp kapanır
    await fireEvent.click(selcukFilterBtn)
    expect(selcukFilterBtn.getAttribute('aria-pressed')).toBe('true')
    await fireEvent.click(selcukFilterBtn)
    expect(selcukFilterBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('kişi rozetindeki kopyala butonu listeyi süzmeden sadece o kişinin dökümünü kopyalar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    const { container, getByRole, getByTestId } = render(HesapDetay, {
      dataset: multiOwnerCardDs,
      param: 'GARANTI-SANAL',
      today: '2026-10-08',
    })

    await fireEvent.click(getByRole('tab', { name: /Ödenecek Ekstre/i }))
    const copySelcukBtn = getByTestId('kisi-kopyala-SELCUK')
    await fireEvent.click(copySelcukBtn)

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('Garanti Sanal Ekstresi — Selçuk')
    expect(copied).toContain('Selçuk Market')
    expect(copied).not.toContain('Enis Yemek')
    expect(copySelcukBtn.hasAttribute('data-copied')).toBe(true)
    expect(copySelcukBtn.hasAttribute('disabled')).toBe(false)

    const status = container.querySelector('[role="status"]')!
    expect(status.textContent).toContain('Selçuk özeti kopyalandı')

    // Liste filtrelenmemiş olarak kalmalı
    expect(container.textContent).toContain('Enis Yemek')
  })

  it('pano erişimi başarısız olduğunda data-failed ve hata durumu bildirir', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    mockClipboard(writeText)

    const { container, getByRole, getByTestId } = render(HesapDetay, {
      dataset: multiOwnerCardDs,
      param: 'GARANTI-SANAL',
      today: '2026-10-08',
    })

    await fireEvent.click(getByRole('tab', { name: /Ödenecek Ekstre/i }))
    const copySelcukBtn = getByTestId('kisi-kopyala-SELCUK')
    await fireEvent.click(copySelcukBtn)

    expect(copySelcukBtn.hasAttribute('data-failed')).toBe(true)
    expect(copySelcukBtn.hasAttribute('disabled')).toBe(false)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Kopyalanamadı')
  })

  it('sekme değiştirildiğinde yeni sekmede seçili kişi yoksa filtre otomatik sıfırlanır', async () => {
    const { container, getByRole, getByTestId } = render(HesapDetay, {
      dataset: multiOwnerCardDs,
      param: 'GARANTI-SANAL',
      today: '2026-10-08',
    })

    await fireEvent.click(getByRole('tab', { name: /Ödenecek Ekstre/i }))
    await fireEvent.click(getByTestId('kisi-filtre-SELCUK'))
    expect(container.textContent).not.toContain('Enis Yemek')

    // Dönem İçi sekmesinde SELCUK harcaması yok -> filtre sıfırlanıp Enis işlemi görünmeli
    await fireEvent.click(getByRole('tab', { name: /Dönem İçi/i }))
    expect(container.textContent).toContain('Ekim Enis Market')
    expect(getByTestId('ekstre-kopyala-btn').textContent).toContain('Özeti Kopyala')
  })
})


