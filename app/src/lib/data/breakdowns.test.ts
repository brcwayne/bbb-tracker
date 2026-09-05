import { describe, it, expect } from 'vitest'
import { holdingsByPortfolio, holdingsByBroker } from './breakdowns'
import { fixture } from '../../fixtures/dataset'
import { derivePositions } from './derive'
import type { OpenPosition } from './derive'
import type { PriceLookup } from './unrealized'
import type { Transaction, AssetTransfer, Broker } from './types'

const open = derivePositions(fixture.transactions).open
const noPrices: PriceLookup = { bySymbol: {}, usdPerGram: null }
// THYAO priced, others not
const somePrices: PriceLookup = { bySymbol: { 'THYAO.IS': { priceUsd: 60 } }, usdPerGram: null }

describe('holdingsByPortfolio', () => {
  it('groups open positions by latest-txn portfoy, sorted by cost desc', () => {
    const g = holdingsByPortfolio(open, fixture.transactions, fixture.instruments, [], noPrices)
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
    const g = holdingsByPortfolio(open, fixture.transactions, fixture.instruments, [], somePrices)
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
    const g = holdingsByBroker(open, fixture.transactions, fixture.instruments, fixture.brokers, [], noPrices)
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

describe('holdingsByPortfolio — asset transfers', () => {
  it('a later transfer re-attributes the holding to the new portfolio', () => {
    const open: OpenPosition[] = [{ kod: 'THYAO', lot: 10, ortMaliyetUsd: 5, toplamMaliyetUsd: 50 }]
    const txns: Transaction[] = [
      {
        id: 't1', tarih: '2026-01-01', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL',
        lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 5, kur: null, komisyon_usd: 0,
        brut_usd: 50, net_usd: 50, not: '', kaynak: 'manual', olusturulma: null,
      },
    ]
    const transfers: AssetTransfer[] = [
      {
        id: 'at1', tarih: '2026-02-01', enstruman: 'THYAO', lot: 10,
        kaynakHesap: 'MIDAS', hedefHesap: 'MIDAS', kaynakPortfoy: 'ENIS', hedefPortfoy: 'ALFA',
        aciklama: '', kaynak: 'manual',
      },
    ]
    const groups = holdingsByPortfolio(open, txns, [], transfers, { bySymbol: {}, usdPerGram: null })
    const alfa = groups.find((g) => g.key === 'ALFA')
    const enis = groups.find((g) => g.key === 'ENIS')
    expect(alfa?.rows.map((r) => r.kod)).toEqual(['THYAO'])
    expect(enis?.rows ?? []).toHaveLength(0)
  })
})

describe('breakdowns — same-day transfer beats same-day transaction (FIX 1)', () => {
  it('a same-date AssetTransfer wins attribution over a same-date Transaction, regardless of id ordering', () => {
    // Regression for a lexicographic id tie-break bug: Transaction ids are prefixed `t_` and
    // AssetTransfer ids `at_`, so 'at_...' < 't_...' always — meaning on an exact-date tie the
    // Transaction used to win no matter which event was semantically later. A user who buys a
    // stock and transfers it to another broker the same day must have the transfer stick.
    const open: OpenPosition[] = [{ kod: 'THYAO', lot: 10, ortMaliyetUsd: 5, toplamMaliyetUsd: 50 }]
    const txns: Transaction[] = [
      {
        id: 't_1', tarih: '2026-09-05', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL',
        lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 5, kur: null, komisyon_usd: 0,
        brut_usd: 50, net_usd: 50, not: '', kaynak: 'manual', olusturulma: null,
      },
    ]
    const transfers: AssetTransfer[] = [
      {
        id: 'at_1', tarih: '2026-09-05', enstruman: 'THYAO', lot: 10,
        kaynakHesap: 'MIDAS', hedefHesap: 'GARAN', kaynakPortfoy: 'ENIS', hedefPortfoy: 'ENIS',
        aciklama: '', kaynak: 'manual',
      },
    ]
    const brokers: Broker[] = [
      { kod: 'MIDAS', ad: 'Midas', tur: 'aracı kurum', sahip: 'Enis', aktif: true },
      { kod: 'GARAN', ad: 'Garanti Yatırım', tur: 'aracı kurum', sahip: 'Enis', aktif: true },
    ]
    const groups = holdingsByBroker(open, txns, [], brokers, transfers, { bySymbol: {}, usdPerGram: null })
    const midas = groups.find((g) => g.key === 'Midas')
    const garan = groups.find((g) => g.key === 'Garanti Yatırım')
    expect(garan?.rows.map((r) => r.kod)).toEqual(['THYAO'])
    expect(midas?.rows ?? []).toHaveLength(0)
  })
})

describe('breakdowns — transfer with null hedefPortfoy (FIX 2)', () => {
  it('does not create a blank-titled portfolio group, but still moves the hesap attribution', () => {
    // A transfer's hedefPortfoy: null means "portfolio unchanged" — it must be excluded from
    // the portfoy attribution stream entirely, not coerced to '' (which used to create a
    // blank-titled group in holdingsByPortfolio). The hesap stream is unaffected by this and
    // must still pick up hedefHesap, which is always present on a transfer.
    const open: OpenPosition[] = [{ kod: 'THYAO', lot: 10, ortMaliyetUsd: 5, toplamMaliyetUsd: 50 }]
    const txns: Transaction[] = [
      {
        id: 't_1', tarih: '2026-01-01', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL',
        lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 5, kur: null, komisyon_usd: 0,
        brut_usd: 50, net_usd: 50, not: '', kaynak: 'manual', olusturulma: null,
      },
    ]
    const transfers: AssetTransfer[] = [
      {
        id: 'at_1', tarih: '2026-02-01', enstruman: 'THYAO', lot: 10,
        kaynakHesap: 'MIDAS', hedefHesap: 'GARAN', kaynakPortfoy: 'ENIS', hedefPortfoy: null,
        aciklama: '', kaynak: 'manual',
      },
    ]
    const brokers: Broker[] = [
      { kod: 'MIDAS', ad: 'Midas', tur: 'aracı kurum', sahip: 'Enis', aktif: true },
      { kod: 'GARAN', ad: 'Garanti Yatırım', tur: 'aracı kurum', sahip: 'Enis', aktif: true },
    ]

    const portfolioGroups = holdingsByPortfolio(open, txns, [], transfers, { bySymbol: {}, usdPerGram: null })
    expect(portfolioGroups.map((g) => g.key)).not.toContain('')
    const enis = portfolioGroups.find((g) => g.key === 'ENIS')
    expect(enis?.rows.map((r) => r.kod)).toEqual(['THYAO'])

    const brokerGroups = holdingsByBroker(open, txns, [], brokers, transfers, { bySymbol: {}, usdPerGram: null })
    const garan = brokerGroups.find((g) => g.key === 'Garanti Yatırım')
    const midas = brokerGroups.find((g) => g.key === 'Midas')
    expect(garan?.rows.map((r) => r.kod)).toEqual(['THYAO'])
    expect(midas?.rows ?? []).toHaveLength(0)
  })
})
