import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import BakiyeDuzeltme from './BakiyeDuzeltme.svelte'
import { fixture } from '../../fixtures/dataset'
import { writable } from 'svelte/store'
import type { AppState } from '../../lib/data/store'

const account = fixture.personalAccounts!.find((a) => a.kod === 'NAKIT')!
const TODAY = '2026-09-08'
const makeStore = () => writable<AppState>({ status: 'ready', dataset: structuredClone(fixture) })

const setTutar = async (container: HTMLElement, v: string) => {
  const el = container.querySelector('#b-gercek') as HTMLInputElement
  el.value = v
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await Promise.resolve()
}

describe('BakiyeDuzeltme', () => {
  it('hesaplanan bakiyeyi gösterir', () => {
    const { container } = render(BakiyeDuzeltme, { dataset: fixture, account, today: TODAY })
    expect(container.querySelector('[data-testid="hesaplanan"]')).toBeTruthy()
  })

  it('farkı ve yönünü sözle anlatır', async () => {
    const { container } = render(BakiyeDuzeltme, { dataset: fixture, account, today: TODAY })
    await setTutar(container, '999999')
    expect(container.textContent).toMatch(/artırılacak/i)
    await setTutar(container, '-999999')
    expect(container.textContent).toMatch(/azaltılacak/i)
  })

  it('fark sıfırsa kaydetmez', async () => {
    const save = vi.fn()
    const { container, getByText } = render(BakiyeDuzeltme, {
      dataset: fixture,
      account,
      today: TODAY,
      store: makeStore(),
      source: { id: 'drive', load: async () => fixture, save },
    })
    const hesaplanan = container.querySelector('[data-testid="hesaplanan"]')!.getAttribute('data-value')!
    await setTutar(container, hesaplanan)
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/fark yok/i)
  })

  it('farkı işaretli DUZELTME satırı olarak yazar', async () => {
    let yazilan: any = null
    const save = vi.fn(async (_n: string, d: unknown) => {
      yazilan = d
    })
    const { container, getByText } = render(BakiyeDuzeltme, {
      dataset: fixture,
      account,
      today: TODAY,
      store: makeStore(),
      source: { id: 'drive', load: async () => fixture, save },
    })
    const hesaplanan = Number(container.querySelector('[data-testid="hesaplanan"]')!.getAttribute('data-value'))
    await setTutar(container, String(hesaplanan - 250))
    ;(getByText(/kaydet/i) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    const eklenen = yazilan[yazilan.length - 1]
    expect(eklenen).toMatchObject({
      tur: 'DUZELTME',
      tutar: -250,
      hesap: 'NAKIT',
      kategori: 'duzeltme',
      tarih: TODAY,
      kaynak: 'manual',
      paraBirimi: 'TRY',
    })
  })
})
