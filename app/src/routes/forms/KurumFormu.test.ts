import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import KurumFormu from './KurumFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('KurumFormu', () => {
  it('rejects a duplicate kod', async () => {
    const { state, store } = await v()
    const onSaved = vi.fn()
    const existingKod = state.dataset!.brokers[0].kod
    const source = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    const { getByLabelText, getByText } = render(KurumFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.input(getByLabelText('Kod'), { target: { value: existingKod } })
    await fireEvent.input(getByLabelText('Ad'), { target: { value: 'Test Kurum' } })
    await fireEvent.input(getByLabelText('Tür'), { target: { value: 'banka' } })
    await fireEvent.input(getByLabelText('Sahip'), { target: { value: 'ENIS' } })
    await fireEvent.click(getByText('İncele'))
    expect(getByText(/bu kod zaten kullanılıyor/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves a new broker to the brokers file', async () => {
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
    const { getByLabelText, getByText } = render(KurumFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })
    await fireEvent.input(getByLabelText('Kod'), { target: { value: 'YENIKURUM' } })
    await fireEvent.input(getByLabelText('Ad'), { target: { value: 'Yeni Kurum A.Ş.' } })
    await fireEvent.input(getByLabelText('Tür'), { target: { value: 'aracı kurum' } })
    await fireEvent.input(getByLabelText('Sahip'), { target: { value: 'ORTAK' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    expect(onSaved).toHaveBeenCalled()
    expect(
      (saved as any[])?.some(
        (b) =>
          b.kod === 'YENIKURUM' &&
          b.ad === 'Yeni Kurum A.Ş.' &&
          b.tur === 'aracı kurum' &&
          b.sahip === 'ORTAK' &&
          b.aktif === true,
      ),
    ).toBe(true)
    const record = get(store).dataset?.brokers.find((b) => b.kod === 'YENIKURUM')
    expect(record).toEqual({
      kod: 'YENIKURUM',
      ad: 'Yeni Kurum A.Ş.',
      tur: 'aracı kurum',
      sahip: 'ORTAK',
      aktif: true,
      kaynak: 'manual',
    })
  })
})

describe('KurumFormu edit mode', () => {
  it('pre-fills fields, keeps kod read-only, and updates the record on confirm', async () => {
    const editingBroker = { kod: 'B_MANUAL', ad: 'Eski Ad', tur: 'yerli', sahip: 'Enis', aktif: true, kaynak: 'manual' }
    const ds = { ...fixture, brokers: [...fixture.brokers, editingBroker] }
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(store)
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByLabelText, getByText } = render(KurumFormu, {
      props: { dataset: state.dataset!, source, store, onSaved, editing: editingBroker },
    })
    const kodInput = getByLabelText('Kod') as HTMLInputElement
    expect(kodInput.value).toBe('B_MANUAL')
    expect(kodInput.readOnly).toBe(true)

    await fireEvent.input(getByLabelText('Ad'), { target: { value: 'Yeni Ad' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Güncelle'))

    expect(onSaved).toHaveBeenCalled()
    const updated = get(store).dataset?.brokers.find((b) => b.kod === 'B_MANUAL')
    expect(updated?.ad).toBe('Yeni Ad')
  })
})
