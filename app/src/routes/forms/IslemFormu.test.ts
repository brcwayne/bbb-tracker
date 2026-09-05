import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import IslemFormu from './IslemFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
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
