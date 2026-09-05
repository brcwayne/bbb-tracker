import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import IslemFormu from './IslemFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load, updateRecord } from '../../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('IslemFormu', () => {
  it('rejects a SAT beyond the open lot', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(IslemFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved },
    })
    await fireEvent.change(getByLabelText('Yön'), { target: { value: 'SAT' } })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '999999' } })
    await fireEvent.input(getByLabelText('Fiyat (USD)'), { target: { value: '10' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/açık pozisyondan fazla/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves a valid AL after confirm and updates the real store', async () => {
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
    const { getByLabelText, getByText } = render(IslemFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved },
    })
    await fireEvent.change(getByLabelText('Yön'), { target: { value: 'AL' } })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '5' } })
    await fireEvent.input(getByLabelText('Fiyat (USD)'), { target: { value: '10' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    expect((saved as any[])?.some((t) => t.enstruman === 'THYAO' && t.yon === 'AL')).toBe(true)
    expect(get(store).dataset?.transactions.some((t) => t.enstruman === 'THYAO' && t.yon === 'AL')).toBe(true)
  })
})

describe('IslemFormu edit mode', () => {
  it('pre-fills fields from editing and updates the record on confirm', async () => {
    const editingTxn = { ...fixture.transactions[0], id: 't_manual', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, editingTxn] }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(store)
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByLabelText, getByText } = render(IslemFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved, editing: editingTxn },
    })
    expect((getByLabelText('Lot') as HTMLInputElement).value).toBe(String(editingTxn.lot))
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '7' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))
    expect(onSaved).toHaveBeenCalled()
    expect(get(store).dataset?.transactions.find((t) => t.id === 't_manual')?.lot).toBe(7)
  })

  it('excludes the record being edited from the SAT lot-availability check', async () => {
    // t_a(AL 100) + t_b(AL 100) - t_c(SAT 50, migration) = 150 open once the edited clone of t_c is excluded
    // from the check. Without the exclusion, view.positions.open (which counts BOTH the original t_c and this
    // manual clone) would show only 100 open, and raising the clone's lot to 120 would be wrongly rejected.
    const editingTxn = { ...fixture.transactions.find((t) => t.id === 't_c')!, id: 't_manual', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, editingTxn] }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(store)
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByLabelText, getByText, queryByText } = render(IslemFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved: vi.fn(), editing: editingTxn },
    })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '120' } })
    await fireEvent.click(getByText('İncele'))
    expect(queryByText(/açık pozisyondan fazla/i)).toBeNull()
  })

  it('rejects a future date', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const state = get(store)
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(IslemFormu, {
      props: { dataset: state.dataset!, view: state.derived!, source, store, onSaved: vi.fn() },
    })
    await fireEvent.change(getByLabelText('Enstrüman'), { target: { value: 'THYAO' } })
    await fireEvent.change(getByLabelText('Hesap'), { target: { value: 'GARAN' } })
    await fireEvent.change(getByLabelText('Portföy'), { target: { value: 'ENIS' } })
    await fireEvent.input(getByLabelText('Lot'), { target: { value: '1' } })
    await fireEvent.input(getByLabelText('Fiyat (USD)'), { target: { value: '1' } })
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await fireEvent.input(getByLabelText('Tarih'), { target: { value: future } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText('Tarih gelecekte olamaz.')).toBeInTheDocument()
  })
})
