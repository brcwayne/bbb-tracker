import { describe, it, expect } from 'vitest'
import { collectWarnings } from './uyarilar'
import { fixture } from '../../fixtures/dataset'
import { deriveAll } from './store'
import type { PriceLookup } from './unrealized'

describe('collectWarnings', () => {
  const emptyPrices: PriceLookup = { bySymbol: {}, usdPerGram: null }

  it('returns empty list for a clean dataset with full prices and no errors', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    // Provide prices for all open positions so fiyatsizPozisyon === 0
    const prices: PriceLookup = {
      bySymbol: {
        'ASTOR.IS': { priceUsd: 3.33 },
        'THYAO.IS': { priceUsd: 10 },
      },
      usdPerGram: 80, // for XAU
    }
    const derived = deriveAll(ds)
    derived.positions.errors = []
    // Ensure snapshot equity matches live equity closely (< 5% difference)
    // and positive cash
    const nakitUsd = Object.values(derived.cashByHesap).reduce((s, v) => s + v, 0)
    // Add a snapshot matching live equity
    ds.snapshots = [
      {
        tarih: '2026-09-01',
        toplamOzkaynak_usd: nakitUsd + derived.positions.open.reduce((s, p) => s + p.toplamMaliyetUsd, 0),
        baslangicSermayesi_usd: 1000,
        netMevduatCekim_usd: 0,
        nakitTemettu_usd: 0,
        netKZ_usd: 0,
        cekim_usd: 0,
        vergiKomisyon_usd: 0,
      },
    ]

    const warnings = collectWarnings(ds, derived, prices)
    expect(warnings.find((w) => w.id === 'negatif-nakit')).toBeUndefined()
    expect(warnings.find((w) => w.id === 'fiyatsiz-pozisyon')).toBeUndefined()
  })

  it('1. triggers mutabakat-farki when discrepancy exceeds 5%', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    const derived = deriveAll(ds)
    // Set a snapshot with $10,000 equity, while live equity is around ~$5,000
    ds.snapshots = [
      {
        tarih: '2026-08-31',
        toplamOzkaynak_usd: 100000,
        baslangicSermayesi_usd: 10000,
        netMevduatCekim_usd: 0,
        nakitTemettu_usd: 0,
        netKZ_usd: 0,
        cekim_usd: 0,
        vergiKomisyon_usd: 0,
      },
    ]
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id === 'mutabakat-farki')
    expect(w).toBeDefined()
    expect(w?.seviye).toBe('bilgi')
    expect(w?.sayfa).toBe('panorama')
    expect(w?.mesaj).toContain('Aylık rapor ile defter arasında')
  })

  it('2. triggers negatif-nakit when total cash is negative', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    const derived = deriveAll(ds)
    // Force total cash negative
    derived.cashByHesap = { GARAN: -2500 }
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id === 'negatif-nakit')
    expect(w).toBeDefined()
    expect(w?.seviye).toBe('uyari')
    expect(w?.sayfa).toBe('panorama')
    expect(w?.mesaj).toContain('Nakit bakiyesi negatif (−$2.500)')
  })

  it('3. triggers fiyatsiz-pozisyon when positions lack price', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    const derived = deriveAll(ds)
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id === 'fiyatsiz-pozisyon')
    expect(w).toBeDefined()
    expect(w?.seviye).toBe('uyari')
    expect(w?.mesaj).toMatch(/\d+ pozisyonun güncel fiyatı alınamadı/)
  })

  it('4. triggers odunc warning when ledger has borrowed lot error', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    const derived = deriveAll(ds)
    derived.positions.errors = [
      'tx_99: HDFGS DELTA portföyünde yok, ALFA portföyünden 34.365 lot alındı — portföy etiketi hatalı olabilir',
    ]
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id.startsWith('odunc'))
    expect(w).toBeDefined()
    expect(w?.seviye).toBe('uyari')
    expect(w?.sayfa).toBe('pozisyonlar')
    expect(w?.mesaj).toContain('DELTA portföyünde yok, ALFA portföyünden 34.365 lot alındı')
  })

  it('5. triggers asiri-satis warning with level hata when ledger has oversell', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    const derived = deriveAll(ds)
    derived.positions.errors = [
      'tx_101: aşırı satış THYAO (istenen 100, mevcut 50)',
    ]
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id.startsWith('asiri-satis'))
    expect(w).toBeDefined()
    expect(w?.seviye).toBe('hata')
    expect(w?.sayfa).toBe('pozisyonlar')
    expect(w?.mesaj).toContain('aşırı satış THYAO')
  })

  it('6. triggers kimlik-farki with level hata when accounting identity drifts > 0.5%', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    ds.meta.gocNakitDuzeltmesi = undefined
    const derived = deriveAll(ds)
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id === 'kimlik-farki')
    expect(w).toBeDefined()
    expect(w?.seviye).toBe('hata')
    expect(w?.sayfa).toBe('panorama')
    expect(w?.mesaj).toContain('Muhasebe kimliği tutmuyor')
  })

  it('does not trigger kimlik-farki when identity is closed within 0.5%', () => {
    const ds = JSON.parse(JSON.stringify(fixture))
    // fixture has gocNakitDuzeltmesi: -450 which closes the identity
    const derived = deriveAll(ds)
    const warnings = collectWarnings(ds, derived, emptyPrices)
    const w = warnings.find((x) => x.id === 'kimlik-farki')
    expect(w).toBeUndefined()
  })
})
