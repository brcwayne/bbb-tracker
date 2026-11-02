import type { Dataset } from './data/types'
import { derivePositions } from './data/derive'
import { applyLiveRate } from './settings.svelte'
import { savePriceHistory } from './data/priceHistory'

const GOLD_API_SYMBOL = 'GC=F'
const SILVER_API_SYMBOL = 'SI=F'
const TEFAS_PREFIX = 'tefas:'
const TV_PREFIX = 'tv:'
const BATCH_LIMIT = 45
/** Beyond this, a hydrated snapshot triggers one automatic refresh on load. */
const AUTO_REFRESH_MS = 6 * 60 * 60_000
const STORE_KEY = 'bbb-prices'

/** Read the Worker base URL fresh every call so tests can `vi.stubEnv` it. */
function priceApi(): string | undefined {
  return import.meta.env.VITE_PRICE_API
}
export function priceApiEnabled(): boolean {
  return !!priceApi()
}

type Entry = { price: number; currency: string; priceUsd: number | null }

export const prices = $state<{
  bySymbol: Record<string, Entry>
  usdPerGram: number | null
  usdPerSilverGram?: number | null
  usdtry: number | null
  eurtry?: number | null
  asOf: string | null
  status: 'idle' | 'loading' | 'ready' | 'kismi' | 'error'
  error?: string
}>({
  bySymbol: {},
  usdPerGram: null,
  usdPerSilverGram: null,
  usdtry: null,
  eurtry: null,
  asOf: null,
  status: 'idle',
})

function apiSymbolFor(fiyatKaynagi: string, fiyatSembolu: string): string | null {
  if (fiyatKaynagi === 'yahoo' || fiyatKaynagi === 'kripto') return fiyatSembolu
  if (fiyatKaynagi === 'altin-turev') return GOLD_API_SYMBOL
  if (fiyatKaynagi === 'gumus-turev') return SILVER_API_SYMBOL
  // TEFAS funds and TradingView-only BIST codes (e.g. DMLKT) go to the worker
  // prefixed; the response de-prefixes back to the bare fiyatSembolu.
  if (fiyatKaynagi === 'tefas') return TEFAS_PREFIX + fiyatSembolu
  if (fiyatKaynagi === 'tradingview') return TV_PREFIX + fiyatSembolu
  return null
}

export function symbolsForHeldInstruments(ds: Dataset): string[] {
  const open = derivePositions(ds.transactions, ds.assetTransfers ?? []).open
  const byKod = new Map(ds.instruments.map((i) => [i.kod, i]))
  const out = new Set<string>()
  for (const pos of open) {
    const inst = byKod.get(pos.kod)
    if (!inst) continue
    const sym = apiSymbolFor(inst.fiyatKaynagi, inst.fiyatSembolu)
    if (sym) out.add(sym)
  }
  return [...out]
}

function persist(): void {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        bySymbol: prices.bySymbol,
        usdPerGram: prices.usdPerGram,
        usdtry: prices.usdtry,
        eurtry: prices.eurtry ?? null,
        asOf: prices.asOf,
      }),
    )
  } catch {
    /* ignore */
  }
}

export async function refreshPrices(ds: Dataset, opts: { fresh?: boolean } = {}): Promise<void> {
  const base = priceApi()
  if (!base) return
  const symbols = symbolsForHeldInstruments(ds)
  if (symbols.length === 0) return
  const prevBySymbol = { ...prices.bySymbol }
  const prevUsdPerGram = prices.usdPerGram
  const prevUsdPerSilverGram = prices.usdPerSilverGram ?? null
  prices.status = 'loading'
  prices.error = undefined
  try {
    const chunks: string[][] = []
    for (let i = 0; i < symbols.length; i += BATCH_LIMIT) {
      chunks.push(symbols.slice(i, i + BATCH_LIMIT))
    }
    const freshParam = opts.fresh ? '&fresh=1' : ''
    const bodies = await Promise.all(
      chunks.map(async (chunk) => {
        const url = `${base}/prices?symbols=${encodeURIComponent(chunk.join(','))}${freshParam}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`fiyat servisi ${res.status}`)
        return (await res.json()) as {
          asOf: string
          usdtry: number | null
          eurtry?: number | null
          prices: Record<string, Entry | { error: string } | (Entry & { usdPerGram?: number })>
        }
      }),
    )

    const mergedRawPrices: Record<string, Entry | { error: string } | (Entry & { usdPerGram?: number })> = {}
    let latestAsOf = bodies[0]?.asOf ?? new Date().toISOString()
    let usdtry: number | null = null
    let eurtry: number | null = null
    for (const b of bodies) {
      if (b.asOf) latestAsOf = b.asOf
      if (typeof b.usdtry === 'number' && Number.isFinite(b.usdtry) && b.usdtry > 0) usdtry = b.usdtry
      if (typeof b.eurtry === 'number' && Number.isFinite(b.eurtry) && b.eurtry > 0) eurtry = b.eurtry
      Object.assign(mergedRawPrices, b.prices)
    }

    const bySymbol: Record<string, Entry> = {}
    let usdPerGram: number | null = null
    let usdPerSilverGram: number | null = null
    for (const [sym, v] of Object.entries(mergedRawPrices)) {
      if ('error' in v) continue
      if (typeof v.price !== 'number' || !Number.isFinite(v.price) || v.price <= 0) continue
      // `tefas:MAC` / `tv:DMLKT` → bare code, so unrealized.ts finds it by fiyatSembolu.
      const key = sym.startsWith(TEFAS_PREFIX)
        ? sym.slice(TEFAS_PREFIX.length)
        : sym.startsWith(TV_PREFIX)
          ? sym.slice(TV_PREFIX.length)
          : sym
      bySymbol[key] = { price: v.price, currency: v.currency, priceUsd: v.priceUsd ?? null }
      if (sym === GOLD_API_SYMBOL && typeof (v as { usdPerGram?: number }).usdPerGram === 'number') {
        usdPerGram = (v as { usdPerGram: number }).usdPerGram
      }
      if (sym === SILVER_API_SYMBOL && typeof (v as { usdPerGram?: number }).usdPerGram === 'number') {
        usdPerSilverGram = (v as { usdPerGram: number }).usdPerGram
      }
    }

    let successfulCount = 0
    for (const sym of symbols) {
      const v = mergedRawPrices[sym]
      if (v && !('error' in v) && typeof v.price === 'number' && Number.isFinite(v.price) && v.price > 0) {
        successfulCount++
      }
    }

    if (symbols.length > 0 && Object.keys(bySymbol).length === 0) {
      throw new Error('hiçbir sembol fiyatlanamadı')
    }
    // Preserve previous valid quotes for any symbol that transiently failed in this round
    prices.bySymbol = { ...prevBySymbol, ...bySymbol }
    prices.usdPerGram = usdPerGram ?? prevUsdPerGram
    prices.usdPerSilverGram = usdPerSilverGram ?? prevUsdPerSilverGram
    prices.usdtry = usdtry
    prices.eurtry = eurtry
    prices.asOf = latestAsOf
    prices.status = symbols.length > 0 && successfulCount < symbols.length ? 'kismi' : 'ready'
    persist()
    await savePriceHistory(bySymbol, latestAsOf)
    if (typeof usdtry === 'number' && usdtry > 0) applyLiveRate(usdtry, eurtry)
  } catch (e) {
    prices.status = 'error'
    prices.error = e instanceof Error ? e.message : 'fiyat alınamadı'
  }
}

/**
 * True when there is no price data, or the newest snapshot is old enough that a
 * fresh pull is worthwhile on load. Used to auto-refresh once per app launch
 * instead of forcing a manual click every time.
 */
export function pricesStale(): boolean {
  if (!prices.asOf) return true
  const t = Date.parse(prices.asOf)
  return Number.isNaN(t) || Date.now() - t > AUTO_REFRESH_MS
}

export function hydratePrices(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return
    const snap = JSON.parse(raw) as {
      bySymbol: Record<string, Entry>
      usdPerGram: number | null
      usdtry: number | null
      eurtry?: number | null
      asOf: string | null
    }
    // Restore the last snapshot whatever its age — the stamp in the header shows
    // how old it is, and a stale load kicks off one automatic refresh.
    if (!snap.asOf || Number.isNaN(Date.parse(snap.asOf))) return
    prices.bySymbol = snap.bySymbol ?? {}
    prices.usdPerGram = snap.usdPerGram ?? null
    prices.usdtry = snap.usdtry ?? null
    prices.eurtry = snap.eurtry ?? null
    prices.asOf = snap.asOf
    prices.status = 'ready'
    if (typeof snap.usdtry === 'number' && Number.isFinite(snap.usdtry) && snap.usdtry > 0) {
      applyLiveRate(snap.usdtry, snap.eurtry)
    }
  } catch {
    /* ignore */
  }
}
