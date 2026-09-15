import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import HarcamaFormu from './HarcamaFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'
import type { PersonalTx } from '../../lib/data/types'

async function setup() {
  const store = createAppStore()
  await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
  const state = get(store)
  return { state, store }
}

describe('HarcamaFormu', () => {
  it('yeni kayıt formu zorunlu alanları doğrular', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(fixture), save: async () => {} }
    const { getByLabelText, getByText } = render(HarcamaFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    // Description is filled, amount left empty
    await fireEvent.input(getByLabelText('Açıklama'), { target: { value: 'Kahve' } })
    await fireEvent.click(getByText('İncele'))

    expect(getByText(/tutar girilmeli/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('yeni kaydı manual olarak yazar', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    let savedData: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        savedData = data
      },
    }
    const { getByLabelText, getByText } = render(HarcamaFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'GIDER' } })
    await fireEvent.change(getByLabelText('Kategori'), { target: { value: 'market' } })
    await fireEvent.input(getByLabelText('Açıklama'), { target: { value: 'Süpermarket' } })
    await fireEvent.input(getByLabelText('Tutar'), { target: { value: '150' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'NAKIT' } })
    await fireEvent.change(getByLabelText('Sahip'), { target: { value: 'ENIS' } })

    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))

    expect(onSaved).toHaveBeenCalled()
    const list = savedData as PersonalTx[]
    const added = list.find((r) => r.aciklama === 'Süpermarket')
    expect(added).toBeDefined()
    expect(added!.kaynak).toBe('manual')
    expect(added!.id).toMatch(/^px_[0-9a-f]{12}$/)
    expect(added!.tutar).toBe(150)
  })

  it('mevcut kaydın tutarını düzeltir', async () => {
    const editingTx: PersonalTx = {
      id: 'px_edit1',
      tarih: '2026-09-01',
      tur: 'GIDER',
      tutar: 100,
      paraBirimi: 'TRY',
      kategori: 'market',
      aciklama: 'Market Alışverişi',
      hesap: 'NAKIT',
      sahip: 'ENIS',
      taksitPlaniId: null,
      taksitNo: null,
      taksitToplam: null,
      not: '',
      kaynak: 'telegram',
      olusturulma: '2026-09-01T10:00:00Z',
    }
    const ds = {
      ...fixture,
      personalTx: [...(fixture.personalTx ?? []), editingTx],
    }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const onSaved = vi.fn()
    let savedData: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(ds),
      save: async (_n: string, data: unknown) => {
        savedData = data
      },
    }

    const { getByLabelText, getByText } = render(HarcamaFormu, {
      props: { dataset: ds, source, store, onSaved, editing: editingTx },
    })

    expect((getByLabelText('Tutar') as HTMLInputElement).value).toBe('100')
    await fireEvent.input(getByLabelText('Tutar'), { target: { value: '250' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))

    expect(onSaved).toHaveBeenCalled()
    const list = savedData as PersonalTx[]
    const updated = list.find((r) => r.id === 'px_edit1')
    expect(updated?.tutar).toBe(250)
  })

  it('taksit satırının plan bağını koparmaya izin vermez', () => {
    const instalmentRow: PersonalTx = {
      id: 'px_p4',
      tarih: '2026-10-07',
      tur: 'GIDER',
      tutar: 2000,
      paraBirimi: 'TRY',
      kategori: 'ev',
      aciklama: 'Beyaz eşya 4/6',
      hesap: 'NAKIT',
      sahip: 'ENIS',
      taksitPlaniId: 'pp_1',
      taksitNo: 4,
      taksitToplam: 6,
      not: '',
      kaynak: 'telegram',
      olusturulma: '2026-07-07T12:00:00Z',
    }
    const { container } = render(HarcamaFormu, {
      props: {
        dataset: fixture,
        source: { id: 'drive' as const, load: () => Promise.resolve(fixture), save: async () => {} },
        store: createAppStore(),
        onSaved: vi.fn(),
        editing: instalmentRow,
      },
    })

    // Plan info is rendered read-only
    expect(container.textContent).toContain('4/6')
    expect(container.textContent).toMatch(/plan.*bağ.*değiştirilemez/i)
  })

  it('verilen hesap ve tarihle açılır', () => {
    const { container } = render(HarcamaFormu, {
      dataset: fixture, hesap: 'GARANTI-DIJI', tarih: '2026-09-12', hesapKilitli: true, onSaved: vi.fn(),
    })
    expect((container.querySelector('#hf-hesap') as HTMLSelectElement).value).toBe('GARANTI-DIJI')
    expect((container.querySelector('#hf-tarih') as HTMLInputElement).value).toBe('2026-09-12')
    expect((container.querySelector('#hf-hesap') as HTMLSelectElement).disabled).toBe(true)
  })

  it('hesap kilitli değilse seçilebilir kalır', () => {
    const { container } = render(HarcamaFormu, { dataset: fixture, hesap: 'NAKIT', onSaved: vi.fn() })
    expect((container.querySelector('#hf-hesap') as HTMLSelectElement).disabled).toBe(false)
  })

  it('planlı bir kaydın tutarı "bundan sonraki tüm tekrarlar" ile değişince kural + sonraki satırlar güncellenir', async () => {
    const rule = {
      id: 'rr_1', tur: 'GIDER' as const, aciklama: 'Netflix', kategori: 'market',
      hesap: 'NAKIT', sahip: 'ENIS', paraBirimi: 'TRY' as const, tutar: 229.9,
      gunOfMonth: 5, baslangicTarihi: '2026-01-01', bitisTarihi: null, aktif: true,
      olusturulma: '', kaynak: 'manual' as const,
    }
    const oncekiAy: PersonalTx = {
      id: 'px_rr_onceki', tarih: '2026-09-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY',
      kategori: 'market', aciklama: 'Netflix', hesap: 'NAKIT', sahip: 'ENIS',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi',
    }
    const editingTx: PersonalTx = {
      ...oncekiAy, id: 'px_rr_editing', tarih: '2026-10-05',
    }
    const ds: any = {
      ...fixture,
      personalTx: [...(fixture.personalTx ?? []), oncekiAy, editingTx],
      recurringRules: [rule],
    }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const onSaved = vi.fn()
    let savedData: unknown
    const personalTxSaves: PersonalTx[][] = []
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(ds),
      save: async (n: string, data: unknown) => {
        savedData = data
        if (n === 'personal_tx') personalTxSaves.push(data as PersonalTx[])
      },
    }

    const { getByLabelText, getByText } = render(HarcamaFormu, {
      props: { dataset: ds, source, store, onSaved, editing: editingTx },
    })

    await fireEvent.input(getByLabelText('Tutar'), { target: { value: '259.90' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByLabelText('Bundan sonraki tüm tekrarlar'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))

    // confirmSave zincirinde üç ardışık `await` var (personal_tx patch, recurring_rules
    // güncellemesi, personal_tx toplu güncelleme) — tek bir `fireEvent.click` beklemesi
    // hepsinin tamamlanmasını garanti etmez, bkz. edit.test.ts'teki aynı desen.
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    // Son `source.save` çağrısı personal_tx dosyasınadır (recurring_rules güncellemesi
    // önce yazılır); px_rr_editing (düzenlenen ve düzenleme tarihinden sonraki) güncellenmeli,
    // px_rr_onceki (geçmiş) dokunulmamalı.
    const list = savedData as PersonalTx[]
    expect(list.find((r) => r.id === 'px_rr_editing')!.tutar).toBe(259.9)
    expect(list.find((r) => r.id === 'px_rr_onceki')!.tutar).toBe(229.9)

    // personal_tx iki kez yazılır (doğrudan updateRecord + toplu updateRecords), ama
    // düzenlenen satır ikinci (toplu) yazımda TEKRAR işlenmemeli — updateRecords'ın patch
    // fonksiyonu eşleşmeyen satırlar için aynı referansı döndürür, o yüzden px_rr_editing'in
    // ilk yazımdaki referansı ile son yazımdaki referansı aynı olmalı (bkz. review fix:
    // bulk predicate'e `r.id !== editing!.id` eklendi).
    expect(personalTxSaves).toHaveLength(2)
    const afterDirectUpdate = personalTxSaves[0].find((r) => r.id === 'px_rr_editing')
    const afterBulkUpdate = personalTxSaves[1].find((r) => r.id === 'px_rr_editing')
    expect(afterBulkUpdate).toBe(afterDirectUpdate)
  })
})

