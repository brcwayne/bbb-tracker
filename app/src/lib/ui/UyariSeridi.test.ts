import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import UyariSeridi from './UyariSeridi.svelte'
import type { WarningItem } from '../data/uyarilar'

describe('UyariSeridi', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when warnings list is empty', () => {
    const { container } = render(UyariSeridi, { props: { warnings: [] } })
    expect(container.querySelector('[data-testid="uyari-seridi"]')).toBeNull()
  })

  it('renders summary and warning list when warnings are present', () => {
    const warnings: WarningItem[] = [
      {
        id: '1',
        seviye: 'bilgi',
        mesaj: 'Aylık rapor ile defter arasında $92.234 fark var',
        sayfa: 'panorama',
      },
      {
        id: '2',
        seviye: 'uyari',
        mesaj: 'HDFGS DELTA portföyünde yok, ALFA’dan 34.365 lot alındı',
        sayfa: 'pozisyonlar',
      },
      {
        id: '3',
        seviye: 'uyari',
        mesaj: '2 pozisyonun güncel fiyatı alınamadı',
      },
    ]

    const { getByTestId, getByText } = render(UyariSeridi, { props: { warnings } })
    const serit = getByTestId('uyari-seridi')
    expect(serit).toBeInTheDocument()
    expect(serit.textContent).toContain('3 uyarı')
    expect(serit.textContent).toContain('Aylık rapor ile defter arasında $92.234 fark var')
    expect(getByText("→ Panorama'ya git")).toBeInTheDocument()
    expect(getByText("→ Pozisyonlar'a git")).toBeInTheDocument()
    expect(serit.textContent).toContain('→ —')
  })

  it('toggles collapse on button click and persists to localStorage', async () => {
    const warnings: WarningItem[] = [
      { id: '1', seviye: 'uyari', mesaj: 'Test uyarı', sayfa: 'panorama' },
    ]
    const { getByTestId, queryByText } = render(UyariSeridi, { props: { warnings } })
    const toggleBtn = getByTestId('uyari-toggle')
    expect(toggleBtn.textContent).toContain('gizle ▴')
    expect(queryByText('Test uyarı')).not.toBeNull()

    // Collapse
    await fireEvent.click(toggleBtn)
    expect(toggleBtn.textContent).toContain('göster ▾')
    expect(queryByText('Test uyarı')).toBeNull()
    expect(localStorage.getItem('bbb-warnings-expanded')).toBe('false')

    // Expand
    await fireEvent.click(toggleBtn)
    expect(toggleBtn.textContent).toContain('gizle ▴')
    expect(queryByText('Test uyarı')).not.toBeNull()
    expect(localStorage.getItem('bbb-warnings-expanded')).toBe('true')
  })

  it('initializes in collapsed state if localStorage was false', () => {
    localStorage.setItem('bbb-warnings-expanded', 'false')
    const warnings: WarningItem[] = [
      { id: '1', seviye: 'uyari', mesaj: 'Test uyarı', sayfa: 'panorama' },
    ]
    const { getByTestId, queryByText } = render(UyariSeridi, { props: { warnings } })
    const toggleBtn = getByTestId('uyari-toggle')
    expect(toggleBtn.textContent).toContain('göster ▾')
    expect(queryByText('Test uyarı')).toBeNull()
  })
})
