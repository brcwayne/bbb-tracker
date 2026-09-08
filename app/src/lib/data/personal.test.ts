import { describe, expect, it } from 'vitest'
import { categoryBreakdown, monthlyTotals, monthSummary } from './personal'
import type { PersonalTx } from './types'

const tx = (o: Partial<PersonalTx>): PersonalTx => ({
  id: 'px_1', tarih: '2026-09-02', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY',
  kategori: 'market', aciklama: '', hesap: 'NAKIT', sahip: 'ENIS',
  taksitPlaniId: null, taksitNo: null, taksitToplam: null,
  not: '', kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z', ...o,
})

const TODAY = '2026-09-08'

describe('personal ledger derivations: totals and breakdown', () => {
  it('boş defterde her şey boş döner, çökmeden', () => {
    expect(monthlyTotals([], TODAY)).toEqual([])
    expect(monthSummary([], 2026, 9, TODAY)).toEqual({ gider: {}, gelir: {}, adet: 0 })
    expect(categoryBreakdown([], 2026, 9, TODAY, 'TRY')).toEqual([])
  })

  it('ayları artan sırada, para birimi ayrı toplar', () => {
    const out = monthlyTotals([
      tx({ id: 'a', tarih: '2026-08-10', tutar: 300 }),
      tx({ id: 'b', tarih: '2026-09-02', tutar: 100 }),
      tx({ id: 'c', tarih: '2026-09-03', tutar: 50 }),
      tx({ id: 'd', tarih: '2026-09-04', tutar: 20, paraBirimi: 'USD' }),
    ], TODAY)
    expect(out).toEqual([
      { ay: '2026-08', para: 'TRY', toplam: 300 },
      { ay: '2026-09', para: 'TRY', toplam: 150 },
      { ay: '2026-09', para: 'USD', toplam: 20 },
    ])
  })

  it('gelecek tarihli taksit satırı harcamaya sayılmaz', () => {
    const rows = [
      tx({ id: 'a', tarih: '2026-09-02', tutar: 2000, taksitPlaniId: 'pp_1', taksitNo: 1, taksitToplam: 6 }),
      tx({ id: 'b', tarih: '2026-10-02', tutar: 2000, taksitPlaniId: 'pp_1', taksitNo: 2, taksitToplam: 6 }),
    ]
    expect(monthSummary(rows, 2026, 9, TODAY).gider.TRY).toBe(2000)
    expect(monthlyTotals(rows, TODAY).some((m) => m.ay === '2026-10')).toBe(false)
  })

  it('gelir gideri kirletmez', () => {
    const s = monthSummary([
      tx({ id: 'a', tutar: 100 }),
      tx({ id: 'b', tarih: '2026-09-03', tutar: 50000, tur: 'GELIR', kategori: 'maas' }),
    ], 2026, 9, TODAY)
    expect(s.gider.TRY).toBe(100)
    expect(s.gelir.TRY).toBe(50000)
    expect(s.adet).toBe(1)
  })

  it('kategori dağılımı büyükten küçüğe', () => {
    const out = categoryBreakdown([
      tx({ id: 'a', tutar: 100, kategori: 'market' }),
      tx({ id: 'b', tarih: '2026-09-03', tutar: 500, kategori: 'kira' }),
    ], 2026, 9, TODAY, 'TRY')
    expect(out.map((c) => c.kod)).toEqual(['kira', 'market'])
  })

  it('12 aylık pencere daha eskisini dışarıda bırakır', () => {
    const out = monthlyTotals([
      tx({ id: 'old', tarih: '2025-01-05', tutar: 999 }),
      tx({ id: 'new', tarih: '2026-09-02', tutar: 100 }),
    ], TODAY, 12)
    expect(out.map((m) => m.ay)).toEqual(['2026-09'])
  })
})
