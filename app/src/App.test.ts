import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/svelte'
import App from './App.svelte'
import { prices } from './lib/prices.svelte'
import { settings } from './lib/settings.svelte'

beforeEach(() => {
  vi.unstubAllEnvs()
  prices.status = 'idle'
  prices.asOf = null
  settings.currency = 'USD'
  settings.rate = 1
  settings.rateDate = ''
})

describe('App — fiyat yenile', () => {
  it('hides the refresh button when VITE_PRICE_API is unset', () => {
    const { queryByText } = render(App)
    expect(queryByText('Fiyatları yenile')).toBeNull()
  })

  it('shows the refresh button when VITE_PRICE_API is set', () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    const { getByText } = render(App)
    expect(getByText('Fiyatları yenile')).toBeInTheDocument()
  })

  it('rate caption says "son bilinen kur" until a live rate lands (Fix 9)', () => {
    settings.currency = 'TRY'
    settings.rate = 40
    settings.rateDate = '2026-09-01'
    const { getByText } = render(App)
    expect(getByText(/\(TCMB, son bilinen kur\)/)).toBeInTheDocument()
  })
})
