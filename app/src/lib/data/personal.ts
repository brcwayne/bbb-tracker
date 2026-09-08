import type { PersonalTx } from './types'

export interface MonthlyTotal {
  ay: string
  para: string
  toplam: number
}

export function monthlyTotals(rows: PersonalTx[], today: string, months = 12): MonthlyTotal[] {
  if (!rows.length) return []

  const year = parseInt(today.slice(0, 4), 10)
  const month = parseInt(today.slice(5, 7), 10)
  const startMonthIndex = year * 12 + (month - 1) - (months - 1)
  const startYear = Math.floor(startMonthIndex / 12)
  const startMonth = (startMonthIndex % 12) + 1
  const startAy = `${startYear}-${String(startMonth).padStart(2, '0')}`
  const todayAy = today.slice(0, 7)

  const map = new Map<string, MonthlyTotal>()

  for (const row of rows) {
    if (row.tur !== 'GIDER') continue
    if (row.tarih > today) continue
    const ay = row.tarih.slice(0, 7)
    if (ay < startAy || ay > todayAy) continue

    const key = `${ay}|${row.paraBirimi}`
    const existing = map.get(key)
    if (existing) {
      existing.toplam = Math.round((existing.toplam + row.tutar) * 100) / 100
    } else {
      map.set(key, { ay, para: row.paraBirimi, toplam: Math.round(row.tutar * 100) / 100 })
    }
  }

  const result = Array.from(map.values())
  result.sort((a, b) => {
    if (a.ay !== b.ay) return a.ay.localeCompare(b.ay)
    return a.para.localeCompare(b.para)
  })
  return result
}

export interface MonthSummary {
  gider: Record<string, number>
  gelir: Record<string, number>
  adet: number
}

export function monthSummary(
  rows: PersonalTx[],
  year: number,
  month: number,
  today: string,
): MonthSummary {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const summary: MonthSummary = {
    gider: {},
    gelir: {},
    adet: 0,
  }

  for (const row of rows) {
    if (!row.tarih.startsWith(prefix)) continue
    if (row.tarih > today) continue

    if (row.tur === 'GIDER') {
      summary.gider[row.paraBirimi] =
        Math.round(((summary.gider[row.paraBirimi] ?? 0) + row.tutar) * 100) / 100
      summary.adet++
    } else if (row.tur === 'GELIR') {
      summary.gelir[row.paraBirimi] =
        Math.round(((summary.gelir[row.paraBirimi] ?? 0) + row.tutar) * 100) / 100
    }
  }

  return summary
}

export interface CategoryBreakdown {
  kod: string
  toplam: number
}

export function categoryBreakdown(
  rows: PersonalTx[],
  year: number,
  month: number,
  today: string,
  para: string,
): CategoryBreakdown[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const map = new Map<string, number>()

  for (const row of rows) {
    if (!row.tarih.startsWith(prefix)) continue
    if (row.tarih > today) continue
    if (row.tur !== 'GIDER') continue
    if (row.paraBirimi !== para) continue

    const current = map.get(row.kategori) ?? 0
    map.set(row.kategori, Math.round((current + row.tutar) * 100) / 100)
  }

  const result: CategoryBreakdown[] = []
  for (const [kod, toplam] of map.entries()) {
    result.push({ kod, toplam })
  }

  result.sort((a, b) => b.toplam - a.toplam)
  return result
}
