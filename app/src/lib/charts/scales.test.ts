import { describe, it, expect } from 'vitest'
import { linePath, arcs } from './scales'

describe('linePath', () => {
  it('produces an SVG path through the points', () => {
    const d = linePath([[0, 0], [10, 10], [20, 0]])
    expect(d).toMatch(/^M0,0/)
    expect(d).toContain('10,10')
  })
})

describe('arcs', () => {
  it('one full circle for a single value', () => {
    const a = arcs([1], 90, 62)
    expect(a).toHaveLength(1)
    expect(a[0].endAngle - a[0].startAngle).toBeCloseTo(Math.PI * 2, 6)
  })
  it('splits proportionally', () => {
    const a = arcs([3, 1], 90, 62)
    expect((a[0].endAngle - a[0].startAngle) / (a[1].endAngle - a[1].startAngle)).toBeCloseTo(3, 6)
  })
})
