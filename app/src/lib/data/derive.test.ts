import { describe, it, expect } from 'vitest'
import { derivePositions } from './derive'
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
  })

  it('full exit removes the open position', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2019-07-01', enstruman: 'XAU', yon: 'AL', lot: 10, fiyat_usd: 50, net_usd: 500 }),
      t({ id: 'b', tarih: '2024-01-01', enstruman: 'XAU', yon: 'SAT', lot: 10, fiyat_usd: 80, net_usd: 800 }),
    ])
    expect(r.open.find((p) => p.kod === 'XAU')).toBeUndefined()
    expect(r.realizedTotalUsd).toBeCloseTo(300, 9)
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
