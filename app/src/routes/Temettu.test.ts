import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Temettu from './Temettu.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Temettu', () => {
  it('shows the dividend total and per-instrument breakdown', async () => {
    const d = await v()
    const { container } = render(Temettu, { props: { view: d.derived } })
    expect(container.textContent).toContain('Temettü')
    expect(container.textContent).toContain('THYAO') // fixture's one TEMETTU is on THYAO
    expect(container.textContent).toContain('$4.00')
  })
})
