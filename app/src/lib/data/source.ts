import type { Dataset, Meta } from './types'
import { dateTimeShort } from '../format'

export interface DataSource {
  readonly id: 'local' | 'drive'
  load(): Promise<Dataset>
  save?(name: string, data: unknown): Promise<void>
  lastModified?: string | null
}

/** The 8 dataset file basenames — shared by every DataSource adapter (DRY). */
export const NAMES = [
  'transactions', 'cashflows', 'snapshots', 'instruments',
  'brokers', 'portfolios', 'meta', 'fxrates',
] as const

/** Optional — a missing personal file yields [] and never fails the load. */
export const PERSONAL_NAMES = [
  'personal_tx', 'payment_plans', 'personal_accounts',
  'categories', 'people', 'debts', 'recurring_rules',
] as const

export const PERSONAL_KEY_MAP = {
  personal_tx: 'personalTx',
  payment_plans: 'paymentPlans',
  personal_accounts: 'personalAccounts',
  categories: 'categories',
  people: 'people',
  debts: 'debts',
  recurring_rules: 'recurringRules',
} as const satisfies Record<typeof PERSONAL_NAMES[number], keyof Dataset>

export function describeSource(
  s: DataSource,
  meta: Meta,
  lastModified?: string | null,
  txCount?: number,
): string {
  const label = s.id === 'local' ? 'Yerel dosya' : 'Google Drive'
  const d = lastModified ?? s.lastModified ?? meta.olusturulma
  const timeStr = d ? dateTimeShort(d) : null
  const txStr = typeof txCount === 'number' ? ` · ${txCount} işlem` : ''
  return timeStr ? `Kaynak: ${label} · son yazma: ${timeStr}${txStr}` : `Kaynak: ${label}${txStr}`
}
