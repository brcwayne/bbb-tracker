import { describe, it, expect } from 'vitest'
import {
  cashBalanceByHesap,
  cashSplitByHesap,
  formatBrokerCash,
  formatBrokerCashTable,
} from './cashBalances'
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
  transactions: [], cashflows: [], snapshots: [], instruments: [], brokers: [{ kod: 'MIDAS', ad: 'Midas', tur: 'ARACI_KURUM', sahip: 'ENIS', aktif: true }], portfolios: [],
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

  it('DUZELTME işaretli farkı doğrudan uygular — pozitif de negatif de', () => {
    const bal = cashBalanceByHesap(ds({
      cashflows: [
        cf({ tur: 'DUZELTME', hesap: 'MIDAS', tutar_usd: 62991.17 }),
        cf({ tur: 'DUZELTME', hesap: 'GARAN', tutar_usd: -250 }),
      ],
    }))
    expect(bal.MIDAS).toBeCloseTo(1000 + 62991.17, 6)
    expect(bal.GARAN).toBeCloseTo(500 - 250, 6)
  })

  it('DUZELTME pozitif farkı TOPLU havuzundan düşer ve çift sayımı önler', () => {
    const bal = cashBalanceByHesap(ds({
      meta: { ...baseMeta, nakitHesapBazli: { MIDAS: -50000, TOPLU: 100000 } },
      cashflows: [
        cf({ tur: 'DUZELTME', hesap: 'MIDAS', tutar_usd: 52000 }),
      ],
    }))
    expect(bal.MIDAS).toBeCloseTo(2000, 6)
    expect(bal.TOPLU).toBeCloseTo(48000, 6)
    // Toplam nakit havuzu değişmeden korunur: (-50k + 100k) == (2k + 48k)
    expect(bal.MIDAS + bal.TOPLU).toBeCloseTo(50000, 6)
  })
})

describe('cashSplitByHesap', () => {
  it('TL ve USD nakit hareketlerini ayrı ayrı takip eder', () => {
    const split = cashSplitByHesap(
      ds({
        transactions: [
          tx({ yon: 'AL', hesap: 'MIDAS', girisParaBirimi: 'TL', fiyat_tl: 100, lot: 5, kaynak: 'manual' }),
          tx({ yon: 'AL', hesap: 'MIDAS', girisParaBirimi: 'USD', net_usd: 50, kaynak: 'manual' }),
        ],
        cashflows: [
          cf({ tur: 'DUZELTME', hesap: 'MIDAS', tutar_tl: 2500, tutar_usd: 52.08 }),
          cf({ tur: 'DUZELTME', hesap: 'MIDAS', tutar_tl: null, tutar_usd: 100 }),
        ],
      }),
      48,
    )

    // TL: -500 (AL) + 2500 (DUZELTME) = 2000
    expect(split.MIDAS.tl).toBe(2000)
    // USD: 1000 (baseline) - 50 (AL) + 100 (DUZELTME) = 1050
    expect(split.MIDAS.usd).toBe(1050)
    // totalUsd = 1050 + 2000 / 48 = 1091.67
    expect(split.MIDAS.totalUsd).toBeCloseTo(1091.67, 2)
  })

  it('formatBrokerCash hem TL hem USD olduğunda ikisini birden gösterir', () => {
    const s = { tl: 5000, usd: 200, totalUsd: 304.17 }
    const res = formatBrokerCash(s, 'TRY', 48)
    expect(res).toContain('₺5.000,00')
    expect(res).toContain('$200.00')
    expect(res).toContain('Toplam:')
  })

  it('formatBrokerCashTable kompakt format sunar', () => {
    const s = { tl: 5000, usd: 200, totalUsd: 304.17 }
    const res = formatBrokerCashTable(s, 'TRY', 48)
    expect(res).toContain('₺5.000,00 · $200.00')
    expect(res).not.toContain('Toplam:')
  })
})
