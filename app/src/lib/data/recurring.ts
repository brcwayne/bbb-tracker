import type { PersonalTx, RecurringRule } from './types'
import { newPersonalId } from './ids'

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

function occurrenceDate(year: number, month1to12: number, gunOfMonth: number): string {
  const gun = Math.min(gunOfMonth, daysInMonth(year, month1to12))
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(gun).padStart(2, '0')}`
}

/**
 * Aktif kuralları, önümüzdeki `horizonMonths` ay için `durum: 'planlandi'`
 * PersonalTx satırlarına genişletir. Sadece EKLENECEK yeni satırları döner —
 * `existing` içinde zaten (kural, tarih) eşleşmesi varsa o ay atlanır
 * (idempotent), böylece kural kaydında da bot'un günlük top-up'ında da
 * güvenle çağrılabilir.
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

  for (const rule of rules) {
    if (!rule.aktif) continue

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

      // Count this occurrence toward the horizon budget
      occurrenceCount++

      // Skip adding to output if it already exists, but we've counted it
      if (existingKeys.has(`${rule.id}|${tarih}`)) {
        m++
        continue
      }

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
      m++
    }
  }

  return out
}
