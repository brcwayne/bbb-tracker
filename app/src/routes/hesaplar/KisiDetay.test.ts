import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import KisiDetay from './KisiDetay.svelte'
import { fixture } from '../../fixtures/dataset'
import type { Dataset, PaymentPlan, PersonalTx, RecurringRule } from '../../lib/data/types'

const ds: Dataset = {
  ...fixture,
  people: [
    { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
    { kod: 'ZEK', ad: 'Zek', haneUyesi: false, aktif: true },
  ],
  personalAccounts: [
    { kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'ENIS', aktif: true },
  ],
  personalTx: [
    {
      id: 'tx_1',
      tarih: '2026-09-01',
      tur: 'GELIR',
      tutar: 5000,
      paraBirimi: 'TRY',
      kategori: 'maas',
      aciklama: 'Eylül Maaş',
      hesap: 'NAKIT',
      sahip: 'ZEK',
      taksitPlaniId: null,
      taksitNo: null,
      taksitToplam: null,
      not: '',
      kaynak: 'manual',
      olusturulma: '2026-09-01T10:00:00Z',
    },
    {
      id: 'tx_2',
      tarih: '2026-09-05',
      tur: 'GIDER',
      tutar: 340,
      paraBirimi: 'TRY',
      kategori: 'market',
      aciklama: 'Market Harcaması',
      hesap: 'NAKIT',
      sahip: 'ZEK',
      taksitPlaniId: null,
      taksitNo: null,
      taksitToplam: null,
      not: '',
      kaynak: 'manual',
      olusturulma: '2026-09-05T10:00:00Z',
    },
    {
      id: 'tx_3',
      tarih: '2026-09-10',
      tur: 'SAHIP_AKTARIM',
      tutar: 600,
      paraBirimi: 'TRY',
      kategori: 'transfer',
      aciklama: 'Enis e borç aktarımı',
      hesap: 'NAKIT',
      sahip: 'ZEK',
      karsiSahip: 'ENIS',
      taksitPlaniId: null,
      taksitNo: null,
      taksitToplam: null,
      not: '',
      kaynak: 'manual',
      olusturulma: '2026-09-10T10:00:00Z',
    },
  ],
  paymentPlans: [
    {
      id: 'pp_zek',
      alisTarihi: '2026-08-01',
      aciklama: 'Zek Bilgisayar',
      toplamTutar: 24000,
      paraBirimi: 'TRY',
      taksitSayisi: 6,
      taksitTutari: 4000,
      sonTaksitTutari: 4000,
      kategori: 'ev',
      hesap: 'NAKIT',
      sahip: 'ZEK',
      durum: 'AKTIF',
      kaynak: 'manual',
      olusturulma: '2026-08-01T10:00:00Z',
    },
  ],
  recurringRules: [
    {
      id: 'rr_zek',
      tur: 'GIDER',
      aciklama: 'Zek Gym Üyelik',
      kategori: 'market',
      hesap: 'NAKIT',
      sahip: 'ZEK',
      paraBirimi: 'TRY',
      tutar: 1200,
      gunOfMonth: 15,
      baslangicTarihi: '2026-01-01',
      bitisTarihi: null,
      aktif: true,
      olusturulma: '',
      kaynak: 'manual',
    },
  ],
}

describe('KisiDetay sayfası', () => {
  it('kişi adını ve bakiyesini gösterir', () => {
    const { container } = render(KisiDetay, { dataset: ds, param: 'ZEK', today: '2026-09-20' })
    expect(container.textContent).toContain('Zek')
    // Bakiye: 5000 (gelir) - 340 (gider) - 600 (aktarım veren) = 4060
    expect(container.textContent).toMatch(/4[.,]060/)
  })

  it('para hareketlerini yön işaretli (+ / −) listeler', () => {
    const { container } = render(KisiDetay, { dataset: ds, param: 'ZEK', today: '2026-09-20' })
    expect(container.textContent).toMatch(/\+\s*₺?\s*5[.,]000/)
    expect(container.textContent).toMatch(/[−-]\s*₺?\s*340/)
    expect(container.textContent).toMatch(/[−-]\s*₺?\s*600/)
  })

  it('alıcı kişi için aktarımı pozitif (+) gösterir', () => {
    const { container } = render(KisiDetay, { dataset: ds, param: 'ENIS', today: '2026-09-20' })
    expect(container.textContent).toContain('Enis')
    // ENIS aktarımı aldı (+600)
    expect(container.textContent).toMatch(/\+\s*₺?\s*600/)
  })

  it('kişinin taksit planlarını ve tekrarlayan işlemlerini listeler', () => {
    const { container } = render(KisiDetay, { dataset: ds, param: 'ZEK', today: '2026-09-20' })
    expect(container.textContent).toContain('Zek Bilgisayar')
    expect(container.textContent).toContain('Zek Gym Üyelik')
  })

  it('hareket veya plan yoksa anlamlı boş durum gösterir', () => {
    const emptyDataset: Dataset = {
      ...fixture,
      people: [{ kod: 'YENI', ad: 'Yeni Kişi', haneUyesi: false, aktif: true }],
      personalTx: [],
      paymentPlans: [],
      recurringRules: [],
    }
    const { container } = render(KisiDetay, { dataset: emptyDataset, param: 'YENI', today: '2026-09-20' })
    expect(container.textContent).toMatch(/hareket yok|işlem yok|kayıt yok/i)
  })

  it('isim düzenleme butonuna tıklayınca düzenleme formunu açar ve adı günceller', async () => {
    const { fireEvent } = await import('@testing-library/svelte')
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })

    let savedPeople: any[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(ds),
      save: async (name: string, data: unknown) => {
        if (name === 'people') savedPeople = data as any[]
      },
    }

    const { getByRole, getByLabelText } = render(KisiDetay, {
      props: { dataset: ds, source, store, param: 'ZEK', today: '2026-09-20' },
    })

    const editBtn = getByRole('button', { name: /Düzenle/i })
    await fireEvent.click(editBtn)

    const input = getByLabelText(/Kişi Adı/i)
    await fireEvent.input(input, { target: { value: 'Zekeriya' } })

    const saveBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(saveBtn)

    expect(savedPeople).toBeDefined()
    const updated = savedPeople!.find((p) => p.kod === 'ZEK')
    expect(updated).toBeDefined()
    expect(updated.ad).toBe('Zekeriya')
    expect(updated.kod).toBe('ZEK')
  })

  it('ilişkili kaydı olan kişi silinmek istendiğinde uyarı verir ve pasife alma sunar', async () => {
    const { fireEvent } = await import('@testing-library/svelte')
    const { createAppStore, load } = await import('../../lib/data/store')
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })

    let savedPeople: any[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(ds),
      save: async (name: string, data: unknown) => {
        if (name === 'people') savedPeople = data as any[]
      },
    }

    const { getByRole, container } = render(KisiDetay, {
      props: { dataset: ds, source, store, param: 'ZEK', today: '2026-09-20' },
    })

    const deleteBtn = getByRole('button', { name: /Kişiyi Sil/i })
    await fireEvent.click(deleteBtn)

    expect(container.textContent).toMatch(/silinemez|kayıt.*bulunuyor/i)

    const pasifBtn = getByRole('button', { name: /Pasife Al/i })
    await fireEvent.click(pasifBtn)

    expect(savedPeople).toBeDefined()
    const updated = savedPeople!.find((p) => p.kod === 'ZEK')
    expect(updated.aktif).toBe(false)
  })

  it('hiçbir kaydı olmayan kişiyi iki adımlı onayla siler', async () => {
    const { fireEvent } = await import('@testing-library/svelte')
    const { createAppStore, load } = await import('../../lib/data/store')
    const emptyPersonDs: Dataset = {
      ...fixture,
      people: [
        { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
        { kod: 'BOS', ad: 'Boş Kişi', haneUyesi: false, aktif: true },
      ],
      personalTx: [],
      paymentPlans: [],
      recurringRules: [],
      personalAccounts: [],
      debts: [],
      brokers: [],
    }

    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(emptyPersonDs) })

    let savedPeople: any[] | undefined
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(emptyPersonDs),
      save: async (name: string, data: unknown) => {
        if (name === 'people') savedPeople = data as any[]
      },
    }

    const { getByRole, container } = render(KisiDetay, {
      props: { dataset: emptyPersonDs, source, store, param: 'BOS', today: '2026-09-20' },
    })

    const deleteBtn = getByRole('button', { name: /Kişiyi Sil/i })
    await fireEvent.click(deleteBtn)

    expect(container.textContent).toMatch(/silmek istediğin/i)

    const confirmBtn = getByRole('button', { name: /Evet, Sil/i })
    await fireEvent.click(confirmBtn)

    expect(savedPeople).toBeDefined()
    expect(savedPeople!.some((p) => p.kod === 'BOS')).toBe(false)
  })
})
