import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/svelte'
import KurumNakitDuzelt from './KurumNakitDuzelt.svelte'
import { fixture } from '../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState } from '../lib/data/store'
import { settings } from '../lib/settings.svelte'
import { cashBalanceByHesap } from '../lib/data/cashBalances'

const TODAY = '2026-09-11'
const makeStore = () => writable<AppState>({ status: 'ready', dataset: structuredClone(fixture) })

const setInput = async (container: HTMLElement, label: string, v: string) => {
  const el = [...container.querySelectorAll('input')].find(
    (i) => i.closest('label')?.textContent?.trim().startsWith(label),
  ) as HTMLInputElement
  el.value = v
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await Promise.resolve()
}

afterEach(() => {
  settings.rate = 1
})

describe('KurumNakitDuzelt', () => {
  it('hesaplanan nakti gösterir', () => {
    settings.rate = 48
    const { container } = render(KurumNakitDuzelt, {
      hesap: 'MIDAS', hesapAdi: 'Midas', hesaplananUsd: -1000, today: TODAY,
    })
    const el = container.querySelector('[data-testid="hesaplanan"]')
    expect(el).toBeTruthy()
    expect(el!.getAttribute('data-value')).toBe('-1000')
  })

  it('TL ve USD girişini kur üzerinden toplayıp farkı yön belirterek anlatır', async () => {
    settings.rate = 48
    const { container } = render(KurumNakitDuzelt, {
      hesap: 'MIDAS', hesapAdi: 'Midas', hesaplananUsd: -1000, today: TODAY,
    })
    // 946467 / 48 + 958 ≈ 20676.7 -> way above hesaplanan -1000 -> artırılacak
    await setInput(container, 'TL nakit', '946467')
    await setInput(container, 'USD nakit', '958')
    expect(container.textContent).toMatch(/artırılacak/i)
  })

  it('fark sıfırsa kaydetmez', async () => {
    settings.rate = 48
    const save = vi.fn()
    const { container, getByText } = render(KurumNakitDuzelt, {
      hesap: 'MIDAS', hesapAdi: 'Midas', hesaplananUsd: 96, today: TODAY,
      store: makeStore(),
      source: { id: 'drive', load: async () => ({}) as any, save },
    })
    // 96 USD hesaplanan, gerçek de tam 96 USD gir -> fark 0
    await setInput(container, 'USD nakit', '96')
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/fark yok/i)
  })

  it('farkı işaretli DUZELTME cashflow satırları olarak yazar (TL ve USD ayrı)', async () => {
    settings.rate = 48
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const onSaved = vi.fn()
    const { container, getByText } = render(KurumNakitDuzelt, {
      hesap: 'QNB', hesapAdi: 'QNB Finansinvest', hesaplananTl: 1000, hesaplananUsd: 50, today: TODAY,
      store: makeStore(),
      source: { id: 'drive', load: async () => ({}) as any, save },
      onSaved,
    })
    await setInput(container, 'TL nakit', '2286')
    await setInput(container, 'USD nakit', '100')
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))

    expect(onSaved).toHaveBeenCalled()
    // 2 broker satırı + 2 TOPLU mahsup satırı = 4 satır
    const eklenenler = yazilan.slice(-4)
    expect(eklenenler[0]).toMatchObject({
      tur: 'DUZELTME',
      hesap: 'QNB',
      tarih: TODAY,
      kaynak: 'manual',
      tutar_tl: 1286,
      kur: 48,
    })
    expect(eklenenler[0].tutar_usd).toBeCloseTo(26.79, 2)
    expect(eklenenler[1]).toMatchObject({
      tur: 'DUZELTME',
      hesap: 'TOPLU',
      tarih: TODAY,
      kaynak: 'otomatik-mahsup',
      tutar_tl: -1286,
      kur: 48,
      aciklama: 'QNB düzeltmesi mahsubu',
    })
    expect(eklenenler[1].tutar_usd).toBeCloseTo(-26.79, 2)
    expect(eklenenler[2]).toMatchObject({
      tur: 'DUZELTME',
      hesap: 'QNB',
      tarih: TODAY,
      kaynak: 'manual',
      tutar_tl: null,
      tutar_usd: 50,
      kur: 48,
    })
    expect(eklenenler[3]).toMatchObject({
      tur: 'DUZELTME',
      hesap: 'TOPLU',
      tarih: TODAY,
      kaynak: 'otomatik-mahsup',
      tutar_tl: null,
      tutar_usd: -50,
      kur: 48,
      aciklama: 'QNB düzeltmesi mahsubu',
    })
  })

  it('tek bir para birimi düzeltildiğinde tam 2 satır yazar ve toplam nakdi değiştirmez (I6)', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const store = makeStore()
    let initBal = 0
    store.subscribe((v) => {
      if (v.dataset) {
        initBal = Object.values(cashBalanceByHesap(v.dataset)).reduce((a, b) => a + b, 0)
      }
    })()

    const { container, getByText } = render(KurumNakitDuzelt, {
      hesap: 'MIDAS', hesapAdi: 'Midas', hesaplananTl: 0, hesaplananUsd: 100, today: TODAY,
      store,
      source: { id: 'drive', load: async () => ({}) as any, save },
    })

    // Sadece USD nakit 150 gir (fark +50 USD)
    await setInput(container, 'USD nakit', '150')
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))

    expect(save).toHaveBeenCalled()
    // Eklenen son 2 satır: 1 MIDAS + 1 TOPLU
    const eklenenler = yazilan.slice(-2)
    expect(eklenenler).toHaveLength(2)
    expect(eklenenler[0]).toMatchObject({
      tur: 'DUZELTME',
      hesap: 'MIDAS',
      tutar_usd: 50,
      kaynak: 'manual',
    })
    expect(eklenenler[1]).toMatchObject({
      tur: 'DUZELTME',
      hesap: 'TOPLU',
      tutar_usd: -50,
      kaynak: 'otomatik-mahsup',
      aciklama: 'MIDAS düzeltmesi mahsubu',
    })

    // Toplam nakit değişmedi: +50 + (-50) = 0
    const newDs = structuredClone(fixture)
    newDs.cashflows = yazilan
    const newBal = Object.values(cashBalanceByHesap(newDs)).reduce((a, b) => a + b, 0)
    expect(newBal).toBeCloseTo(initBal, 5)
  })
})

