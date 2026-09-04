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
  it('lists open positions with — placeholders', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const open = within(container.querySelector('[data-testid="open-table"]') as HTMLElement)
    expect(open.getByText('ASTOR')).toBeInTheDocument()
    expect(open.getByText('THYAO')).toBeInTheDocument()
    // XAU has a residual open 5-lot lot (t_g) on top of its earlier full exit
    expect(open.getByText('XAU')).toBeInTheDocument()
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

  it('closed % is on the sold-lot cost basis, not the full-buy notional', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const closed = container.querySelector('[data-testid="closed-table"]') as HTMLElement
    // ASTOR partial exit: sold 50 @ avg cost 1.5 -> basis $75; realized $175 -> 233.3%
    expect(closed.textContent).toContain('$75.00')
    expect(closed.textContent).toContain('233.3%')
  })

  it('always renders the approximate portfolio/account note', async () => {
    const d = await v()
    const { getByTestId } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    expect(getByTestId('pozisyonlar-notes').textContent).toContain(
      'son işlemine göre gösterilir (yaklaşık)',
    )
  })

  it('clicking an open row expands its transaction detail', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    expect(openTbody(container).textContent).not.toContain('Alım 200 lot')
    await fireEvent.click(within(openTable).getByText('ASTOR').closest('tr')!)
    const body = openTbody(container).textContent!
    expect(body).toContain('3 işlem')
    expect(body).toContain('Alım 200 lot')
    expect(body).toContain('Satım 50 lot')
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
