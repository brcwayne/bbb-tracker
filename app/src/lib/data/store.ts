import { writable, type Writable } from 'svelte/store'
import type { Dataset } from './types'
import type { DataSource } from './source'
import { describeSource } from './source'
import { LocalFileSource } from './local'
import { DriveSource, NeedsAuthError } from './drive'
import { initRate } from '../settings.svelte'
import {
  derivePositions, allocationByClass, allocationByPortfolio, gainBuckets,
  periodPerformance, topMovers, winLoss, positionStats, type ClosedPosition,
} from './derive'
import { dashboardTotals, thisMonthPerf } from './dashboard'
import { bankTransfers, moneyMarketMoves, dividends } from './cashmoves'

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

/**
 * Everything the pages render. `range` (inclusive ISO dates) scopes the
 * time-series and the closed trades; open positions and their allocation are
 * always "now". Called all-time from `load()`, then re-run reactively by
 * App.svelte when the global period changes.
 */
export function deriveAll(ds: Dataset, range?: { from: string; to: string }) {
  const r = range ?? { from: '0000-01-01', to: '9999-12-31' }
  const inR = (iso: string) => iso >= r.from && iso <= r.to
  const positions = derivePositions(ds.transactions)
  const closedInRange: ClosedPosition[] = positions.closed.filter((c) => inR(c.sonSatisTarih))
  const snaps = ds.snapshots.filter((s) => inR(s.tarih))
  return {
    positions,
    closedInRange,
    snapshots: snaps,
    byClass: allocationByClass(positions.open, ds.instruments),
    byPortfolio: allocationByPortfolio(positions.open, ds.transactions),
    buckets: gainBuckets(closedInRange),
    periods: periodPerformance(ds.snapshots),
    movers: topMovers(closedInRange),
    winLoss: winLoss(closedInRange),
    stats: positionStats(closedInRange),
    dashboard: dashboardTotals(ds, positions, null),
    monthPerf: thisMonthPerf(ds.snapshots),
    transfers: bankTransfers(ds.cashflows),
    mmMoves: moneyMarketMoves(ds.transactions, ds.instruments),
    divs: dividends(ds.cashflows, ds.transactions),
  }
}

export function createAppStore(): Writable<AppState> {
  return writable<AppState>({ status: 'loading' })
}

export async function load(store: Writable<AppState>, source: DataSource): Promise<void> {
  store.set({ status: 'loading' })
  try {
    const dataset = await source.load()
    initRate(dataset)
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
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      if (clientId)
        return new DriveSource(
          clientId,
          import.meta.env.VITE_GOOGLE_API_KEY,
          import.meta.env.VITE_GOOGLE_APP_ID,
        )
      console.warn('VITE_GOOGLE_CLIENT_ID tanımlı değil — local kaynağa düşülüyor')
    }
  } catch {}
  return new LocalFileSource()
}
