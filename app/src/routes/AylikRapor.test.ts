import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AylikRapor from './AylikRapor.svelte'
import { fixture } from '../fixtures/dataset'

describe('AylikRapor', () => {
  it('renders one row per year, newest first, expandable into its months', async () => {
    // fixture has 2 snapshots, one in 2021 and one in 2024 — 2 year rows expected.
    const { getAllByRole, container } = render(AylikRapor, { props: { dataset: fixture } })
    const rows = getAllByRole('row')
    expect(rows).toHaveLength(1 + 2) // header + 2 years
    expect(rows[1].textContent).toContain('2024') // en yeni yıl önce
    expect(container.querySelector('.year-detail')).toBeNull() // henüz açılmadı
    await fireEvent.click(rows[1])
    // Expanding renders a nested month-level table scoped under .year-detail — check that,
    // rather than a bare text query (month labels also appear as bar-chart text elsewhere).
    expect(container.querySelector('.year-detail')?.textContent).toContain('Oca 2024')
  })

  it('% getiri is — when baslangicSermayesi is 0/null', () => {
    const ds = structuredClone(fixture)
    ds.snapshots[0].baslangicSermayesi_usd = null
    const { container } = render(AylikRapor, { props: { dataset: ds } })
    expect(container.textContent).toContain('—')
  })

  it('clicking a month row (after expanding its year) updates the selected-month card', async () => {
    const { getAllByRole, getByTestId, container } = render(AylikRapor, {
      props: { dataset: fixture },
    })
    await fireEvent.click(getAllByRole('row')[2]) // expand 2021 (older year, second row)
    const monthRow = container.querySelector('.year-detail tbody tr')!
    await fireEvent.click(monthRow)
    expect(getByTestId('month-card').textContent).toContain('Mar 2021')
  })
})
