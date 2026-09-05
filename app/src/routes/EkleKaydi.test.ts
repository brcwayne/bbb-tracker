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
    const { getByText, getByLabelText } = render(EkleKaydi, {
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
    // Task 14 replaced the last remaining placeholder ('kurum') with a real KurumFormu, so
    // there is no placeholder kind left to retarget this check to (unlike Task 11/12/13, which
    // each retargeted it to the next still-placeholder kind). KurumFormu's own behaviour
    // (validation, save) is covered by KurumFormu.test.ts, so this generic picker test is
    // rewritten to assert that clicking 'Kurum Ekle' renders the real form's content (its
    // 'Kod' field), proving the picker wiring — not a placeholder string.
    await fireEvent.click(getByText('Kurum Ekle'))
    expect(getByLabelText('Kod')).toBeInTheDocument()
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(EkleKaydi, { props: {} })
    expect(getByText('Ekle')).toBeInTheDocument()
  })
})
