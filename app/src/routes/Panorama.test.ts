import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Panorama from './Panorama.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

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
})
