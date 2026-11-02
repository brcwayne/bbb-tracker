import { writable, type Writable, get } from 'svelte/store'
import type { Dataset } from './types'
import type { DataSource } from './source'
import { describeSource, PERSONAL_KEY_MAP } from './source'
import { LocalFileSource } from './local'
import { DriveSource, NeedsAuthError, ConflictError } from './drive'
import { initRate } from '../settings.svelte'
import {
  derivePositions, allocationByClass, allocationByPortfolio, gainBuckets,
  periodPerformance, topMovers, winLoss, positionStats, type ClosedPosition,
} from './derive'
import { dashboardTotals, thisMonthPerf } from './dashboard'
import { bankTransfers, moneyMarketMoves, dividends, transfers as moneyTransfersOf } from './cashmoves'
import { cashBalanceByHesap, turetilmisNakit } from './cashBalances'

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
  const positions = derivePositions(ds.transactions, ds.assetTransfers ?? [])
  const closedInRange: ClosedPosition[] = positions.closed.filter((c) => inR(c.sonSatisTarih))
  // Snapshot'lardaki nakit_usd, defterden türetilmiş nakittir (turetilmisNakit(ds, s.tarih)).
  // Bu, kurum ekstre bakiyelerinin (cashBalanceByHesap) toplamından göç sınırındaki
  // kurucu sermaye farkı kadar (bkz. kimlik.ts: gocNakitDuzeltmesi, ~$14.989,38) sapar;
  // bu nedenle kurum bazlı ekstre bakiyeleriyle doğrudan eşleşmez.
  const snaps = ds.snapshots.filter((s) => inR(s.tarih)).map((s) => ({
    ...s,
    nakit_usd:
      typeof s.nakit_usd === 'number' && !isNaN(s.nakit_usd)
        ? s.nakit_usd
        : turetilmisNakit(ds, s.tarih),
  }))
  return {
    positions,
    closedInRange,
    snapshots: snaps,
    byClass: allocationByClass(positions.open, ds.instruments),
    byPortfolio: allocationByPortfolio(positions.open, ds.transactions, ds.assetTransfers ?? []),
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
      sourceText: describeSource(
        source,
        dataset.meta,
        source.lastModified,
        dataset.transactions?.length,
      ),
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

export type Kind =
  | 'transactions'
  | 'cashflows'
  | 'assetTransfers'
  | 'brokers'
  | 'portfolios'
  | 'instruments'
  | 'personal_tx'
  | 'payment_plans'
  | 'personal_accounts'
  | 'categories'
  | 'people'
  | 'debts'
  | 'recurring_rules'

export interface WriteStep {
  file: Kind
  build: (current: unknown[], dataset: Dataset) => unknown[]
}

const storeWriteQueues = new WeakMap<Writable<AppState>, Promise<unknown>>()

function enqueueStoreWrite<T>(store: Writable<AppState>, task: () => Promise<T>): Promise<T> {
  const prev = storeWriteQueues.get(store)
  const next = prev ? prev.catch(() => undefined).then(task) : task()
  const settled = next.then(
    () => undefined,
    () => undefined,
  )
  storeWriteQueues.set(store, settled)
  settled.then(() => {
    if (storeWriteQueues.get(store) === settled) storeWriteQueues.delete(store)
  })
  return next
}

function datasetKeyFor(file: Kind): keyof Dataset {
  return ((PERSONAL_KEY_MAP as Record<string, string>)[file] ?? file) as keyof Dataset
}

/**
 * Serialized, rollback-safe multi-file write. If saving step K fails (conflict
 * or network error), steps 0..K-1 are rolled back to their prior arrays in
 * reverse order before retrying (on `ConflictError`) or propagating the error.
 */
export function writeMultiAndCommit(
  store: Writable<AppState>,
  source: DataSource,
  steps: WriteStep[],
): Promise<void> {
  if (steps.length === 0) return Promise.resolve()
  if (!source.save) {
    return Promise.reject(
      new Error("Bu kaynakta kayıt değiştirilemez — sadece Google Drive'a yazılabilir."),
    )
  }

  return enqueueStoreWrite(store, async () => {
    const state = get(store)
    if (!state.dataset) throw new Error('Veri henüz yüklenmedi.')

    let baseDs = state.dataset
    let newDataset: Dataset | null = null

    for (let retry = 0; retry < 2; retry++) {
      let working = baseDs
      const completed: { file: Kind; previous: unknown[] }[] = []
      try {
        for (const step of steps) {
          const key = datasetKeyFor(step.file)
          const prevArr = (working[key] ?? []) as unknown as unknown[]
          const updatedArray = step.build(prevArr, working)
          try {
            await source.save!(step.file, updatedArray)
            completed.push({ file: step.file, previous: prevArr })
            working = { ...working, [key]: updatedArray }
          } catch (stepErr) {
            for (let i = completed.length - 1; i >= 0; i--) {
              const c = completed[i]
              try {
                await source.save!(c.file, c.previous)
              } catch (rbErr) {
                console.error(`Drive rollback başarısız (${c.file}):`, rbErr)
              }
            }
            throw stepErr
          }
        }
        newDataset = working
        break
      } catch (e) {
        if (retry === 0 && e instanceof ConflictError) {
          baseDs = await source.load()
          continue
        }
        throw e
      }
    }

    if (!newDataset) throw new Error('Yazma işlemi tamamlanamadı.')

    store.set({
      status: 'ready',
      dataset: newDataset,
      derived: deriveAll(newDataset),
      sourceText: describeSource(
        source,
        newDataset.meta,
        source.lastModified,
        newDataset.transactions?.length,
      ),
    })
  })
}

function writeAndCommit(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  build: (current: unknown[]) => unknown[],
): Promise<void> {
  return writeMultiAndCommit(store, source, [
    {
      file,
      build: (current) => build(current),
    },
  ])
}

export function appendRecord<T>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  record: T,
): Promise<void> {
  return writeAndCommit(store, source, file, (current) => [...(current as T[]), record])
}

export function appendRecords<T>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  records: T[],
): Promise<void> {
  if (records.length === 0) return Promise.resolve()
  return writeAndCommit(store, source, file, (current) => [...(current as T[]), ...records])
}

/**
 * `allowImported` lets the Log page edit/delete an Excel-migrated row after an
 * explicit warning. Everywhere else the `kaynak === 'manual'` gate still holds,
 * unless widened via `allowKaynak` (default `['manual']`).
 */
export type MutateOpts = { allowImported?: boolean; allowKaynak?: string[] }

export function updateRecord<T extends { kaynak?: string }>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  matches: (r: T) => boolean,
  patch: T,
  opts: MutateOpts = {},
): Promise<void> {
  return writeAndCommit(store, source, file, (current) => {
    const arr = current as T[]
    const idx = arr.findIndex(matches)
    if (idx === -1) throw new Error('Kayıt bulunamadı — başka bir yerden silinmiş olabilir.')
    const allowed = opts.allowKaynak ?? ['manual']
    if (!opts.allowImported && !allowed.includes(arr[idx].kaynak ?? ''))
      throw new Error('Sadece manuel kayıtlar düzenlenebilir.')
    const next = [...arr]
    next[idx] = patch
    return next
  })
}

/** `updateRecord`'un çoğulu: `matches` ile eşleşen her satırı `patch(satır)` ile
 *  değiştirir, tek bir dosya yazımında. Bir RecurringRule'un tutarını "bundan
 *  sonraki tüm tekrarlar" seçeneğiyle değiştirmek için kullanılır. */
export function updateRecords<T extends { kaynak?: string }>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  matches: (r: T) => boolean,
  patch: (r: T) => T,
  opts: MutateOpts = {},
): Promise<void> {
  return writeAndCommit(store, source, file, (current) => {
    const arr = current as T[]
    const allowed = opts.allowKaynak ?? ['manual']
    return arr.map((r) => {
      if (!matches(r)) return r
      if (!opts.allowImported && !allowed.includes(r.kaynak ?? '')) {
        throw new Error('Sadece manuel kayıtlar düzenlenebilir.')
      }
      return patch(r)
    })
  })
}

/** `deleteRecord`'un çoğulu: `matches` ile eşleşen her satırı tek bir dosya
 *  yazımında siler. Bir RecurringRule durdurulduğunda onun henüz onaylanmamış
 *  ('planlandi') personal_tx satırlarını topluca kaldırmak için kullanılır. */
export function deleteRecords<T extends { kaynak?: string }>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  matches: (r: T) => boolean,
  opts: MutateOpts = {},
): Promise<void> {
  return writeAndCommit(store, source, file, (current) => {
    const arr = current as T[]
    const allowed = opts.allowKaynak ?? ['manual']
    for (const r of arr) {
      if (!matches(r)) continue
      if (!opts.allowImported && !allowed.includes(r.kaynak ?? '')) {
        throw new Error('Sadece manuel kayıtlar silinebilir.')
      }
    }
    return arr.filter((r) => !matches(r))
  })
}

export function deleteRecord<T extends { kaynak?: string }>(
  store: Writable<AppState>,
  source: DataSource,
  file: Kind,
  matches: (r: T) => boolean,
  opts: MutateOpts = {},
): Promise<void> {
  return writeAndCommit(store, source, file, (current) => {
    const arr = current as T[]
    const target = arr.find(matches)
    if (!target) throw new Error('Kayıt bulunamadı — başka bir yerden silinmiş olabilir.')
    const allowed = opts.allowKaynak ?? ['manual']
    if (!opts.allowImported && !allowed.includes(target.kaynak ?? ''))
      throw new Error('Sadece manuel kayıtlar silinebilir.')
    return arr.filter((r) => !matches(r))
  })
}
