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
  it('lists every transaction newest → oldest', async () => {
    const { state, store } = await v()
    const { getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    const rows = getAllByRole('row')
    expect(rows).toHaveLength(1 + fixture.transactions.length) // header + 7
    // fixture newest is t_g (2025-01-02); oldest is t_d (2019-07-01)
    expect(rows[1].textContent).toContain('2025')
    expect(rows[rows.length - 1].textContent).toContain('2019')
  })

  it('shows each row net total in ₺ and $ with the day rate', async () => {
    const { state, store } = await v()
    const { getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    // newest row = t_g: net_usd 450, kur 35 → $450.00 / ₺15.750,00 / kur 35,00
    const first = getAllByRole('row')[1].textContent ?? ''
    expect(first).toContain('$450.00')
    expect(first).toContain('₺15.750,00')
    expect(first).toContain('kur 35,00')
  })

  it('filters by kurum', async () => {
    const { state, store } = await v()
    const { getByLabelText, getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    // fixture: 3 GARAN? no — t_f is GARAN, the rest MIDAS/KASA. Pick MIDAS (t_a,t_b,t_c → 3 rows).
    await fireEvent.change(getByLabelText('Kurum'), { target: { value: 'MIDAS' } })
    const rows = getAllByRole('row')
    expect(rows).toHaveLength(1 + 3)
    expect(rows.slice(1).every((r) => r.textContent?.includes('MIDAS'))).toBe(true)
  })

  it('migration rows keep a 🔒 marker but still expose edit/delete', async () => {
    const manual = { ...fixture.transactions[0], id: 't_manual', tarih: '2026-01-01', kaynak: 'manual' }
    const ds = { ...fixture, transactions: [...fixture.transactions, manual] }
    const { state, store } = await v(ds)
    const { getAllByRole, getAllByLabelText } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(ds) }, store },
    })
    // 🔒 appears for every migration row (7 of them), not the manual one
    const rows = getAllByRole('row')
    const lockCount = rows.filter((r) => r.textContent?.includes('🔒')).length
    expect(lockCount).toBe(fixture.transactions.length)
    // every row — migration included — now has an edit control
    expect(getAllByLabelText('Düzenle')).toHaveLength(fixture.transactions.length + 1)
  })

  it('editing a migration row shows the divergence warning', async () => {
    const { state, store } = await v()
    const { getAllByLabelText, getByText, queryByText } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    expect(queryByText(/Excel'deki geçmiş veriden kalıcı olarak ayrışır/)).toBeNull()
    await fireEvent.click(getAllByLabelText('Düzenle')[0])
    expect(getByText(/Excel'deki geçmiş veriden kalıcı olarak ayrışır/)).toBeInTheDocument()
  })

  it('clicking the edit icon opens the İşlem form pre-filled', async () => {
    const manual = { ...fixture.transactions[0], id: 't_manual', tarih: '2026-01-01', kaynak: 'manual', lot: 42 }
    const ds = { ...fixture, transactions: [manual, ...fixture.transactions] }
    const { state, store } = await v(ds)
    const { getAllByLabelText, getByLabelText } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(ds) }, store },
    })
    // manual row is dated 2026-01-01 → newest → first edit button
    await fireEvent.click(getAllByLabelText('Düzenle')[0])
    expect((getByLabelText('Lot') as HTMLInputElement).value).toBe('42')
  })

  it('shows realized K/Z on SAT rows and — on AL rows', async () => {
    const { state, store } = await v()
    const { getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    const rows = getAllByRole('row')
    // Find ASTOR SAT row (t_c: realized +$175.00, +233.3%)
    const satAstor = rows.find(
      (r) => r.textContent?.includes('ASTOR') && r.querySelector('td:nth-child(2)')?.textContent === 'SAT',
    )
    expect(satAstor).toBeDefined()
    expect(satAstor?.textContent).toContain('+$175.00')
    expect(satAstor?.textContent).toContain('233.3%')

    // Find ASTOR AL row (t_a / t_b: AL rows have — in K/Z cell)
    const alAstor = rows.find(
      (r) => r.textContent?.includes('ASTOR') && r.querySelector('td:nth-child(2)')?.textContent === 'AL',
    )
    expect(alAstor).toBeDefined()
    expect(alAstor?.querySelector('.kz-cell')?.textContent).toContain('—')
  })

  it('filters table to only sales when Sadece satışlar is checked', async () => {
    const { state, store } = await v()
    const { getByLabelText, getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(fixture) }, store },
    })
    // Initially 1 header + 7 rows
    expect(getAllByRole('row')).toHaveLength(8)

    const checkbox = getByLabelText('Sadece satışlar')
    await fireEvent.click(checkbox)

    // In fixture, there are 2 SAT transactions (t_c, t_e)
    const salesRows = getAllByRole('row')
    expect(salesRows).toHaveLength(1 + 2)
    expect(salesRows.slice(1).every((r) => r.querySelector('td:nth-child(2)')?.textContent === 'SAT')).toBe(true)
    expect(salesRows.slice(1).some((r) => r.querySelector('td:nth-child(2)')?.textContent === 'AL')).toBe(false)
  })

  it('displays K/Z even when a sale is cropped due to oversell', async () => {
    // In fixture, ASTOR has 200 lot bought. t_c sells 50 -> 150 open.
    // Add an oversell transaction of 200 lot ASTOR (only 150 available).
    const oversellTx: (typeof fixture.transactions)[0] = {
      ...fixture.transactions[2],
      id: 't_oversell',
      tarih: '2026-06-01',
      lot: 200,
      fiyat_usd: 10,
      brut_usd: 2000,
      net_usd: 2000,
      komisyon_usd: 0,
    }
    const ds = { ...fixture, transactions: [...fixture.transactions, oversellTx] }
    const { state, store } = await v(ds)
    const { getAllByRole } = render(Log, {
      props: { dataset: state.dataset, view: state.derived, source: { id: 'local', load: () => Promise.resolve(ds) }, store },
    })
    const rows = getAllByRole('row')
    const overRow = rows.find((r) => r.textContent?.includes('2026') && r.textContent?.includes('ASTOR'))
    expect(overRow).toBeDefined()
    // Cropped lot = 150 lot sold @ avg cost 1.5 -> cost $225, revenue 150 * 10 = $1500 -> K/Z +$1,275.00
    expect(overRow?.querySelector('.kz-cell')?.textContent).toContain('+$1,275.00')
  })
})
