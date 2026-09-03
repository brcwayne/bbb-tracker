import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import LineChart from './LineChart.svelte'

describe('LineChart', () => {
  it('draws a path with as many points as the series', () => {
    const { getByTestId } = render(LineChart, {
      props: { series: [{ x: 0, y: 0 }, { x: 1, y: 10 }, { x: 2, y: 5 }], width: 100, height: 100, pad: 10 },
    })
    const d = getByTestId('line').getAttribute('d')!
    expect(d.split('L').length + (d.match(/^M/) ? 0 : 0)).toBe(3) // M + 2×L
    expect(d).toMatch(/^M10,/)                                    // sol kenar = pad
  })
})
