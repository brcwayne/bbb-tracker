import { describe, it, expect } from 'vitest'
import { writable } from 'svelte/store'
import { get } from 'svelte/store'
import { updateRecords } from './store'
import type { AppState } from './store'

describe('updateRecords', () => {
  it('eşleşen tüm satırları tek seferde günceller', async () => {
    const dataset: any = {
      transactions: [], cashflows: [], snapshots: [], instruments: [], brokers: [],
      portfolios: [], meta: {}, fxrates: {}, assetTransfers: [],
      personalTx: [
        { id: 'px_1', tarih: '2026-10-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' },
        { id: 'px_2', tarih: '2026-11-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' },
        { id: 'px_3', tarih: '2026-09-05', tur: 'GIDER', tutar: 229.9, paraBirimi: 'TRY', kategori: 'eglence', aciklama: 'Netflix', hesap: 'nakit', sahip: 'enis', taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '', kaynak: 'manual', olusturulma: '', tekrarKuralId: 'rr_1' },
      ],
      paymentPlans: [], personalAccounts: [], categories: [], people: [], debts: [], recurringRules: [],
    }
    const store = writable<AppState>({ status: 'ready', dataset, derived: {} as any, sourceText: '' } as any)
    const source: any = { id: 'drive', load: async () => dataset, save: async () => {} }

    await updateRecords(
      store, source, 'personal_tx',
      (r: any) => r.tekrarKuralId === 'rr_1' && r.durum === 'planlandi' && r.tarih >= '2026-10-05',
      (r: any) => ({ ...r, tutar: 259.9 }),
    )
    const rows = get(store).dataset?.personalTx ?? []
    expect(rows.find((r: any) => r.id === 'px_1')!.tutar).toBe(259.9)
    expect(rows.find((r: any) => r.id === 'px_2')!.tutar).toBe(259.9)
    expect(rows.find((r: any) => r.id === 'px_3')!.tutar).toBe(229.9) // geçmiş satır dokunulmadı
  })
})
