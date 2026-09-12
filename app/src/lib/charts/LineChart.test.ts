import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
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

  it('triggers onPointClick when clicked', async () => {
    const onClick = vi.fn()
    const series = [{ x: 0, y: 100 }, { x: 1, y: 200 }, { x: 2, y: 150 }]
    const labels = ['Haz 2026', 'Tem 2026', 'Ağu 2026']
    const { container } = render(LineChart, {
      props: { series, labels, width: 300, height: 150, onPointClick: onClick, selectedPoint: 1 },
    })
    const svg = container.querySelector('svg')!
    expect(svg).toHaveClass('clickable')

    // Mock bounding rect
    svg.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 150,
      right: 300,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Click near index 2 (x = 290)
    await fireEvent.click(svg, { clientX: 290, clientY: 75 })
    expect(onClick).toHaveBeenCalledWith(2, series[2], labels[2])
  })

  it('renders compareSeries with dashed line and handles null values gracefully', () => {
    const series = [{ x: 0, y: 100 }, { x: 1, y: 120 }, { x: 2, y: 140 }]
    const compareSeries = [{ x: 0, y: null }, { x: 1, y: 90 }, { x: 2, y: 110 }]
    const { getByTestId } = render(LineChart, {
      props: { series, compareSeries, width: 200, height: 100 },
    })

    const compareLine = getByTestId('line-compare')
    expect(compareLine).toBeInTheDocument()
    expect(compareLine).toHaveAttribute('stroke-dasharray', '3 3')
    const d = compareLine.getAttribute('d')
    expect(d).toBeTruthy()
  })
})
