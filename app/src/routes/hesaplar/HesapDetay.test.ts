import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import HesapDetay from './HesapDetay.svelte'
import { fixture } from '../../fixtures/dataset'

const TODAY = '2026-09-08'

describe('Hesap detayı', () => {
  it('bilinmeyen hesapta geri dönüş bağlantısıyla uyarı verir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'YOK', today: TODAY })
    expect(container.textContent).toMatch(/hesap bulunamadı/i)
    expect(container.querySelector('a[href="#/h/hesaplar"]')).toBeTruthy()
  })

  it('hesabın adını ve bakiyesini gösterir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Nakit')
    expect(container.querySelector('[data-testid="bakiye"]')).toBeTruthy()
  })

  it('kredi kartında Bu Ay / Gelecek Ay gösterir', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'GARANTI-DIJI', today: TODAY })
    expect(container.textContent).toContain('Bu Ay')
    expect(container.textContent).toContain('Gelecek Ay')
  })

  it('takvimi bugünün ayıyla açar', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Eylül 2026')
  })

  it('ayın giriş / çıkış / net toplamını yazar', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const t = container.querySelector('[data-testid="ay-toplam"]')!
    expect(t.textContent).toContain('Giriş')
    expect(t.textContent).toContain('Çıkış')
    expect(t.textContent).toContain('Net')
  })

  it('ayın hareketlerini listeler', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Haftalık pazar')
  })

  it('güne tıklayınca listeyi o güne indirir, ay toplamı değişmez', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const oncekiToplam = container.querySelector('[data-testid="ay-toplam"]')!.textContent
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    expect(container.textContent).toContain('Haftalık pazar')
    expect(container.textContent).not.toContain('Akşam yemeği')
    expect(container.querySelector('[data-testid="ay-toplam"]')!.textContent).toBe(oncekiToplam)
  })

  it('seçili gün rozetinden seçim temizlenir', async () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    ;(container.querySelector('[data-day="2"]') as HTMLButtonElement).click()
    await Promise.resolve()
    const rozet = container.querySelector('[data-testid="gun-rozeti"]') as HTMLButtonElement
    expect(rozet).toBeTruthy()
    rozet.click()
    await Promise.resolve()
    expect(container.textContent).toContain('Akşam yemeği')
  })

  it('transfer satırını yönüyle okur', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    expect(container.textContent).toContain('Garanti Bankası')
  })

  it('Drive yoksa eylem düğmeleri pasif', () => {
    const { container } = render(HesapDetay, { dataset: fixture, param: 'NAKIT', today: TODAY })
    const butonlar = [...container.querySelectorAll('[data-action]')] as HTMLButtonElement[]
    expect(butonlar.length).toBeGreaterThan(0)
    expect(butonlar.every((b) => b.disabled)).toBe(true)
  })
})
