// BIST prices for tickers Yahoo Finance does not carry (e.g. DMLKT) via the
// public TradingView scanner. One POST covers every ticker; BIST quotes are TRY.
// Mirrors what the old Excel VBA "Trade Plan Fiyat Güncelleme" module did.

export type TvQuote = { price: number; currency: 'TRY' } | { error: string }

export const TV_SCAN_URL = 'https://scanner.tradingview.com/turkey/scan'
const EXCHANGE = 'BIST:'

type ScanRow = { s?: unknown; d?: unknown }

/** Pull `{ CODE: {price} }` out of a scanner body, keyed by the bare BIST code. */
export function parseScan(body: unknown): Record<string, { price: number; currency: 'TRY' }> {
  const rows = (body as { data?: unknown })?.data
  const out: Record<string, { price: number; currency: 'TRY' }> = {}
  if (!Array.isArray(rows)) return out
  for (const row of rows as ScanRow[]) {
    const ticker = typeof row?.s === 'string' ? row.s : ''
    const code = ticker.startsWith(EXCHANGE) ? ticker.slice(EXCHANGE.length) : ticker
    const close = Array.isArray(row?.d) ? (row.d as unknown[])[0] : undefined
    if (code && typeof close === 'number' && Number.isFinite(close) && close > 0) {
      out[code] = { price: close, currency: 'TRY' }
    }
  }
  return out
}

/**
 * Resolve each bare BIST code (e.g. `DMLKT`) to a TRY quote. A code the scanner
 * omits comes back `{error}`; the rest of `/prices` is unaffected.
 */
export async function fetchTvQuotes(
  codes: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, TvQuote>> {
  const uniq = [...new Set(codes)]
  if (uniq.length === 0) return {}
  // A `.IS` suffix (Yahoo habit) is harmless: TradingView wants the bare BIST
  // ticker, so strip it for the request but key the reply by the original code.
  const wanted = uniq.map((orig) => ({ orig, bare: orig.replace(/\.IS$/i, '') }))
  try {
    const res = await fetchImpl(TV_SCAN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: wanted.map((w) => EXCHANGE + w.bare) },
        columns: ['close'],
      }),
    })
    if (!res.ok) {
      const err = { error: `tradingview ${res.status}` }
      return Object.fromEntries(wanted.map((w) => [w.orig, err]))
    }
    const parsed = parseScan(await res.json())
    return Object.fromEntries(
      wanted.map((w) => [w.orig, parsed[w.bare] ?? { error: 'tradingview yanıtı' }]),
    )
  } catch {
    return Object.fromEntries(wanted.map((w) => [w.orig, { error: 'tradingview kaynağı' }]))
  }
}
