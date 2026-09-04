import { describe, it, expect } from 'vitest'
import { bankTransfers, moneyMarketMoves, dividends } from './cashmoves'
import type { Cashflow, Transaction, Instrument } from './types'

const cf = (o: Partial<Cashflow>): Cashflow => ({
  id: 'c', tarih: '2020-01-01', hesap: 'TOPLU', portfoy: null, tur: 'YATIRMA',
  enstruman: null, tutar_tl: null, tutar_usd: 0, kur: null, aciklama: '', kaynak: 'm', ...o,
})
const tx = (o: Partial<Transaction>): Transaction => ({
  id: 't', tarih: '2020-01-01', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'X', yon: 'AL',
  lot: 1, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 1, kur: null, komisyon_usd: 0,
  brut_usd: 1, net_usd: 1, not: '', kaynak: 'm', olusturulma: null, ...o,
})

describe('bankTransfers', () => {
  it('splits in/out, newest first, totals', () => {
    const r = bankTransfers([
      cf({ id: 'a', tur: 'YATIRMA', tutar_usd: 1000, tarih: '2020-01-01' }),
      cf({ id: 'b', tur: 'CEKME', tutar_usd: 300, tarih: '2021-06-01' }),
      cf({ id: 'c', tur: 'TEMETTU', tutar_usd: 5, tarih: '2021-01-01', enstruman: 'THYAO' }),
    ])
    expect(r.rows.map((x) => x.tur)).toEqual(['CEKME', 'YATIRMA']) // 2021 before 2020, TEMETTU excluded
    expect(r.totalIn).toBe(1000)
    expect(r.totalOut).toBe(300)
    expect(r.net).toBe(700)
  })
})

describe('moneyMarketMoves', () => {
  it('keeps only FON_PARA-class transactions, newest first', () => {
    const insts: Instrument[] = [
      { kod: 'TP2', ad: 'TP2', sinif: 'FON_PARA', girisParaBirimi: 'TL', fiyatKaynagi: 'tefas', fiyatSembolu: 'TP2', seviyeler: null },
      { kod: 'THYAO', ad: 'THYAO', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'THYAO.IS', seviyeler: null },
    ]
    const r = moneyMarketMoves(
      [tx({ enstruman: 'TP2', tarih: '2022-01-01', net_usd: 500 }), tx({ enstruman: 'THYAO', net_usd: 999 }), tx({ enstruman: 'TP2', tarih: '2023-01-01', yon: 'SAT', net_usd: 200 })],
      insts,
    )
    expect(r.map((x) => x.tarih)).toEqual(['2023-01-01', '2022-01-01'])
    expect(r[0]).toMatchObject({ kod: 'TP2', yon: 'SAT', tutarUsd: 200 })
  })
})

describe('dividends', () => {
  it('lists TEMETTU cashflows, groups by instrument, totals', () => {
    const r = dividends(
      [
        cf({ tur: 'TEMETTU', enstruman: 'THYAO', tutar_usd: 10, tarih: '2023-01-01' }),
        cf({ tur: 'TEMETTU', enstruman: 'THYAO', tutar_usd: 6, tarih: '2024-01-01' }),
        cf({ tur: 'TEMETTU', enstruman: 'KCHOL', tutar_usd: 4, tarih: '2023-06-01' }),
        cf({ tur: 'YATIRMA', tutar_usd: 100 }),
      ],
      [],
    )
    expect(r.total).toBe(20)
    expect(r.rows).toHaveLength(3)
    expect(r.rows[0].tarih).toBe('2024-01-01') // newest first
    expect(r.byInstrument).toEqual([
      { kod: 'THYAO', toplamUsd: 16 },
      { kod: 'KCHOL', toplamUsd: 4 },
    ])
  })

  it('flags a same-window reinvest buy', () => {
    const r = dividends(
      [cf({ tur: 'TEMETTU', enstruman: 'THYAO', tutar_usd: 100, tarih: '2023-03-10' })],
      [
        tx({ yon: 'AL', enstruman: 'FROTO', tarih: '2023-03-12', net_usd: 105 }), // within 3d, within 15%
        tx({ yon: 'AL', enstruman: 'BIMAS', tarih: '2023-03-25', net_usd: 100 }), // too far
      ],
    )
    expect(r.rows[0].reinvestKod).toBe('FROTO')
  })

  it('no reinvest match → null', () => {
    const r = dividends(
      [cf({ tur: 'TEMETTU', enstruman: 'THYAO', tutar_usd: 100, tarih: '2023-03-10' })],
      [tx({ yon: 'AL', enstruman: 'FROTO', tarih: '2023-03-12', net_usd: 500 })],
    )
    expect(r.rows[0].reinvestKod).toBeNull()
  })
})
