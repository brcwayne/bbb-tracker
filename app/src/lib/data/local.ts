import type { Dataset } from './types'
import { type DataSource, NAMES, PERSONAL_NAMES, PERSONAL_KEY_MAP } from './source'

export class LocalFileSource implements DataSource {
  readonly id = 'local' as const
  constructor(private base = './data') {}

  async load(): Promise<Dataset> {
    const parts = await Promise.all(
      NAMES.map(async (name) => {
        const res = await fetch(`${this.base}/${name}.json`)
        if (!res.ok) throw new Error(`data/${name}.json okunamadı (${res.status})`)
        return [name, await res.json()] as const
      }),
    )
    const dataset = Object.fromEntries(parts) as unknown as Dataset
    const atRes = await fetch(`${this.base}/assetTransfers.json`)
    dataset.assetTransfers = atRes.ok ? await atRes.json() : []

    await Promise.all(
      PERSONAL_NAMES.map(async (name) => {
        const key = PERSONAL_KEY_MAP[name]
        try {
          const res = await fetch(`${this.base}/${name}.json`)
          const data = res.ok ? await res.json() : null
          dataset[key] = Array.isArray(data) ? data : []
        } catch (e) {
          console.warn(`local: ${name}.json okunamadı:`, e)
          dataset[key] = []
        }
      }),
    )

    return dataset
  }
}
