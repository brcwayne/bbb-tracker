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
})

