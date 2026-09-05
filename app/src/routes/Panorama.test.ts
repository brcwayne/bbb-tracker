import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Panorama from './Panorama.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'
import { prices } from '../lib/prices.svelte'

async function derived() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Panorama', () => {
  it('shows KPI band with realized profit and equity', async () => {
    const v = await derived()
    const { getByText, container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(getByText('Gerçekleşmiş Kâr')).toBeInTheDocument()
    expect(container.textContent).toContain('$475.00') // 175 + 300
    expect(container.textContent).toContain('$5,475.00') // son snapshot toplamOzkaynak
    expect(container.textContent).toMatch(/son bilinen/i)
  })
  it('renders each chart once', async () => {
    const v = await derived()
    const { container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5)
    expect(container.querySelector('[data-testid="line"]')).toBeTruthy()
  })
  it('shows an unrealized-P/L KPI once prices are loaded', async () => {
    const v = await derived()
    prices.bySymbol = { 'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 99 } }
    prices.usdPerGram = null
    prices.status = 'ready'
    const { getByText } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(getByText('Gerçekleşmemiş K/Z')).toBeInTheDocument()
    prices.bySymbol = {}
    prices.usdPerGram = null
    prices.status = 'idle'
  })
  it('renders the consolidated Özet section', async () => {
    const v = await derived()
    const { getByText, container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    expect(getByText('Özet')).toBeInTheDocument()
    expect(getByText(/Güncel Özkaynak/)).toBeInTheDocument()
    expect(getByText('Yatırılan Sermaye')).toBeInTheDocument()
    expect(getByText('Kapanan İşlemler')).toBeInTheDocument()
    // fixture: toplamSermaye 5000
    expect(container.textContent).toContain('$5,000.00')
    // Gerçekleşmemiş K/Z appears both here and as a KPI label; scope by textContent.
    expect(container.textContent).toContain('Gerçekleşmemiş K/Z')
  })

  it('shows THIS MONTH block from the newest snapshot', async () => {
    const v = await derived()
    const { getByText, container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    // "Bu Ay" also appears as a period label in the periods table, so use textContent here.
    expect(container.textContent).toContain('Bu Ay')
    expect(getByText('Oca 2024')).toBeInTheDocument()
  })
})
