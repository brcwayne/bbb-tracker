import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Donut from './Donut.svelte'

describe('Donut', () => {
  it('renders one path per slice, tagged by label', () => {
    const { container } = render(Donut, { props: { slices: [{ label: 'BIST', value: 3 }, { label: 'ALTIN', value: 1 }] } })
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('[data-slice="BIST"]')).toBeTruthy()
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
})
