import type { Dataset } from './data/types'
import { derivePositions } from './data/derive'
import { applyLiveRate } from './settings.svelte'

const GOLD_API_SYMBOL = 'GC=F'
const MAX_AGE_MS = 30 * 60_000
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
  usdtry: number | null
  asOf: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
}>({
  bySymbol: {},
  usdPerGram: null,
  usdtry: null,
  asOf: null,
  status: 'idle',
})

function apiSymbolFor(fiyatKaynagi: string, fiyatSembolu: string): string | null {
  if (fiyatKaynagi === 'yahoo') return fiyatSembolu
  if (fiyatKaynagi === 'altin-turev') return GOLD_API_SYMBOL
  return null
}

export function symbolsForHeldInstruments(ds: Dataset): string[] {
  const open = derivePositions(ds.transactions).open
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
    sessionStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        bySymbol: prices.bySymbol,
        usdPerGram: prices.usdPerGram,
        usdtry: prices.usdtry,
        asOf: prices.asOf,
      }),
    )
  } catch {
    /* ignore */
  }
}

export async function refreshPrices(ds: Dataset): Promise<void> {
  const base = priceApi()
  if (!base) return
  const symbols = symbolsForHeldInstruments(ds)
  if (symbols.length === 0) return
  prices.status = 'loading'
  prices.error = undefined
  try {
    const url = `${base}/prices?symbols=${encodeURIComponent(symbols.join(','))}&fresh=1`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fiyat servisi ${res.status}`)
    const body = (await res.json()) as {
      asOf: string
      usdtry: number
      prices: Record<string, Entry | { error: string } | (Entry & { usdPerGram?: number })>
    }
    const bySymbol: Record<string, Entry> = {}
    let usdPerGram: number | null = null
    for (const [sym, v] of Object.entries(body.prices)) {
      if ('error' in v) continue
      bySymbol[sym] = { price: v.price, currency: v.currency, priceUsd: v.priceUsd ?? null }
      if (sym === GOLD_API_SYMBOL && typeof (v as { usdPerGram?: number }).usdPerGram === 'number') {
        usdPerGram = (v as { usdPerGram: number }).usdPerGram
      }
    }
    if (symbols.length > 0 && Object.keys(bySymbol).length === 0) {
      throw new Error('hiçbir sembol fiyatlanamadı')
    }
    prices.bySymbol = bySymbol
    prices.usdPerGram = usdPerGram
    prices.usdtry = body.usdtry
    prices.asOf = body.asOf
    prices.status = 'ready'
    persist()
    if (typeof body.usdtry === 'number') applyLiveRate(body.usdtry)
  } catch (e) {
    prices.status = 'error'
    prices.error = e instanceof Error ? e.message : 'fiyat alınamadı'
  }
}

export function hydratePrices(): void {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return
    const snap = JSON.parse(raw) as {
      bySymbol: Record<string, Entry>
      usdPerGram: number | null
      usdtry: number | null
      asOf: string | null
    }
    if (!snap.asOf || Date.now() - Date.parse(snap.asOf) > MAX_AGE_MS) return
    prices.bySymbol = snap.bySymbol ?? {}
    prices.usdPerGram = snap.usdPerGram ?? null
    prices.usdtry = snap.usdtry ?? null
    prices.asOf = snap.asOf
    prices.status = 'ready'
    if (typeof snap.usdtry === 'number' && Number.isFinite(snap.usdtry) && snap.usdtry > 0) {
      applyLiveRate(snap.usdtry)
    }
  } catch {
    /* ignore */
  }
}
