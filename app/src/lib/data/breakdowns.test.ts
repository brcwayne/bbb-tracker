import { describe, it, expect } from 'vitest'
import { holdingsByPortfolio, holdingsByBroker } from './breakdowns'
import { fixture } from '../../fixtures/dataset'
import { derivePositions } from './derive'
import type { PriceLookup } from './unrealized'

const open = derivePositions(fixture.transactions).open
const noPrices: PriceLookup = { bySymbol: {}, usdPerGram: null }
// THYAO priced, others not
const somePrices: PriceLookup = { bySymbol: { 'THYAO.IS': { priceUsd: 60 } }, usdPerGram: null }

describe('holdingsByPortfolio', () => {
  it('groups open positions by latest-txn portfoy, sorted by cost desc', () => {
    const g = holdingsByPortfolio(open, fixture.transactions, fixture.instruments, noPrices)
    // ASTOR/THYAO/XAU → portfolios ALFA (ASTOR) and ENIS (THYAO, XAU)
    const keys = g.map((x) => x.key)
    expect(keys).toContain('ENIS')
    expect(keys).toContain('ALFA')
    const enis = g.find((x) => x.key === 'ENIS')!
    expect(enis.rows.map((r) => r.kod).sort()).toEqual(['THYAO', 'XAU'])
    expect(enis.totalCostUsd).toBeCloseTo(1001.5 + 450, 4)
    expect(enis.totalValueUsd).toBeNull()
    expect(enis.unrealUsd).toBeNull()
    // sorted: ENIS (1451.5) before ALFA (225)
    expect(keys.indexOf('ENIS')).toBeLessThan(keys.indexOf('ALFA'))
  })

  it('fills value + unreal when at least one row is priced', () => {
    const g = holdingsByPortfolio(open, fixture.transactions, fixture.instruments, somePrices)
    const enis = g.find((x) => x.key === 'ENIS')!
    const thyao = enis.rows.find((r) => r.kod === 'THYAO')!
    expect(thyao.guncelFiyatUsd).toBe(60)
    expect(thyao.degerUsd).toBeCloseTo(60 * 25, 4)
    // XAU has no price → its deger falls back to cost in the group total
    expect(enis.totalValueUsd).toBeCloseTo(60 * 25 + 450, 4)
    expect(enis.unrealUsd).toBeCloseTo(enis.totalValueUsd! - enis.totalCostUsd, 4)
  })
})

describe('holdingsByBroker', () => {
  it('one group per broker in order, empty brokers included', () => {
    const g = holdingsByBroker(open, fixture.transactions, fixture.instruments, fixture.brokers, noPrices)
    expect(g.map((x) => x.key)).toEqual(fixture.brokers.map((b) => b.ad))
    const midas = g.find((x) => x.key === 'Midas')!
    expect(midas.sahip).toBe('Enis')
    // ASTOR latest txn hesap MIDAS; THYAO GARAN; XAU KASA
    expect(midas.rows.map((r) => r.kod)).toEqual(['ASTOR'])
    const garan = g.find((x) => x.key === 'Garanti Yatırım')!
    expect(garan.rows.map((r) => r.kod)).toEqual(['THYAO'])
    const kasa = g.find((x) => x.key === 'Kasa (fiziki)')!
    expect(kasa.rows.map((r) => r.kod)).toEqual(['XAU'])
  })
})
