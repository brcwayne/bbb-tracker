import { describe, it, expect, beforeEach } from 'vitest'
import {
  settings,
  money,
  periodRange,
  setCurrency,
  applyLiveRate,
  initRate,
  isLiveRate,
  setUiMode,
  toggleUiMode,
  setFontScale,
  applyUiAttributes,
} from './settings.svelte'

beforeEach(() => {
  settings.currency = 'USD'
  settings.rate = 40
  settings.rateDate = '2026-08-27'
  setUiMode('classic')
  setFontScale(18)
  settings.quickDrawerOpen = false
})

describe('money()', () => {
  it('formats USD by default', () => {
    expect(money(1234.5)).toBe('$1,234.50')
    expect(money(-10, { sign: true })).toBe('-$10.00')
    expect(money(null)).toBe('—')
  })

  it('converts at the active rate when currency is TRY', () => {
    setCurrency('TRY')
    expect(money(100)).toBe('₺4.000,00') // 100 × 40, tr-TR grouping
    expect(money(5, { sign: true })).toBe('+₺200,00')
  })
})

describe('periodRange()', () => {
  const today = new Date('2026-09-03T00:00:00Z')

  it('all → an open window', () => {
    const r = periodRange('all', today)
    expect(r.from).toBe('0000-01-01')
    expect(r.to).toBe('9999-12-31')
  })

  it('ytd → Jan 1 of the current year', () => {
    expect(periodRange('ytd', today).from).toBe('2026-01-01')
  })

  it('3m → three months back, inclusive of today', () => {
    const r = periodRange('3m', today)
    expect(r.from).toBe('2026-06-03')
    expect(r.to).toBe('2026-09-03')
  })
})

// Kept last: applyLiveRate flips a module-scope latch that initRate then honours.
describe('live rate persistence (Fix 8)', () => {
  it('ignores a non-positive rate and does not latch', () => {
    applyLiveRate(0)
    expect(isLiveRate()).toBe(false)
  })

  it('adopts a fetched rate and marks isLiveRate()', () => {
    applyLiveRate(48.5)
    expect(settings.rate).toBe(48.5)
    expect(isLiveRate()).toBe(true)
  })

  it('initRate() no longer clobbers a live rate once applied', () => {
    applyLiveRate(50)
    initRate({ fxrates: { '2020-01-01': 7 } } as never)
    expect(settings.rate).toBe(50)
    expect(settings.rateDate).not.toBe('2020-01-01')
  })
})

describe('basis setting and persistence (H8)', () => {
  it('defaults to deger or stored value and flips with setBasis', async () => {
    const { setBasis } = await import('./settings.svelte')
    setBasis('maliyet')
    expect(settings.basis).toBe('maliyet')
    setBasis('deger')
    expect(settings.basis).toBe('deger')
  })
})

describe('uiMode and fontScale (V2 Komuta Merkezi)', () => {
  it('defaults to classic and 18px fontScale', () => {
    expect(settings.uiMode).toBe('classic')
    expect(settings.fontScale).toBe(18)
    expect(settings.quickDrawerOpen).toBe(false)
  })

  it('setUiMode and toggleUiMode switch between classic and v2', () => {
    setUiMode('v2')
    expect(settings.uiMode).toBe('v2')
    expect(localStorage.getItem('bbb-ui-mode')).toBe('v2')
    expect(document.documentElement.getAttribute('data-ui')).toBe('v2')
    expect(document.documentElement.style.fontSize).toBe('18px')

    toggleUiMode()
    expect(settings.uiMode).toBe('classic')
    expect(localStorage.getItem('bbb-ui-mode')).toBe('classic')
    expect(document.documentElement.hasAttribute('data-ui')).toBe(false)
    expect(document.documentElement.style.fontSize).toBe('')

    toggleUiMode()
    expect(settings.uiMode).toBe('v2')
    expect(document.documentElement.getAttribute('data-ui')).toBe('v2')
  })

  it('setFontScale updates fontScale and root fontSize in v2 mode', () => {
    setUiMode('v2')
    setFontScale(16)
    expect(settings.fontScale).toBe(16)
    expect(localStorage.getItem('bbb-font-scale')).toBe('16')
    expect(document.documentElement.style.fontSize).toBe('16px')

    setFontScale(20)
    expect(settings.fontScale).toBe(20)
    expect(localStorage.getItem('bbb-font-scale')).toBe('20')
    expect(document.documentElement.style.fontSize).toBe('20px')
  })
})
