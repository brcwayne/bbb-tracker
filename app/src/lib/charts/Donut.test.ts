import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Donut from './Donut.svelte'

describe('Donut', () => {
  it('renders one path per slice, tagged by label', () => {
    const { container } = render(Donut, { props: { slices: [{ label: 'BIST', value: 3 }, { label: 'ALTIN', value: 1 }] } })
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('[data-slice="BIST"]')).toBeTruthy()
  })
})
