import { describe, it, expect } from 'vitest'
import { visibleRoutes, routesFor, currentRoute, KISILER_ROUTE } from './router'

describe('Kişiler tab', () => {
  it('is not part of the static tab list, so existing datasets are unchanged', () => {
    expect(routesFor('hesaplar').some((r) => r.id === 'h-kisiler')).toBe(false)
    expect(KISILER_ROUTE.path).toBe('#/h/kisiler')
  })
  it('#/h/kisiler resolves to the Kişiler page', () => {
    location.hash = '#/h/kisiler'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-kisiler' })
  })
  it('is hidden with fewer than two active people', () => {
    expect(visibleRoutes('hesaplar', [{ aktif: true }]).some((r) => r.id === 'h-kisiler')).toBe(false)
    expect(visibleRoutes('hesaplar', []).some((r) => r.id === 'h-kisiler')).toBe(false)
    expect(visibleRoutes('hesaplar', [{ aktif: true }, { aktif: false }]).some((r) => r.id === 'h-kisiler')).toBe(false)
  })
  it('is shown with two or more active people', () => {
    const two = [{ aktif: true }, { aktif: true }]
    expect(visibleRoutes('hesaplar', two).some((r) => r.id === 'h-kisiler')).toBe(true)
  })
  it('never appears in the yatirim volume', () => {
    expect(visibleRoutes('yatirim', [{}, {}]).some((r) => r.id === 'h-kisiler')).toBe(false)
  })
})
