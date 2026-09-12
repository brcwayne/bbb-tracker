import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Kurumlar from './Kurumlar.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get, writable } from 'svelte/store'
import type { AppState } from '../lib/data/store'
import { cashSplitByHesap } from '../lib/data/cashBalances'
import { money, settings } from '../lib/settings.svelte'

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

  it('disables the Nakit Düzelt button on a non-Drive source', async () => {
    const d = await v()
    const { getAllByText } = render(Kurumlar, {
      props: { dataset: d.dataset, view: d.derived, source: { id: 'local', load: async () => fixture } },
    })
    const btn = getAllByText('⚖ Nakit Düzelt')[0] as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('opens the correction form for a broker on a Drive source', async () => {
    const d = await v()
    const store = writable<AppState>(d)
    const { getAllByText, getByText } = render(Kurumlar, {
      props: {
        dataset: d.dataset,
        view: d.derived,
        store,
        source: { id: 'drive', load: async () => fixture, save: async () => {} },
      },
    })
    const btn = getAllByText('⚖ Nakit Düzelt')[0] as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    await fireEvent.click(btn)
    expect(getByText(/Nakit Düzeltmesi/)).toBeInTheDocument()
  })

  it('includes a Nakit column in the summary table', async () => {
    const d = await v()
    const { container } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
    const ths = [...container.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(ths).toContain('Nakit')
  })

  it('renders top cash health banner with total cash and warning note (H7)', async () => {
    const d = await v()
    const { getByTestId } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
    const banner = getByTestId('kurum-nakit-banner')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Toplam Nakit:')
    expect(banner.textContent).toContain('kurum bazlı dağılım güvenilir değil')
    expect(banner.textContent).toContain('göç kaynaklı: mevduatlar TOPLU altında toplu kaydedilmiş')
  })

  it('renders red badge on negative brokers and NOT on positive brokers, opens modal on click (H7)', async () => {
    const d = await v()
    const store = writable<AppState>(d)
    const { getByTestId, queryByTestId, getByText } = render(Kurumlar, {
      props: {
        dataset: d.dataset,
        view: d.derived,
        store,
        source: { id: 'drive', load: async () => fixture, save: async () => {} },
      },
    })

    // In fixture, MIDAS (-50) and GARAN (-1001.5) are negative; KASA (+300) is positive
    const midasBadge = getByTestId('badge-neg-nakit-MIDAS')
    const garanBadge = getByTestId('badge-neg-nakit-GARAN')
    const kasaBadge = queryByTestId('badge-neg-nakit-KASA')

    expect(midasBadge).toBeInTheDocument()
    expect(midasBadge.textContent).toContain('Negatif Bakiye')
    expect(garanBadge).toBeInTheDocument()
    expect(kasaBadge).toBeNull() // Positive broker has NO badge

    // Hint text is rendered for negative brokers
    const midasHint = getByTestId('neg-nakit-hint-MIDAS')
    expect(midasHint.textContent).toContain('kurum bazlı bakiye tek başına anlamlı değil')
    expect(queryByTestId('neg-nakit-hint-KASA')).toBeNull()

    // Clicking the badge opens KurumNakitDuzelt modal
    await fireEvent.click(midasBadge)
    expect(getByText('Midas — Nakit Düzeltmesi')).toBeInTheDocument()
  })

  it('confirms total cash calculation is unchanged by H7', async () => {
    const d = await v()
    const splits = cashSplitByHesap(d.dataset!, settings.rate)
    const expectedTotal = Object.values(splits).reduce((sum, s) => sum + s.totalUsd, 0)

    const { getByTestId } = render(Kurumlar, { props: { dataset: d.dataset, view: d.derived } })
    const banner = getByTestId('kurum-nakit-banner')
    expect(banner.textContent).toContain(money(expectedTotal))
  })
})
