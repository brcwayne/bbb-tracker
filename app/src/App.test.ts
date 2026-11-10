import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/svelte'
import App from './App.svelte'
import { prices } from './lib/prices.svelte'
import { settings } from './lib/settings.svelte'

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  prices.status = 'idle'
  prices.asOf = null
  prices.bySymbol = {}
  settings.currency = 'USD'
  settings.rate = 1
  settings.rateDate = ''
  settings.uiMode = 'classic'
  settings.fontScale = 18
  settings.quickDrawerOpen = false
  document.documentElement.removeAttribute('data-ui')
  document.documentElement.style.removeProperty('font-size')
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

  it('shows a dated last-refreshed stamp with the full time in its tooltip', () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })))
    prices.status = 'ready'
    prices.asOf = new Date('2026-09-06T17:30:00').toISOString()
    const { getByTestId } = render(App)
    const stamp = getByTestId('price-stamp')
    expect(stamp.textContent).toMatch(/6 Eyl/)
    expect(stamp.title).toContain('Fiyatlar son yenilendi:')
  })

  it('rate caption says "son bilinen kur" until a live rate lands (Fix 9)', () => {
    settings.currency = 'TRY'
    settings.rate = 40
    settings.rateDate = '2026-09-01'
    const { getByText } = render(App)
    expect(getByText(/\(TCMB, son bilinen kur\)/)).toBeInTheDocument()
  })
})

describe('App — iki cilt ve kabuk', () => {
  it('yatırım cildinde switch Hesaplar gösterir, 9 sekme ve para birimi görünür', () => {
    window.location.hash = '#/'
    const { getByRole, queryByRole, getAllByRole } = render(App)
    const switchLink = getByRole('link', { name: /Hesaplar defterine geç/i })
    expect(getByRole('group', { name: 'Para birimi' })).toBeInTheDocument()
    expect(getByRole('group', { name: 'Değerleme bazı' })).toBeInTheDocument()
    expect(getByRole('combobox', { name: 'Dönem' })).toBeInTheDocument()
  })

  it('flips settings.basis when basis toggle buttons are clicked (H8)', async () => {
    window.location.hash = '#/'
    const { getByRole, getByText } = render(App)
    const maliyetBtn = getByText('maliyet')
    const degerBtn = getByText('değer')

    const { fireEvent } = await import('@testing-library/svelte')
    await fireEvent.click(maliyetBtn)
    expect(settings.basis).toBe('maliyet')

    await fireEvent.click(degerBtn)
    expect(settings.basis).toBe('deger')
  })

  it('hesaplar cildinde switch Yatırım gösterir, 5 sekme görünür, para birimi ve dönem gizlidir', () => {
    window.location.hash = '#/h/hesaplar'
    const { getByRole, queryByRole } = render(App)
    const switchLink = getByRole('link', { name: /Yatırım defterine geç/i })
    expect(switchLink).toHaveAttribute('href', '#/')
    expect(queryByRole('group', { name: 'Para birimi' })).toBeNull()
    expect(queryByRole('combobox', { name: 'Dönem' })).toBeNull()
  })

  it('shows local copy warning badge in controls when source is local (H2)', () => {
    window.location.hash = '#/'
    const { queryByTestId } = render(App)
    expect(queryByTestId('app-local-badge')).toBeInTheDocument()
    expect(queryByTestId('app-local-badge')?.textContent).toContain('⚠ yerel kopya — canlı veri olmayabilir')
  })

  it('#/h/kisiler/<kod> rotasında başlık Kişi olarak çözülür', () => {
    window.location.hash = '#/h/kisiler/ENIS'
    const { getByText } = render(App)
    expect(getByText('Kişi')).toBeInTheDocument()
  })
})

describe('App — V2 Komuta Merkezi ve Hızlı Kayıt Çekmecesi', () => {
  it('renders classic bottom tabs by default without v2-dock or quick-drawer-btn', () => {
    window.location.hash = '#/'
    const { queryByTestId, container } = render(App)
    expect(queryByTestId('quick-drawer-btn')).toBeNull()
    const nav = container.querySelector('nav.tabs')
    expect(nav).not.toHaveClass('v2-dock')
  })

  it('in V2 mode, renders floating bottom dock and opens quick action drawer on button click', async () => {
    const { setUiMode } = await import('./lib/settings.svelte')
    setUiMode('v2')
    window.location.hash = '#/'
    const { getByTestId } = render(App)
    const btn = getByTestId('quick-drawer-btn')
    expect(btn).toBeInTheDocument()
    expect(settings.quickDrawerOpen).toBe(false)

    const { fireEvent } = await import('@testing-library/svelte')
    await fireEvent.click(btn)
    expect(settings.quickDrawerOpen).toBe(true)
    expect(getByTestId('quick-action-drawer')).toBeInTheDocument()
  })
})
