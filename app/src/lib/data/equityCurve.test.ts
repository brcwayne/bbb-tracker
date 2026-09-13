import { describe, it, expect } from 'vitest'
import { buildEquityCurve, type AylikSermaye } from './equityCurve'
import { derivePositions } from './derive'
import type { Dataset, Transaction, Cashflow, Snapshot } from './types'
import type { SaleEvent } from './ledger'
import { hasRealData, loadRealData } from './testRealData'

function makeFixtureDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    transactions: [],
    cashflows: [],
    snapshots: [],
    instruments: [],
    brokers: [],
    portfolios: [],
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

describe('buildEquityCurve (I2)', () => {
  it('küçük fixture üzerinde doğru başlangıç ayı, kümülatif toplamlar ve sermaye üretir', () => {
    const cf1: Cashflow = {
      id: 'cf1', tarih: '2020-03-15', hesap: 'B1', portfoy: null, tur: 'YATIRMA',
      enstruman: null, tutar_tl: null, tutar_usd: 10000, kur: null, aciklama: '', kaynak: 'manual',
    }
    const cf2: Cashflow = {
      id: 'cf2', tarih: '2020-05-10', hesap: 'B1', portfoy: null, tur: 'TEMETTU',
      enstruman: null, tutar_tl: null, tutar_usd: 250, kur: null, aciklama: '', kaynak: 'manual',
    }
    const cf3: Cashflow = {
      id: 'cf3', tarih: '2020-06-01', hesap: 'B1', portfoy: null, tur: 'CEKME',
      enstruman: null, tutar_tl: null, tutar_usd: 1000, kur: null, aciklama: '', kaynak: 'manual',
    }
    const snap1: Snapshot = {
      tarih: '2020-04-30', toplamOzkaynak_usd: 10000, baslangicSermayesi_usd: null,
      netMevduatCekim_usd: 0, cekim_usd: 0, nakitTemettu_usd: 0, nakit_usd: 0,
      netKZ_usd: 0, vergiKomisyon_usd: 0, kaynak: 'excel-monthly-report',
    }

    const sale1: SaleEvent = {
      txId: 's1', tarih: '2020-04-20', kod: 'KOD', hesap: 'B1', portfoy: 'P1',
      lot: 10, satisFiyatUsd: 15, ortMaliyetUsd: 10, maliyetUsd: 100, hasilatUsd: 150,
      komisyonUsd: 0, kzUsd: 50, kzPct: 0.5, kalanLot: 0, pozisyonKapandi: true,
      ilkAlisTarih: '2020-03-20', tutmaGunu: 31, oduncAlindi: false,
    }

    const ds = makeFixtureDataset({
      cashflows: [cf1, cf2, cf3],
      snapshots: [snap1],
    })

    const curve = buildEquityCurve(ds, [sale1])

    // İlk nakit akışı 2020-03, son nakit akışı 2020-06 -> 4 ay: 2020-03, 2020-04, 2020-05, 2020-06
    expect(curve).toHaveLength(4)
    expect(curve[0].ay).toBe('2020-03')
    expect(curve[0].sermaye).toBe(10000)
    expect(curve[0].excelSermaye).toBeNull()

    // 2020-04: sermaye = 10000 (mevduat) + 50 (kar) = 10050. Excel = 10000 -> fark = 50
    expect(curve[1].ay).toBe('2020-04')
    expect(curve[1].sermaye).toBe(10050)
    expect(curve[1].excelSermaye).toBe(10000)
    expect(curve[1].excelFarki).toBe(50)

    // 2020-05: temettu eklendi (+250) -> 10300
    expect(curve[2].ay).toBe('2020-05')
    expect(curve[2].sermaye).toBe(10300)
    expect(curve[2].temettuKumulatif).toBe(250)

    // 2020-06: cekim (-1000) -> 9300
    expect(curve[3].ay).toBe('2020-06')
    expect(curve[3].sermaye).toBe(9300)
    expect(curve[3].cekimKumulatif).toBe(1000)

    // Her ay için kimlik kontrolü: sermaye === mevduatKumulatif - cekimKumulatif + gerceklesenKzKumulatif + temettuKumulatif
    for (const c of curve) {
      expect(c.sermaye).toBeCloseTo(
        c.mevduatKumulatif - c.cekimKumulatif + c.gerceklesenKzKumulatif + c.temettuKumulatif,
        2,
      )
    }
  })

  it('boş veri setinde boş dizi döndürür', () => {
    const ds = makeFixtureDataset()
    expect(buildEquityCurve(ds, [])).toEqual([])
  })

  it.skipIf(!hasRealData())('gerçek BBB veri setinde Dalga 4 Session 2 çapalarını tam karşılar', () => {
    const transactions = loadRealData<Transaction[]>('transactions.json')
    const cashflows = loadRealData<Cashflow[]>('cashflows.json')
    const snapshots = loadRealData<Snapshot[]>('snapshots.json')

    const ds = makeFixtureDataset({
      transactions,
      cashflows,
      snapshots,
    })

    const pos = derivePositions(ds.transactions)
    const curve = buildEquityCurve(ds, pos.sales)

    // Çapa 1: Seri ilk nakit akışının ayından (2016-01) başlar
    expect(curve[0].ay).toBe('2016-01')
    // Çapa 2: İlk ayın sermayesi $109.699,10
    expect(curve[0].sermaye).toBe(109699.1)
    expect(curve[0].mevduatKumulatif).toBe(109699.1)
    // Excel aylık raporu 2016-05'te başladığından 2016-01'de excelSermaye null olmalıdır
    expect(curve[0].excelSermaye).toBeNull()
    expect(curve[0].excelFarki).toBeNull()

    // 2016-05: Excel'in ilk ayı, toplamOzkaynak_usd = 0
    const may16 = curve.find((c) => c.ay === '2016-05')!
    expect(may16).toBeDefined()
    expect(may16.sermaye).toBe(109699.1)
    expect(may16.excelSermaye).toBe(0)
    expect(may16.excelFarki).toBe(109699.1)

    // 2018-05: İkinci kurucu mevduat ($3.510,33) eklendi -> toplam kurucu sermaye $113.209,43
    const may18 = curve.find((c) => c.ay === '2018-05')!
    expect(may18).toBeDefined()
    expect(may18.mevduatKumulatif).toBe(113209.43)
    expect(may18.excelSermaye).toBe(0)
    expect(may18.excelFarki).toBe(113209.43)

    // 2026-08 (Excel son ayı): Excel = $191.386,89
    const aug26 = curve.find((c) => c.ay === '2026-08')!
    expect(aug26).toBeDefined()
    expect(aug26.excelSermaye).toBeCloseTo(191386.89, 1)

    // Çapa 3: Son ayın (2026-09) sermayesi, I1'in beklenenVarlik'ıyla birebir aynı: $298.611,16
    const last = curve[curve.length - 1]
    expect(last.ay).toBe('2026-09')
    expect(last.sermaye).toBe(298611.16)
    expect(last.mevduatKumulatif).toBe(184608.62)
    expect(last.temettuKumulatif).toBe(298.07)
    expect(last.gerceklesenKzKumulatif).toBe(113704.47)

    // Çapa 4: Her ay için sermaye == mevduatKumulatif - cekimKumulatif + gerceklesenKzKumulatif + temettuKumulatif
    for (const c of curve) {
      expect(c.sermaye).toBeCloseTo(
        c.mevduatKumulatif - c.cekimKumulatif + c.gerceklesenKzKumulatif + c.temettuKumulatif,
        2,
      )
    }
  })
})
