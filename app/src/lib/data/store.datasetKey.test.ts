import { expect, it } from 'vitest'
import { writable } from 'svelte/store'
import { appendRecord } from './store'
import type { AppState } from './store'

/**
 * Regression: the Drive file is `personal_tx.json` but the loader puts its rows
 * in `dataset.personalTx` (PERSONAL_KEY_MAP). writeAndCommit used to index the
 * dataset by the FILE name, so in production `current` was undefined and every
 * add threw "current is not iterable" — while the older tests passed because
 * they seeded the snake_case key by hand. Seed this the way the loader really
 * does, or the bug comes back invisible.
 */
const dsAsLoaderProduces: any = {
  transactions: [], cashflows: [], snapshots: [], instruments: [], brokers: [],
  portfolios: [], meta: {}, fxrates: {}, assetTransfers: [],
  personalTx: [{ id: 'px_1', kaynak: 'telegram' }],
  paymentPlans: [], personalAccounts: [], categories: [], people: [], debts: [],
  recurringRules: [],
}

it('yükleyicinin ürettiği veriyle uygulamadan kayıt eklenebiliyor mu?', async () => {
  const store = writable<AppState>({ status: 'ready', dataset: dsAsLoaderProduces,
    derived: {} as any, sourceText: '' } as any)
  const saved: Record<string, unknown> = {}
  const source: any = { id: 'drive', load: async () => dsAsLoaderProduces,
    save: async (n: string, d: unknown) => { saved[n] = d } }

  await appendRecord(store, source, 'personal_tx' as any, { id: 'px_2', kaynak: 'manual' })
  expect(saved.personal_tx).toHaveLength(2)   // mevcut 1 + yeni 1
})

it('recurring_rules dosya adı recurringRules dataset alanına yazılır', async () => {
  const store = writable<AppState>({ status: 'ready', dataset: dsAsLoaderProduces,
    derived: {} as any, sourceText: '' } as any)
  const saved: Record<string, unknown> = {}
  const source: any = { id: 'drive', load: async () => dsAsLoaderProduces,
    save: async (n: string, d: unknown) => { saved[n] = d } }

  await appendRecord(store, source, 'recurring_rules' as any, {
    id: 'rr_abc123abc123',
    tur: 'GIDER',
    aciklama: 'Netflix',
    kategori: 'eglence',
    hesap: 'nakit',
    sahip: 'enis',
    paraBirimi: 'TRY',
    tutar: 229.9,
    gunOfMonth: 5,
    baslangicTarihi: '2026-09-01',
    bitisTarihi: null,
    aktif: true,
    olusturulma: new Date().toISOString(),
    kaynak: 'manual',
  })
  expect(saved.recurring_rules).toHaveLength(1)
  expect((saved.recurring_rules as any[])[0].aciklama).toBe('Netflix')
})
