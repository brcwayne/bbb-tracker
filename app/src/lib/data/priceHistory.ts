/**
 * priceHistory.ts
 *
 * Dalga 4, Görev I5: Fiyat anlık görüntüsü saklama ve geçmiş biriktirme.
 * Başarılı her fiyat çekiminde { tarih, sembol, fiyatUsd } satırları eklenir;
 * aynı gün için ikinci çekim satır çoğaltmaz, üzerine yazar.
 */

export interface PriceHistoryRow {
  tarih: string  // 'YYYY-MM-DD'
  sembol: string
  fiyatUsd: number
}

/**
 * Mevcut geçmiş ile yeni çekilen fiyatları birleştirir.
 * Aynı gün ve aynı sembol için mükerrer satır oluşmasını engeller (üzerine yazar).
 */
export function mergePriceHistory(
  existing: PriceHistoryRow[],
  entries: Record<string, { priceUsd: number | null }>,
  dateIso: string,
): PriceHistoryRow[] {
  const tarih = dateIso.slice(0, 10)
  const map = new Map<string, PriceHistoryRow>()

  for (const row of existing) {
    map.set(`${row.tarih}:${row.sembol}`, row)
  }

  for (const [sembol, entry] of Object.entries(entries)) {
    if (entry && typeof entry.priceUsd === 'number' && Number.isFinite(entry.priceUsd)) {
      map.set(`${tarih}:${sembol}`, {
        tarih,
        sembol,
        fiyatUsd: entry.priceUsd,
      })
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1
    return a.sembol.localeCompare(b.sembol)
  })
}

/**
 * Node/Vitest ortamında data/price-history.json dosyasına kaydeder.
 * Tarayıcı ortamında hata fırlatmaz.
 */
export async function savePriceHistory(
  entries: Record<string, { priceUsd: number | null }>,
  dateIso: string,
  targetPath?: string,
): Promise<PriceHistoryRow[]> {
  let current: PriceHistoryRow[] = []

  // 1. Read existing from localStorage if available
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('bbb-price-history')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) current = parsed
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Read from Node fs if in Node environment and not already loaded from localStorage
  const g = globalThis as unknown as {
    process?: { cwd: () => string; versions?: { node?: string } }
  }
  const isNode = typeof g.process !== 'undefined' && Boolean(g.process.versions?.node)
  let fsModule: any = null
  let pathModule: any = null
  let filePath: string | undefined = targetPath

  if (isNode && g.process) {
    try {
      const fsName = 'node:fs'
      const pathName = 'node:path'
      fsModule = await import(/* @vite-ignore */ fsName)
      pathModule = await import(/* @vite-ignore */ pathName)

      if (!filePath) {
        const cwd = g.process.cwd()
        if (fsModule.existsSync(pathModule.resolve(cwd, 'data'))) {
          filePath = pathModule.resolve(cwd, 'data/price-history.json')
        } else if (fsModule.existsSync(pathModule.resolve(cwd, '../data'))) {
          filePath = pathModule.resolve(cwd, '../data/price-history.json')
        } else {
          filePath = pathModule.resolve(cwd, 'data/price-history.json')
        }
      }

      if (current.length === 0 && filePath && fsModule.existsSync(filePath)) {
        try {
          const raw = fsModule.readFileSync(filePath, 'utf8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) current = parsed
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  const merged = mergePriceHistory(current, entries, dateIso)

  // Save to localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('bbb-price-history', JSON.stringify(merged))
    } catch {
      /* ignore */
    }
  }

  // Save to fs
  if (fsModule && filePath) {
    try {
      fsModule.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8')
    } catch {
      /* ignore */
    }
  }

  return merged
}
