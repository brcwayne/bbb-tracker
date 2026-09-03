import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import BarChart from './BarChart.svelte'

describe('BarChart', () => {
  it('vertical: one rect per bar, sign-colored', () => {
    const { container } = render(BarChart, {
      props: { bars: [{ label: 'a', value: 10 }, { label: 'b', value: -4 }], width: 200, height: 100, pad: 10 },
    })
    const rects = container.querySelectorAll('rect')
    expect(rects).toHaveLength(2)
    expect(container.querySelector('[data-bar="a"]')!.getAttribute('fill')).toContain('--gain')
    expect(container.querySelector('[data-bar="b"]')!.getAttribute('fill')).toContain('--loss')
  })
  it('bar height is proportional to value', () => {
    const { container } = render(BarChart, {
      props: { bars: [{ label: 'a', value: 10 }, { label: 'b', value: 5 }], width: 200, height: 100, pad: 0 },
    })
    const [a, b] = [...container.querySelectorAll('rect')].map((r) => +r.getAttribute('height')!)
    expect(a / b).toBeCloseTo(2, 5)
  })
})
