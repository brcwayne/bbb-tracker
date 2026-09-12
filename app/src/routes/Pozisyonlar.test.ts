import { describe, it, expect } from 'vitest'
import { render, fireEvent, within } from '@testing-library/svelte'
import Pozisyonlar from './Pozisyonlar.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'
import { prices } from '../lib/prices.svelte'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

const openTbody = (c: HTMLElement) =>
  c.querySelector('[data-testid="open-table"] tbody') as HTMLElement

describe('Pozisyonlar', () => {
  it('lists open positions with — placeholders', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const open = within(container.querySelector('[data-testid="open-table"]') as HTMLElement)
    expect(open.getByText('ASTOR')).toBeInTheDocument()
    expect(open.getByText('THYAO')).toBeInTheDocument()
    // XAU has a residual open 5-lot lot (t_g) on top of its earlier full exit
    expect(open.getByText('XAU')).toBeInTheDocument()
    // Güncel Fiyat / Gerçekleşmemiş K/Z placeholder columns
    expect(container.textContent).toContain('—')
  })

  it('closed table shows realized P/L incl. fully-exited names', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const closed = container.querySelector('[data-testid="closed-table"]') as HTMLElement
    expect(closed.textContent).toContain('XAU')
    expect(closed.textContent).toContain('+$300.00')
  })

  it('closed % is on the sold-lot cost basis, not the full-buy notional', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const closed = container.querySelector('[data-testid="closed-table"]') as HTMLElement
    // ASTOR partial exit: sold 50 @ avg cost 1.5 -> basis $75; realized $175 -> 233.3%
    expect(closed.textContent).toContain('$75.00')
    expect(closed.textContent).toContain('233.3%')
  })

  it('always renders the approximate portfolio/account note', async () => {
    const d = await v()
    const { getByTestId } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    expect(getByTestId('pozisyonlar-notes').textContent).toContain(
      'son işlemine göre gösterilir (yaklaşık)',
    )
  })

  it('clicking an open row expands its transaction detail', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    expect(openTbody(container).textContent).not.toContain('Alım 200 lot')
    await fireEvent.click(within(openTable).getByText('ASTOR').closest('tr')!)
    const body = openTbody(container).textContent!
    expect(body).toContain('3 işlem')
    expect(body).toContain('Alım 200 lot')
    expect(body).toContain('Satım 50 lot')
  })

  it('fills Güncel Fiyat + Gerçekleşmemiş K/Z from the price store', async () => {
    const d = await v()
    // THYAO is open in the fixture; price it.
    prices.bySymbol = { 'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 12 } }
    prices.usdPerGram = null
    prices.status = 'ready'
    const { container } = render(Pozisyonlar, { props: { dataset: d.dataset, derived: d.derived } })
    const openBody = openTbody(container).textContent!
    expect(openBody).toContain('$12.00') // güncel fiyat (THYAO ort maliyet < 12 → pozitif K/Z)
    prices.bySymbol = {}
    prices.status = 'idle'
  })

  it('class filter narrows the open table', async () => {
    const d = await v()
    const { container, getByLabelText } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    expect(openTbody(container).textContent).toContain('ASTOR')
    await fireEvent.change(getByLabelText('Sınıf'), { target: { value: 'ALTIN' } })
    expect(openTbody(container).textContent).not.toContain('ASTOR')
  })

  it('expanding a closed position shows Satışlar table, KAPANDI badge, and matching realized K/Z', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const closedTable = container.querySelector('[data-testid="closed-table"]') as HTMLElement
    const xauRow = within(closedTable).getByText('XAU').closest('tr')!
    await fireEvent.click(xauRow)

    const detail = closedTable.textContent!
    expect(detail).toContain('Satışlar (gerçekleşen kâr/zarar)')
    expect(detail).toContain('KAPANDI')
    expect(detail).toContain('Tutma süresi')

    // Verify sum of SaleEvent.kzUsd matches closed row realizedTotal
    const xauSales = d.derived!.positions.sales.filter((s) => s.kod === 'XAU')
    const sumSalesKz = xauSales.reduce((s, x) => s + x.kzUsd, 0)
    const closedXau = d.derived!.positions.closed.find((c) => c.kod === 'XAU')!
    expect(Math.abs(sumSalesKz - closedXau.gerceklesmisKzUsd)).toBeLessThan(0.01)
  })

  it('partially closed open position shows both realized and unrealized P/L and sales table', async () => {
    const d = await v()
    prices.bySymbol = { 'ASTOR.IS': { price: 200, currency: 'TRY', priceUsd: 6 } }
    prices.status = 'ready'
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    const astorRow = within(openTable).getByText('ASTOR').closest('tr')!
    await fireEvent.click(astorRow)

    const openBody = openTbody(container)
    expect(openBody.textContent).toContain('🟢 AÇIK · 150 lot kaldı')
    expect(openBody.textContent).toContain('Şimdiye dek gerçekleşen: +$175.00')
    expect(openBody.textContent).toContain('Gerçekleşmemiş:')
    expect(openBody.textContent).toContain('Satışlar (gerçekleşen kâr/zarar)')

    // Tüm işlemler default closed details element
    const details = openBody.querySelector('details.all-txns') as HTMLDetailsElement
    expect(details).toBeInTheDocument()
    expect(details.open).toBe(false)
    prices.bySymbol = {}
    prices.status = 'idle'
  })

  it('G11: renders ⚠ ödünç badge on borrowed sale in sales table', async () => {
    const ds = structuredClone(fixture)
    ds.portfolios.push({ kod: 'DELTA', ad: 'Delta Portföy', aktif: true })
    // ASTOR is bought in ALFA. Add sale in DELTA.
    ds.transactions.push({
      id: 't_delta_sat',
      tarih: '2026-08-01',
      hesap: 'MIDAS',
      portfoy: 'DELTA',
      enstruman: 'ASTOR',
      yon: 'SAT',
      lot: 50,
      girisParaBirimi: 'USD',
      fiyat_tl: null,
      fiyat_usd: 10,
      kur: 34,
      komisyon_usd: 0,
      brut_usd: 500,
      net_usd: 500,
      not: '',
      kaynak: 'migration',
      olusturulma: null,
    })

    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const d = get(s)

    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })

    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    const astorRow = within(openTable).getByText('ASTOR').closest('tr')!
    await fireEvent.click(astorRow)

    const badge = openTable.querySelector('.badge-warn')
    expect(badge).toBeInTheDocument()
    expect(badge?.textContent).toContain('⚠ ödünç')
  })

  it('renders holding duration panel with averages, medians and histogram (H6)', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })

    const panel = container.querySelector('[data-testid="holding-panel"]')
    expect(panel).toBeInTheDocument()
    expect(panel?.textContent).toContain('Tutma süresi dağılımı')
    expect(panel?.textContent).toContain('Kazanan işlemler')
    expect(panel?.textContent).toContain('Kaybeden işlemler')
    expect(panel?.textContent).toContain('ortalama')
    expect(panel?.textContent).toContain('medyan')

    // 5 buckets
    expect(panel?.textContent).toContain('0–7 gün')
    expect(panel?.textContent).toContain('8–30 gün')
    expect(panel?.textContent).toContain('31–90 gün')
    expect(panel?.textContent).toContain('91–365 gün')
    expect(panel?.textContent).toContain('365+ gün')
  })

  it('positions without levels get no extra column and no badge', async () => {
    const d = await v()
    const { container } = render(Pozisyonlar, {
      props: { dataset: d.dataset, derived: d.derived },
    })
    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    expect(openTable.querySelectorAll('.badge-level-cross').length).toBe(0)
    const ths = Array.from(openTable.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(ths).toContain('Seviye')
    expect(ths).not.toContain('Destek')
    expect(ths).not.toContain('Direnç')
    expect(ths).not.toContain('Hedef')
  })

  it('shows distance % and crossing badges on positions with levels', async () => {
    const d = await v()
    const ds = JSON.parse(JSON.stringify(d.dataset))
    const astorInst = ds.instruments.find((i: any) => i.kod === 'ASTOR')
    astorInst.seviyeler = {
      destek: 80,
      direnc: 120,
      hedef: 150,
      birim: 'TL',
    }

    prices.bySymbol = { 'ASTOR.IS': { price: 130, currency: 'TRY', priceUsd: 4 } }
    prices.status = 'ready'

    const { container } = render(Pozisyonlar, {
      props: { dataset: ds, derived: d.derived },
    })

    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    const astorRow = within(openTable).getByText('ASTOR').closest('tr')!

    expect(astorRow.textContent).toContain('D: 80 (+62.5%)')
    expect(astorRow.textContent).toContain('R: 120 (+8.3%)')
    expect(astorRow.textContent).toContain('H: 150 (-13.3%)')

    expect(astorRow.querySelector('.badge-level-cross.gain')?.textContent).toContain('R aşıldı')
    expect(astorRow.textContent).not.toContain('D kırıldı')

    prices.bySymbol = {}
    prices.status = 'idle'
  })

  it('level entry in detail saves to instruments and survives reload', async () => {
    let savedInstruments: any[] = []
    const d = await v()
    const ds = JSON.parse(JSON.stringify(d.dataset))
    const s = createAppStore()
    const fakeSource = {
      id: 'local' as const,
      load: () => Promise.resolve(ds),
      save: async (file: string, data: any) => {
        if (file === 'instruments') {
          savedInstruments = data
          ds.instruments = data
        }
      },
    }
    await load(s, fakeSource)
    const fresh = get(s)

    const { container } = render(Pozisyonlar, {
      props: {
        dataset: fresh.dataset,
        derived: fresh.derived,
        source: fakeSource,
        store: s,
      },
    })

    const openTable = container.querySelector('[data-testid="open-table"]') as HTMLElement
    const astorRow = within(openTable).getByText('ASTOR').closest('tr')!
    await fireEvent.click(astorRow)

    const editor = container.querySelector('[data-testid="level-editor-ASTOR"]') as HTMLElement
    expect(editor).toBeInTheDocument()

    const dInput = within(editor).getByTestId('input-destek')
    const rInput = within(editor).getByTestId('input-direnc')
    const hInput = within(editor).getByTestId('input-hedef')
    const saveBtn = within(editor).getByTestId('btn-save-levels')

    await fireEvent.input(dInput, { target: { value: '95.5' } })
    await fireEvent.input(rInput, { target: { value: '115' } })
    await fireEvent.input(hInput, { target: { value: '140' } })
    await fireEvent.click(saveBtn)

    expect(savedInstruments.length).toBeGreaterThan(0)
    const savedAstor = savedInstruments.find((i) => i.kod === 'ASTOR')
    expect(savedAstor.seviyeler).not.toBeNull()
    expect(savedAstor.seviyeler.destek).toBe(95.5)
    expect(savedAstor.seviyeler.direnc).toBe(115)
    expect(savedAstor.seviyeler.hedef).toBe(140)
    expect(savedAstor.seviyeler.birim).toBe('TL')
    expect(savedAstor.seviyeler.guncelleme).toBeDefined()

    await load(s, fakeSource)
    const reloaded = get(s)
    const reloadedAstor = reloaded.dataset?.instruments.find((i) => i.kod === 'ASTOR')
    expect(reloadedAstor?.seviyeler?.destek).toBe(95.5)
  })
})
