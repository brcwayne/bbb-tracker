import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { createAppStore, load, deriveAll } from './store'
import { NeedsAuthError } from './drive'
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
