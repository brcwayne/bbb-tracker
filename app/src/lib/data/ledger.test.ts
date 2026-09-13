import { describe, it, expect } from 'vitest'
import { buildLedger, type SaleEvent } from './ledger'
import { fixture } from '../../fixtures/dataset'
import type { Transaction, AssetTransfer } from './types'
import { hasRealData, loadRealData } from './testRealData'

const t = (o: Partial<Transaction>): Transaction => ({
  id: o.id ?? 'x',
  tarih: o.tarih ?? '2020-01-01',
  hesap: o.hesap ?? 'MIDAS',
  portfoy: o.portfoy ?? 'ALFA',
  enstruman: o.enstruman ?? 'ASTOR',
  yon: o.yon ?? 'AL',
  lot: o.lot ?? 0,
  girisParaBirimi: 'TL',
  fiyat_tl: null,
  fiyat_usd: o.fiyat_usd ?? 0,
  kur: 1,
  komisyon_usd: o.komisyon_usd ?? 0,
  brut_usd: 0,
  net_usd: o.net_usd ?? 0,
  not: '',
  kaynak: 'manual',
  olusturulma: null,
})

describe('ledger — unit tests', () => {
  it('empty ledger returns valid structure', () => {
    const res = buildLedger([], [], 'global', new Date('2026-01-01'))
    expect(res.allSales).toEqual([])
    expect(res.errors).toEqual([])
    const g = res.byScope.get('')
    expect(g).toBeDefined()
    expect(g!.open).toEqual([])
    expect(g!.sales).toEqual([])
    expect(g!.realizedUsd).toBe(0)
    expect(g!.gunSayisi).toBe(0)
    expect(g!.ortKullanilanSermayeUsd).toBe(0)
  })

  it('partial sale calculates moving average, realized pnl, and holding days', () => {
    const res = buildLedger(
      [
        t({ id: 'a', tarih: '2020-01-01', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
        t({ id: 'b', tarih: '2020-06-01', yon: 'AL', lot: 100, fiyat_usd: 2, net_usd: 200 }),
        t({ id: 'c', tarih: '2021-01-01', yon: 'SAT', lot: 50, fiyat_usd: 5, net_usd: 250 }),
      ],
      [],
      'global',
      new Date('2021-06-01'),
    )

    const g = res.byScope.get('')!
    expect(g.open).toHaveLength(1)
    expect(g.open[0].lot).toBe(150)
    expect(g.open[0].ortMaliyetUsd).toBeCloseTo(1.5, 9)
    expect(g.open[0].toplamMaliyetUsd).toBeCloseTo(225, 9)
    expect(g.realizedUsd).toBeCloseTo(175, 9)
    expect(res.allSales).toHaveLength(1)

    const s = res.allSales[0]
    expect(s.txId).toBe('c')
    expect(s.lot).toBe(50)
    expect(s.ortMaliyetUsd).toBeCloseTo(1.5, 9)
    expect(s.maliyetUsd).toBeCloseTo(75, 9)
    expect(s.hasilatUsd).toBeCloseTo(250, 9)
    expect(s.kzUsd).toBeCloseTo(175, 9)
    expect(s.kzPct).toBeCloseTo(175 / 75, 9)
    expect(s.kalanLot).toBe(150)
    expect(s.pozisyonKapandi).toBe(false)
    expect(s.ilkAlisTarih).toBe('2020-01-01')
    expect(s.tutmaGunu).toBe(366) // 2020 is a leap year
  })

  it('full exit clears position and marks pozisyonKapandi', () => {
    const res = buildLedger(
      [
        t({ id: 'a', tarih: '2019-07-01', enstruman: 'XAU', yon: 'AL', lot: 10, fiyat_usd: 50, net_usd: 500 }),
        t({ id: 'b', tarih: '2024-01-01', enstruman: 'XAU', yon: 'SAT', lot: 10, fiyat_usd: 80, net_usd: 800 }),
      ],
      [],
      'global',
    )
    const g = res.byScope.get('')!
    expect(g.open).toHaveLength(0)
    expect(g.realizedUsd).toBeCloseTo(300, 9)
    expect(res.allSales).toHaveLength(1)
    const s = res.allSales[0]
    expect(s.pozisyonKapandi).toBe(true)
    expect(s.kalanLot).toBe(0)
  })

  it('close and re-open resets ilkAlisTarih and holding period', () => {
    const res = buildLedger(
      [
        t({ id: 'a', tarih: '2020-01-01', enstruman: 'THYAO', yon: 'AL', lot: 10, fiyat_usd: 10, net_usd: 100 }),
        t({ id: 'b', tarih: '2020-02-01', enstruman: 'THYAO', yon: 'SAT', lot: 10, fiyat_usd: 12, net_usd: 120 }),
        t({ id: 'c', tarih: '2020-05-01', enstruman: 'THYAO', yon: 'AL', lot: 20, fiyat_usd: 15, net_usd: 300 }),
        t({ id: 'd', tarih: '2020-06-01', enstruman: 'THYAO', yon: 'SAT', lot: 10, fiyat_usd: 20, net_usd: 200 }),
      ],
      [],
      'global',
    )
    expect(res.allSales).toHaveLength(2)
    const [s1, s2] = res.allSales
    expect(s1.ilkAlisTarih).toBe('2020-01-01')
    expect(s1.tutmaGunu).toBe(31)
    expect(s1.pozisyonKapandi).toBe(true)

    expect(s2.ilkAlisTarih).toBe('2020-05-01')
    expect(s2.tutmaGunu).toBe(31)
    expect(s2.pozisyonKapandi).toBe(false)
    expect(s2.kalanLot).toBe(10)
  })

  it('oversell is flagged in errors and clamped', () => {
    const res = buildLedger(
      [
        t({ id: 'a', tarih: '2020-01-01', enstruman: 'ASTOR', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
        t({ id: 'b', tarih: '2020-02-01', enstruman: 'ASTOR', yon: 'SAT', lot: 250, fiyat_usd: 2, net_usd: 500 }),
      ],
      [],
      'global',
    )
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toBe('b: aşırı satış ASTOR (istenen 250, mevcut 100)')
    expect(res.allSales).toHaveLength(1)
    expect(res.allSales[0].lot).toBe(100)
    expect(res.allSales[0].kzUsd).toBeCloseTo(100, 9)
    expect(res.byScope.get('')!.open).toHaveLength(0)
  })

  it('transfer between portfolios moves cost and lots without generating sale', () => {
    const txns: Transaction[] = [
      t({ id: 't1', tarih: '2026-01-01', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL', lot: 10, fiyat_usd: 10, net_usd: 100 }),
    ]
    const transfers: AssetTransfer[] = [
      {
        id: 'at1',
        tarih: '2026-02-01',
        enstruman: 'THYAO',
        lot: 10,
        kaynakHesap: 'MIDAS',
        hedefHesap: 'MIDAS',
        kaynakPortfoy: 'ENIS',
        hedefPortfoy: 'ALFA',
        aciklama: '',
        kaynak: 'manual',
      },
    ]

    const res = buildLedger(txns, transfers, 'portfoy', new Date('2026-03-01'))
    expect(res.allSales).toHaveLength(0)

    const enis = res.byScope.get('ENIS')!
    const alfa = res.byScope.get('ALFA')!

    expect(enis.open).toHaveLength(0)
    expect(alfa.open).toHaveLength(1)
    expect(alfa.open[0].kod).toBe('THYAO')
    expect(alfa.open[0].lot).toBe(10)
    expect(alfa.open[0].ortMaliyetUsd).toBeCloseTo(10, 9)
    expect(alfa.open[0].toplamMaliyetUsd).toBeCloseTo(100, 9)
    expect(alfa.toplamAlimMaliyetiUsd).toBeCloseTo(100, 9)
  })

  it('same-day buy and transfer properly sequences transfer after buy', () => {
    const txns: Transaction[] = [
      t({ id: 't_1', tarih: '2026-09-05', portfoy: 'ENIS', hesap: 'MIDAS', enstruman: 'THYAO', yon: 'AL', lot: 10, fiyat_usd: 5, net_usd: 50 }),
    ]
    const transfers: AssetTransfer[] = [
      {
        id: 'at_1',
        tarih: '2026-09-05',
        enstruman: 'THYAO',
        lot: 10,
        kaynakHesap: 'MIDAS',
        hedefHesap: 'GARAN',
        kaynakPortfoy: 'ENIS',
        hedefPortfoy: 'ALFA',
        aciklama: '',
        kaynak: 'manual',
      },
    ]

    const byPort = buildLedger(txns, transfers, 'portfoy')
    expect(byPort.byScope.get('ENIS')!.open).toHaveLength(0)
    expect(byPort.byScope.get('ALFA')!.open).toHaveLength(1)

    const byHesap = buildLedger(txns, transfers, 'hesap')
    expect(byHesap.byScope.get('MIDAS')!.open).toHaveLength(0)
    expect(byHesap.byScope.get('GARAN')!.open).toHaveLength(1)
  })

  it('in consistent multi-scope dataset, portfoy and hesap realized sum matches global', () => {
    const txns: Transaction[] = [
      t({ id: 't1', tarih: '2026-01-01', portfoy: 'P1', hesap: 'H1', enstruman: 'SYM1', yon: 'AL', lot: 10, fiyat_usd: 10, net_usd: 100 }),
      t({ id: 't2', tarih: '2026-02-01', portfoy: 'P1', hesap: 'H1', enstruman: 'SYM1', yon: 'SAT', lot: 5, fiyat_usd: 15, net_usd: 75 }),
      t({ id: 't3', tarih: '2026-01-15', portfoy: 'P2', hesap: 'H2', enstruman: 'SYM2', yon: 'AL', lot: 20, fiyat_usd: 20, net_usd: 400 }),
      t({ id: 't4', tarih: '2026-03-01', portfoy: 'P2', hesap: 'H2', enstruman: 'SYM2', yon: 'SAT', lot: 10, fiyat_usd: 25, net_usd: 250 }),
    ]

    const globalRes = buildLedger(txns, [], 'global')
    const portRes = buildLedger(txns, [], 'portfoy')
    const hesapRes = buildLedger(txns, [], 'hesap')

    const globalRealized = globalRes.byScope.get('')!.realizedUsd
    const portRealized = [...portRes.byScope.values()].reduce((s, sc) => s + sc.realizedUsd, 0)
    const hesapRealized = [...hesapRes.byScope.values()].reduce((s, sc) => s + sc.realizedUsd, 0)

    expect(portRealized).toBeCloseTo(globalRealized, 9)
    expect(hesapRealized).toBeCloseTo(globalRealized, 9)
  })

  it('G11: ALFA\'da alınıp DELTA\'da satılan sembol için errors.length === 1 ve uyarı iki portföyün adını da içeriyor', () => {
    const txns: Transaction[] = [
      t({ id: 'tx_buy', tarih: '2026-01-01', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'AL', lot: 100, fiyat_usd: 10, net_usd: 1000 }),
      t({ id: 'tx_sell', tarih: '2026-02-01', portfoy: 'DELTA', enstruman: 'ASTOR', yon: 'SAT', lot: 100, fiyat_usd: 15, net_usd: 1500 }),
    ]

    const res = buildLedger(txns, [], 'portfoy')
    expect(res.errors).toHaveLength(1)
    const err = res.errors[0]
    expect(err).toContain('ALFA')
    expect(err).toContain('DELTA')
    expect(err).toBe(
      'tx_sell: ASTOR DELTA portföyünde yok, ALFA portföyünden 100 lot alındı — portföy etiketi hatalı olabilir',
    )
    expect(res.allSales).toHaveLength(1)
    expect(res.allSales[0].oduncAlindi).toBe(true)
  })

  it('G11: picks portfolio holding the most lots deterministically when borrowing', () => {
    const txns: Transaction[] = [
      t({ id: 't_p1', tarih: '2026-01-01', portfoy: 'PORT_A', enstruman: 'THYAO', yon: 'AL', lot: 30, fiyat_usd: 10, net_usd: 300 }),
      t({ id: 't_p2', tarih: '2026-01-02', portfoy: 'PORT_B', enstruman: 'THYAO', yon: 'AL', lot: 70, fiyat_usd: 10, net_usd: 700 }),
      t({ id: 't_sell', tarih: '2026-02-01', portfoy: 'PORT_C', enstruman: 'THYAO', yon: 'SAT', lot: 50, fiyat_usd: 15, net_usd: 750 }),
    ]

    const res = buildLedger(txns, [], 'portfoy')
    expect(res.errors).toHaveLength(1)
    // Borrowed 50 lots from PORT_B because it holds 70 lots (more than PORT_A's 30)
    expect(res.errors[0]).toBe(
      't_sell: THYAO PORT_C portföyünde yok, PORT_B portföyünden 50 lot alındı — portföy etiketi hatalı olabilir',
    )
    // PORT_B should have 20 lots left, PORT_A should still have 30 lots
    expect(res.byScope.get('PORT_B')!.open[0].lot).toBe(20)
    expect(res.byScope.get('PORT_A')!.open[0].lot).toBe(30)
  })
})

describe('ledger — real dataset reconciliation', () => {
  it.skipIf(!hasRealData())('matches all anchor values from actual transactions', () => {
    const typedRealTxns = loadRealData<Transaction[]>('transactions.json')
    const globalRes = buildLedger(typedRealTxns, [], 'global')

    const g = globalRes.byScope.get('')!
    // Gerçek veriyle: realizedUsd ≈ $113.704,47
    expect(g.realizedUsd).toBeCloseTo(113704.47, 2)

    // Açık pozisyon sayısı: 34
    expect(g.open).toHaveLength(34)

    // Açık maliyet ≈ $264.826,36
    const totalOpenCost = g.open.reduce((s, p) => s + p.toplamMaliyetUsd, 0)
    expect(totalOpenCost).toBeCloseTo(264826.36, 2)

    // allSales.reduce((s, e) => s + e.kzUsd, 0) ≈ realizedTotalUsd
    const salesTotalKz = globalRes.allSales.reduce((s, e) => s + e.kzUsd, 0)
    expect(salesTotalKz).toBeCloseTo(g.realizedUsd, 4)

    // En büyük açık pozisyon: ATA LIRA 143 lot / $38.381,60
    const ata = g.open.find((p) => p.kod === 'ATA LIRA')
    expect(ata).toBeDefined()
    expect(ata!.lot).toBe(143)
    expect(ata!.toplamMaliyetUsd).toBeCloseTo(38381.60, 2)

    // Hesap kapsamı toplam sermaye korumu (realized + openCost = toplam harcanan sermaye - bakiye)
    const hesapRes = buildLedger(typedRealTxns, [], 'hesap')
    expect(hesapRes.errors).toEqual([])
  })
})
