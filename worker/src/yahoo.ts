export type Quote = { price: number; currency: string } | { error: string }

const UA = 'Mozilla/5.0 (BBB-Tracker)'
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']

export function parseChart(body: unknown): { price: number; currency: string } | null {
  const meta = (body as any)?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number' || typeof meta.currency !== 'string') {
    return null
  }
  return { price: meta.regularMarketPrice, currency: meta.currency }
}

async function one(symbol: string, fetchImpl: typeof fetch): Promise<Quote> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  for (const host of HOSTS) {
    try {
      const res = await fetchImpl(host + path, { headers: { 'user-agent': UA } })
      if (!res.ok) continue
      const parsed = parseChart(await res.json())
      if (parsed) return parsed
    } catch {
      /* try next host */
    }
  }
  return { error: 'kaynak' }
}

export async function fetchQuotes(
  symbols: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, Quote>> {
  const uniq = [...new Set(symbols)]
  const results = await Promise.all(uniq.map((s) => one(s, fetchImpl)))
  return Object.fromEntries(uniq.map((s, i) => [s, results[i]]))
}
