import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AylikRapor from './AylikRapor.svelte'
import { fixture } from '../fixtures/dataset'

describe('AylikRapor', () => {
  it('renders one row per snapshot, newest first', () => {
    const { getAllByRole } = render(AylikRapor, { props: { dataset: fixture } })
    const rows = getAllByRole('row')
    expect(rows).toHaveLength(1 + fixture.snapshots.length)
    expect(rows[1].textContent).toContain('Oca 2024') // en yeni
  })

  it('% getiri is — when baslangicSermayesi is 0/null', () => {
    const ds = structuredClone(fixture)
    ds.snapshots[0].baslangicSermayesi_usd = null
    const { container } = render(AylikRapor, { props: { dataset: ds } })
    expect(container.textContent).toContain('—')
  })

  it('clicking a row updates the selected-month card', async () => {
    const { getAllByRole, getByTestId } = render(AylikRapor, {
      props: { dataset: fixture },
    })
    await fireEvent.click(getAllByRole('row')[2]) // 2021-03
    expect(getByTestId('month-card').textContent).toContain('Mar 2021')
  })
})
