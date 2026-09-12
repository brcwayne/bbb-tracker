import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Panorama from './Panorama.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'
import { prices } from '../lib/prices.svelte'
import { cashBalanceByHesap } from '../lib/data/cashBalances'
import { money, settings } from '../lib/settings.svelte'

async function derived() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Panorama', () => {
  it('shows KPI band with realized profit and equity, and top metadata strip (H2)', async () => {
    const v = await derived()
    const { getByText, container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(getByText('Gerçekleşmiş Kâr')).toBeInTheDocument()
    expect(container.textContent).toContain('$475') // 175 + 300
    expect(container.textContent).toContain('$5,475') // son snapshot toplamOzkaynak
    // H2: Künye: Kaynak: Yerel dosya · son yazma: ... · 7 işlem · local badge
    expect(container.textContent).toContain('Kaynak: Yerel dosya')
    expect(container.textContent).toContain('son yazma:')
    expect(container.textContent).toContain('7 işlem')
    expect(container.querySelector('[data-testid="local-badge"]')).toBeTruthy()
    expect(container.textContent).toContain('⚠ yerel kopya — canlı veri olmayabilir')
    expect(container.textContent).toContain('Fiyatlar:')
    expect(container.textContent).toContain('Kur:')
  })

  it('renders Google Drive künye without local warning badge when source is drive', async () => {
    const v = await derived()
    const mockDriveSource = {
      id: 'drive' as const,
      load: vi.fn(),
      lastModified: new Date(2026, 8, 12, 14, 20).toISOString(),
    }
    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, source: mockDriveSource },
    })
    expect(container.textContent).toContain('Kaynak: Google Drive')
    expect(container.textContent).toContain('son yazma: 12 Eyl 2026 14:20')
    expect(container.textContent).toContain('7 işlem')
    expect(container.querySelector('[data-testid="local-badge"]')).toBeNull()
    expect(container.textContent).not.toContain('yerel kopya')
  })

  it('renders each chart once', async () => {
    const v = await derived()
    const { container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5)
    expect(container.querySelector('[data-testid="line"]')).toBeTruthy()
  })

  it('shows an unrealized-P/L KPI once prices are loaded', async () => {
    const v = await derived()
    prices.bySymbol = { 'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 99 } }
    prices.usdPerGram = null
    prices.status = 'ready'
    const { getByText } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(getByText('Gerçekleşmemiş K/Z')).toBeInTheDocument()
    prices.bySymbol = {}
    prices.usdPerGram = null
    prices.status = 'idle'
  })

  it('renders the structured blocks: Bu Ay, Özkaynak, Kâr / Zarar, Nakit, Kapanan İşlemler', async () => {
    const v = await derived()
    const { getByText, getAllByText, container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    expect(getByText('Özkaynak')).toBeInTheDocument()
    expect(getByText(/Güncel Özkaynak/)).toBeInTheDocument()
    expect(getByText('Canlı Özkaynak')).toBeInTheDocument()
    expect(getByText('Yatırılan Sermaye')).toBeInTheDocument()
    expect(getByText(/Toplam Getiri/)).toBeInTheDocument()
    expect(getAllByText('Nakit & Para Piyasası').length).toBeGreaterThan(0)
    expect(getByText('Nakit Oranı (XAU hariç)')).toBeInTheDocument()
    expect(getByText('Kapanan İşlemler')).toBeInTheDocument()
    expect(container.textContent).toContain('$5,000')
    expect(container.textContent).toContain('Gerçekleşmemiş K/Z')
  })

  it('verifies every dt contains a scope badge (G5 & G6 acceptance)', async () => {
    const v = await derived()
    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    const dts = container.querySelectorAll('.mini dt')
    const scopes = container.querySelectorAll('.mini dt .scope')
    expect(dts.length).toBeGreaterThan(0)
    expect(dts.length).toBe(scopes.length)
  })

  it('verifies block DOM order: Bu Ay -> Özkaynak -> Kâr / Zarar -> Nakit -> Kapanan İşlemler (K5)', async () => {
    const v = await derived()
    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    const text = container.textContent ?? ''
    const idxBuAy = text.indexOf('Bu Ay')
    const idxOzkaynak = text.indexOf('Özkaynak')
    const idxKarZarar = text.indexOf('Kâr / Zarar')
    const idxNakit = text.indexOf('Nakit')
    const idxKapanan = text.indexOf('Kapanan İşlemler')

    expect(idxBuAy).toBeLessThan(idxOzkaynak)
    expect(idxOzkaynak).toBeLessThan(idxKarZarar)
    expect(idxKarZarar).toBeLessThan(idxNakit)
    expect(idxNakit).toBeLessThan(idxKapanan)
  })

  it('shows a live Nakit KPI, not the migration-day snapshot frozen in meta.nakitHesapBazli', async () => {
    const withDeposit = {
      ...fixture,
      cashflows: [
        ...fixture.cashflows,
        {
          id: 'c_test_nakit', tarih: '2026-09-05', hesap: 'MIDAS', portfoy: null,
          tur: 'YATIRMA' as const, enstruman: null, tutar_tl: null, tutar_usd: 1000,
          kur: null, aciklama: 'test deposit', kaynak: 'manual',
        },
      ],
    }
    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(withDeposit) })
    const v = get(s)

    const frozenTotal = Object.values(fixture.meta.nakitHesapBazli).reduce((s, x) => s + x, 0)
    const liveTotal = Object.values(cashBalanceByHesap(v.dataset!)).reduce((s, x) => s + x, 0)
    expect(liveTotal).toBeCloseTo(frozenTotal + 1000, 2)

    const { container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(container.textContent).toContain(money(liveTotal, { whole: true }))
    expect(container.textContent).not.toContain(money(frozenTotal, { whole: true }))
  })

  it('shows THIS MONTH block from the newest snapshot with dynamic month name and past month note', async () => {
    const v = await derived()
    const { getAllByText, container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    expect(container.textContent).toContain('Bu Ay — Oca 2024')
    expect(container.textContent).toContain('son kapanan ay')
    expect(getAllByText('Oca 2024').length).toBeGreaterThan(0)
  })

  it('no longer renders inline warning strips inside Panorama (H3 centralized to UyariSeridi)', async () => {
    const v = await derived()
    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    expect(container.querySelector('.note-strip')).toBeNull()
    expect(container.querySelector('.info-strip')).toBeNull()
    expect(container.querySelector('.warn-strip')).toBeNull()
  })

  it('handles empty snapshots without warning or crashing (G10)', async () => {
    const noSnapshots = { ...fixture, snapshots: [] }
    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(noSnapshots) })
    const v = get(s)

    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    expect(container.textContent).not.toContain('mutabakat gerekiyor')
  })

  it('opens monthly waterfall breakdown when equity chart point is clicked (H4)', async () => {
    const v = await derived()
    const { container, getByText } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    const svg = container.querySelector('svg.clickable') as SVGElement
    expect(svg).toBeTruthy()

    // Mock bounding rect for SVG click
    svg.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 640,
      height: 200,
      right: 640,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Click near right edge (last point, index 1 in fixture)
    const { fireEvent } = await import('@testing-library/svelte')
    await fireEvent.click(svg, { clientX: 620, clientY: 100 })

    const wfCard = container.querySelector('[data-testid="waterfall-breakdown"]')
    expect(wfCard).toBeTruthy()

    expect(wfCard?.textContent).toContain('Neden değişti?')
    expect(wfCard?.textContent).toContain('Şelale Dökümü')
    expect(wfCard?.textContent).toContain('Başlangıç')
    expect(wfCard?.textContent).toContain('Yeni mevduat')
    expect(wfCard?.textContent).toContain('Gerçekleşen kâr')
    expect(wfCard?.textContent).toContain('Temettü')
    expect(wfCard?.textContent).toContain('Vergi & komisyon')
    expect(wfCard?.textContent).toContain('Değerleme (bakiye)')
    expect(wfCard?.textContent).toContain('Dönem sonu')
    expect(wfCard?.textContent).toContain('defter bazlı seride kalemler toplamı dönem sonuna tam eşittir')

    // Transactions details
    expect(wfCard?.textContent).toContain('O ayın işlemleri')

    // Close button
    const closeBtn = wfCard?.querySelector('.wf-close') as HTMLButtonElement
    expect(closeBtn).toBeTruthy()
    await fireEvent.click(closeBtn)
    expect(container.querySelector('[data-testid="waterfall-breakdown"]')).toBeNull()
  })

  it('renders Realize Sermaye heading with hint and reconciliation note (I2)', async () => {
    const v = await derived()
    const { container, getByText } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    expect(getByText('Realize Sermaye')).toBeInTheDocument()
    expect(container.textContent).toContain('yatırılan para + gerçekleşen kâr + temettü; açık pozisyonların güncel değeri bu eğride yok')
    expect(container.textContent).toContain('Excel aylık raporu kurucu sermayenin $113.209\'unu içermiyor (bkz. mutabakat raporu).')
    expect(container.querySelector('[data-testid="line"]')).toBeTruthy()
  })

  it('connects class and portfolio donuts to settings.basis and reflects basis note (H8)', async () => {
    const v = await derived()
    settings.basis = 'maliyet'
    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    expect(container.textContent).toContain('maliyet · nakit dahil')
    expect(container.textContent).toContain('maliyet bazlı')

    settings.basis = 'deger'
    const { container: c2 } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })
    expect(c2.textContent).toContain('güncel değer · nakit dahil')
  })

  it('shows scope badge as "2026-02\'den bu yana" for realized P/L and closed trades (I3)', async () => {
    const v = await derived()
    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    const text = container.textContent ?? ''
    expect(text).toContain("2026-02'den bu yana")
  })

  it('shows price coverage and fallback "≈" when prices are partially missing in deger mode (I5)', async () => {
    const v = await derived()
    settings.basis = 'deger'
    prices.asOf = '2026-09-12T14:32:00Z'
    prices.status = 'kismi'
    // Only 1 of 3 open positions priced
    prices.bySymbol = { 'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 10 } }
    prices.usdPerGram = null

    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    // 1. Coverage visible in künye strip
    expect(container.textContent).toContain('Fiyatlar: 1/3 pozisyon · 14:32')

    // 2. Fallback mark "≈" and hint present
    expect(container.textContent).toContain('≈')
    expect(container.textContent).toContain('güncel fiyat alınamadı, maliyet gösteriliyor')

    // Reset
    prices.bySymbol = {}
    prices.asOf = null
    prices.status = 'idle'
  })

  it('shows NOT ONE "≈" when price coverage is 100% (zero false positives) (I5)', async () => {
    const v = await derived()
    settings.basis = 'deger'
    prices.asOf = '2026-09-12T14:32:00Z'
    prices.status = 'ready'
    // All 3 open positions priced (ASTOR, THYAO, XAU)
    prices.bySymbol = {
      'ASTOR.IS': { price: 100, currency: 'TRY', priceUsd: 2.5 },
      'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 10 },
    }
    prices.usdPerGram = 90 // XAU priced via usdPerGram

    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    expect(container.textContent).toContain('Fiyatlar: 3/3 pozisyon · 14:32')
    expect(container.textContent).not.toContain('≈')
    expect(container.textContent).not.toContain('güncel fiyat alınamadı, maliyet gösteriliyor')

    // Reset
    prices.bySymbol = {}
    prices.asOf = null
    prices.usdPerGram = null
    prices.status = 'idle'
  })

  it('falls back to maliyet and says so when price API is fully off (I5)', async () => {
    const v = await derived()
    settings.basis = 'deger'
    prices.asOf = null
    prices.status = 'idle'

    const { container } = render(Panorama, {
      props: { dataset: v.dataset, derived: v.derived, view: v.derived },
    })

    expect(container.textContent).toContain('Fiyatlar: API kapalı (maliyet)')
    // Does not crash
    expect(container.textContent).toContain('Özkaynak')
  })
})

