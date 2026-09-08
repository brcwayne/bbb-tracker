import { describe, expect, it } from 'vitest'
import {
  activePlans,
  categoryBreakdown,
  debtBalances,
  instalmentSchedule,
  monthlyTotals,
  monthSummary,
} from './personal'
import type { Debt, PaymentPlan, PersonalTx } from './types'

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

describe('personal ledger derivations: instalments and debts', () => {
  const planRows = [1, 2, 3, 4, 5, 6].map((n) => tx({
    id: `px_${n}`, tarih: `2026-${String(6 + n).padStart(2, '0')}-07`,
    tutar: 2000, kategori: 'ev', taksitPlaniId: 'pp_1', taksitNo: n, taksitToplam: 6,
  }))

  const PLAN: PaymentPlan = {
    id: 'pp_1', alisTarihi: '2026-07-07', aciklama: 'Beyaz eşya', toplamTutar: 12000,
    paraBirimi: 'TRY', taksitSayisi: 6, taksitTutari: 2000, sonTaksitTutari: 2000,
    kategori: 'ev', hesap: 'NAKIT', sahip: 'ENIS', durum: 'AKTIF',
    kaynak: 'telegram', olusturulma: '2026-07-07T00:00:00Z',
  }

  it('takvim sadece gelecek taksitleri sayar', () => {
    const out = instalmentSchedule(planRows, TODAY)
    expect(out.map((m) => m.ay)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(out[0].toplam).toBe(2000)
  })

  it('sıradan bir harcama takvime girmez', () => {
    expect(instalmentSchedule([tx({ tarih: '2026-12-01', tutar: 500 })], TODAY)).toEqual([])
  })

  it('plan ilerlemesi ödenmiş taksitleri sayar', () => {
    const [p] = activePlans([PLAN], planRows, TODAY)
    expect(p.ilerleme).toBe('3/6')
    expect(p.odenen).toBe(6000)
    expect(p.kalan).toBe(6000)
  })

  it('bitmiş ve iptal planlar listelenmez', () => {
    expect(activePlans([{ ...PLAN, durum: 'BITTI' }], planRows, TODAY)).toEqual([])
    expect(activePlans([{ ...PLAN, durum: 'IPTAL' }], planRows, TODAY)).toEqual([])
  })

  const debt = (o: Partial<Debt>): Debt => ({
    id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'AHMET', tutar: 5000,
    paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK',
    kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z', ...o,
  })

  it('kişi bazında alacak ve borç netleşir', () => {
    const out = debtBalances([
      debt({ id: 'a', kisi: 'AHMET', yon: 'VERDIM', tutar: 5000 }),
      debt({ id: 'b', kisi: 'AHMET', yon: 'ALDIM', tutar: 2000 }),
      debt({ id: 'c', kisi: 'AYSE', yon: 'ALDIM', tutar: 800 }),
    ])
    const ahmet = out.find((d) => d.kisi === 'AHMET')!
    expect(ahmet).toMatchObject({ alacak: 5000, borc: 2000, net: 3000 })
    expect(out[0].kisi).toBe('AHMET')
  })

  it('kapanmış borç sayılmaz', () => {
    expect(debtBalances([debt({ durum: 'KAPALI' })])).toEqual([])
  })

  it('boş girdide boş döner', () => {
    expect(instalmentSchedule([], TODAY)).toEqual([])
    expect(activePlans([], [], TODAY)).toEqual([])
    expect(debtBalances([])).toEqual([])
  })
})
