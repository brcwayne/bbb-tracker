import { describe, it, expect } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/svelte'
import EkleKaydi from './EkleKaydi.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'
import type { Broker, Dataset } from '../lib/data/types'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('EkleKaydi', () => {
  it('shows 4 record-type choices, switches to the picked form area', async () => {
    const { state, store } = await v()
    const { getByText, getByLabelText } = render(EkleKaydi, {
      props: {
        dataset: state.dataset,
        view: state.derived,
        source: { id: 'local', load: () => Promise.resolve(fixture) },
        store,
      },
    })
    expect(getByText('İşlem (Al/Sat)')).toBeInTheDocument()
    expect(getByText('Nakit Hareketi')).toBeInTheDocument()
    expect(getByText('Varlık Transferi')).toBeInTheDocument()
    expect(getByText('Kurum Ekle')).toBeInTheDocument()
    // Task 14 replaced the last remaining placeholder ('kurum') with a real KurumFormu, so
    // there is no placeholder kind left to retarget this check to (unlike Task 11/12/13, which
    // each retargeted it to the next still-placeholder kind). KurumFormu's own behaviour
    // (validation, save) is covered by KurumFormu.test.ts, so this generic picker test is
    // rewritten to assert that clicking 'Kurum Ekle' renders the real form's content (its
    // 'Kod' field), proving the picker wiring — not a placeholder string.
    await fireEvent.click(getByText('Kurum Ekle'))
    expect(getByLabelText('Kod')).toBeInTheDocument()
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(EkleKaydi, { props: {} })
    expect(getByText('Ekle')).toBeInTheDocument()
  })

  it('shows a green success message after a form saves, and clears it on the next pick', async () => {
    const { state, store } = await v()
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {},
    }
    const { getByText, getByLabelText, queryByText } = render(EkleKaydi, {
      props: { dataset: state.dataset, view: state.derived, source, store },
    })
    await fireEvent.click(getByText('Kurum Ekle'))
    await fireEvent.input(getByLabelText('Kod'), { target: { value: 'YENIKURUM' } })
    await fireEvent.input(getByLabelText('Ad'), { target: { value: 'Yeni Kurum A.Ş.' } })
    await fireEvent.input(getByLabelText('Tür'), { target: { value: 'banka' } })
    await fireEvent.input(getByLabelText('Sahip'), { target: { value: 'ENIS' } })
    await fireEvent.click(getByText('İncele'))
    await fireEvent.click(getByText('Onayla ve Kaydet'))
    await waitFor(() => expect(getByText('Kayıt başarıyla eklendi.')).toBeInTheDocument())
    // Picking a new record type clears the confirmation instead of leaving it stale.
    await fireEvent.click(getByText('İşlem (Al/Sat)'))
    expect(queryByText('Kayıt başarıyla eklendi.')).not.toBeInTheDocument()
  })
})

describe('EkleKaydi manage lists', () => {
  it('lists only manual transactions and hides migration rows', async () => {
    const editingTxn = { ...fixture.transactions[0], id: 't_manual', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, editingTxn] }
    const { state, store } = await (async () => {
      const s = createAppStore()
      await load(s, { id: 'local', load: () => Promise.resolve(ds) })
      return { state: get(s), store: s }
    })()
    const source = { id: 'local' as const, load: () => Promise.resolve(ds) }
    const { getByText, getAllByText } = render(EkleKaydi, {
      props: { dataset: state.dataset, view: state.derived, source, store },
    })
    await fireEvent.click(getByText('İşlemlerim'))
    // Only the manual clone renders — the original migration row (t_a, same shape) does not.
    expect(getAllByText(/AL ASTOR · 100 lot/)).toHaveLength(1)
  })

  it('calls deleteRecord after the two-step confirm', async () => {
    const editingTxn = { ...fixture.transactions[0], id: 't_manual', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, editingTxn] }
    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(s)
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByText, queryByText, rerender } = render(EkleKaydi, {
      props: { dataset: state.dataset, view: state.derived, source, store: s },
    })
    await fireEvent.click(getByText('İşlemlerim'))
    await fireEvent.click(getByText('Sil'))
    expect(getByText(/kalıcı olarak silinsin mi/)).toBeInTheDocument()
    await fireEvent.click(getByText('Evet, sil'))
    await waitFor(() => expect(getByText('Kayıt silindi.')).toBeInTheDocument())
    expect(get(s).dataset?.transactions.some((t) => t.id === 't_manual')).toBe(false)
    // The component only re-renders its manual-record rows when its `dataset` prop is
    // refreshed (as App.svelte does reactively via `$store.dataset`) — mirror that here.
    await rerender({ dataset: get(s).dataset, view: get(s).derived, source, store: s })
    expect(queryByText(/AL ASTOR · 100 lot/)).not.toBeInTheDocument()
  })

  it('opens the İşlem form pre-filled when Düzenle is clicked', async () => {
    const editingTxn = { ...fixture.transactions[0], id: 't_manual', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, editingTxn] }
    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(s)
    const source = { id: 'local' as const, load: () => Promise.resolve(ds) }
    const { getByText, getByLabelText } = render(EkleKaydi, {
      props: { dataset: state.dataset, view: state.derived, source, store: s },
    })
    await fireEvent.click(getByText('İşlemlerim'))
    await fireEvent.click(getByText('Düzenle'))
    expect((getByLabelText('Lot') as HTMLInputElement).value).toBe('100')
    await fireEvent.click(getByText('İncele'))
    expect(getByText('Onayla ve Güncelle')).toBeInTheDocument()
  })

  it('rejects deleting a transaction that would oversell a later SAT, and does not delete it', async () => {
    // Minimal two-transaction dataset: editingTxn is a manual clone of t_a (AL 100 ASTOR),
    // satTxn is the real t_c (SAT 50 ASTOR). Baseline (AL 100, SAT 50) has zero derivePositions
    // errors. Deleting the AL entirely leaves SAT 50 with nothing to sell — a genuine oversell,
    // so prospectiveErrors (1) > baselineErrors (0) and the delete must be blocked.
    const editingTxn = { ...fixture.transactions.find((t) => t.id === 't_a')!, id: 't_manual', kaynak: 'manual' }
    const satTxn = fixture.transactions.find((t) => t.id === 't_c')!
    const ds = { ...fixture, transactions: [editingTxn, satTxn] }
    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(s)
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByText } = render(EkleKaydi, {
      props: { dataset: state.dataset, view: state.derived, source, store: s },
    })
    await fireEvent.click(getByText('İşlemlerim'))
    await fireEvent.click(getByText('Sil'))
    await fireEvent.click(getByText('Evet, sil'))
    await waitFor(() => expect(getByText(/daha sonraki bir satış geçersiz hale gelir/i)).toBeInTheDocument())
    expect(get(s).dataset?.transactions.some((t) => t.id === 't_manual')).toBe(true)
  })
})

describe('EkleKaydi broker delete referential guard', () => {
  it('blocks deleting a broker referenced by a transaction, and keeps the broker', async () => {
    const manualBroker: Broker = { kod: 'YENIKURUM', ad: 'Yeni Kurum', tur: 'BROKER', sahip: 'Enis', aktif: true, kaynak: 'manual' }
    const refTxn = { ...fixture.transactions[0], id: 't_ref', hesap: 'YENIKURUM', kaynak: 'manual' }
    const ds: Dataset = {
      ...fixture,
      brokers: [...fixture.brokers, manualBroker],
      transactions: [...fixture.transactions, refTxn],
    }
    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const state = get(s)
    const source = { id: 'drive' as const, load: () => Promise.resolve(ds), save: async () => {} }
    const { getByText } = render(EkleKaydi, {
      props: { dataset: state.dataset, view: state.derived, source, store: s },
    })
    await fireEvent.click(getByText('Kurumlarım'))
    await fireEvent.click(getByText('Sil'))
    await fireEvent.click(getByText('Evet, sil'))
    await waitFor(() =>
      expect(getByText(/işlem, nakit hareketi veya transfer kayıtlarında kullanılıyor/i)).toBeInTheDocument(),
    )
    expect(get(s).dataset?.brokers.some((b) => b.kod === 'YENIKURUM')).toBe(true)
  })
})
