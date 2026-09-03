import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Histogram from './Histogram.svelte'

describe('Histogram', () => {
  it('zero-count buckets have zero height', () => {
    const { container } = render(Histogram, {
      props: { buckets: [{ label: 'a', count: 0 }, { label: 'b', count: 4 }], width: 100, height: 100, pad: 0 },
    })
    const [a, b] = [...container.querySelectorAll('rect')].map((r) => +r.getAttribute('height')!)
    expect(a).toBe(0)
    expect(b).toBeGreaterThan(0)
  })

  it('renders sparse band-axis tick labels (§10 direct labelling)', () => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({ label: `b${i}`, count: i }))
    const { container } = render(Histogram, { props: { buckets, width: 400, height: 120 } })
    const ticks = [...container.querySelectorAll('text')].map((t) => t.textContent)
    // every 4th bucket + the last
    expect(ticks).toEqual(['b0', 'b4', 'b8', 'b11'])
  })
})
