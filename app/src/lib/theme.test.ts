import { describe, it, expect, beforeEach } from 'vitest'
import * as t from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme', () => {
  it('defaults to system', () => expect(t.getTheme()).toBe('system'))
  it('setTheme persists and stamps root', () => {
    t.setTheme('dark')
    expect(t.getTheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('bbb-theme')).toBe('dark')
  })
  it('system clears the attribute', () => {
    t.setTheme('dark'); t.setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
  it('initTheme applies stored value', () => {
    localStorage.setItem('bbb-theme', 'light')
    t.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
