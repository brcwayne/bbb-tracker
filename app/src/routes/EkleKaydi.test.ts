import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import EkleKaydi from './EkleKaydi.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return { state: get(s), store: s }
}

describe('EkleKaydi', () => {
  it('shows 4 record-type choices, switches to the picked form area', async () => {
    const { state, store } = await v()
    const { getByText } = render(EkleKaydi, {
      props: {
        dataset: state.dataset,
        view: state.derived,
        source: { id: 'local', load: () => Promise.resolve(fixture) },
        store,
      },
    })
    expect(getByText('İşlem (Al/Sat)')).toBeInTheDocument()
    expect(getByText('Nakit Hareketi')).toBeInTheDocument()
    expect(getByText('Varlık Transferi')).toBeInTheDocument()
    expect(getByText('Kurum Ekle')).toBeInTheDocument()
    // Task 13 replaced the 'transfer' placeholder with a real VarlikTransferiFormu, so this
    // generic "picker switches to a placeholder form area" check is retargeted to
    // 'Kurum Ekle' (kind === 'kurum'), which remains a placeholder — same fix pattern
    // Task 11/12 used when they retargeted this test to 'Nakit Hareketi' then
    // 'Varlık Transferi'. 'kurum' is now the only kind left as a placeholder.
    await fireEvent.click(getByText('Kurum Ekle'))
    expect(getByText(/Kurum Ekle formu/i)).toBeInTheDocument()
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(EkleKaydi, { props: {} })
    expect(getByText('Ekle')).toBeInTheDocument()
  })
})
