import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Donut from './Donut.svelte'

describe('Donut', () => {
  it('renders one path per slice, tagged by label', () => {
    const { container } = render(Donut, { props: { slices: [{ label: 'BIST', value: 3 }, { label: 'ALTIN', value: 1 }] } })
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('[data-slice="BIST"]')).toBeTruthy()
  })

  it('shows the total in the centre at rest', () => {
    const { getByText } = render(Donut, {
      props: {
        slices: [{ label: 'BIST', value: 3 }, { label: 'ALTIN', value: 1 }],
        fmt: (v: number) => `$${v}`,
        totalLabel: 'Toplam',
      },
    })
    expect(getByText('Toplam')).toBeInTheDocument()
    expect(getByText('$4')).toBeInTheDocument() // 3 + 1
  })

  it('hovering a slice reveals its label + formatted value', async () => {
    const { container, getByText, queryByText } = render(Donut, {
      props: { slices: [{ label: 'BIST', value: 3 }, { label: 'ALTIN', value: 1 }], fmt: (v: number) => `$${v}` },
    })
    expect(queryByText('$3')).toBeNull()
    await fireEvent.mouseEnter(container.querySelector('[data-slice="BIST"]')!)
    expect(getByText('$3')).toBeInTheDocument()
    expect(getByText('BIST')).toBeInTheDocument()
  })

  it('7-slice donut assigns distinct colors to all slices (G8 acceptance)', () => {
    const slices = [
      { label: 'S1', value: 10 },
      { label: 'S2', value: 10 },
      { label: 'S3', value: 10 },
      { label: 'S4', value: 10 },
      { label: 'S5', value: 10 },
      { label: 'S6', value: 10 },
      { label: 'S7', value: 10 },
    ]
    const { container } = render(Donut, { props: { slices } })
    const paths = Array.from(container.querySelectorAll('path'))
    expect(paths).toHaveLength(7)
    const fills = paths.map((p) => p.getAttribute('fill'))
    expect(new Set(fills).size).toBe(7)
  })

  it('folds extra slices into "Diğer" when slices exceed maxSlices', () => {
    const slices = [
      { label: 'S1', value: 10 },
      { label: 'S2', value: 10 },
      { label: 'S3', value: 10 },
      { label: 'S4', value: 10 },
      { label: 'S5', value: 5 },
      { label: 'S6', value: 5 },
    ]
    const { container } = render(Donut, { props: { slices, maxSlices: 4 } })
    const paths = Array.from(container.querySelectorAll('path'))
    // maxSlices: 4 -> 3 kept + 1 "Diğer"
    expect(paths).toHaveLength(4)
    expect(container.querySelector('[data-slice="Diğer"]')).toBeTruthy()
  })
})
