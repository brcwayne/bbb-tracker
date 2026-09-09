import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import AyTakvimi from './AyTakvimi.svelte'
import type { DayBucket } from '../data/accounts'

const gunler = new Map<number, DayBucket>([
  [2, { giris: 0, cikis: 620, adet: 1 }],
  [5, { giris: 75000, cikis: 0, adet: 1 }],
])

const base = { yil: 2026, ay: 9, gunler, paraBirimi: 'TRY', bugun: '2026-09-08' }

describe('AyTakvimi', () => {
  it('haftaya pazartesi ile başlar', () => {
    const { container } = render(AyTakvimi, base)
    const basliklar = [...container.querySelectorAll('[data-weekday]')].map((e) => e.textContent?.trim())
    expect(basliklar).toEqual(['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'])
  })

  it('ayın ilk gününü doğru sütuna koyar', () => {
    // 1 Eylül 2026 bir Salı — önünde tam bir boş hücre olmalı
    const { container } = render(AyTakvimi, base)
    expect(container.querySelectorAll('[data-outside]')).toHaveLength(1)
    expect(container.querySelector('[data-day="1"]')).toBeTruthy()
  })

  it('ayın gün sayısını doğru çizer', () => {
    const { container } = render(AyTakvimi, base)
    expect(container.querySelectorAll('[data-day]')).toHaveLength(30)
  })

  it('şubatı doğru çizer', () => {
    const { container } = render(AyTakvimi, { ...base, yil: 2026, ay: 2 })
    expect(container.querySelectorAll('[data-day]')).toHaveLength(28)
  })

  it('hareketli günü giriş ve çıkış olarak işaretler', () => {
    const { container } = render(AyTakvimi, base)
    expect(container.querySelector('[data-day="2"] [data-out]')).toBeTruthy()
    expect(container.querySelector('[data-day="5"] [data-in]')).toBeTruthy()
    expect(container.querySelector('[data-day="3"] [data-out]')).toBeFalsy()
  })

  it('bugünü işaretler', () => {
    const { container } = render(AyTakvimi, base)
    expect(container.querySelector('[data-day="8"]')!.getAttribute('data-today')).toBe('true')
  })

  it('güne tıklayınca onSelect çağırır', async () => {
    const onSelect = vi.fn()
    const { container } = render(AyTakvimi, { ...base, onSelect })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('seçili güne tekrar tıklayınca seçimi temizler', async () => {
    const onSelect = vi.fn()
    const { container } = render(AyTakvimi, { ...base, secili: 2, onSelect })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('seçili günde ekleme düğmesi belirir ve onAdd çağırır', async () => {
    const onAdd = vi.fn()
    const { container } = render(AyTakvimi, { ...base, secili: 2, onAdd })
    const ekle = container.querySelector('[data-day="2"] [data-add]') as HTMLButtonElement
    expect(ekle).toBeTruthy()
    ekle.click()
    expect(onAdd).toHaveBeenCalledWith(2)
  })

  it('ay okları onAyDegis çağırır ve yıl sınırını aşar', async () => {
    const onAyDegis = vi.fn()
    const { getByLabelText } = render(AyTakvimi, { ...base, yil: 2026, ay: 1, onAyDegis })
    ;(getByLabelText('Önceki ay') as HTMLButtonElement).click()
    expect(onAyDegis).toHaveBeenCalledWith(2025, 12)
  })

  it('gün hücresi ekran okuyucuya tarihi ve tutarları söyler', () => {
    const { container } = render(AyTakvimi, base)
    const label = container.querySelector('[data-day="2"]')!.getAttribute('aria-label')!
    expect(label).toContain('2 Eylül 2026')
    expect(label.toLowerCase()).toContain('çıkış')
  })

  it('ay dışı hücreler tıklanamaz', () => {
    const { container } = render(AyTakvimi, base)
    const disari = container.querySelector('[data-outside]') as HTMLElement
    expect(disari.tagName).not.toBe('BUTTON')
  })
})
