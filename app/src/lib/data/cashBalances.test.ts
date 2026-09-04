import { describe, it, expect } from 'vitest'
import { cashBalanceByHesap } from './cashBalances'
import type { Dataset, Transaction, Cashflow } from './types'

const baseMeta = { semaVersiyonu: 1, olusturulma: '2026-01-01', kaynak: 'x', nakitHesapBazli: { MIDAS: 1000, GARAN: 500 }, p0Sinirlari: [] }
const tx = (o: Partial<Transaction>): Transaction => ({
  id: 't', tarih: '2026-02-01', hesap: 'MIDAS', portfoy: 'ENIS', enstruman: 'X', yon: 'AL',
  lot: 1, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 1, kur: null, komisyon_usd: 0,
  brut_usd: 1, net_usd: 1, not: '', kaynak: 'manual', olusturulma: null, ...o,
})
const cf = (o: Partial<Cashflow>): Cashflow => ({
  id: 'c', tarih: '2026-02-01', hesap: 'MIDAS', portfoy: null, tur: 'YATIRMA',
  enstruman: null, tutar_tl: null, tutar_usd: 0, kur: null, aciklama: '', kaynak: 'manual', ...o,
})
const ds = (over: Partial<Dataset>): Dataset => ({
  transactions: [], cashflows: [], snapshots: [], instruments: [], brokers: [], portfolios: [],
  meta: baseMeta, fxrates: {}, assetTransfers: [], ...over,
})

describe('cashBalanceByHesap', () => {
  it('starts from meta.nakitHesapBazli and ignores migration-sourced rows', () => {
    const bal = cashBalanceByHesap(ds({
      transactions: [tx({ kaynak: 'migration', net_usd: 999 })],
      cashflows: [cf({ kaynak: 'migration', tutar_usd: 999 })],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000, 6)
  })

  it('AL azaltır, SAT artırır — sadece manual kayıtlar', () => {
    const bal = cashBalanceByHesap(ds({
      transactions: [
        tx({ yon: 'AL', hesap: 'MIDAS', net_usd: 200, kaynak: 'manual' }),
        tx({ yon: 'SAT', hesap: 'MIDAS', net_usd: 50, kaynak: 'manual' }),
      ],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000 - 200 + 50, 6)
  })

  it('YATIRMA/TEMETTU artırır, CEKME azaltır', () => {
    const bal = cashBalanceByHesap(ds({
      cashflows: [
        cf({ tur: 'YATIRMA', hesap: 'GARAN', tutar_usd: 300 }),
        cf({ tur: 'CEKME', hesap: 'GARAN', tutar_usd: 100 }),
        cf({ tur: 'TEMETTU', hesap: 'GARAN', tutar_usd: 20 }),
      ],
    }))
    expect(bal.GARAN).toBeCloseTo(500 + 300 - 100 + 20, 6)
  })

  it('TRANSFER kaynaktan düşer, hedefe eklenir', () => {
    const bal = cashBalanceByHesap(ds({
      cashflows: [cf({ tur: 'TRANSFER', hesap: 'MIDAS', hedefHesap: 'GARAN', tutar_usd: 400 })],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000 - 400, 6)
    expect(bal.GARAN).toBeCloseTo(500 + 400, 6)
  })
})
