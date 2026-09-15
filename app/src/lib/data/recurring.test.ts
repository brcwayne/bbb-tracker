import { describe, it, expect } from 'vitest'
import { materialize } from './recurring'
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
})
