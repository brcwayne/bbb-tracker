import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import QuickActionDrawer from './QuickActionDrawer.svelte'
import { settings, setUiMode } from '../settings.svelte'
import { fixture } from '../../fixtures/dataset'

beforeEach(() => {
  setUiMode('v2')
  settings.quickDrawerOpen = false
})

describe('QuickActionDrawer', () => {
  it('is closed when settings.quickDrawerOpen is false', () => {
    const { queryByTestId } = render(QuickActionDrawer, {
      props: {
        dataset: fixture,
        volume: 'yatirim',
      },
    })
    expect(queryByTestId('quick-action-drawer')).toBeNull()
  })

  it('opens and renders header, local info banner and tabs when quickDrawerOpen is true', () => {
    settings.quickDrawerOpen = true
    const { getByTestId, getByText, getByRole } = render(QuickActionDrawer, {
      props: {
        dataset: fixture,
        source: { id: 'local', load: async () => fixture } as any,
        volume: 'yatirim',
      },
    })

    expect(getByTestId('quick-action-drawer')).toBeInTheDocument()
    expect(getByText('⚡ Hızlı Kayıt Ekle')).toBeInTheDocument()
    const banner = getByTestId('drawer-local-info')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Google Drive olarak seçin')

    expect(getByRole('tab', { name: /Hisse\/Fon Al-Sat/ })).toBeInTheDocument()
    expect(getByRole('tab', { name: /Nakit Hareketi/ })).toBeInTheDocument()
    expect(getByRole('tab', { name: /Varlık Transferi/ })).toBeInTheDocument()
    expect(getByRole('tab', { name: /Harcama \/ Gelir/ })).toBeInTheDocument()
  })

  it('closes on close button click and on Escape key', async () => {
    settings.quickDrawerOpen = true
    const { getByLabelText } = render(QuickActionDrawer, {
      props: {
        dataset: fixture,
        volume: 'yatirim',
      },
    })

    const closeBtn = getByLabelText('Çekmeceyi kapat')
    await fireEvent.click(closeBtn)
    expect(settings.quickDrawerOpen).toBe(false)

    settings.quickDrawerOpen = true
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(settings.quickDrawerOpen).toBe(false)
  })
})
