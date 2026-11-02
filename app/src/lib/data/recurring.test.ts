import { describe, it, expect } from 'vitest'
import { materialize, getOccurrenceDate } from './recurring'
import type { RecurringRule, PersonalTx } from './types'

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'rr_1',
  tur: 'GIDER',
  aciklama: 'Netflix',
  kategori: 'eglence',
  hesap: 'nakit',
  sahip: 'enis',
  paraBirimi: 'TRY',
  tutar: 229.9,
  gunOfMonth: 5,
  baslangicTarihi: '2026-01-01',
  bitisTarihi: null,
  aktif: true,
  olusturulma: '2026-09-15T00:00:00.000Z',
  kaynak: 'manual',
  ...over,
})

describe('getOccurrenceDate', () => {
  it('GUN periyodunda gün gün ilerler', () => {
    expect(getOccurrenceDate('2026-11-02', 'GUN', 0)).toBe('2026-11-02')
    expect(getOccurrenceDate('2026-11-02', 'GUN', 1)).toBe('2026-11-03')
    expect(getOccurrenceDate('2026-11-02', 'GUN', 5)).toBe('2026-11-07')
  })

  it('HAFTA periyodunda 7 gün 7 gün ilerler', () => {
    expect(getOccurrenceDate('2026-11-02', 'HAFTA', 0)).toBe('2026-11-02')
    expect(getOccurrenceDate('2026-11-02', 'HAFTA', 1)).toBe('2026-11-09')
    expect(getOccurrenceDate('2026-11-02', 'HAFTA', 3)).toBe('2026-11-23')
  })

  it('AY periyodunda aynı güne denk getirir ve ay sonunu taşmaz', () => {
    expect(getOccurrenceDate('2026-11-02', 'AY', 0)).toBe('2026-11-02')
    expect(getOccurrenceDate('2026-11-02', 'AY', 1)).toBe('2026-12-02')
    expect(getOccurrenceDate('2026-11-02', 'AY', 2)).toBe('2027-01-02')
    // Ay sonu taşma (31 Ocak -> 28 Şubat)
    expect(getOccurrenceDate('2027-01-31', 'AY', 1, 31)).toBe('2027-02-28')
  })

  it('YIL periyodunda yıl yıl ilerler', () => {
    expect(getOccurrenceDate('2026-11-02', 'YIL', 0)).toBe('2026-11-02')
    expect(getOccurrenceDate('2026-11-02', 'YIL', 1)).toBe('2027-11-02')
    expect(getOccurrenceDate('2026-11-02', 'YIL', 3)).toBe('2029-11-02')
  })
})

describe('materialize', () => {
  it('12 aylık ufuk için planlandi satırları üretir', () => {
    const rows = materialize([rule()], [], '2026-09-15')
    expect(rows).toHaveLength(12)
    expect(rows[0].tarih).toBe('2026-10-05') // bu ayın 5'i geçti, ilk oluşum ekim
    expect(rows[0].durum).toBe('planlandi')
    expect(rows[0].tekrarKuralId).toBe('rr_1')
    expect(rows[0].tutar).toBe(229.9)
    expect(rows.at(-1)!.tarih).toBe('2027-09-05')
  })

  it('bugünün günü henüz geçmediyse bu ayı da üretir', () => {
    const rows = materialize([rule({ gunOfMonth: 20 })], [], '2026-09-15')
    expect(rows[0].tarih).toBe('2026-09-20')
    expect(rows).toHaveLength(12) // regression: must not generate 13 rows
  })

  it('ay sonu kısa aylarda gün sabitlenir (31 -> Şubat 28)', () => {
    const rows = materialize([rule({ gunOfMonth: 31, baslangicTarihi: '2027-01-01' })], [], '2027-01-15', 3)
    const subat = rows.find((r) => r.tarih.startsWith('2027-02'))
    expect(subat?.tarih).toBe('2027-02-28')
    expect(rows).toHaveLength(3) // regression: must not generate 4 rows
  })

  it('idempotent: var olan (kural, tarih) çifti için ikinci satır açmaz', () => {
    const existing: PersonalTx[] = [{
      id: 'px_x', tarih: '2026-10-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY',
      kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi',
    }]
    const rows = materialize([rule()], existing, '2026-09-15')
    expect(rows.find((r) => r.tarih === '2026-10-05')).toBeUndefined()
    expect(rows).toHaveLength(11)
  })

  it('bitisTarihi sonrasını üretmez', () => {
    const rows = materialize([rule({ bitisTarihi: '2026-11-10' })], [], '2026-09-15', 12)
    expect(rows.every((r) => r.tarih <= '2026-11-10')).toBe(true)
    expect(rows).toHaveLength(2) // ekim + kasım
  })

  it('pasif kural için hiçbir satır üretmez', () => {
    expect(materialize([rule({ aktif: false })], [], '2026-09-15')).toEqual([])
  })

  it('toplamTekrar = 3 (Seçenek A: 1 asıl + 2 planlı tekrar) üretir', () => {
    // Bugün 2026-11-02'de girilmiş asıl kayıt var
    const existing: PersonalTx[] = [{
      id: 'px_initial', tarih: '2026-11-02', tur: 'GIDER', tutar: 500, paraBirimi: 'TRY',
      kategori: 'eglence', aciklama: 'Kurs', hesap: 'nakit', sahip: 'enis',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_custom',
    }]
    const customRule = rule({
      id: 'rr_custom',
      baslangicTarihi: '2026-11-02',
      gunOfMonth: 2,
      periyot: 'AY',
      toplamTekrar: 3,
      bitisTarihi: '2027-01-02',
    })

    const rows = materialize([customRule], existing, '2026-11-02')
    expect(rows).toHaveLength(2)
    expect(rows[0].tarih).toBe('2026-12-02')
    expect(rows[1].tarih).toBe('2027-01-02')
  })

  it('toplamTekrar = 1 ise planlanan satır üretmez (sadece asıl kayıt kalır)', () => {
    const existing: PersonalTx[] = [{
      id: 'px_initial', tarih: '2026-11-02', tur: 'GIDER', tutar: 500, paraBirimi: 'TRY',
      kategori: 'eglence', aciklama: 'Kurs', hesap: 'nakit', sahip: 'enis',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_1only',
    }]
    const customRule = rule({
      id: 'rr_1only',
      baslangicTarihi: '2026-11-02',
      gunOfMonth: 2,
      periyot: 'AY',
      toplamTekrar: 1,
      bitisTarihi: '2026-11-02',
    })

    const rows = materialize([customRule], existing, '2026-11-02')
    expect(rows).toHaveLength(0)
  })

  it('haftalık periyot ile toplamTekrar = 4 (1 asıl + 3 planlı) üretir', () => {
    const existing: PersonalTx[] = [{
      id: 'px_init', tarih: '2026-11-02', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY',
      kategori: 'eglence', aciklama: 'Ders', hesap: 'nakit', sahip: 'enis',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_weekly',
    }]
    const weeklyRule = rule({
      id: 'rr_weekly',
      baslangicTarihi: '2026-11-02',
      periyot: 'HAFTA',
      toplamTekrar: 4,
    })

    const rows = materialize([weeklyRule], existing, '2026-11-02')
    expect(rows).toHaveLength(3)
    expect(rows[0].tarih).toBe('2026-11-09')
    expect(rows[1].tarih).toBe('2026-11-16')
    expect(rows[2].tarih).toBe('2026-11-23')
  })

  it('günlük periyot ile toplamTekrar = 3 (1 asıl + 2 planlı) üretir', () => {
    const existing: PersonalTx[] = [{
      id: 'px_init', tarih: '2026-11-02', tur: 'GIDER', tutar: 50, paraBirimi: 'TRY',
      kategori: 'eglence', aciklama: 'İlaç', hesap: 'nakit', sahip: 'enis',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual',
      olusturulma: '', tekrarKuralId: 'rr_daily',
    }]
    const dailyRule = rule({
      id: 'rr_daily',
      baslangicTarihi: '2026-11-02',
      periyot: 'GUN',
      toplamTekrar: 3,
    })

    const rows = materialize([dailyRule], existing, '2026-11-02')
    expect(rows).toHaveLength(2)
    expect(rows[0].tarih).toBe('2026-11-03')
    expect(rows[1].tarih).toBe('2026-11-04')
  })
})
