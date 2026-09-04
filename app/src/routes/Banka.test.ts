import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Banka from './Banka.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Banka', () => {
  it('shows deposit/withdrawal totals and the transfers table', async () => {
    const d = await v()
    const { getByText, container } = render(Banka, { props: { view: d.derived } })
    expect(getByText('Toplam Yatan')).toBeInTheDocument()
    expect(container.textContent).toContain('$5,000.00') // fixture single YATIRMA
    expect(container.textContent).toContain('Para piyasası')
  })
})
