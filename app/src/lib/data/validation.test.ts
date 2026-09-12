import { describe, it, expect } from 'vitest'
import { validateSaleScope, secButtonLabel } from './validation'
import type { Transaction } from './types'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    tarih: '2026-08-01',
    hesap: 'MIDAS',
    portfoy: 'FON',
    enstruman: 'FSK',
    yon: 'AL',
    lot: 11419,
    girisParaBirimi: 'USD',
    fiyat_tl: null,
    fiyat_usd: 10,
    kur: null,
    komisyon_usd: 0,
    brut_usd: 114190,
    net_usd: 114190,
    not: '',
    kaynak: 'manual',
    olusturulma: null,
    ...overrides,
  }
}

describe('validateSaleScope (H5)', () => {
  it('returns valid: true with no warnings when portfolio and broker have enough lots', () => {
    const txns = [makeTx({ portfoy: 'FON', hesap: 'MIDAS', lot: 500 })]
    const res = validateSaleScope(txns, [], 'FSK', 200, 'FON', 'MIDAS')

    expect(res.valid).toBe(true)
    expect(res.warnings).toHaveLength(0)
  })

  it('warns when selected portfolio has 0 lots and suggests alternative with most lots', () => {
    const txns = [
      makeTx({ id: 't1', portfoy: 'FON', lot: 11419 }),
      makeTx({ id: 't2', portfoy: 'DELTA', lot: 500 }),
    ]
    // Trying to sell from ENIS where FSK does not exist
    const res = validateSaleScope(txns, [], 'FSK', 100, 'ENIS', 'MIDAS')

    expect(res.valid).toBe(false)
    expect(res.portfoyWarning).toBeDefined()
    expect(res.portfoyWarning?.mesaj).toBe('⚠ ENIS portföyünde FSK yok. FON portföyünde 11.419 lot var.')
    expect(res.portfoyWarning?.alternative?.scope).toBe('FON')
    expect(res.portfoyWarning?.alternative?.availableLot).toBe(11419)
    expect(secButtonLabel('FON')).toBe("FON'u seç")
  })

  it('warns when selected broker has insufficient lots and suggests alternative broker', () => {
    const txns = [
      makeTx({ id: 't1', hesap: 'GARAN', portfoy: 'FON', lot: 1000 }),
      makeTx({ id: 't2', hesap: 'MIDAS', portfoy: 'FON', lot: 50 }),
    ]
    // Trying to sell 200 from MIDAS (only 50 available)
    const res = validateSaleScope(txns, [], 'FSK', 200, 'FON', 'MIDAS')

    expect(res.valid).toBe(false)
    expect(res.hesapWarning).toBeDefined()
    expect(res.hesapWarning?.alternative?.scope).toBe('GARAN')
    expect(res.hesapWarning?.mesaj).toContain('GARAN kurumunda 1.000 lot var.')
    expect(secButtonLabel('GARAN')).toBe("GARAN'ı seç")
  })

  it('handles both portfolio and broker warning simultaneously', () => {
    const txns = [
      makeTx({ id: 't1', hesap: 'GARAN', portfoy: 'FON', lot: 1000 }),
    ]
    // Selling from ENIS and MIDAS
    const res = validateSaleScope(txns, [], 'FSK', 100, 'ENIS', 'MIDAS')

    expect(res.valid).toBe(false)
    expect(res.warnings).toHaveLength(2)
    expect(res.portfoyWarning).toBeDefined()
    expect(res.hesapWarning).toBeDefined()
  })

  it('secButtonLabel correctly applies Turkish vowel harmony', () => {
    expect(secButtonLabel('FON')).toBe("FON'u seç")
    expect(secButtonLabel('ENIS')).toBe("ENIS'i seç")
    expect(secButtonLabel('ALFA')).toBe("ALFA'yı seç")
    expect(secButtonLabel('DELTA')).toBe("DELTA'yı seç")
    expect(secButtonLabel('MIDAS')).toBe("MIDAS'ı seç")
    expect(secButtonLabel('QNB')).toBe("QNB'i seç")
  })
})
