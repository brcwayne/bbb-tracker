import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Log from './Log.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v(ds = fixture) {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(ds) })
  return { state: get(s), store: s }
}

describe('Log', () => {
  it('lists every transaction oldest → newest', async () => {
    const { state, store } = await v()
    const { getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    const rows = getAllByRole('row')
    expect(rows).toHaveLength(1 + fixture.transactions.length) // header + 7
    // fixture oldest is t_d (2019-07-01, XAU AL); newest is t_g (2025-01-02, XAU AL)
    expect(rows[1].textContent).toContain('2019')
    expect(rows[rows.length - 1].textContent).toContain('2025')
  })

  it('migration rows are locked; manual rows get edit/delete icons', async () => {
    const manual = { ...fixture.transactions[0], id: 't_manual', tarih: '2026-01-01', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, manual] }
    const { state, store } = await v(ds)
    const { getAllByRole, getByLabelText } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(ds) }, store },
    })
    // 🔒 appears for every migration row (7 of them)
    const rows = getAllByRole('row')
    const lockCount = rows.filter((r) => r.textContent?.includes('🔒')).length
    expect(lockCount).toBe(fixture.transactions.length)
    // the manual row exposes an edit button
    expect(getByLabelText('Düzenle')).toBeInTheDocument()
  })

  it('clicking the edit icon opens the İşlem form pre-filled', async () => {
    const manual = { ...fixture.transactions[0], id: 't_manual', tarih: '2026-01-01', kaynak: 'manual', lot: 42 }
    const ds = { ...fixture, transactions: [...fixture.transactions, manual] }
    const { state, store } = await v(ds)
    const { getByLabelText } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(ds) }, store },
    })
    await fireEvent.click(getByLabelText('Düzenle'))
    expect((getByLabelText('Lot') as HTMLInputElement).value).toBe('42')
  })
})
