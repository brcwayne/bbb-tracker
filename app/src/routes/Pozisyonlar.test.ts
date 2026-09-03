import { describe, it, expect } from 'vitest'
import { render, fireEvent, within } from '@testing-library/svelte'
import Pozisyonlar from './Pozisyonlar.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

const openTbody = (c: HTMLElement) =>
  c.querySelector('[data-testid="open-table"] tbody') as HTMLElement

describe('Pozisyonlar', () => {
  it('lists open positions with — placeholders, excludes fully-exited names', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const open = within(container.querySelector('[data-testid="open-table"]') as HTMLElement)
    expect(open.getByText('ASTOR')).toBeInTheDocument()
    expect(open.getByText('THYAO')).toBeInTheDocument()
    // XAU is fully exited -> not in the OPEN table
    expect(openTbody(container).textContent).not.toContain('XAU')
    // Güncel Fiyat / Gerçekleşmemiş K/Z placeholder columns
    expect(container.textContent).toContain('—')
  })

  it('closed table shows realized P/L incl. fully-exited names', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const closed = container.querySelector('[data-testid="closed-table"]') as HTMLElement
    expect(closed.textContent).toContain('XAU')
    expect(closed.textContent).toContain('+$300.00')
  })

  it('renders the — placeholder somewhere on the page', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    expect(container.textContent).toContain('—')
  })

  it('class filter narrows the open table', async () => {
    const d = await v()
    const { container, getByLabelText } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    expect(openTbody(container).textContent).toContain('ASTOR')
    await fireEvent.change(getByLabelText('Sınıf'), { target: { value: 'ALTIN' } })
    expect(openTbody(container).textContent).not.toContain('ASTOR')
  })
})
