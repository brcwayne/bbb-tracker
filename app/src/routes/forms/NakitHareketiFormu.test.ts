import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import NakitHareketiFormu from './NakitHareketiFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'

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
