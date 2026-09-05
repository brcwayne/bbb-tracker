import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Kurumlar from './Kurumlar.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

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
})
