import { describe, it, expect } from 'vitest'
import {
  derivePositions,
  allocationByClass, allocationByPortfolio, gainBuckets, periodPerformance,
  topMovers, winLoss, positionStats,
} from './derive'
import { fixture } from '../../fixtures/dataset'
import type { Transaction } from './types'

const t = (o: Partial<Transaction>): Transaction => ({
  id: o.id ?? 'x', tarih: o.tarih ?? '2020-01-01', hesap: 'MIDAS', portfoy: 'ALFA',
  enstruman: o.enstruman ?? 'ASTOR', yon: o.yon ?? 'AL', lot: o.lot ?? 0, girisParaBirimi: 'TL',
  fiyat_tl: null, fiyat_usd: o.fiyat_usd ?? 0, kur: 1, komisyon_usd: o.komisyon_usd ?? 0,
  brut_usd: 0, net_usd: o.net_usd ?? 0, not: '', kaynak: 'migration', olusturulma: null,
})

describe('derivePositions', () => {
  it('moving average + realized on partial sell', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2020-01-06', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
      t({ id: 'b', tarih: '2020-06-10', yon: 'AL', lot: 100, fiyat_usd: 2, net_usd: 200 }),
      t({ id: 'c', tarih: '2021-03-15', yon: 'SAT', lot: 50, fiyat_usd: 5, net_usd: 250 }),
    ])
    const astor = r.open.find((p) => p.kod === 'ASTOR')!
    expect(astor.lot).toBe(150)
    expect(astor.ortMaliyetUsd).toBeCloseTo(1.5, 9)
    expect(astor.toplamMaliyetUsd).toBeCloseTo(225, 9)
    expect(r.realizedTotalUsd).toBeCloseTo(175, 9)
    expect(r.closed[0].gerceklesmisKzUsd).toBeCloseTo(175, 9)
    // sold-lot cost basis: 50 lots @ avg cost 1.5
    expect(r.closed[0].satisMaliyetUsd).toBeCloseTo(75, 9)
  })

  it('full exit removes the open position', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2019-07-01', enstruman: 'XAU', yon: 'AL', lot: 10, fiyat_usd: 50, net_usd: 500 }),
      t({ id: 'b', tarih: '2024-01-01', enstruman: 'XAU', yon: 'SAT', lot: 10, fiyat_usd: 80, net_usd: 800 }),
    ])
    expect(r.open.find((p) => p.kod === 'XAU')).toBeUndefined()
    expect(r.realizedTotalUsd).toBeCloseTo(300, 9)
    // full exit: sold-lot basis == the whole buy notional
    expect(r.closed[0].satisMaliyetUsd).toBeCloseTo(500, 9)
  })

  it('oversell is flagged and clamped', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2020-01-01', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
      t({ id: 'b', tarih: '2020-02-01', yon: 'SAT', lot: 250, fiyat_usd: 2, net_usd: 500 }),
    ])
    expect(r.errors.some((e) => e.includes('aşırı satış'))).toBe(true)
    expect(r.open.find((p) => p.kod === 'ASTOR')).toBeUndefined()
    expect(r.realizedTotalUsd).toBeCloseTo(100, 9)
  })

  it('processes by (tarih, id) regardless of array order', () => {
    const r = derivePositions([
      t({ id: 'c', tarih: '2021-03-15', yon: 'SAT', lot: 50, fiyat_usd: 5, net_usd: 250 }),
      t({ id: 'a', tarih: '2020-01-06', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
      t({ id: 'b', tarih: '2020-06-10', yon: 'AL', lot: 100, fiyat_usd: 2, net_usd: 200 }),
    ])
    expect(r.realizedTotalUsd).toBeCloseTo(175, 9)
  })
})

describe('allocation', () => {
  it('by class, cost-weighted, sorted desc', () => {
    const pos = derivePositions(fixture.transactions)
    const a = allocationByClass(pos.open, fixture.instruments)
    // açık: ASTOR 150@1.5 = 225 (BIST), THYAO 25 net 1001.5 (BIST); XAU 5 lot @ 90 = 450 (ALTIN)
    const bist = a.find((r) => r.key === 'BIST')!
    expect(bist.tutarUsd).toBeCloseTo(1226.5, 6)
    expect(a.reduce((s, r) => s + r.pay, 0)).toBeCloseTo(1, 9)
  })

  it('by portfolio, keyed on latest transaction', () => {
    const pos = derivePositions(fixture.transactions)
    const a = allocationByPortfolio(pos.open, fixture.transactions)
    expect(a[0].key).toBe('ENIS')
    // ENIS: THYAO 1001.5 + open XAU lot 450 (latest XAU txn is t_g @ portfoy ENIS)
    expect(a[0].tutarUsd).toBeCloseTo(1451.5, 6)
    expect(a.find((r) => r.key === 'ALFA')!.tutarUsd).toBeCloseTo(225, 6)
    expect(a.reduce((s, r) => s + r.pay, 0)).toBeCloseTo(1, 9)
  })
})

describe('gainBuckets', () => {
  it('buckets closed positions by return % (sold-lot basis)', () => {
    const pos = derivePositions(fixture.transactions)
    const b = gainBuckets(pos.closed)
    // ASTOR kapalı: kz 175 / satisMaliyet 75 -> +233%; XAU: 300 / 500 -> +60%
    // ikisi de en üst (">20%") kovada
    expect(b.at(-1)!.label).toBe('>20%')
    expect(b.at(-1)!.count).toBe(2)
    expect(b[0].label).toBe('<-22%')
    expect(b.reduce((s, r) => s + r.count, 0)).toBe(2)
  })
})

describe('periodPerformance', () => {
  it('sums netKZ over ranges with null-safe pct', () => {
    const rows = periodPerformance(fixture.snapshots, new Date('2024-02-01'))
    const ytd = rows.find((r) => r.period === 'YTD')!
    expect(ytd.netKzUsd).toBeCloseTo(300, 6) // yalnız 2024-01 snapshot
  })
})

describe('topMovers / winLoss / positionStats', () => {
  it('ranks and counts', () => {
    const pos = derivePositions(fixture.transactions)
    const m = topMovers(pos.closed, 5)
    expect(m.gainers[0].kod).toBe('XAU') // XAU +300 > ASTOR +175
    const wl = winLoss(pos.closed)
    expect(wl.wins).toBe(2)
    expect(wl.losses).toBe(0)
    const st = positionStats(pos.closed)
    expect(st.win).toBe(2)
    expect(st.enBuyukKazanc).toBeCloseTo(300, 6)
  })
})
