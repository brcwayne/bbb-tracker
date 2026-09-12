import { describe, it, expect } from 'vitest'
import { buildWaterfall } from './waterfall'
import type { Snapshot, Transaction, Cashflow } from './types'
import type { SaleEvent } from './ledger'
import type { AylikSermaye } from './equityCurve'

function mockSnap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    tarih: '2026-08-31',
    toplamOzkaynak_usd: 191386.89,
    baslangicSermayesi_usd: 169669.24,
    netMevduatCekim_usd: 0,
    cekim_usd: 0,
    nakitTemettu_usd: 0,
    nakit_usd: 0,
    netKZ_usd: 21717.65,
    vergiKomisyon_usd: 48.42,
    kaynak: 'excel-monthly-report',
    ...overrides,
  }
}

function mockSale(overrides: Partial<SaleEvent> = {}): SaleEvent {
  return {
    txId: 'tx-1',
    tarih: '2026-08-15',
    kod: 'THYAO',
    hesap: 'MIDAS',
    portfoy: 'ALFA',
    lot: 100,
    satisFiyatUsd: 10,
    ortMaliyetUsd: 8,
    maliyetUsd: 800,
    hasilatUsd: 1000,
    komisyonUsd: 2,
    kzUsd: 198,
    kzPct: 0.2475,
    kalanLot: 0,
    pozisyonKapandi: true,
    ilkAlisTarih: '2026-07-01',
    tutmaGunu: 45,
    oduncAlindi: false,
    ...overrides,
  }
}

function mockTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    tarih: '2026-08-15',
    hesap: 'MIDAS',
    portfoy: 'ALFA',
    enstruman: 'THYAO',
    yon: 'SAT',
    lot: 100,
    girisParaBirimi: 'USD',
    fiyat_tl: null,
    fiyat_usd: 10,
    kur: null,
    komisyon_usd: 2,
    brut_usd: 1000,
    net_usd: 998,
    not: '',
    kaynak: 'manual',
    olusturulma: null,
    ...overrides,
  }
}

describe('buildWaterfall (H4)', () => {
  it('returns null gracefully when snapshot is missing without crashing', () => {
    const res = buildWaterfall('2026-08', undefined, undefined, [], [])
    expect(res).toBeNull()
  })

  it('calculates exact residual for Değerleme (bakiye) satisfying the identity (H4-fix: vergiKomisyon is info-only)', () => {
    const snap = mockSnap({
      baslangicSermayesi_usd: 100000,
      netMevduatCekim_usd: 5000,
      cekim_usd: 1000,
      nakitTemettu_usd: 300,
      vergiKomisyon_usd: 50,
      toplamOzkaynak_usd: 110000,
    })

    const sales = [mockSale({ kzUsd: 2500, tarih: '2026-08-10' })]
    const res = buildWaterfall('2026-08', snap, undefined, sales, [])

    expect(res).not.toBeNull()
    if (!res) return

    // H4-fix: araToplam = 100000 + 5000 - 1000 + 2500 + 300 = 106800 (vergiKomisyon is NOT subtracted)
    // donemSonu = 110000
    // degerlemeBakiye = 110000 - 106800 = 3200
    expect(res.degerlemeBakiye).toBe(3200)

    // Verify mathematical identity:
    // baslangic + yeniMevduat - cekim + gerceklesenKar + temettu + degerlemeBakiye === donemSonu
    const total =
      res.baslangic +
      res.yeniMevduat -
      res.cekim +
      res.gerceklesenKar +
      res.temettu +
      res.degerlemeBakiye
    expect(total).toBeCloseTo(res.donemSonu, 5)

    const degStep = res.steps.find((s) => s.label === 'Değerleme (bakiye)')
    expect(degStep?.hint).toBe('aylık rapordan doğrudan gelmeyen, kapanış farkından hesaplanan kalan')

    const vergiStep = res.steps.find((s) => s.label === 'Vergi & komisyon')
    expect(vergiStep?.sign).toBe('ℹ')
    expect(vergiStep?.hint).toBe("net K/Z'ye zaten dahil, ayrıca düşülmez")
    expect(vergiStep?.isInfo).toBe(true)
  })

  it('drops Değerleme (bakiye) to zero in real snapshots data (2026-08, 2026-06, 2026-03) (H4-fix)', async () => {
    // Import real snapshots
    const snapshots: Snapshot[] = (await import('../../../../data/snapshots.json')).default as unknown as Snapshot[]

    // 1) 2026-08: vergiKomisyon = 48.42, netKZ = 21717.66
    const snap08 = snapshots.find((s) => s.tarih === '2026-08-31')!
    const prev08 = snapshots.find((s) => s.tarih === '2026-07-31')!
    const res08 = buildWaterfall('2026-08', snap08, prev08, [
      mockSale({ kzUsd: snap08.netKZ_usd ?? 0, tarih: '2026-08-15' }),
    ])
    expect(res08).not.toBeNull()
    expect(Math.abs(res08!.degerlemeBakiye)).toBeLessThan(0.01)

    // 2) 2026-06: vergiKomisyon = 40.44, netKZ = 6006.13, temettu = 1.34
    const snap06 = snapshots.find((s) => s.tarih === '2026-06-30')!
    const prev06 = snapshots.find((s) => s.tarih === '2026-05-31')!
    const res06 = buildWaterfall('2026-06', snap06, prev06, [
      mockSale({ kzUsd: snap06.netKZ_usd ?? 0, tarih: '2026-06-15' }),
    ])
    expect(res06).not.toBeNull()
    expect(Math.abs(res06!.degerlemeBakiye)).toBeLessThan(0.01)

    // 3) 2026-03: vergiKomisyon = 7.23, netMevduat = 1556, temettu = 89.72
    const snap03 = snapshots.find((s) => s.tarih === '2026-03-31')!
    const prev03 = snapshots.find((s) => s.tarih === '2026-02-28')!
    const res03 = buildWaterfall('2026-03', snap03, prev03, [
      mockSale({ kzUsd: snap03.netKZ_usd ?? 0, tarih: '2026-03-15' }),
    ])
    expect(res03).not.toBeNull()
    expect(Math.abs(res03!.degerlemeBakiye)).toBeLessThan(0.01)
  })

  it('falls back to prevSnap.toplamOzkaynak_usd when baslangicSermayesi_usd is null', () => {
    const prevSnap = mockSnap({ tarih: '2026-07-31', toplamOzkaynak_usd: 85000 })
    const snap = mockSnap({ baslangicSermayesi_usd: null, toplamOzkaynak_usd: 90000 })

    const res = buildWaterfall('2026-08', snap, prevSnap, [], [])
    expect(res?.baslangic).toBe(85000)
  })

  it('detects difference between SaleEvent profit and snapshot netKZ_usd', () => {
    const snap = mockSnap({ netKZ_usd: 21717.65 })
    const sales = [mockSale({ kzUsd: 21766.0, tarih: '2026-08-20' })]

    const res = buildWaterfall('2026-08', snap, undefined, sales, [])
    expect(res?.kzFarkiVar).toBe(true)
    expect(res?.gerceklesenKar).toBe(21766.0)
    expect(res?.snapNetKz).toBe(21717.65)
    expect(res?.kzFarki).toBeCloseTo(48.35, 2)

    const karStep = res?.steps.find((s) => s.label === 'Gerçekleşen kâr')
    expect(karStep?.altLabel).toBe('Aylık rapor (netKZ)')
    expect(karStep?.altTutarUsd).toBe(21717.65)
    expect(karStep?.farkLabel).toContain('Defter')
  })

  it('filters and sorts month transactions correctly', () => {
    const snap = mockSnap()
    const txns = [
      mockTx({ id: 'tx-july', tarih: '2026-07-25' }),
      mockTx({ id: 'tx-aug1', tarih: '2026-08-05' }),
      mockTx({ id: 'tx-aug2', tarih: '2026-08-28' }),
      mockTx({ id: 'tx-sept', tarih: '2026-09-02' }),
    ]

    const res = buildWaterfall('2026-08', snap, undefined, [], txns)
    expect(res?.monthTransactions.length).toBe(2)
    expect(res?.monthTransactions[0].id).toBe('tx-aug2')
    expect(res?.monthTransactions[1].id).toBe('tx-aug1')
  })

  it('AylikSermaye serisine bağlandığında degerlemeBakiye TAM SIFIRDIR (I2)', () => {
    const prevMonth: AylikSermaye = {
      ay: '2026-07',
      mevduatKumulatif: 180000,
      cekimKumulatif: 0,
      gerceklesenKzKumulatif: 90000,
      temettuKumulatif: 200,
      sermaye: 270200,
      excelSermaye: null,
      excelFarki: null,
    }

    const curMonth: AylikSermaye = {
      ay: '2026-08',
      mevduatKumulatif: 184608.62,
      cekimKumulatif: 0,
      gerceklesenKzKumulatif: 112291.96,
      temettuKumulatif: 298.07,
      sermaye: 297198.65,
      excelSermaye: 191386.89,
      excelFarki: 105811.76,
    }

    const snap = mockSnap({ netKZ_usd: 21717.65, vergiKomisyon_usd: 48.42 })
    const res = buildWaterfall('2026-08', curMonth, prevMonth, snap, [], [])

    expect(res).not.toBeNull()
    expect(res!.baslangic).toBe(270200)
    expect(res!.yeniMevduat).toBe(4608.62)
    expect(res!.gerceklesenKar).toBe(22291.96)
    expect(res!.temettu).toBe(98.07)
    expect(res!.donemSonu).toBe(297198.65)

    // Kabul kriteri: Değerleme (bakiye) TAM SIFIR olmalıdır
    expect(res!.degerlemeBakiye).toBe(0)
    const degStep = res!.steps.find((s) => s.label === 'Değerleme (bakiye)')
    expect(degStep?.tutarUsd).toBe(0)
  })

  it('gerçek BBB defter serisinde her ay için degerlemeBakiye TAM SIFIRDIR', async () => {
    const transactions = (await import('../../../../data/transactions.json')).default as unknown as Transaction[]
    const cashflows = (await import('../../../../data/cashflows.json')).default as unknown as Cashflow[]
    const snapshots = (await import('../../../../data/snapshots.json')).default as unknown as Snapshot[]

    const { derivePositions } = await import('./derive')
    const { buildEquityCurve } = await import('./equityCurve')

    const ds = {
      transactions,
      cashflows,
      snapshots,
      instruments: [],
      brokers: [],
      portfolios: [],
      meta: { semaVersiyonu: 1, olusturulma: '', kaynak: '', nakitHesapBazli: {}, p0Sinirlari: [] },
      fxrates: {},
      assetTransfers: [],
    }

    const pos = derivePositions(ds.transactions)
    const curve = buildEquityCurve(ds, pos.sales)

    for (let i = 1; i < curve.length; i++) {
      const cur = curve[i]
      const prev = curve[i - 1]
      const snap = snapshots.find((s) => s.tarih.slice(0, 7) === cur.ay)
      const res = buildWaterfall(cur.ay, cur, prev, snap, pos.sales, ds.transactions)
      expect(res).not.toBeNull()
      // Defter serisinde araToplam === donemSonu, bakiye her zaman 0
      expect(res!.degerlemeBakiye).toBe(0)
    }
  })
})
