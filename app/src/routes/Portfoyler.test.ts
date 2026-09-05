import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Portfoyler from './Portfoyler.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Portfoyler', () => {
  it('shows a panel per non-empty portfolio with its holdings', async () => {
    const d = await v()
    const { getAllByText, container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })
    // Each portfolio's name now appears twice — once as its pie-row label, once as its
    // holdings panel's SectionHeader title.
    expect(getAllByText('ENIS').length).toBeGreaterThanOrEqual(2)
    expect(getAllByText('ALFA').length).toBeGreaterThanOrEqual(2)
    // THYAO + XAU live under ENIS
    expect(container.textContent).toContain('THYAO')
    expect(container.textContent).toContain('XAU')
    // priceless → dash somewhere in the value columns
    expect(container.textContent).toContain('—')
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(Portfoyler, { props: {} })
    expect(getByText(/Portföyler/i)).toBeInTheDocument()
  })
})
