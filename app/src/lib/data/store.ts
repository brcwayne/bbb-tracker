import { writable, type Writable } from 'svelte/store'
import type { Dataset } from './types'
import type { DataSource } from './source'
import { describeSource } from './source'
import { LocalFileSource } from './local'
import { DriveSource, NeedsAuthError } from './drive'
import {
  derivePositions, allocationByClass, allocationByPortfolio, gainBuckets,
  periodPerformance, topMovers, winLoss, positionStats,
} from './derive'

export type DerivedBundle = ReturnType<typeof deriveAll>
export interface AppState {
  status: 'loading' | 'ready' | 'error'
  dataset?: Dataset
  derived?: DerivedBundle
  error?: string
  /** 'auth' → the Drive source needs the user to connect / pick a folder. */
  errorKind?: 'auth'
  sourceText?: string
}

function deriveAll(ds: Dataset) {
  const positions = derivePositions(ds.transactions)
  return {
    positions,
    byClass: allocationByClass(positions.open, ds.instruments),
    byPortfolio: allocationByPortfolio(positions.open, ds.transactions),
    buckets: gainBuckets(positions.closed),
    periods: periodPerformance(ds.snapshots),
    movers: topMovers(positions.closed),
    winLoss: winLoss(positions.closed),
    stats: positionStats(positions.closed),
  }
}

export function createAppStore(): Writable<AppState> {
  return writable<AppState>({ status: 'loading' })
}

export async function load(store: Writable<AppState>, source: DataSource): Promise<void> {
  store.set({ status: 'loading' })
  try {
    const dataset = await source.load()
    store.set({
      status: 'ready',
      dataset,
      derived: deriveAll(dataset),
      sourceText: describeSource(source, dataset.meta),
    })
  } catch (e) {
    store.set({
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      errorKind: e instanceof NeedsAuthError ? 'auth' : undefined,
    })
  }
}

export function pickSource(): DataSource {
  try {
    const p = new URLSearchParams(location.search).get('source')
    const pref = p ?? localStorage.getItem('bbb-source')
    if (pref === 'drive') {
      const clientId = (import.meta as unknown as { env: Record<string, string | undefined> }).env
        .VITE_GOOGLE_CLIENT_ID
      if (clientId) return new DriveSource(clientId)
      console.warn('VITE_GOOGLE_CLIENT_ID tanımlı değil — local kaynağa düşülüyor')
    }
  } catch {}
  return new LocalFileSource()
}
