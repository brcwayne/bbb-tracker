import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Harcamalar from './Harcamalar.svelte'
import Taksitler from './Taksitler.svelte'
import Borclar from './Borclar.svelte'
import HarcamaFormu from './HarcamaFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { ConflictError } from '../../lib/data/drive'

describe('Kişisel Defter düzenleme, çakışma ve çevrimdışı kontrolleri', () => {
  it('ConflictError sonrası veriyi yeniler ve tekrar denemeyi ister', async () => {
    const store = createAppStore()
    let loadCount = 0
    const source = {
      id: 'drive' as const,
      load: vi.fn(async () => {
        loadCount++
        return fixture
      }),
      save: vi.fn(async () => {
        throw new ConflictError('personal_tx')
      }),
    }
    await load(store, source)
    expect(loadCount).toBe(1)

    const { getByRole, container } = render(HarcamaFormu, {
      props: {
        dataset: fixture,
        source,
        store,
        onSaved: () => {},
      },
    })

    // Fill form and submit
    const tutarInput = getByRole('spinbutton', { name: /Tutar/i })
    await fireEvent.input(tutarInput, { target: { value: '150' } })

    const aciklamaInput = getByRole('textbox', { name: /Açıklama/i })
    await fireEvent.input(aciklamaInput, { target: { value: 'Market harcaması' } })

    const inceleBtn = getByRole('button', { name: /İncele/i })
    await fireEvent.click(inceleBtn)

    // Confirm step
    const confirmBtn = getByRole('button', { name: /Onayla ve Kaydet/i })
    await fireEvent.click(confirmBtn)

    // Wait for async write, reload, and state update
    await vi.waitFor(() => {
      // load called again to refresh dataset
      expect(loadCount).toBeGreaterThan(1)
      // Error message tells user file changed elsewhere and asks to retry ("tekrar")
      expect(container.textContent).toMatch(/tekrar/i)
      expect(container.textContent).toMatch(/başka bir yerden değişti/i)
    })
  })

  it('Drive bağlı değilken üç sayfada da düzenleme kapalı', async () => {
    const store = createAppStore()
    const localSource = {
      id: 'local' as const,
      load: () => Promise.resolve(fixture),
    }

    for (const Page of [Harcamalar, Taksitler, Borclar]) {
      const { container } = render(Page as any, {
        props: { dataset: fixture, source: localSource, store, today: '2026-09-08' },
      })

      // Reason shown
      expect(container.textContent).toMatch(/Düzenleme için Drive bağlantısı gerekiyor/i)

      // Edit / add / cancel / close controls disabled
      const actionButtons = container.querySelectorAll<HTMLButtonElement>(
        '.btn-add, .btn-row-edit, .btn-row-del, .btn-cancel-plan, .btn-action',
      )
      expect(actionButtons.length).toBeGreaterThan(0)
      for (const btn of actionButtons) {
        expect(btn.disabled).toBe(true)
      }
    }
  })

  it('kayıt hatası kullanıcıya görünür, sessizce yutulmaz', async () => {
    const store = createAppStore()
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: vi.fn(async () => {
        throw new Error('Özel ağ hatası 500')
      }),
    }
    await load(store, source)

    const { getByRole, container } = render(HarcamaFormu, {
      props: {
        dataset: fixture,
        source,
        store,
        onSaved: () => {},
      },
    })

    const tutarInput = getByRole('spinbutton', { name: /Tutar/i })
    await fireEvent.input(tutarInput, { target: { value: '200' } })

    const aciklamaInput = getByRole('textbox', { name: /Açıklama/i })
    await fireEvent.input(aciklamaInput, { target: { value: 'Benzin harcaması' } })

    const inceleBtn = getByRole('button', { name: /İncele/i })
    await fireEvent.click(inceleBtn)

    const confirmBtn = getByRole('button', { name: /Onayla ve Kaydet/i })
    await fireEvent.click(confirmBtn)

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Özel ağ hatası 500')
    })
  })
})
