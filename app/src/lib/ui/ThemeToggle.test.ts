import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import ThemeToggle from './ThemeToggle.svelte'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  it('cycles system -> light -> dark and stamps the root', async () => {
    const { getByRole } = render(ThemeToggle)
    const btn = getByRole('button')
    await fireEvent.click(btn) // light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    await fireEvent.click(btn) // dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('bbb-theme')).toBe('dark')
  })
})
