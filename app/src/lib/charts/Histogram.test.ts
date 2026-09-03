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
})
