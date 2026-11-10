import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import ThemeToggle from './ThemeToggle.svelte'
import { settings, setUiMode } from '../settings.svelte'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  setUiMode('classic')
})

describe('ThemeToggle', () => {
  it('cycles system -> light -> dark and stamps the root', async () => {
    const { getByRole } = render(ThemeToggle)
    const btn = getByRole('button', { name: /Tema:/i })
    await fireEvent.click(btn) // light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    await fireEvent.click(btn) // dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('bbb-theme')).toBe('dark')
  })

  it('renders v2 toggle button and toggles uiMode on click', async () => {
    const { getByTestId, queryByTestId } = render(ThemeToggle)
    const v2Btn = getByTestId('v2-toggle')
    expect(v2Btn.textContent).toContain('✨ V2 Tasarım')
    expect(queryByTestId('font-scale-group')).toBeNull()

    await fireEvent.click(v2Btn)
    expect(settings.uiMode).toBe('v2')
    expect(v2Btn.textContent).toContain('✨ V2 Aktif')
    expect(getByTestId('font-scale-group')).toBeInTheDocument()
  })

  it('allows scaling font size when v2 is active', async () => {
    setUiMode('v2')
    const { getByRole } = render(ThemeToggle)
    const btn16 = getByRole('button', { name: 'Okuma boyutu: 16px' })
    const btn20 = getByRole('button', { name: 'Okuma boyutu: 20px' })

    await fireEvent.click(btn16)
    expect(settings.fontScale).toBe(16)

    await fireEvent.click(btn20)
    expect(settings.fontScale).toBe(20)
  })
})
