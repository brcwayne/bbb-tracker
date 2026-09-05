// TEFAS fund (yatırım fonu) prices via fonoloji.com — the TEFAS site's own
// endpoints were disabled in 2026, so we go through this keyed JSON API.
// One GET per fund code; the key lives in the FONOLOJI_API_KEY Worker secret.

export type FundQuote = { price: number; currency: 'TRY' } | { error: string }

const BASE = 'https://fonoloji.com/v1/funds/'

/** Pull the current NAV out of a `/v1/funds/{code}` body, or null if absent. */
export function parseFund(body: unknown): { price: number } | null {
  const p = (body as { fund?: { current_price?: unknown } })?.fund?.current_price
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? { price: p } : null
}

async function one(code: string, apiKey: string, fetchImpl: typeof fetch): Promise<FundQuote> {
  try {
    const res = await fetchImpl(BASE + encodeURIComponent(code), {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
    })
    if (!res.ok) return { error: `fon ${res.status}` }
    const parsed = parseFund(await res.json())
    return parsed ? { price: parsed.price, currency: 'TRY' } : { error: 'fon yanıtı' }
  } catch {
    return { error: 'fon kaynağı' }
  }
}

/**
 * Resolve each fund code to a TRY quote. With no key configured every code
 * comes back `{error}` — `/prices` still succeeds for everything else.
 */
export async function fetchFundQuotes(
  codes: string[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, FundQuote>> {
  const uniq = [...new Set(codes)]
  if (!apiKey) return Object.fromEntries(uniq.map((c) => [c, { error: 'fon anahtarı yok' }]))
  const results = await Promise.all(uniq.map((c) => one(c, apiKey, fetchImpl)))
  return Object.fromEntries(uniq.map((c, i) => [c, results[i]]))
}
