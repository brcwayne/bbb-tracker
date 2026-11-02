import { fetchQuotes } from './yahoo'
import { fetchTcmbRates, type TcmbFxSnapshot } from './tcmb'
import { fetchFundQuotes, type FundQuote } from './fonoloji'
import { fetchTvQuotes, type TvQuote } from './tradingview'
import { usdPerGramFromOunce, GOLD_YAHOO_SYMBOL, SILVER_YAHOO_SYMBOL } from './symbols'

export interface Env {
  ALLOWED_ORIGIN: string
  /** fonoloji.com key for TEFAS fund prices; unset → funds come back {error}. */
  FONOLOJI_API_KEY?: string
}

/** App marks a TEFAS fund symbol as `tefas:<code>` so we can route it here. */
const TEFAS_PREFIX = 'tefas:'
/** …and a TradingView-only BIST symbol (e.g. DMLKT) as `tv:<code>`. */
const TV_PREFIX = 'tv:'
export const MAX_SYMBOLS = 100

/**
 * Convert an instrument price in `currency` to USD using TCMB `ForexBuying` rates.
 * Handles London pence (`GBp` / `GBX` = 1/100 GBP) and never treats unknown/non-USD
 * currencies as 1:1 USD.
 */
export function convertToUsd(
  price: number,
  currency: string,
  fx: TcmbFxSnapshot | null,
): number | null {
  if (!Number.isFinite(price) || price <= 0) return null
  if (currency === 'USD') return price
  if (!fx || !Number.isFinite(fx.usdtry) || fx.usdtry <= 0) return null
  if (currency === 'TRY' || currency === 'TL') return price / fx.usdtry
  if (currency === 'GBp' || currency === 'GBX') {
    const gbpTry = fx.rates.GBP
    return gbpTry && gbpTry > 0 ? ((price / 100) * gbpTry) / fx.usdtry : null
  }
  const curTry = fx.rates[currency.toUpperCase()]
  if (curTry && curTry > 0) {
    return (price * curTry) / fx.usdtry
  }
  return null
}

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

async function handlePrices(
  url: URL,
  origin: string,
  env: Env,
): Promise<{ res: Response; cacheable: boolean }> {
  const raw = url.searchParams.get('symbols')?.trim()
  if (!raw) return { res: json({ error: 'symbols parametresi gerekli' }, 400, origin), cacheable: false }
  const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (symbols.length === 0) {
    return { res: json({ error: 'symbols parametresi gerekli' }, 400, origin), cacheable: false }
  }
  const uniq = [...new Set(symbols)]
  if (uniq.length > MAX_SYMBOLS) {
    return { res: json({ error: `en fazla ${MAX_SYMBOLS} sembol` }, 400, origin), cacheable: false }
  }

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
  const fxP = fetchTcmbRates().catch(() => null)
  const [quotes, funds, tv, fx] = await Promise.all([quotesP, fundsP, tvP, fxP])
  const usdtry = fx?.usdtry ?? null
  const eurtry = fx?.eurtry ?? null

  const prices: Record<string, unknown> = {}
  let okCount = 0
  for (const [sym, q] of Object.entries(quotes)) {
    if ('error' in q) {
      prices[sym] = q
      continue
    }
    const priceUsd = convertToUsd(q.price, q.currency, fx)
    const entry: Record<string, unknown> = { price: q.price, currency: q.currency, priceUsd }
    if (sym === GOLD_YAHOO_SYMBOL || sym === SILVER_YAHOO_SYMBOL) {
      entry.usdPerGram = usdPerGramFromOunce(q.price)
    }
    prices[sym] = entry
    okCount++
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
      priceUsd: convertToUsd(q.price, q.currency, fx),
    }
    okCount++
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
      priceUsd: convertToUsd(q.price, q.currency, fx),
    }
    okCount++
  }
  const cacheable = okCount > 0 && usdtry != null
  return {
    res: json(
      { asOf: new Date().toISOString(), usdtry, eurtry, prices },
      200,
      origin,
      { 'cache-control': cacheable ? 's-maxage=300' : 'no-store' },
    ),
    cacheable,
  }
}

async function handleFx(origin: string): Promise<{ res: Response; cacheable: boolean }> {
  try {
    const fx = await fetchTcmbRates()
    return {
      res: json(
        { date: fx.date, usdtry: fx.usdtry, eurtry: fx.eurtry, rates: fx.rates },
        200,
        origin,
        { 'cache-control': 's-maxage=300' },
      ),
      cacheable: true,
    }
  } catch (e) {
    return {
      res: json({ error: e instanceof Error ? e.message : 'kur alınamadı' }, 502, origin),
      cacheable: false,
    }
  }
}

function normalizedCacheKey(req: Request, url: URL): Request {
  const clean = new URL(url.toString())
  clean.searchParams.delete('fresh')
  return new Request(clean.toString(), { method: 'GET' })
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
      const cacheKey = normalizedCacheKey(req, url)
      if (cache && !fresh) {
        const hit = await cache.match(cacheKey)
        if (hit) return hit
      }

      let res: Response
      let cacheable = false
      if (url.pathname === '/prices') ({ res, cacheable } = await handlePrices(url, origin, env))
      else if (url.pathname === '/fx/latest') ({ res, cacheable } = await handleFx(origin))
      else res = json({ error: 'bilinmeyen uç' }, 404, origin)

      if (cache && res.status === 200 && cacheable) {
        ctx.waitUntil(cache.put(cacheKey, res.clone()))
      }
      return res
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'sunucu hatası' }, 500, origin)
    }
  },
}
