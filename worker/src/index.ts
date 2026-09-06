import { fetchQuotes } from './yahoo'
import { fetchUsdTry } from './tcmb'
import { fetchFundQuotes, type FundQuote } from './fonoloji'
import { fetchTvQuotes, type TvQuote } from './tradingview'
import { usdPerGramFromOunce, GOLD_YAHOO_SYMBOL } from './symbols'

export interface Env {
  ALLOWED_ORIGIN: string
  /** fonoloji.com key for TEFAS fund prices; unset → funds come back {error}. */
  FONOLOJI_API_KEY?: string
}

/** App marks a TEFAS fund symbol as `tefas:<code>` so we can route it here. */
const TEFAS_PREFIX = 'tefas:'
/** …and a TradingView-only BIST symbol (e.g. DMLKT) as `tv:<code>`. */
const TV_PREFIX = 'tv:'

function cors(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }
}

function json(body: unknown, status: number, origin: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin), ...extra },
  })
}

async function handlePrices(url: URL, origin: string, env: Env): Promise<Response> {
  const raw = url.searchParams.get('symbols')?.trim()
  if (!raw) return json({ error: 'symbols parametresi gerekli' }, 400, origin)
  const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (symbols.length === 0) return json({ error: 'symbols parametresi gerekli' }, 400, origin)
  const uniq = [...new Set(symbols)]
  if (uniq.length > 45) return json({ error: 'en fazla 45 sembol' }, 400, origin)

  const fundCodes = uniq
    .filter((s) => s.startsWith(TEFAS_PREFIX))
    .map((s) => s.slice(TEFAS_PREFIX.length))
  const tvCodes = uniq
    .filter((s) => s.startsWith(TV_PREFIX))
    .map((s) => s.slice(TV_PREFIX.length))
  const yahooSyms = uniq.filter(
    (s) => !s.startsWith(TEFAS_PREFIX) && !s.startsWith(TV_PREFIX),
  )

  const quotesP = fetchQuotes(yahooSyms)
  const fundsP: Promise<Record<string, FundQuote>> = fundCodes.length
    ? fetchFundQuotes(fundCodes, env.FONOLOJI_API_KEY ?? '')
    : Promise.resolve({})
  const tvP: Promise<Record<string, TvQuote>> = tvCodes.length
    ? fetchTvQuotes(tvCodes)
    : Promise.resolve({})
  const fxP = fetchUsdTry().then((r) => r.usdtry).catch(() => null)
  const [quotes, funds, tv, usdtry] = await Promise.all([quotesP, fundsP, tvP, fxP])

  const prices: Record<string, unknown> = {}
  for (const [sym, q] of Object.entries(quotes)) {
    if ('error' in q) {
      prices[sym] = q
      continue
    }
    const priceUsd =
      q.currency === 'TRY' ? (usdtry != null ? q.price / usdtry : null) : q.price
    const entry: Record<string, unknown> = { price: q.price, currency: q.currency, priceUsd }
    if (sym === GOLD_YAHOO_SYMBOL) entry.usdPerGram = usdPerGramFromOunce(q.price)
    prices[sym] = entry
  }
  // TEFAS funds always report TRY — same USD conversion as the BIST path.
  for (const [code, q] of Object.entries(funds)) {
    const key = TEFAS_PREFIX + code
    if ('error' in q) {
      prices[key] = q
      continue
    }
    prices[key] = {
      price: q.price,
      currency: q.currency,
      priceUsd: usdtry != null ? q.price / usdtry : null,
    }
  }
  // TradingView BIST quotes are TRY too — same conversion again.
  for (const [code, q] of Object.entries(tv)) {
    const key = TV_PREFIX + code
    if ('error' in q) {
      prices[key] = q
      continue
    }
    prices[key] = {
      price: q.price,
      currency: q.currency,
      priceUsd: usdtry != null ? q.price / usdtry : null,
    }
  }
  return json(
    { asOf: new Date().toISOString(), usdtry, prices },
    200,
    origin,
    { 'cache-control': 's-maxage=300' },
  )
}

async function handleFx(origin: string): Promise<Response> {
  try {
    const fx = await fetchUsdTry()
    return json(fx, 200, origin, { 'cache-control': 's-maxage=300' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'kur alınamadı' }, 502, origin)
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })

      const url = new URL(req.url)
      if (url.pathname === '/health') return json({ ok: true }, 200, origin)
      if (req.method !== 'GET') return json({ error: 'bilinmeyen uç' }, 404, origin)

      const cache = (globalThis as typeof globalThis & { caches?: CacheStorage }).caches?.default
      const fresh = url.searchParams.get('fresh') === '1'
      if (cache && !fresh) {
        const hit = await cache.match(req)
        if (hit) return hit
      }

      let res: Response
      if (url.pathname === '/prices') res = await handlePrices(url, origin, env)
      else if (url.pathname === '/fx/latest') res = await handleFx(origin)
      else res = json({ error: 'bilinmeyen uç' }, 404, origin)

      if (cache && res.status === 200 && !fresh) ctx.waitUntil(cache.put(req, res.clone()))
      return res
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'sunucu hatası' }, 500, origin)
    }
  },
}
