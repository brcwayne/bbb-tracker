import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Kurumlar from './Kurumlar.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get, writable } from 'svelte/store'
import type { AppState } from '../lib/data/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Kurumlar', () => {
  it('shows a panel per broker; empty brokers say so', async () => {
    const d = await v()
    const { getByRole, container } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
    expect(getByRole('heading', { name: 'Midas' })).toBeInTheDocument()
    expect(getByRole('heading', { name: 'Garanti Yatırım' })).toBeInTheDocument()
    // fixture: MIDAS holds ASTOR, GARAN holds THYAO, KASA holds XAU
    expect(container.textContent).toContain('ASTOR')
    expect(container.textContent).toContain('"Ekle" sekmesini kullanın')
  })

  it('shows a cash balance for each broker', async () => {
    const d = await v()
    const { container } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
    expect(container.textContent).toContain('Nakit')
  })

  it('disables the Nakit Düzelt button on a non-Drive source', async () => {
    const d = await v()
    const { getAllByText } = render(Kurumlar, {
      props: { dataset: d.dataset, view: d.derived, source: { id: 'local', load: async () => fixture } },
    })
    const btn = getAllByText('⚖ Nakit Düzelt')[0] as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('opens the correction form for a broker on a Drive source', async () => {
    const d = await v()
    const store = writable<AppState>(d)
    const { getAllByText, getByText } = render(Kurumlar, {
      props: {
        dataset: d.dataset,
        view: d.derived,
        store,
        source: { id: 'drive', load: async () => fixture, save: async () => {} },
      },
    })
    const btn = getAllByText('⚖ Nakit Düzelt')[0] as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    await fireEvent.click(btn)
    expect(getByText(/Nakit Düzeltmesi/)).toBeInTheDocument()
  })

  it('includes a Nakit column in the summary table', async () => {
    const d = await v()
    const { container } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
    const ths = [...container.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(ths).toContain('Nakit')
  })
})
