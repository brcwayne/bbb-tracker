import { describe, it, expect } from 'vitest'
import { dashboardTotals, thisMonthPerf } from './dashboard'
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
