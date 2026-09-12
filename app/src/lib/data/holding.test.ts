import { describe, it, expect } from 'vitest'
import { calculateHoldingStats, calcAverage, calcMedian } from './holding'
import type { SaleEvent } from './ledger'

function mockSale(tutmaGunu: number | null, kzUsd: number): SaleEvent {
  return {
    txId: 'tx-test',
    tarih: '2026-08-01',
    kod: 'THYAO',
    hesap: 'MIDAS',
    portfoy: 'ALFA',
    lot: 10,
    satisFiyatUsd: 10,
    ortMaliyetUsd: 8,
    maliyetUsd: 80,
    hasilatUsd: 100,
    komisyonUsd: 1,
    kzUsd,
    kzPct: kzUsd / 80,
    kalanLot: 0,
    pozisyonKapandi: true,
    ilkAlisTarih: '2026-06-01',
    tutmaGunu,
    oduncAlindi: false,
  }
}

describe('calcMedian and calcAverage', () => {
  it('handles empty arrays', () => {
    expect(calcMedian([])).toBe(0)
    expect(calcAverage([])).toBe(0)
  })

  it('calculates median for odd and even length lists', () => {
    expect(calcMedian([10, 20, 30])).toBe(20)
    expect(calcMedian([10, 20, 30, 40])).toBe(25)
    expect(calcMedian([40, 10, 30, 20])).toBe(25)
  })

  it('calculates average accurately', () => {
    expect(calcAverage([10, 20, 30])).toBe(20)
    expect(calcAverage([10, 20])).toBe(15)
  })
})

describe('calculateHoldingStats (H6)', () => {
  it('excludes sales with tutmaGunu === null and tracks count', () => {
    const sales = [
      mockSale(null, 100),
      mockSale(null, -50),
      mockSale(15, 200),
    ]

    const stats = calculateHoldingStats(sales)
    expect(stats.totalSales).toBe(3)
    expect(stats.excludedCount).toBe(2)
    expect(stats.validSalesCount).toBe(1)
    expect(stats.winCount).toBe(1)
    expect(stats.lossCount).toBe(0)
    expect(stats.avgWin).toBe(15)
    expect(stats.medianWin).toBe(15)
  })

  it('correctly populates the 5 histogram buckets', () => {
    const sales = [
      mockSale(3, 50),     // 0-7 win
      mockSale(7, -20),    // 0-7 loss
      mockSale(15, 100),   // 8-30 win
      mockSale(45, -30),   // 31-90 loss
      mockSale(120, 80),   // 91-365 win
      mockSale(400, -10),  // 365+ loss
    ]

    const stats = calculateHoldingStats(sales)
    expect(stats.buckets[0].label).toBe('0–7')
    expect(stats.buckets[0].winCount).toBe(1)
    expect(stats.buckets[0].lossCount).toBe(1)

    expect(stats.buckets[1].label).toBe('8–30')
    expect(stats.buckets[1].winCount).toBe(1)
    expect(stats.buckets[1].lossCount).toBe(0)

    expect(stats.buckets[2].label).toBe('31–90')
    expect(stats.buckets[2].winCount).toBe(0)
    expect(stats.buckets[2].lossCount).toBe(1)

    expect(stats.buckets[3].label).toBe('91–365')
    expect(stats.buckets[3].winCount).toBe(1)
    expect(stats.buckets[3].lossCount).toBe(0)

    expect(stats.buckets[4].label).toBe('365+')
    expect(stats.buckets[4].winCount).toBe(0)
    expect(stats.buckets[4].lossCount).toBe(1)
  })

  it('renders comment when losing hold duration is >20% shorter than winning', () => {
    // Win avg: 100, Loss avg: 20 -> diff is 80% > 20%
    const sales = [
      mockSale(100, 50),
      mockSale(20, -30),
    ]

    const stats = calculateHoldingStats(sales)
    expect(stats.avgWin).toBe(100)
    expect(stats.avgLoss).toBe(20)
    expect(stats.comment).toBe('Kaybeden işlemleri kazananlardan daha kısa tutuyorsun.')
  })

  it('renders comment when losing hold duration is >20% longer than winning', () => {
    // Win avg: 20, Loss avg: 100 -> diff is 80% > 20%
    const sales = [
      mockSale(20, 50),
      mockSale(100, -30),
    ]

    const stats = calculateHoldingStats(sales)
    expect(stats.avgWin).toBe(20)
    expect(stats.avgLoss).toBe(100)
    expect(stats.comment).toBe('Kaybeden işlemleri kazananlardan daha uzun tutuyorsun.')
  })

  it('does NOT render comment when difference is <= 20%', () => {
    // Win avg: 100, Loss avg: 90 -> diff is 10% <= 20%
    const sales = [
      mockSale(100, 50),
      mockSale(90, -30),
    ]

    const stats = calculateHoldingStats(sales)
    expect(stats.comment).toBeNull()
  })
})
