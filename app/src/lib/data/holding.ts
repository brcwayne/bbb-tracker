import type { SaleEvent } from './ledger'

export interface HoldingBucket {
  label: string
  minDays: number
  maxDays: number
  winCount: number
  lossCount: number
  totalCount: number
}

export interface HoldingStats {
  totalSales: number
  validSalesCount: number
  excludedCount: number
  winCount: number
  lossCount: number
  avgWin: number
  medianWin: number
  avgLoss: number
  medianLoss: number
  diffPct: number
  comment: string | null
  maxBucketCount: number
  buckets: HoldingBucket[]
}

export function calcMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 !== 0) {
    return sorted[mid]
  }
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
}

export function calcAverage(values: number[]): number {
  if (values.length === 0) return 0
  const sum = values.reduce((acc, v) => acc + v, 0)
  return Math.round((sum / values.length) * 10) / 10
}

const BUCKET_DEFS = [
  { label: '0–7', minDays: 0, maxDays: 7 },
  { label: '8–30', minDays: 8, maxDays: 30 },
  { label: '31–90', minDays: 31, maxDays: 90 },
  { label: '91–365', minDays: 91, maxDays: 365 },
  { label: '365+', minDays: 366, maxDays: Infinity },
]

export function calculateHoldingStats(sales: SaleEvent[] = []): HoldingStats {
  const totalSales = sales.length
  let excludedCount = 0

  const winDays: number[] = []
  const lossDays: number[] = []

  const buckets: HoldingBucket[] = BUCKET_DEFS.map((b) => ({
    ...b,
    winCount: 0,
    lossCount: 0,
    totalCount: 0,
  }))

  for (const s of sales) {
    if (s.tutmaGunu == null) {
      excludedCount++
      continue
    }

    const days = Math.max(0, s.tutmaGunu)
    const isWin = s.kzUsd > 0
    const isLoss = s.kzUsd < 0

    if (isWin) {
      winDays.push(days)
    } else if (isLoss) {
      lossDays.push(days)
    }

    // Find bucket
    const targetBucket = buckets.find((b) => days >= b.minDays && days <= b.maxDays)
    if (targetBucket) {
      if (isWin) targetBucket.winCount++
      if (isLoss) targetBucket.lossCount++
      targetBucket.totalCount++
    }
  }

  const avgWin = calcAverage(winDays)
  const medianWin = calcMedian(winDays)
  const avgLoss = calcAverage(lossDays)
  const medianLoss = calcMedian(lossDays)

  let diffPct = 0
  let comment: string | null = null

  if (winDays.length > 0 && lossDays.length > 0) {
    const base = Math.max(avgWin, avgLoss)
    if (base > 0) {
      diffPct = Math.abs(avgWin - avgLoss) / base
      if (diffPct > 0.20) {
        if (avgLoss < avgWin) {
          comment = 'Kaybeden işlemleri kazananlardan daha kısa tutuyorsun.'
        } else {
          comment = 'Kaybeden işlemleri kazananlardan daha uzun tutuyorsun.'
        }
      }
    }
  }

  return {
    totalSales,
    validSalesCount: totalSales - excludedCount,
    excludedCount,
    winCount: winDays.length,
    lossCount: lossDays.length,
    avgWin,
    medianWin,
    avgLoss,
    medianLoss,
    diffPct,
    comment,
    maxBucketCount: Math.max(...buckets.map((x) => Math.max(x.winCount, x.lossCount)), 1),
    buckets,
  }
}
