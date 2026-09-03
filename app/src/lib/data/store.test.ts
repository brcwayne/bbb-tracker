import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'
import { createAppStore, load } from './store'
import { fixture } from '../../fixtures/dataset'
import type { DataSource } from './source'

const okSource: DataSource = { id: 'local', load: () => Promise.resolve(fixture) }
const badSource: DataSource = { id: 'local', load: () => Promise.reject(new Error('data/meta.json okunamadı (404)')) }

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
  })
})
