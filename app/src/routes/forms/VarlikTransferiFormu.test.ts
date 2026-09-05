import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import VarlikTransferiFormu from './VarlikTransferiFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('VarlikTransferiFormu', () => {
  it('rejects a transfer exceeding the total open lot for the instrument', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(VarlikTransferiFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved },
    })
    // THYAO has an open lot of 25 in the fixture.
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Kaynak Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '999999' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/açık pozisyondan \(25\) fazla/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('rejects when source and target are identical (both hesap and portfoy unchanged)', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(VarlikTransferiFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved },
    })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Kaynak Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Kaynak Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.change(getByLabelText('Hedef Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '5' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/kaynak ve hedef aynı/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves a valid transfer to the assetTransfers file', async () => {
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
    const { getByLabelText, getByText } = render(VarlikTransferiFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved },
    })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Kaynak Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.change(getByLabelText('Kaynak Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '5' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    expect(
      (saved as any[])?.some(
        (t) => t.enstruman === 'THYAO' && t.kaynakHesap === 'GARAN' && t.hedefHesap === 'MIDAS' && t.lot === 5,
      ),
    ).toBe(true)
    expect(
      get(store).dataset?.assetTransfers.some(
        (t) => t.enstruman === 'THYAO' && t.kaynakHesap === 'GARAN' && t.hedefHesap === 'MIDAS' && t.lot === 5,
      ),
    ).toBe(true)
    // Load-bearing: this record must never land in transactions (P2-2).
    expect(get(store).dataset?.transactions.some((t) => (t as any).kaynakHesap === 'GARAN')).toBe(false)
    // hedefPortfoy was left unselected — must be stored as null, not ''.
    const record = get(store).dataset?.assetTransfers.find((t) => t.kaynakHesap === 'GARAN' && t.hedefHesap === 'MIDAS')
    expect(record?.hedefPortfoy).toBeNull()
    // Load-bearing for cashBalanceByHesap's migration-vs-manual filtering.
    expect(record?.kaynak).toBe('manual')
  })
})

describe('VarlikTransferiFormu edit mode', () => {
  it('pre-fills fields from editing and updates the record on confirm', async () => {
    const editingTransfer = {
      id: 'at_manual', tarih: '2026-01-08', enstruman: 'THYAO', lot: 5,
      kaynakHesap: 'GARAN', hedefHesap: 'MIDAS', kaynakPortfoy: 'ENIS', hedefPortfoy: null,
      aciklama: 'eski açıklama', kaynak: 'manual',
    }
    const ds = { ...fixture, assetTransfers: [editingTransfer] }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(store)
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByLabelText, getByText } = render(VarlikTransferiFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved, editing: editingTransfer },
    })
    expect((getByLabelText('Açıklama') as HTMLInputElement).value).toBe('eski açıklama')
    await fireEvent.input(getByLabelText('Açıklama'), { target: { value: 'yeni açıklama' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))
    expect(onSaved).toHaveBeenCalled()
    expect(get(store).dataset?.assetTransfers.find((a) => a.id === 'at_manual')?.aciklama).toBe('yeni açıklama')
  })

  it('rejects a future date', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const state = get(store)
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(VarlikTransferiFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved: vi.fn() },
    })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Kaynak Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Hedef Hesap'), { target: { value: 'MIDAS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '5' } })
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await fireEvent.input(getByLabelText('Tarih'), { target: { value: future } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText('Tarih gelecekte olamaz.')).toBeInTheDocument()
  })
})
