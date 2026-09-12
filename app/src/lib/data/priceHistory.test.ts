import { describe, it, expect } from 'vitest'
import { mergePriceHistory, type PriceHistoryRow } from './priceHistory'

describe('mergePriceHistory', () => {
  it('boş geçmişe yeni fiyatları ekler', () => {
    const res = mergePriceHistory(
      [],
      {
        'THYAO.IS': { priceUsd: 10.5 },
        'AKBNK.IS': { priceUsd: 2.2 },
      },
      '2026-09-12T14:32:00Z',
    )
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({ tarih: '2026-09-12', sembol: 'AKBNK.IS', fiyatUsd: 2.2 })
    expect(res[1]).toEqual({ tarih: '2026-09-12', sembol: 'THYAO.IS', fiyatUsd: 10.5 })
  })

  it('aynı gün için ikinci çekimde satır çoğaltmaz, üzerine yazar (I5)', () => {
    const existing: PriceHistoryRow[] = [
      { tarih: '2026-09-12', sembol: 'THYAO.IS', fiyatUsd: 10.5 },
      { tarih: '2026-09-11', sembol: 'THYAO.IS', fiyatUsd: 10.0 },
    ]

    const res = mergePriceHistory(
      existing,
      {
        'THYAO.IS': { priceUsd: 11.0 }, // Güncellendi
        'GARAN.IS': { priceUsd: 3.5 }, // Yeni sembol
      },
      '2026-09-12T18:00:00Z',
    )

    // 2026-09-11 THYAO (10.0) + 2026-09-12 THYAO (11.0, güncellendi) + 2026-09-12 GARAN (3.5) = 3 satır
    expect(res).toHaveLength(3)
    const thyao12 = res.find((r) => r.tarih === '2026-09-12' && r.sembol === 'THYAO.IS')
    expect(thyao12?.fiyatUsd).toBe(11.0)
    const garan12 = res.find((r) => r.tarih === '2026-09-12' && r.sembol === 'GARAN.IS')
    expect(garan12?.fiyatUsd).toBe(3.5)
  })

  it('fiyatı null veya geçersiz olan sembolleri geçmişe eklemez', () => {
    const res = mergePriceHistory(
      [],
      {
        'VALID.IS': { priceUsd: 5.0 },
        'NULL.IS': { priceUsd: null },
      },
      '2026-09-12',
    )
    expect(res).toHaveLength(1)
    expect(res[0].sembol).toBe('VALID.IS')
  })
})
