import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import NakitHareketiFormu from './NakitHareketiFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'
import { settings } from '../../lib/settings.svelte'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('NakitHareketiFormu', () => {
  it('requires hedefHesap when tur is TRANSFER and rejects same-account transfer', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText, queryByLabelText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    expect(queryByLabelText('Hedef Hesap')).not.toBeInTheDocument()

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'TRANSFER' } })
    expect(getByLabelText('Hedef Hesap')).toBeInTheDocument()

    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '100' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/hedef hesap seçilmeli/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/aynı hesaba transfer yapılamaz/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves a YATIRMA record and updates the real store', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'YATIRMA' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '250' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    expect((saved as any[])?.some((c) => c.tur === 'YATIRMA' && c.hesap === 'GARAN' && c.tutar_usd === 250)).toBe(
      true,
    )
    expect(
      get(store).dataset?.cashflows.some((c) => c.tur === 'YATIRMA' && c.hesap === 'GARAN' && c.tutar_usd === 250),
    ).toBe(true)
  })

  it('saves a TL-denominated CEKME with tutar_tl set and tutar_usd converted', async () => {
    const { state, store } = await v()
    const rate = state.dataset!.fxrates[Object.keys(state.dataset!.fxrates).sort().reverse()[0]]
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'CEKME' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Para Birimi'), { target: { value: 'TL' } })
    await fireEvent.input(getByLabelText('Tutar (TL)'), { target: { value: '1000' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    const record = (saved as any[])?.find((c) => c.tur === 'CEKME' && c.hesap === 'GARAN')
    expect(record.tutar_tl).toBe(1000)
    expect(record.kur).toBe(rate)
    expect(record.tutar_usd).toBeCloseTo(1000 / rate, 6)
  })
})

describe('NakitHareketiFormu edit mode', () => {
  it('pre-fills fields from editing and updates the record on confirm', async () => {
    const editingFlow = { ...fixture.cashflows[0], id: 'c_manual', kaynak: 'manual', aciklama: 'eski açıklama' }
    const ds = { ...fixture, cashflows: [...fixture.cashflows, editingFlow] }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(store)
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved, editing: editingFlow },
    })
    expect((getByLabelText('Açıklama') as HTMLInputElement).value).toBe('eski açıklama')
    await fireEvent.input(getByLabelText('Açıklama'), { target: { value: 'yeni açıklama' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))
    expect(onSaved).toHaveBeenCalled()
    expect(get(store).dataset?.cashflows.find((c) => c.id === 'c_manual')?.aciklama).toBe('yeni açıklama')
  })

  it('rejects a future date', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const state = get(store)
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved: vi.fn() },
    })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '10' } })
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await fireEvent.input(getByLabelText('Tarih'), { target: { value: future } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText('Tarih gelecekte olamaz.')).toBeInTheDocument()
  })
})

describe('NakitHareketiFormu kurumlar arası farklı para birimi transferi', () => {
  it('"Hedef para birimi farklı" kapalıyken kaydedilen TRANSFER satırı bugünküyle birebir aynıdır (regresyon)', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText, queryByLabelText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'TRANSFER' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Para Birimi'), { target: { value: 'USD' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '200' } })

    const toggle = getByLabelText('Hedef para birimi farklı') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    expect(queryByLabelText('Hedef Para Birimi')).not.toBeInTheDocument()
    expect(queryByLabelText('Kur')).not.toBeInTheDocument()

    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))

    expect(onSaved).toHaveBeenCalled()
    const record = (saved as any[])?.find((c) => c.tur === 'TRANSFER' && c.hesap === 'MIDAS' && c.tutar_usd === 200)
    expect(record).toBeDefined()
    expect(record.hedefHesap).toBe('GARAN')
    expect(record.tutar_tl).toBeNull()
    expect(record.hedefTutarTl).toBeUndefined()
    expect(record.hedefTutarUsd).toBeUndefined()
  })

  it('açıkken: hedef para birimi seçilince kur alanı görünüyor, settings.rate ile dolu ve çift yönlü hesaplama çalışıyor', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'TRANSFER' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Para Birimi'), { target: { value: 'USD' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '100' } })

    const toggle = getByLabelText('Hedef para birimi farklı')
    await fireEvent.click(toggle)

    // Hedef para birimi varsayılan TL (kaynak USD olduğu için)
    const hedefParaBirimiSelect = getByLabelText('Hedef Para Birimi') as HTMLSelectElement
    expect(hedefParaBirimiSelect.value).toBe('TL')

    const kurInput = getByLabelText('Kur') as HTMLInputElement
    expect(kurInput).toBeInTheDocument()
    expect(Number(kurInput.value)).toBe(settings.rate)

    const hedefTutarInput = getByLabelText('Hedef Tutar (TL)') as HTMLInputElement
    expect(hedefTutarInput).toBeInTheDocument()
    expect(Number(hedefTutarInput.value)).toBeCloseTo(100 * settings.rate, 2)

    // Kur değişince hedef tutar otomatik güncellenir
    await fireEvent.input(kurInput, { target: { value: '40' } })
    expect(Number(hedefTutarInput.value)).toBe(4000)

    // Hedef tutar elle değiştirilince kur güncellenir (5000 / 100 = 50)
    await fireEvent.input(hedefTutarInput, { target: { value: '5000' } })
    expect(Number(kurInput.value)).toBe(50)

    await fireEvent.click(getByText('İncele'))
    expect(getByText(/MIDAS → GARAN · 100 USD → 5000 TL/)).toBeInTheDocument()

    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()

    const record = (saved as any[])?.find((c) => c.tur === 'TRANSFER' && c.hesap === 'MIDAS' && c.hedefTutarTl === 5000)
    expect(record).toBeDefined()
    expect(record.hedefHesap).toBe('GARAN')
    expect(record.tutar_usd).toBe(100)
    expect(record.tutar_tl).toBeNull()
    expect(record.kur).toBe(50)
    expect(record.hedefTutarTl).toBe(5000)
    expect(record.hedefTutarUsd).toBe(100) // 5000 / 50 = 100
  })

  it('TL -> USD farklı para birimi transferini doğru kaydeder', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'TRANSFER' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.change(getByLabelText('Para Birimi'), { target: { value: 'TL' } })
    await fireEvent.input(getByLabelText('Tutar (TL)'), { target: { value: '4000' } })

    const toggle = getByLabelText('Hedef para birimi farklı')
    await fireEvent.click(toggle)

    const hedefParaBirimiSelect = getByLabelText('Hedef Para Birimi') as HTMLSelectElement
    expect(hedefParaBirimiSelect.value).toBe('USD')

    const kurInput = getByLabelText('Kur') as HTMLInputElement
    await fireEvent.input(kurInput, { target: { value: '40' } })

    const hedefTutarInput = getByLabelText('Hedef Tutar (USD)') as HTMLInputElement
    expect(Number(hedefTutarInput.value)).toBe(100)

    await fireEvent.click(getByText('İncele'))
    expect(getByText(/GARAN → MIDAS · 4000 TL → 100 USD/)).toBeInTheDocument()

    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()

    const record = (saved as any[])?.find((c) => c.tur === 'TRANSFER' && c.hesap === 'GARAN')
    expect(record).toBeDefined()
    expect(record.hedefHesap).toBe('MIDAS')
    expect(record.tutar_tl).toBe(4000)
    expect(record.kur).toBe(40)
    expect(record.tutar_usd).toBe(100)
    expect(record.hedefTutarUsd).toBe(100)
    expect(record.hedefTutarTl).toBeNull()
  })

  it('aynı para birimi seçilse bile (toggle açıkken) kur alanı gizlenir ve hedef tutar kaynakla eşitlenir', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    let saved: unknown
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_n: string, data: unknown) => {
        saved = data
      },
    }
    const { getByLabelText, getByText, queryByLabelText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'TRANSFER' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Para Birimi'), { target: { value: 'USD' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '150' } })

    await fireEvent.click(getByLabelText('Hedef para birimi farklı'))
    // Kullanıcı hedef para birimini kaynakla aynı (USD) seçerse:
    await fireEvent.change(getByLabelText('Hedef Para Birimi'), { target: { value: 'USD' } })

    // Kur alanı gizlenmeli
    expect(queryByLabelText('Kur')).not.toBeInTheDocument()

    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()

    const record = (saved as any[])?.find(
      (c) => c.tur === 'TRANSFER' && c.hesap === 'MIDAS' && c.tutar_usd === 150,
    )
    expect(record).toBeDefined()
    expect(record.hedefTutarTl).toBeUndefined()
    expect(record.hedefTutarUsd).toBeUndefined()
  })

  it('doğrulama: hedef para birimi farklıyken hedef tutar veya kur boş/<=0 ise hata verir', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.change(getByLabelText('Tür'), { target: { value: 'TRANSFER' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Para Birimi'), { target: { value: 'USD' } })
    await fireEvent.input(getByLabelText('Tutar (USD)'), { target: { value: '100' } })

    await fireEvent.click(getByLabelText('Hedef para birimi farklı'))

    const kurInput = getByLabelText('Kur')
    await fireEvent.input(kurInput, { target: { value: '0' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/hedef tutar ve kur girilmeli|tüm alanları doldurun/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    await fireEvent.input(kurInput, { target: { value: '40' } })
    const hedefTutarInput = getByLabelText('Hedef Tutar (TL)')
    await fireEvent.input(hedefTutarInput, { target: { value: '0' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/hedef tutar ve kur girilmeli|tüm alanları doldurun/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('düzenleme modunda farklı para birimi transfer kaydını doğru önceden doldurur', async () => {
    const editingFlow = {
      id: 'c_edit_xfer',
      tarih: '2026-03-01',
      hesap: 'MIDAS',
      portfoy: null,
      tur: 'TRANSFER' as const,
      enstruman: null,
      tutar_tl: null,
      tutar_usd: 200,
      kur: 40,
      aciklama: 'eski transfer',
      kaynak: 'manual',
      hedefHesap: 'GARAN',
      hedefTutarTl: 8000,
      hedefTutarUsd: 200,
    }
    const ds = { ...fixture, cashflows: [...fixture.cashflows, editingFlow] }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(store)
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }

    const { getByLabelText, getByText } = render(NakitHareketiFormu, {
      props: { dataset: state.dataset!, source, store, onSaved, editing: editingFlow },
    })

    const toggle = getByLabelText('Hedef para birimi farklı') as HTMLInputElement
    expect(toggle.checked).toBe(true)

    const hedefParaBirimi = getByLabelText('Hedef Para Birimi') as HTMLSelectElement
    expect(hedefParaBirimi.value).toBe('TL')

    const kurInput = getByLabelText('Kur') as HTMLInputElement
    expect(kurInput.value).toBe('40')

    const hedefTutarInput = getByLabelText('Hedef Tutar (TL)') as HTMLInputElement
    expect(hedefTutarInput.value).toBe('8000')

    await fireEvent.input(hedefTutarInput, { target: { value: '8800' } })
    expect(Number(kurInput.value)).toBe(44)

    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))
    expect(onSaved).toHaveBeenCalled()

    const updated = get(store).dataset?.cashflows.find((c) => c.id === 'c_edit_xfer')
    expect(updated?.hedefTutarTl).toBe(8800)
    expect(updated?.kur).toBe(44)
    expect(updated?.hedefTutarUsd).toBe(200)
  })
})
