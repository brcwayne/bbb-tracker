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
