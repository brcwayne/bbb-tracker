import { describe, it, expect } from 'vitest'
import { deriveAll } from './store'
import { ownerLedger } from './owners'
import type { Dataset } from './types'

// Exactly what `python -m src.cli.make_seed --owner BEN --name Ben` writes for a new instance.
const starter: Dataset = {
  transactions: [],
  cashflows: [],
  snapshots: [],
  instruments: [],
  brokers: [],
  portfolios: [],
  fxrates: {},
  assetTransfers: [],
  meta: { semaVersiyonu: 1, olusturulma: '2026-09-20T00:00:00', kaynak: 'bos-baslangic', nakitHesapBazli: {}, p0Sinirlari: [] },
  personalTx: [],
  paymentPlans: [],
  personalAccounts: [{ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY', sahip: 'BEN', aktif: true }],
  categories: [{ kod: 'market', ad: 'Market', tur: 'GIDER', aktif: true }],
  people: [{ kod: 'BEN', ad: 'Ben', haneUyesi: true, aktif: true }],
  debts: [],
  recurringRules: [],
}

describe('boş başlangıç veri seti (yeni kurulum)', () => {
  it('türetme hiçbir şeyi çökertmez', () => {
    expect(() => deriveAll(starter)).not.toThrow()
  })

  it('kişi bakiyesi sıfır ve hesaplarla tutar', () => {
    const l = ownerLedger(starter.personalTx!, starter.personalAccounts!, starter.people!, '2026-09-20')
    expect(l.owners).toEqual({ BEN: {} })
    expect(Object.values(l.gap).every((v) => v === 0)).toBe(true)
  })
})
