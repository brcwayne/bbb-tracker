import { writable, type Writable, get } from 'svelte/store'
import type { Dataset } from './types'
import type { DataSource } from './source'
import { describeSource } from './source'
import { LocalFileSource } from './local'
import { DriveSource, NeedsAuthError, ConflictError } from './drive'
import { initRate } from '../settings.svelte'
import {
  derivePositions, allocationByClass, allocationByPortfolio, gainBuckets,
  periodPerformance, topMovers, winLoss, positionStats, type ClosedPosition,
} from './derive'
import { dashboardTotals, thisMonthPerf } from './dashboard'
import { bankTransfers, moneyMarketMoves, dividends, transfers as moneyTransfersOf } from './cashmoves'
import { cashBalanceByHesap } from './cashBalances'

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
    cashByHesap: cashBalanceByHesap(ds),
    moneyTransfers: moneyTransfersOf(ds.cashflows),
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

export async function appendRecord<T>(
  store: Writable<AppState>,
  source: DataSource,
  file: 'transactions' | 'cashflows' | 'assetTransfers' | 'brokers',
  record: T,
): Promise<void> {
  if (!source.save) throw new Error("Bu kaynakta kayıt eklenemez — sadece Google Drive'a yazılabilir.")
  const state = get(store)
  if (!state.dataset) throw new Error('Veri henüz yüklenmedi.')

  const attempt = async (ds: Dataset): Promise<Dataset> => {
    const updatedArray = [...(ds[file] as unknown as T[]), record]
    await source.save!(file, updatedArray)
    return { ...ds, [file]: updatedArray }
  }

  let newDataset: Dataset
  try {
    newDataset = await attempt(state.dataset)
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e
    const fresh = await source.load()
    newDataset = await attempt(fresh)
  }

  store.set({
    status: 'ready',
    dataset: newDataset,
    derived: deriveAll(newDataset),
    sourceText: state.sourceText,
  })
}
