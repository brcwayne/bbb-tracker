import { describe, it, expect } from 'vitest'
import { buildVergiOzeti, exportVergiCsv, getMevcutYillar } from './vergi'
import type { Dataset } from './types'
import type { SaleEvent } from './ledger'

describe('vergi module (I7)', () => {
  const mockDataset: Dataset = {
    transactions: [],
    cashflows: [
      { id: 'c1', tarih: '2026-03-15', hesap: 'GARAN', portfoy: null, tur: 'TEMETTU', enstruman: 'KCHOL', tutar_tl: null, tutar_usd: 150, kur: null, aciklama: '', kaynak: 'migration' },
      { id: 'c2', tarih: '2025-05-10', hesap: 'GARAN', portfoy: null, tur: 'TEMETTU', enstruman: 'THYAO', tutar_tl: null, tutar_usd: 50, kur: null, aciklama: '', kaynak: 'migration' },
    ],
    snapshots: [],
    instruments: [
      { kod: 'THYAO', ad: 'Türk Hava Yolları', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'THYAO.IS', seviyeler: null },
      { kod: 'PPZ', ad: 'Para Piyasası Fonu', sinif: 'FON_PARA', girisParaBirimi: 'TL', fiyatKaynagi: 'tefas', fiyatSembolu: 'PPZ', seviyeler: null },
      { kod: 'XAU', ad: 'Altın', sinif: 'ALTIN', girisParaBirimi: 'USD', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'XAUUSD', seviyeler: null },
    ],
    brokers: [],
    portfolios: [],
    fxrates: {},
    assetTransfers: [],
    meta: { semaVersiyonu: 1, olusturulma: '2026-09-12T00:00:00', kaynak: 'test.xlsm', nakitHesapBazli: {}, p0Sinirlari: [] },
  }

  const mockSales: SaleEvent[] = [
    {
      txId: 's1',
      tarih: '2026-02-10',
      kod: 'THYAO',
      hesap: 'GARAN',
      portfoy: 'ALFA',
      lot: 100,
      satisFiyatUsd: 10,
      ortMaliyetUsd: 8,
      maliyetUsd: 800,
      hasilatUsd: 990,
      komisyonUsd: 10,
      kzUsd: 190,
      kzPct: 0.2375,
      kalanLot: 0,
      pozisyonKapandi: true,
      ilkAlisTarih: '2025-10-01',
      tutmaGunu: 132,
      oduncAlindi: false,
    },
    {
      txId: 's2',
      tarih: '2026-04-15',
      kod: 'THYAO',
      hesap: 'GARAN',
      portfoy: 'ALFA',
      lot: 50,
      satisFiyatUsd: 7,
      ortMaliyetUsd: 9,
      maliyetUsd: 450,
      hasilatUsd: 345,
      komisyonUsd: 5,
      kzUsd: -105,
      kzPct: -0.2333,
      kalanLot: 0,
      pozisyonKapandi: true,
      ilkAlisTarih: '2026-01-10',
      tutmaGunu: 95,
      oduncAlindi: false,
    },
    {
      txId: 's3',
      tarih: '2026-06-20',
      kod: 'PPZ',
      hesap: 'GARAN',
      portfoy: 'DELTA',
      lot: 1000,
      satisFiyatUsd: 1.05,
      ortMaliyetUsd: 1.0,
      maliyetUsd: 1000,
      hasilatUsd: 1050,
      komisyonUsd: 0,
      kzUsd: 50,
      kzPct: 0.05,
      kalanLot: 0,
      pozisyonKapandi: true,
      ilkAlisTarih: '2026-05-01',
      tutmaGunu: 50,
      oduncAlindi: false,
    },
    {
      txId: 's4',
      tarih: '2025-11-10',
      kod: 'XAU',
      hesap: 'KASA',
      portfoy: 'ENIS',
      lot: 10,
      satisFiyatUsd: 70,
      ortMaliyetUsd: 60,
      maliyetUsd: 600,
      hasilatUsd: 700,
      komisyonUsd: 0,
      kzUsd: 100,
      kzPct: 0.1667,
      kalanLot: 0,
      pozisyonKapandi: true,
      ilkAlisTarih: '2025-01-01',
      tutmaGunu: 313,
      oduncAlindi: false,
    },
  ]

  it('aggregates year totals correctly and matches SaleEvent rows (reconciles to realized P/L)', () => {
    const res = buildVergiOzeti(mockDataset, mockSales, 2026)

    expect(res.yil).toBe(2026)
    expect(res.satisSayisi).toBe(3)
    expect(res.toplamMaliyetUsd).toBe(800 + 450 + 1000) // 2250
    expect(res.toplamHasilatUsd).toBe(990 + 345 + 1050) // 2385
    expect(res.gerceklesenKzUsd).toBe(190 - 105 + 50) // 135
    expect(res.toplamKarUsd).toBe(190 + 50) // 240
    expect(res.toplamZararUsd).toBe(-105) // -105
    expect(res.komisyonUsd).toBe(10 + 5 + 0) // 15
    expect(res.temettuUsd).toBe(150) // only 2026 dividend
    expect(res.satislar.length).toBe(3)
  })

  it('breaks down results by instrument class with separate profit and loss', () => {
    const res = buildVergiOzeti(mockDataset, mockSales, 2026)
    expect(res.siniflar.length).toBe(2)

    const bist = res.siniflar.find((s) => s.sinif === 'BIST')
    expect(bist).toBeDefined()
    expect(bist?.satisSayisi).toBe(2)
    expect(bist?.toplamMaliyetUsd).toBe(1250)
    expect(bist?.toplamHasilatUsd).toBe(1335)
    expect(bist?.toplamKarUsd).toBe(190)
    expect(bist?.toplamZararUsd).toBe(-105)
    expect(bist?.netKzUsd).toBe(85)
    expect(bist?.komisyonUsd).toBe(15)

    const fonPara = res.siniflar.find((s) => s.sinif === 'FON_PARA')
    expect(fonPara).toBeDefined()
    expect(fonPara?.satisSayisi).toBe(1)
    expect(fonPara?.toplamKarUsd).toBe(50)
    expect(fonPara?.toplamZararUsd).toBe(0)
    expect(fonPara?.netKzUsd).toBe(50)
  })

  it('handles a year with no sales without crashing and returns empty structure', () => {
    const res = buildVergiOzeti(mockDataset, mockSales, 2024)
    expect(res.yil).toBe(2024)
    expect(res.satisSayisi).toBe(0)
    expect(res.toplamHasilatUsd).toBe(0)
    expect(res.toplamMaliyetUsd).toBe(0)
    expect(res.gerceklesenKzUsd).toBe(0)
    expect(res.toplamKarUsd).toBe(0)
    expect(res.toplamZararUsd).toBe(0)
    expect(res.komisyonUsd).toBe(0)
    expect(res.temettuUsd).toBe(0)
    expect(res.siniflar).toEqual([])
    expect(res.satislar).toEqual([])
  })

  it('generates CSV with exact row count matching sales count', () => {
    const res = buildVergiOzeti(mockDataset, mockSales, 2026)
    const csv = exportVergiCsv(res.satislar)
    const lines = csv.trim().split('\n')

    // 1 header line + 3 data lines
    expect(lines.length).toBe(4)
    expect(lines[0]).toBe('tarih,kod,sinif,lot,maliyet,hasilat,kz,tutmaGunu')
    expect(lines[1]).toContain('2026-02-10,THYAO,BIST,100,800.00,990.00,190.00,132')
  })

  it('extracts available years correctly', () => {
    const years = getMevcutYillar(mockDataset, mockSales)
    expect(years).toContain(2026)
    expect(years).toContain(2025)
    // Sorted descending
    expect(years[0]).toBe(2026)
  })
})
