import { fetchQuotes } from './yahoo'
import { fetchUsdTry } from './tcmb'
import { usdPerGramFromOunce, GOLD_YAHOO_SYMBOL } from './symbols'

export interface Env {
  ALLOWED_ORIGIN: string
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

async function handlePrices(url: URL, origin: string): Promise<Response> {
  const raw = url.searchParams.get('symbols')?.trim()
  if (!raw) return json({ error: 'symbols parametresi gerekli' }, 400, origin)
  const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (symbols.length === 0) return json({ error: 'symbols parametresi gerekli' }, 400, origin)
  if (symbols.length > 60) return json({ error: 'en fazla 60 sembol' }, 400, origin)

  const [quotes, fx] = await Promise.all([fetchQuotes(symbols), fetchUsdTry()])
  const prices: Record<string, unknown> = {}
  for (const [sym, q] of Object.entries(quotes)) {
    if ('error' in q) {
      prices[sym] = q
      continue
    }
    const priceUsd = q.currency === 'TRY' ? q.price / fx.usdtry : q.price
    const entry: Record<string, unknown> = { price: q.price, currency: q.currency, priceUsd }
    if (sym === GOLD_YAHOO_SYMBOL) entry.usdPerGram = usdPerGramFromOunce(q.price)
    prices[sym] = entry
  }
  return json(
    { asOf: new Date().toISOString(), usdtry: fx.usdtry, prices },
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
    if (url.pathname === '/prices') res = await handlePrices(url, origin)
    else if (url.pathname === '/fx/latest') res = await handleFx(origin)
    else res = json({ error: 'bilinmeyen uç' }, 404, origin)

    if (cache && res.status === 200 && !fresh) ctx.waitUntil(cache.put(req, res.clone()))
    return res
  },
}
