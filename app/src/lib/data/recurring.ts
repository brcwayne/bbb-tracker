import type { PersonalTx, RecurringRule, RecurrencePeriod } from './types'
import { newPersonalId } from './ids'

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

export function occurrenceDate(year: number, month1to12: number, gunOfMonth: number): string {
  const gun = Math.min(gunOfMonth, daysInMonth(year, month1to12))
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(gun).padStart(2, '0')}`
}

export function getOccurrenceDate(
  startDate: string,
  period: RecurrencePeriod,
  step: number,
  gunOfMonth?: number,
): string {
  if (step === 0) return startDate

  const [y, m, d] = startDate.split('-').map(Number)

  if (period === 'GUN') {
    const dt = new Date(Date.UTC(y, m - 1, d + step))
    return dt.toISOString().slice(0, 10)
  }

  if (period === 'HAFTA') {
    const dt = new Date(Date.UTC(y, m - 1, d + step * 7))
    return dt.toISOString().slice(0, 10)
  }

  if (period === 'YIL') {
    const targetYear = y + step
    const targetMonth = m
    const maxDays = daysInMonth(targetYear, targetMonth)
    const clampedDay = Math.min(gunOfMonth ?? d, maxDays)
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
  }

  // period === 'AY'
  const totalMonths = (m - 1) + step
  const targetYear = y + Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1
  const maxDays = daysInMonth(targetYear, targetMonth)
  const clampedDay = Math.min(gunOfMonth ?? d, maxDays)
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

/**
 * Aktif kuralları PersonalTx satırlarına genişletir.
 * Sadece EKLENECEK yeni satırları döner — `existing` içinde zaten
 * (kural, tarih) eşleşmesi varsa o tarih atlanır (idempotent).
 */
export function materialize(
  rules: RecurringRule[],
  existing: PersonalTx[],
  today: string,
  horizonMonths = 12,
): PersonalTx[] {
  const existingKeys = new Set(
    existing
      .filter((r) => r.tekrarKuralId)
      .map((r) => `${r.tekrarKuralId}|${r.tarih}`),
  )
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const out: PersonalTx[] = []

  function addRow(rule: RecurringRule, tarih: string) {
    out.push({
      id: newPersonalId(),
      tarih,
      tur: rule.tur,
      tutar: rule.tutar,
      paraBirimi: rule.paraBirimi,
      kategori: rule.kategori,
      aciklama: rule.aciklama,
      hesap: rule.hesap,
      sahip: rule.sahip,
      taksitPlaniId: null,
      taksitNo: null,
      taksitToplam: null,
      not: '',
      kaynak: 'manual',
      olusturulma: new Date().toISOString(),
      tekrarKuralId: rule.id,
      durum: 'planlandi',
    })
    existingKeys.add(`${rule.id}|${tarih}`)
  }

  for (const rule of rules) {
    if (!rule.aktif) continue

    const period = rule.periyot ?? 'AY'

    // Bounded recurrence (toplamTekrar adet sınırlı)
    if (rule.toplamTekrar != null) {
      for (let step = 0; step < rule.toplamTekrar; step++) {
        const tarih = getOccurrenceDate(rule.baslangicTarihi, period, step, rule.gunOfMonth)
        if (tarih < today || tarih < rule.baslangicTarihi) {
          continue
        }
        if (rule.bitisTarihi != null && tarih > rule.bitisTarihi) {
          break
        }
        if (existingKeys.has(`${rule.id}|${tarih}`)) {
          continue
        }
        addRow(rule, tarih)
      }
      continue
    }

    // Suresiz recurrence
    if (period === 'AY') {
      let occurrenceCount = 0
      let m = 0
      while (occurrenceCount < horizonMonths) {
        const idx = todayYear * 12 + (todayMonth - 1) + m
        const year = Math.floor(idx / 12)
        const month = (idx % 12) + 1
        const tarih = occurrenceDate(year, month, rule.gunOfMonth)

        if (tarih < today || tarih < rule.baslangicTarihi) {
          m++
          continue
        }
        if (rule.bitisTarihi != null && tarih > rule.bitisTarihi) {
          break
        }

        occurrenceCount++

        if (existingKeys.has(`${rule.id}|${tarih}`)) {
          m++
          continue
        }

        addRow(rule, tarih)
        m++
      }
    } else if (period === 'GUN') {
      const maxDays = 30
      let count = 0
      for (let step = 0; count < maxDays; step++) {
        const dt = new Date(Date.UTC(todayYear, todayMonth - 1, Number(today.split('-')[2]) + step))
        const tarih = dt.toISOString().slice(0, 10)
        if (tarih < rule.baslangicTarihi) continue
        if (rule.bitisTarihi != null && tarih > rule.bitisTarihi) break
        count++
        if (existingKeys.has(`${rule.id}|${tarih}`)) continue
        addRow(rule, tarih)
      }
    } else if (period === 'HAFTA') {
      const maxWeeks = 12
      const [sy, sm, sd] = rule.baslangicTarihi.split('-').map(Number)
      const startMs = Date.UTC(sy, sm - 1, sd)
      const [ty, tm, td] = today.split('-').map(Number)
      const todayMs = Date.UTC(ty, tm - 1, td)
      const weekMs = 7 * 86400000
      let step = Math.max(0, Math.floor((todayMs - startMs) / weekMs))
      let count = 0
      while (count < maxWeeks) {
        const tarih = getOccurrenceDate(rule.baslangicTarihi, 'HAFTA', step)
        if (tarih < today || tarih < rule.baslangicTarihi) {
          step++
          continue
        }
        if (rule.bitisTarihi != null && tarih > rule.bitisTarihi) break
        count++
        step++
        if (existingKeys.has(`${rule.id}|${tarih}`)) continue
        addRow(rule, tarih)
      }
    } else if (period === 'YIL') {
      const maxYears = 5
      let count = 0
      for (let y = todayYear; count < maxYears; y++) {
        const step = y - Number(rule.baslangicTarihi.split('-')[0])
        if (step < 0) continue
        const tarih = getOccurrenceDate(rule.baslangicTarihi, 'YIL', step, rule.gunOfMonth)
        if (tarih < today || tarih < rule.baslangicTarihi) continue
        if (rule.bitisTarihi != null && tarih > rule.bitisTarihi) break
        count++
        if (existingKeys.has(`${rule.id}|${tarih}`)) continue
        addRow(rule, tarih)
      }
    }
  }

  return out
}
