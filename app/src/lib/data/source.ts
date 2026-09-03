import type { Dataset, Meta } from './types'
import { dateShort } from '../format'

export interface DataSource {
  readonly id: 'local' | 'drive'
  load(): Promise<Dataset>
}

export function describeSource(s: DataSource, meta: Meta): string {
  const label = s.id === 'local' ? 'local' : 'Drive'
  const d = meta.olusturulma?.slice(0, 10)
  return d ? `${label} · son güncelleme ${dateShort(d)}` : label
}
