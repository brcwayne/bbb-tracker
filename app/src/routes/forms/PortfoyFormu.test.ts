import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import PortfoyFormu from './PortfoyFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('PortfoyFormu', () => {
  it('rejects an empty kod', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(PortfoyFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.input(getByLabelText('Portföy Kodu'), { target: { value: '' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/portföy kodu zorunludur/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('rejects a duplicate kod', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const existingKod = state.dataset!.portfolios[0].kod
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(PortfoyFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.input(getByLabelText('Portföy Kodu'), { target: { value: existingKod } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/bu portföy kodu zaten kullanılıyor/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves a new portfolio and updates the store', async () => {
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
    const { getByLabelText, getByText } = render(PortfoyFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.input(getByLabelText('Portföy Kodu'), { target: { value: 'TEMETTU' } })
    await fireEvent.input(getByLabelText('Portföy Adı'), { target: { value: 'Temettü Portföyü' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    expect(
      (saved as any[])?.some(
        (p) => p.kod === 'TEMETTU' && p.ad === 'Temettü Portföyü' && p.aktif === true,
      ),
    ).toBe(true)
    expect(
      get(store).dataset?.portfolios.some(
        (p) => p.kod === 'TEMETTU' && p.ad === 'Temettü Portföyü' && p.aktif === true,
      ),
    ).toBe(true)
  })
})
