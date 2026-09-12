import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Portfoyler from './Portfoyler.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('Portfoyler', () => {
  it('shows a panel per non-empty portfolio with its holdings', async () => {
    const d = await v()
    const { getAllByText, container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })
    // Each portfolio's name now appears three times — a label in each of the two
    // pie rows, plus its holdings panel's SectionHeader title.
    expect(getAllByText('ENIS').length).toBeGreaterThanOrEqual(2)
    expect(getAllByText('ALFA').length).toBeGreaterThanOrEqual(2)
    // THYAO + XAU live under ENIS
    expect(container.textContent).toContain('THYAO')
    expect(container.textContent).toContain('XAU')
    // priceless → dash somewhere in the value columns
    expect(container.textContent).toContain('—')
  })

  it('has a single pie row connected to settings.basis (H8)', async () => {
    const { settings, setBasis } = await import('../lib/settings.svelte')
    setBasis('deger')
    const d = await v()
    const { container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })
    expect(container.textContent).toContain('Portföy dağılımı (güncel değer bazlı)')
    expect(container.textContent).not.toContain('Maliyet dağılımı')

    // Flip to maliyet
    const { tick } = await import('svelte')
    setBasis('maliyet')
    await tick()
    expect(container.textContent).toContain('Portföy dağılımı (maliyet bazlı)')
  })

  it('remembers collapsed pie row across mounts (H8)', async () => {
    const d = await v()
    const first = render(Portfoyler, { props: { dataset: d.dataset, view: d.derived } })
    const toggle = first.container.querySelector('[data-testid="pf-pie-toggle"]') as HTMLButtonElement
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    first.unmount()

    const second = render(Portfoyler, { props: { dataset: d.dataset, view: d.derived } })
    const secondToggle = second.container.querySelector('[data-testid="pf-pie-toggle"]') as HTMLButtonElement
    expect(secondToggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('renders an empty state without data', () => {
    const { getByText } = render(Portfoyler, { props: {} })
    expect(getByText(/Portföyler/i)).toBeInTheDocument()
  })

  it('toggling a row open reveals the broker breakdown detail', async () => {
    const d = await v()
    const { getByText, queryByText } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })
    expect(queryByText(/Kurum Dağılımı/i)).not.toBeInTheDocument()

    // Click on THYAO row
    const thyaoCell = getByText('THYAO')
    await fireEvent.click(thyaoCell)

    expect(getByText(/Kurum Dağılımı/i)).toBeInTheDocument()
    expect(getByText(/Garanti Yatırım/i)).toBeInTheDocument()
  })

  it('renders top summary comparison table with honesty hint', async () => {
    const d = await v()
    const { getByText, container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })

    expect(getByText('Portföy Karşılaştırması')).toBeInTheDocument()
    expect(
      getByText(/Yaklaşık ölçüdür — gerçek zaman ağırlıklı getiri \(TWR\/IRR\) değildir/i),
    ).toBeInTheDocument()

    // Header columns check
    const ths = Array.from(container.querySelectorAll('.summary-table th')).map(
      (th) => th.textContent?.trim(),
    )
    expect(ths).toEqual([
      'Portföy',
      'Açık Değer',
      'Gerçekleşmiş',
      'Gerçekleşmemiş',
      'Temettü',
      'Toplam K/Z',
      'Getiri %',
      'Yıllık ≈ %',
    ])
  })

  it('renders saklama badge and hint for XAU portfolio', async () => {
    const ds = structuredClone(fixture)
    ds.portfolios.push({ kod: 'XAU', ad: 'Altın Saklama', aktif: true })
    ds.transactions.push({
      id: 't_xau_1',
      tarih: '2023-01-01',
      hesap: 'KASA',
      portfoy: 'XAU',
      enstruman: 'XAU',
      yon: 'AL',
      lot: 5,
      girisParaBirimi: 'USD',
      fiyat_tl: null,
      fiyat_usd: 1900,
      kur: 19,
      komisyon_usd: 0,
      brut_usd: 9500,
      net_usd: 9500,
      not: '',
      kaynak: 'migration',
      olusturulma: null,
    })

    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const d = get(s)

    const { getByText, container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })

    const badge = container.querySelector('.badge-saklama')
    expect(badge).toBeInTheDocument()
    expect(badge?.textContent).toBe('saklama')
    expect(getByText(/alım-satım portföyleriyle doğrudan kıyaslanmaz/i)).toBeInTheDocument()
  })

  it('renders two-line performance strip and collapsible closed trades per portfolio', async () => {
    const d = await v()
    const { container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })

    // Check two-line performance strip
    const phLines = container.querySelectorAll('.ph-line')
    expect(phLines.length).toBeGreaterThan(0)
    expect(container.textContent).toContain('maliyet')
    expect(container.textContent).toContain('değer')
    expect(container.textContent).toContain('gerç.mmiş')
    expect(container.textContent).toContain('gerçekleşmiş')
    expect(container.textContent).toContain('temettü')

    // Check collapsible closed trades
    const closedDetails = container.querySelector('details.closed-trades')
    expect(closedDetails).toBeInTheDocument()
    const summary = closedDetails?.querySelector('summary')
    expect(summary?.textContent).toContain('Kapanan İşlemler')

    // Table columns inside closed trades
    const closedThs = Array.from(closedDetails!.querySelectorAll('th')).map((th) =>
      th.textContent?.trim(),
    )
    expect(closedThs).toEqual(['Tarih', 'Hisse', 'Lot', 'K/Z', '%', 'Kurum'])
  })

  it('displays — for Yıllık ≈ % when gunSayisi < 30', async () => {
    const ds = structuredClone(fixture)
    // Create a new portfolio whose trades are less than 30 days old
    ds.portfolios.push({ kod: 'BETA', ad: 'Beta Yeni', aktif: true })
    ds.transactions.push(
      {
        id: 't_b1',
        tarih: '2026-09-01',
        hesap: 'MIDAS',
        portfoy: 'BETA',
        enstruman: 'ASTOR',
        yon: 'AL',
        lot: 10,
        girisParaBirimi: 'USD',
        fiyat_tl: null,
        fiyat_usd: 10,
        kur: 34,
        komisyon_usd: 0,
        brut_usd: 100,
        net_usd: 100,
        not: '',
        kaynak: 'migration',
        olusturulma: null,
      },
      {
        id: 't_b2',
        tarih: '2026-09-05',
        hesap: 'MIDAS',
        portfoy: 'BETA',
        enstruman: 'ASTOR',
        yon: 'SAT',
        lot: 10,
        girisParaBirimi: 'USD',
        fiyat_tl: null,
        fiyat_usd: 12,
        kur: 34,
        komisyon_usd: 0,
        brut_usd: 120,
        net_usd: 120,
        not: '',
        kaynak: 'migration',
        olusturulma: null,
      },
    )

    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const d = get(s)

    const { container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })

    // In summary table, find row for BETA
    const rows = Array.from(container.querySelectorAll('.summary-table tbody tr'))
    const betaRow = rows.find((tr) => tr.textContent?.includes('BETA'))
    expect(betaRow).toBeDefined()
    // Yıllık ≈ % column is the 8th td (last one)
    const yillikCell = betaRow!.querySelectorAll('td')[7]
    expect(yillikCell.textContent?.trim()).toBe('—')
  })

  it('correctly divides a symbol held across multiple portfolios', async () => {
    const ds = structuredClone(fixture)
    // THYAO is bought in ALFA and ENIS
    ds.transactions.push({
      id: 't_split',
      tarih: '2024-02-01',
      hesap: 'MIDAS',
      portfoy: 'ALFA',
      enstruman: 'THYAO',
      yon: 'AL',
      lot: 50,
      girisParaBirimi: 'USD',
      fiyat_tl: null,
      fiyat_usd: 40,
      kur: 30,
      komisyon_usd: 0,
      brut_usd: 2000,
      net_usd: 2000,
      not: '',
      kaynak: 'migration',
      olusturulma: null,
    })

    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const d = get(s)

    const { container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })

    // Both ALFA and ENIS panels should have a THYAO row
    const panels = Array.from(container.querySelectorAll('.panel'))
    const alfaPanel = panels.find((p) => p.querySelector('.ph-title')?.textContent?.trim() === 'ALFA')
    const enisPanel = panels.find((p) => p.querySelector('.ph-title')?.textContent?.trim() === 'ENIS')

    expect(alfaPanel?.textContent).toContain('THYAO')
    expect(enisPanel?.textContent).toContain('THYAO')

    // In ALFA panel, THYAO lot is 50
    const alfaThyaoRow = Array.from(alfaPanel!.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('THYAO'),
    )
    expect(alfaThyaoRow?.textContent).toContain('50')

    // In ENIS panel, THYAO lot is 25
    const enisThyaoRow = Array.from(enisPanel!.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('THYAO'),
    )
    expect(enisThyaoRow?.textContent).toContain('25')
  })

  it('G11: renders ⚠ ödünç badge on borrowed sale rows in Kapanan İşlemler', async () => {
    const ds = structuredClone(fixture)
    ds.portfolios.push({ kod: 'DELTA', ad: 'Delta Portföy', aktif: true })
    // DELTA buys 10 THYAO, and sells 50 ASTOR (borrowed from ALFA)
    ds.transactions.push(
      {
        id: 't_delta_al',
        tarih: '2026-07-01',
        hesap: 'MIDAS',
        portfoy: 'DELTA',
        enstruman: 'THYAO',
        yon: 'AL',
        lot: 10,
        girisParaBirimi: 'USD',
        fiyat_tl: null,
        fiyat_usd: 10,
        kur: 34,
        komisyon_usd: 0,
        brut_usd: 100,
        net_usd: 100,
        not: '',
        kaynak: 'migration',
        olusturulma: null,
      },
      {
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
      },
    )

    const s = createAppStore()
    await load(s, { id: 'local', load: () => Promise.resolve(ds) })
    const d = get(s)

    const { container } = render(Portfoyler, {
      props: { dataset: d.dataset, view: d.derived },
    })

    const panels = Array.from(container.querySelectorAll('.panel'))
    const deltaPanel = panels.find((p) => p.querySelector('.ph-title')?.textContent?.trim() === 'DELTA')
    expect(deltaPanel).toBeDefined()

    const badge = deltaPanel!.querySelector('.badge-warn')
    expect(badge).toBeInTheDocument()
    expect(badge?.textContent).toContain('⚠ ödünç')
  })
})
