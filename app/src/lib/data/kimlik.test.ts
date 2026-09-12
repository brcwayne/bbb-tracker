import { describe, it, expect } from 'vitest'
import { kimlikKontrol, type KimlikKontrol } from './kimlik'
import { derivePositions } from './derive'
import { cashBalanceByHesap } from './cashBalances'
import type { Dataset, Transaction, Cashflow } from './types'
import type { SaleEvent } from './ledger'

import transactionsJson from '../../../../data/transactions.json'
import cashflowsJson from '../../../../data/cashflows.json'
import snapshotsJson from '../../../../data/snapshots.json'
import metaJson from '../../../../data/meta.json'

function makeFixtureDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    transactions: [],
    cashflows: [],
    snapshots: [],
    instruments: [],
    brokers: [{ kod: 'TEST_BROKER', ad: 'Test Broker', tur: 'ARACI_KURUM', sahip: 'ENIS', aktif: true }],
    portfolios: [{ kod: 'ANA', ad: 'Ana Portfoy', aktif: true }],
    meta: {
      semaVersiyonu: 1,
      olusturulma: '2026-01-01',
      kaynak: 'test',
      nakitHesapBazli: {},
      p0Sinirlari: [],
    },
    fxrates: {},
    assetTransfers: [],
    ...overrides,
  }
}

describe('kimlikKontrol', () => {
  it('küçük elde kurulmuş fixture üzerinde kimlik TAM sağlanır (fark === 0)', () => {
    // 1. Mevduat: $1,000
    const cf1: Cashflow = {
      id: 'cf1',
      tarih: '2026-01-01',
      hesap: 'TEST_BROKER',
      portfoy: null,
      tur: 'YATIRMA',
      enstruman: null,
      tutar_tl: null,
      tutar_usd: 1000,
      kur: null,
      aciklama: 'Mevduat',
      kaynak: 'manual',
    }

    // 2. Alım: 10 lot @ $100 = $1,000
    const t1: Transaction = {
      id: 't1',
      tarih: '2026-01-02',
      hesap: 'TEST_BROKER',
      portfoy: 'ANA',
      enstruman: 'HISSE_A',
      yon: 'AL',
      lot: 10,
      girisParaBirimi: 'USD',
      fiyat_tl: null,
      fiyat_usd: 100,
      kur: null,
      komisyon_usd: 0,
      brut_usd: 1000,
      net_usd: 1000,
      not: '',
      kaynak: 'manual',
      olusturulma: null,
    }

    // 3. Satış: 5 lot @ $120 = $600 hasılat, K/Z = +$100, kalan 5 lot maliyet = $500
    const t2: Transaction = {
      id: 't2',
      tarih: '2026-01-03',
      hesap: 'TEST_BROKER',
      portfoy: 'ANA',
      enstruman: 'HISSE_A',
      yon: 'SAT',
      lot: 5,
      girisParaBirimi: 'USD',
      fiyat_tl: null,
      fiyat_usd: 120,
      kur: null,
      komisyon_usd: 0,
      brut_usd: 600,
      net_usd: 600,
      not: '',
      kaynak: 'manual',
      olusturulma: null,
    }

    // 4. Temettü: $50
    const cf2: Cashflow = {
      id: 'cf2',
      tarih: '2026-01-04',
      hesap: 'TEST_BROKER',
      portfoy: null,
      tur: 'TEMETTU',
      enstruman: null,
      tutar_tl: null,
      tutar_usd: 50,
      kur: null,
      aciklama: 'Temettu',
      kaynak: 'manual',
    }

    // 5. Çekim: $100
    const cf3: Cashflow = {
      id: 'cf3',
      tarih: '2026-01-05',
      hesap: 'TEST_BROKER',
      portfoy: null,
      tur: 'CEKME',
      enstruman: null,
      tutar_tl: null,
      tutar_usd: 100,
      kur: null,
      aciklama: 'Cekim',
      kaynak: 'manual',
    }

    const ds = makeFixtureDataset({
      cashflows: [cf1, cf2, cf3],
      transactions: [t1, t2],
    })

    const pos = derivePositions(ds.transactions)
    expect(pos.open).toHaveLength(1)
    expect(pos.open[0].toplamMaliyetUsd).toBe(500)
    expect(pos.sales).toHaveLength(1)
    expect(pos.sales[0].kzUsd).toBe(100)

    // Nakit hesabı: +1000 (mevduat) - 1000 (alım) + 600 (satış) + 50 (temettü) - 100 (çekim) = $550
    const nakit = 550
    const res: KimlikKontrol = kimlikKontrol(ds, pos.sales, pos.open, nakit)

    expect(res.mevduat).toBe(1000)
    expect(res.cekim).toBe(100)
    expect(res.temettu).toBe(50)
    expect(res.gerceklesenKz).toBe(100)
    expect(res.beklenenVarlik).toBe(1050)
    expect(res.acikMaliyet).toBe(500)
    expect(res.nakit).toBe(550)
    expect(res.gercekVarlik).toBe(1050)
    expect(res.fark).toBe(0)
    expect(res.farkOrani).toBe(0)
  })

  it('gerçek veri setinde gocNakitDuzeltmesi olmadan fark ~$14.989,79 iken düzeltmeyle < $1 olur', () => {
    const transactions = transactionsJson as unknown as Transaction[]
    const cashflows = cashflowsJson as unknown as Cashflow[]
    const snapshots = snapshotsJson as unknown as Dataset['snapshots']
    const meta = metaJson as unknown as Dataset['meta']

    // 1. Düzeltmesiz meta ile kontrol
    const metaWithoutFix = { ...meta, gocNakitDuzeltmesi: undefined }
    const dsHam = makeFixtureDataset({
      transactions,
      cashflows,
      snapshots,
      meta: metaWithoutFix,
    })

    const pos = derivePositions(dsHam.transactions)
    const cashByHesap = cashBalanceByHesap(dsHam)
    const displayedCash = Object.values(cashByHesap).reduce((s, v) => s + v, 0)

    const resHam = kimlikKontrol(dsHam, pos.sales, pos.open, displayedCash)

    // Ham fark: gercekVarlik ($283.621,37) - beklenenVarlik ($298.611,16) = -$14.989,79
    expect(resHam.beklenenVarlik).toBeCloseTo(298611.16, 1)
    expect(resHam.gercekVarlik).toBeCloseTo(283621.37, 1)
    expect(Math.abs(resHam.fark)).toBeCloseTo(14989.79, 1)

    // 2. gocNakitDuzeltmesi: 14989.79 ile kontrol
    const metaWithFix = { ...meta, gocNakitDuzeltmesi: 14989.79 }
    const dsDuzeltilmis = makeFixtureDataset({
      transactions,
      cashflows,
      snapshots,
      meta: metaWithFix,
    })

    const resDuzeltilmis = kimlikKontrol(dsDuzeltilmis, pos.sales, pos.open, displayedCash)

    expect(Math.abs(resDuzeltilmis.fark)).toBeLessThan(1.0)
    expect(resDuzeltilmis.farkOrani).toBeLessThan(0.0001)
  })
})
