import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { createAppStore, load, deriveAll, appendRecord } from './store'
import { NeedsAuthError, ConflictError } from './drive'
import { fixture } from '../../fixtures/dataset'
import type { DataSource } from './source'

const okSource: DataSource = { id: 'local', load: () => Promise.resolve(fixture) }
const badSource: DataSource = { id: 'local', load: () => Promise.reject(new Error('data/meta.json okunamadı (404)')) }
const authSource: DataSource = { id: 'drive', load: () => Promise.reject(new NeedsAuthError('oturum süresi doldu')) }

describe('app store', () => {
  it('loads and derives', async () => {
    const s = createAppStore()
    await load(s, okSource)
    const v = get(s)
    expect(v.status).toBe('ready')
    expect(v.derived!.positions.realizedTotalUsd).toBeCloseTo(475, 6) // 175 + 300
    expect(v.sourceText).toContain('local')
  })
  it('captures load errors', async () => {
    const s = createAppStore()
    await load(s, badSource)
    const v = get(s)
    expect(v.status).toBe('error')
    expect(v.error).toMatch(/okunamadı/)
    expect(v.errorKind).toBeUndefined()
  })
  it('tags NeedsAuthError so App can route to ConnectDrive', async () => {
    const s = createAppStore()
    await load(s, authSource)
    const v = get(s)
    expect(v.status).toBe('error')
    expect(v.errorKind).toBe('auth')
  })
})

describe('deriveAll — period range', () => {
  it('all-time keeps every snapshot and closed trade', () => {
    const d = deriveAll(fixture)
    expect(d.snapshots).toHaveLength(fixture.snapshots.length)
    expect(d.closedInRange.map((c) => c.kod).sort()).toEqual(['ASTOR', 'XAU'])
  })

  it('a 2023+ window drops the older snapshot and the 2021 ASTOR exit', () => {
    const d = deriveAll(fixture, { from: '2023-01-01', to: '9999-12-31' })
    expect(d.snapshots).toHaveLength(1)
    expect(d.snapshots[0].tarih).toBe('2024-01-31')
    expect(d.closedInRange.map((c) => c.kod)).toEqual(['XAU'])
    expect(d.winLoss.wins).toBe(1)
    // open positions + realized total stay all-time
    expect(d.positions.realizedTotalUsd).toBeCloseTo(475, 6)
  })
})

describe('deriveAll — P1.6 blocks', () => {
  it('carries the dashboard totals, this-month, transfers and dividends', () => {
    const d = deriveAll(fixture)
    expect(d.dashboard.toplamSermaye).toBeCloseTo(5000, 6)
    expect(d.dashboard.gerceklesmemisKz).toBeNull() // priceless in deriveAll
    expect(d.monthPerf?.ay).toBe('Oca 2024')
    expect(d.transfers.totalIn).toBeCloseTo(5000, 6)
    expect(d.divs.total).toBeCloseTo(4, 6)
  })

  it('carries cashByHesap and moneyTransfers', () => {
    const d = deriveAll(fixture)
    expect(d.cashByHesap).toBeDefined()
    expect(d.moneyTransfers).toEqual([])
  })
})

describe('appendRecord', () => {
  it('throws when the source cannot save (e.g. local)', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const local = { id: 'local' as const, load: () => Promise.resolve(fixture) }
    await expect(appendRecord(store, local, 'transactions', {} as any)).rejects.toThrow(/sadece Google Drive/)
  })

  it('appends the record, saves, and updates the store on success', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let saved: unknown
    const drive = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (_name: string, data: unknown) => {
        saved = data
      },
    }
    const newTx = { id: 't_new', tarih: '2026-05-01' } as any
    await appendRecord(store, drive, 'transactions', newTx)
    expect((saved as any[]).some((t) => t.id === 't_new')).toBe(true)
    const state = get(store)
    expect(state.dataset?.transactions.some((t) => t.id === 't_new')).toBe(true)
  })

  it('retries once on ConflictError by reloading fresh data', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    let saveCalls = 0
    const drive = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {
        saveCalls++
        if (saveCalls === 1) throw new ConflictError('transactions')
      },
    }
    await appendRecord(store, drive, 'transactions', { id: 't_new2' } as any)
    expect(saveCalls).toBe(2)
  })

  it('surfaces an error after a second ConflictError', async () => {
    const store = createAppStore()
    await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
    const drive = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async () => {
        throw new ConflictError('transactions')
      },
    }
    await expect(appendRecord(store, drive, 'transactions', { id: 't_new3' } as any)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
})
