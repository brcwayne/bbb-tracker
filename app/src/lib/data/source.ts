import type { Dataset, Meta } from './types'
import { dateShort } from '../format'

export interface DataSource {
  readonly id: 'local' | 'drive'
  load(): Promise<Dataset>
  save?(name: string, data: unknown): Promise<void>
}

/** The 8 dataset file basenames — shared by every DataSource adapter (DRY). */
export const NAMES = [
  'transactions', 'cashflows', 'snapshots', 'instruments',
  'brokers', 'portfolios', 'meta', 'fxrates',
] as const

/** Optional — a missing personal file yields [] and never fails the load. */
export const PERSONAL_NAMES = [
  'personal_tx', 'payment_plans', 'personal_accounts',
  'categories', 'people', 'debts',
] as const

export const PERSONAL_KEY_MAP = {
  personal_tx: 'personalTx',
  payment_plans: 'paymentPlans',
  personal_accounts: 'personalAccounts',
  categories: 'categories',
  people: 'people',
  debts: 'debts',
} as const satisfies Record<typeof PERSONAL_NAMES[number], keyof Dataset>

export function describeSource(s: DataSource, meta: Meta): string {
  const label = s.id === 'local' ? 'local' : 'Drive'
  const d = meta.olusturulma?.slice(0, 10)
  return d ? `${label} · son güncelleme ${dateShort(d)}` : label
}
