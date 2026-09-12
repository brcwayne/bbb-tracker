import { describe, it, expect } from 'vitest'
import { dashboardTotals, thisMonthPerf, liveEquity } from './dashboard'
import { fixture } from '../../fixtures/dataset'
import { derivePositions } from './derive'

const pos = derivePositions(fixture.transactions)

describe('dashboardTotals', () => {
  it('computes the 7 top-block fields (no live prices)', () => {
    const d = dashboardTotals(fixture, pos, null)
    expect(d.toplamSermaye).toBeCloseTo(5000, 6)   // Σ YATIRMA
    expect(d.cekimler).toBe(0)
    expect(d.temettu).toBeCloseTo(4, 6)            // Σ TEMETTU
    expect(d.realized).toBeCloseTo(475, 6)         // 175 + 300
    expect(d.icerideKalan).toBeCloseTo(475 + 4 - 0, 6)
    expect(d.donemSonu).toBeCloseTo(5000 + 479 - 0, 6)
    expect(d.gerceklesmemisKz).toBeNull()
    expect(d.gerceklesmemisOzkaynak).toBeNull()
    // open cost = 225 (ASTOR) + 1001.5 (THYAO) + 450 (XAU) = 1676.5
    expect(d.nakitBakiyesi).toBeCloseTo(5479 - 1676.5, 4)
  })

  it('fills unrealized fields when a total is supplied', () => {
    const d = dashboardTotals(fixture, pos, 1000)
    expect(d.gerceklesmemisKz).toBe(1000)
    expect(d.gerceklesmemisOzkaynak).toBeCloseTo(5479 + 1000, 4)
  })

  it('splits closed P/L into gain / loss / net', () => {
    const d = dashboardTotals(fixture, pos, null)
    // fixture closed: ASTOR +175, XAU +300 → both gains, no losses
    expect(d.totalGain).toBeCloseTo(475, 6)
    expect(d.totalLoss).toBe(0)
    expect(d.gainLoss).toBeCloseTo(475, 6)
  })

  it('honours withdrawals', () => {
    const ds = structuredClone(fixture)
    ds.cashflows.push({
      id: 'c_x', tarih: '2024-02-01', hesap: 'TOPLU', portfoy: null, tur: 'CEKME',
      enstruman: null, tutar_tl: null, tutar_usd: 1000, kur: null, aciklama: 'çekim', kaynak: 'migration',
    })
    const d = dashboardTotals(ds, pos, null)
    expect(d.cekimler).toBe(1000)
    expect(d.icerideKalan).toBeCloseTo(475 + 4 - 1000, 6)
    expect(d.donemSonu).toBeCloseTo(5000 + d.icerideKalan - 1000, 6)
  })
})

describe('thisMonthPerf', () => {
  it('reads the newest snapshot', () => {
    const m = thisMonthPerf(fixture.snapshots)!
    expect(m.ay).toBe('Oca 2024')
    expect(m.begCapital).toBe(5175)
    expect(m.divReceived).toBe(4)
    expect(m.netKz).toBe(300)
    expect(m.endCapital).toBe(5475)
    expect(m.withdrawal).toBe(0)
  })
  it('returns null with no snapshots', () => {
    expect(thisMonthPerf([])).toBeNull()
  })
})

describe('liveEquity', () => {
  const nakit = 1000

  it('computes live equity with prices and diff against snapshot', () => {
    // ASTOR open: 150 lot. THYAO open: 25 lot. XAU open: 5 lot.
    const p = {
      bySymbol: {
        'ASTOR.IS': { price: 100, currency: 'TRY', priceUsd: 3 },
        'THYAO.IS': { price: 300, currency: 'TRY', priceUsd: 50 },
      },
      usdPerGram: 100, // XAU has altinKatsayi: 1 -> 100 USD/lot
    }

    const eq = liveEquity(fixture, pos, p, nakit)
    // 150 * 3 = 450 (ASTOR)
    // 25 * 50 = 1250 (THYAO)
    // 5 * 100 = 500 (XAU)
    // total pos value = 2200
    expect(eq.pozisyonDegeriUsd).toBeCloseTo(2200, 4)
    expect(eq.nakitUsd).toBe(1000)
    expect(eq.canliOzkaynakUsd).toBeCloseTo(3200, 4)
    expect(eq.snapshotOzkaynakUsd).toBe(5475)
    expect(eq.snapshotTarih).toBe('2024-01-31')
    expect(eq.farkUsd).toBeCloseTo(3200 - 5475, 4)
    expect(eq.fiyatsizPozisyon).toBe(0)
  })

  it('falls back to position cost when prices are missing', () => {
    const emptyPrices = { bySymbol: {}, usdPerGram: null }
    const eq = liveEquity(fixture, pos, emptyPrices, nakit)

    const expectedCost = pos.open.reduce((s, x) => s + x.toplamMaliyetUsd, 0)
    expect(eq.pozisyonDegeriUsd).toBeCloseTo(expectedCost, 4)
    expect(eq.fiyatsizPozisyon).toBe(pos.open.length)
    expect(eq.canliOzkaynakUsd).toBeCloseTo(expectedCost + nakit, 4)
  })

  it('handles empty snapshots without exploding', () => {
    const ds = structuredClone(fixture)
    ds.snapshots = []
    const eq = liveEquity(ds, pos, { bySymbol: {}, usdPerGram: null }, nakit)

    expect(eq.snapshotOzkaynakUsd).toBeNull()
    expect(eq.snapshotTarih).toBeNull()
    expect(eq.farkUsd).toBeNull()
  })

  it('detects threshold divergence (> 5%)', () => {
    const emptyPrices = { bySymbol: {}, usdPerGram: null }
    const eq = liveEquity(fixture, pos, emptyPrices, nakit)
    // eq.canliOzkaynakUsd = 1676.5 + 1000 = 2676.5
    // snapshot = 5475
    // |2676.5 - 5475| / 5475 = 2798.5 / 5475 = 51.1% > 5%
    expect(eq.snapshotOzkaynakUsd).toBe(5475)
    expect(eq.farkUsd).not.toBeNull()
    const relDiff = Math.abs(eq.farkUsd!) / eq.snapshotOzkaynakUsd!
    expect(relDiff).toBeGreaterThan(0.05)
  })
})

