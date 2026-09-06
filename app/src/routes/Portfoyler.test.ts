import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Portfoyler from './Portfoyler.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('Portfoyler', () => {
  it('shows a panel per non-empty portfolio with its holdings', async () => {
    const d = await v()
    const { getAllByText, container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })
    // Each portfolio's name now appears three times — a label in each of the two
    // pie rows, plus its holdings panel's SectionHeader title.
    expect(getAllByText('ENIS').length).toBeGreaterThanOrEqual(2)
    expect(getAllByText('ALFA').length).toBeGreaterThanOrEqual(2)
    // THYAO + XAU live under ENIS
    expect(container.textContent).toContain('THYAO')
    expect(container.textContent).toContain('XAU')
    // priceless → dash somewhere in the value columns
    expect(container.textContent).toContain('—')
  })

  it('has a cost pie row and a current-value pie row, both collapsible', async () => {
    const d = await v()
    const { getByText, queryAllByText } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })
    const costToggle = getByText('Maliyet dağılımı')
    const valueToggle = getByText('Güncel değer dağılımı')
    expect(costToggle).toBeInTheDocument()
    expect(valueToggle).toBeInTheDocument()

    // both rows open → each portfolio label shows in both pie rows + its panel header
    const before = queryAllByText('ENIS').length
    expect(before).toBeGreaterThanOrEqual(3)

    // collapsing the value row drops one occurrence of every portfolio label
    await fireEvent.click(valueToggle)
    expect(queryAllByText('ENIS').length).toBe(before - 1)
    expect(valueToggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('remembers a collapsed pie row across mounts', async () => {
    const d = await v()
    const first = render(Portfoyler, { props: { dataset: d.dataset, view: d.derived } })
    await fireEvent.click(first.getByText('Maliyet dağılımı'))
    first.unmount()

    const second = render(Portfoyler, { props: { dataset: d.dataset, view: d.derived } })
    expect(second.getByText('Maliyet dağılımı').getAttribute('aria-expanded')).toBe('false')
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(Portfoyler, { props: {} })
    expect(getByText(/Portföyler/i)).toBeInTheDocument()
  })
})
