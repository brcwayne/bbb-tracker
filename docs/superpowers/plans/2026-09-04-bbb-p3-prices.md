# P3 — Canlı Fiyat + FX + Gerçekleşmemiş K/Z Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateless Cloudflare Worker that proxies Yahoo Finance (BIST/USA/gold) and TCMB (USD/TRY), plus an on-demand "Fiyatları yenile" button in the PWA that fills the open-positions **Güncel Fiyat** and **Gerçekleşmemiş K/Z** columns and a Panorama KPI.

**Architecture:** New `worker/` package at the repo root, deployed separately with `wrangler`. The Worker exposes `GET /prices?symbols=…` and `GET /fx/latest`; it holds no state, requires no keys, and CORS-restricts to the Pages origin. The PWA gets `src/lib/prices.svelte.ts` (a `$state` store + `refreshPrices` / `hydratePrices`) and a pure `src/lib/data/unrealized.ts`; `Pozisyonlar.svelte`, `Panorama.svelte` and `App.svelte` consume them. The Worker URL is a build-time env var `VITE_PRICE_API` (public, like the Google client id); no data file is added.

**Tech Stack:** Cloudflare Workers (module syntax, TypeScript), `wrangler`, `vitest` (plain node, mocked `fetch`) for the worker; existing Svelte 5 + Vite 6 + Vitest for the app.

**Spec:** `docs/superpowers/specs/2026-09-04-bbb-p3-prices-design.md`

## Global Constraints

- **Data never in the repo or the bundle.** `VITE_PRICE_API` is a public CORS-locked URL and is fine as an env var (same class as `VITE_GOOGLE_CLIENT_ID`). No new JSON data file. The CI `dist`-no-json guard stays.
- **The Worker never receives user data** — only ticker symbols. No account, holdings, quantities, or identity.
- **Svelte 5 idioms (Ruling P1-3):** props are `let { x = d }: { x?: T } = $props()` (annotation form, never `$props<{}>()`); event handlers are `onclick=` / `onmouseenter=` (never `on:click`); `$state` / `$derived` / `$derived.by`.
- **Ruling P1-9 (load-bearing):** `app/svelte.config.js` MUST stay `export default { preprocess: vitePreprocess({ style: false }) }`. Do not touch it. Plain `<style>` blocks are fine.
- **Ruling P1-10:** a component that binds a prop literally named `derived` cannot also use the `$derived` rune. Do NOT introduce a prop or variable named `derived` in any component. `Panorama.svelte` / `Pozisyonlar.svelte` build their view model via `function buildView(ds, d)` under `{@const vm = buildView(dataset, derived)}` inside `{#if dataset && derived}`. New reads of `prices` go through `buildView` or plain template expressions.
- **Ruling P1-5:** jsdom in this vitest config exposes neither `localStorage` nor `sessionStorage`. `app/vitest-setup.ts` shims `localStorage` with a Map-backed object; Task 8 adds the same shim for `sessionStorage`. All storage access in app code is wrapped in `try/catch` and works when storage is absent.
- **`money()` currency-awareness:** all displayed monetary values use `money()` from `app/src/lib/settings.svelte.ts` (USD or TRY at `settings.rate`). Never call `usd()` directly in a page for a user-facing amount.
- **App test suite is 76 passing tests. Every task keeps `cd app && npm test`, `npm run check` (0 errors, 0 warnings) and `npm run build` green.** The worker has its own suite: `cd worker && npm test`.
- **Worker portability:** the handler uses only `fetch`, `Request`, `Response`, `URL` (all global in Node 18+ / vitest). `caches` is Cloudflare-only — every use is `globalThis.caches?.default` guarded so tests run without it.
- **Copy is Turkish** (button label, stamps, errors), matching the app.
- **Node 22** in CI for both `app` and `worker` jobs (matches the existing Pages workflow `setup-node` version).

---

## File Structure

**New — `worker/` (repo root, standalone package):**
| File | Responsibility |
|---|---|
| `worker/package.json` | `wrangler`, `vitest`, `typescript`, `@cloudflare/workers-types` devDeps; `test`, `deploy`, `dev`, `smoke` scripts |
| `worker/tsconfig.json` | `target ES2022`, `moduleResolution bundler`, `types: ["@cloudflare/workers-types"]` |
| `worker/wrangler.toml` | `name = "bbb-prices"`, `main = "src/index.ts"`, `compatibility_date`, `[vars] ALLOWED_ORIGIN` |
| `worker/vitest.config.ts` | plain node env |
| `worker/src/symbols.ts` | instrument `fiyatKaynagi`/`fiyatSembolu` → Yahoo symbol; gram constant; USD-per-gram from gold ounce price |
| `worker/src/yahoo.ts` | `fetchQuotes(symbols, deps)` — call Yahoo chart API, `query1`→`query2` fallback, parse `{price,currency}`, isolate per-symbol errors |
| `worker/src/tcmb.ts` | `fetchUsdTry(deps)` — `today.xml` + business-day walk-back, extract `ForexBuying` |
| `worker/src/index.ts` | `fetch` handler: route `/prices`, `/fx/latest`, `OPTIONS`; CORS; Cache API; assemble response |
| `worker/test/*.test.ts` | pure-function tests for the four `src` modules with fixture JSON/XML + mocked `fetch` |
| `worker/test/fixtures/*` | captured Yahoo JSON + TCMB XML samples |
| `worker/smoke.mjs` | manual real-endpoint check (not in CI) |
| `worker/README.md` | `wrangler login && wrangler deploy`, repo-variable step, `npm run smoke` |

**New — app:**
| File | Responsibility |
|---|---|
| `app/src/lib/data/unrealized.ts` | pure: open positions + instruments + prices → per-`kod` unrealized {price, K/Z, %}; total |
| `app/src/lib/prices.svelte.ts` | `prices` `$state`; `refreshPrices(ds)`; `hydratePrices()`; `priceApiEnabled()`; `PRICE_API` |
| test files for both | |

**Modified — app:**
| File | Change |
|---|---|
| `app/src/vite-env.d.ts` | add `readonly VITE_PRICE_API?: string` |
| `app/vite.config.ts` | no code change needed (env var read via `import.meta.env`); comment only |
| `app/vitest-setup.ts` | add `sessionStorage` shim (mirror the `localStorage` one) |
| `app/src/routes/Pozisyonlar.svelte` | `guncelFiyat` / `gerceklesmemisKz` columns from `unrealized` + `prices`; import `prices` |
| `app/src/routes/Panorama.svelte` | KPI band gains a "Gerçekleşmemiş K/Z" item (6th) |
| `app/src/App.svelte` | "Fiyatları yenile" button + `HH:MM` stamp in `.controls`; `hydratePrices()` on mount; button hidden when `!priceApiEnabled()` |
| `app/src/lib/settings.svelte.ts` | `applyLiveRate(usdtry)` — set `settings.rate`/`rateDate` from a live TCMB rate |
| `.github/workflows/pages.yml` | add `VITE_PRICE_API: ${{ vars.VITE_PRICE_API }}` to build `env:`; add a `worker` job (`cd worker && npm ci && npm test`) |
| `app/README.md` | P3 "Enis kurulumu" section |

---

## Task 1: `worker/` scaffold + health route

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.toml`, `worker/vitest.config.ts`, `worker/src/index.ts`, `worker/test/index.test.ts`
- Create: `worker/.gitignore`

**Interfaces:**
- Produces: `worker/src/index.ts` default export `{ fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> }`; `interface Env { ALLOWED_ORIGIN: string }`. A `GET /health` route returns `200` `{"ok":true}`. `OPTIONS` returns `204` with CORS headers. Unknown routes → `404` `{"error":"bilinmeyen uç"}`.

- [ ] **Step 1: Write `worker/package.json`**

```json
{
  "name": "bbb-prices-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "smoke": "node smoke.mjs"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: Write `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write `worker/wrangler.toml`**

```toml
name = "bbb-prices"
main = "src/index.ts"
compatibility_date = "2024-09-01"

[vars]
ALLOWED_ORIGIN = "https://brcwayne.github.io"
```

- [ ] **Step 4: Write `worker/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
```

- [ ] **Step 5: Write `worker/.gitignore`**

```
node_modules/
.wrangler/
dist/
```

- [ ] **Step 6: Write the failing test `worker/test/index.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import worker from '../src/index'

const env = { ALLOWED_ORIGIN: 'https://example.test' }
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

describe('worker routing', () => {
  it('GET /health → 200 {ok:true} with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/health'), env, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('OPTIONS → 204 with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/prices', { method: 'OPTIONS' }), env, ctx)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('unknown route → 404 {error}', async () => {
    const res = await worker.fetch(new Request('https://w/nope'), env, ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'bilinmeyen uç' })
  })
})
```

- [ ] **Step 7: Run it — expect FAIL (no `src/index.ts`)**

Run: `cd worker && npm install && npm test`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 8: Write `worker/src/index.ts`**

```ts
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

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })

    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true }, 200, origin)

    return json({ error: 'bilinmeyen uç' }, 404, origin)
  },
}
```

- [ ] **Step 9: Run tests — expect PASS**

Run: `cd worker && npm test`
Expected: PASS (3 tests).

- [ ] **Step 10: Verify wrangler config parses**

Run: `cd worker && npx wrangler deploy --dry-run --outdir /tmp/bbb-worker-dry`
Expected: "Total Upload" line, no error. (No login needed for `--dry-run`.)

- [ ] **Step 11: Commit**

```bash
git add worker
git commit -m "feat(worker): scaffold bbb-prices Worker + /health route"
```

---

## Task 2: `worker/src/symbols.ts` — instrument → Yahoo symbol mapping

**Files:**
- Create: `worker/src/symbols.ts`, `worker/test/symbols.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GRAMS_PER_TROY_OUNCE = 31.1034768`
  - `GOLD_YAHOO_SYMBOL = 'GC=F'`
  - `type PriceSource = 'yahoo' | 'altin-turev' | 'tefas'`
  - `yahooSymbolFor(fiyatKaynagi: string, fiyatSembolu: string): string | null` — `'yahoo'` → returns `fiyatSembolu` as-is; `'altin-turev'` → returns `GOLD_YAHOO_SYMBOL`; anything else (incl. `'tefas'`) → `null` (not fetched in P3).
  - `usdPerGramFromOunce(ouncePriceUsd: number): number` — `ouncePriceUsd / GRAMS_PER_TROY_OUNCE`.

- [ ] **Step 1: Write the failing test `worker/test/symbols.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { yahooSymbolFor, usdPerGramFromOunce, GOLD_YAHOO_SYMBOL } from '../src/symbols'

describe('yahooSymbolFor', () => {
  it('passes BIST/USA symbols through for source "yahoo"', () => {
    expect(yahooSymbolFor('yahoo', 'THYAO.IS')).toBe('THYAO.IS')
    expect(yahooSymbolFor('yahoo', 'SPCX')).toBe('SPCX')
  })
  it('maps every gold instrument to the single gold future', () => {
    expect(yahooSymbolFor('altin-turev', 'XAUUSD')).toBe(GOLD_YAHOO_SYMBOL)
  })
  it('returns null for tefas / unknown (not priced in P3)', () => {
    expect(yahooSymbolFor('tefas', 'MAC')).toBeNull()
    expect(yahooSymbolFor('whatever', 'X')).toBeNull()
  })
})

describe('usdPerGramFromOunce', () => {
  it('divides by grams per troy ounce', () => {
    expect(usdPerGramFromOunce(4516.9)).toBeCloseTo(145.222, 3)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd worker && npm test -- symbols`
Expected: FAIL — cannot resolve `../src/symbols`.

- [ ] **Step 3: Write `worker/src/symbols.ts`**

```ts
export const GRAMS_PER_TROY_OUNCE = 31.1034768
export const GOLD_YAHOO_SYMBOL = 'GC=F'

export type PriceSource = 'yahoo' | 'altin-turev' | 'tefas'

/** Yahoo chart symbol for an instrument, or null when P3 does not price it. */
export function yahooSymbolFor(fiyatKaynagi: string, fiyatSembolu: string): string | null {
  if (fiyatKaynagi === 'yahoo') return fiyatSembolu
  if (fiyatKaynagi === 'altin-turev') return GOLD_YAHOO_SYMBOL
  return null
}

export function usdPerGramFromOunce(ouncePriceUsd: number): number {
  return ouncePriceUsd / GRAMS_PER_TROY_OUNCE
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd worker && npm test -- symbols`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/symbols.ts worker/test/symbols.test.ts
git commit -m "feat(worker): instrument → Yahoo symbol mapping + gram math"
```

---

## Task 3: `worker/src/yahoo.ts` — Yahoo Finance quote fetch

**Files:**
- Create: `worker/src/yahoo.ts`, `worker/test/yahoo.test.ts`, `worker/test/fixtures/yahoo-thyao.json`, `worker/test/fixtures/yahoo-spcx.json`

**Interfaces:**
- Consumes: nothing (takes an injected `fetch`).
- Produces:
  - `type Quote = { price: number; currency: string } | { error: string }`
  - `parseChart(body: unknown): { price: number; currency: string } | null` — pulls `chart.result[0].meta.regularMarketPrice` + `meta.currency`; `null` when the shape is missing/`result` is null.
  - `fetchQuotes(symbols: string[], fetchImpl?: typeof fetch): Promise<Record<string, Quote>>` — one request per symbol to `https://query1.finance.yahoo.com/v8/finance/chart/<enc>?interval=1d&range=1d` with header `user-agent: Mozilla/5.0 (BBB-Tracker)`; on non-ok or unparseable, retry once against `query2.finance.yahoo.com`; still failing → `{ error: 'kaynak' }`. Requests run with `Promise.all`. `<enc>` is `encodeURIComponent(symbol)`.

- [ ] **Step 1: Capture fixtures**

Run and save (pretty-print not required):
```bash
cd worker && mkdir -p test/fixtures
curl -s -A 'Mozilla/5.0 (BBB-Tracker)' 'https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS?interval=1d&range=1d' -o test/fixtures/yahoo-thyao.json
curl -s -A 'Mozilla/5.0 (BBB-Tracker)' 'https://query1.finance.yahoo.com/v8/finance/chart/SPCX?interval=1d&range=1d' -o test/fixtures/yahoo-spcx.json
```
Then in each file confirm `.chart.result[0].meta.regularMarketPrice` and `.meta.currency` exist (`node -e "console.log(require('./test/fixtures/yahoo-thyao.json').chart.result[0].meta.currency)"` → `TRY`; spcx → `USD`). If Yahoo is unreachable from the build box, hand-write a minimal fixture:
```json
{"chart":{"result":[{"meta":{"regularMarketPrice":294.0,"currency":"TRY"}}],"error":null}}
```

- [ ] **Step 2: Write the failing test `worker/test/yahoo.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import thyao from './fixtures/yahoo-thyao.json'
import spcx from './fixtures/yahoo-spcx.json'
import { parseChart, fetchQuotes } from '../src/yahoo'

describe('parseChart', () => {
  it('reads price + currency from a chart response', () => {
    expect(parseChart(thyao)).toEqual({
      price: (thyao as any).chart.result[0].meta.regularMarketPrice,
      currency: 'TRY',
    })
    expect(parseChart(spcx)?.currency).toBe('USD')
  })
  it('returns null for a malformed body', () => {
    expect(parseChart({ chart: { result: null } })).toBeNull()
    expect(parseChart({})).toBeNull()
  })
})

describe('fetchQuotes', () => {
  it('resolves each symbol, falling back to query2 on a bad query1', async () => {
    const f = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('query1') && u.includes('THYAO')) return new Response('nope', { status: 503 })
      if (u.includes('THYAO')) return new Response(JSON.stringify(thyao))
      if (u.includes('SPCX')) return new Response(JSON.stringify(spcx))
      return new Response('x', { status: 404 })
    }) as unknown as typeof fetch

    const out = await fetchQuotes(['THYAO.IS', 'SPCX'], f)
    expect(out['THYAO.IS']).toEqual({ price: (thyao as any).chart.result[0].meta.regularMarketPrice, currency: 'TRY' })
    expect(out['SPCX']).toEqual({ price: (spcx as any).chart.result[0].meta.regularMarketPrice, currency: 'USD' })
  })

  it('reports {error} for a symbol that fails on both hosts', async () => {
    const f = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch
    const out = await fetchQuotes(['BAD.IS'], f)
    expect(out['BAD.IS']).toEqual({ error: 'kaynak' })
  })
})
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd worker && npm test -- yahoo`
Expected: FAIL — cannot resolve `../src/yahoo`.

- [ ] **Step 4: Write `worker/src/yahoo.ts`**

```ts
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
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd worker && npm test -- yahoo`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add worker/src/yahoo.ts worker/test/yahoo.test.ts worker/test/fixtures
git commit -m "feat(worker): Yahoo Finance quote fetch with query1→query2 fallback"
```

---

## Task 4: `worker/src/tcmb.ts` — USD/TRY from TCMB with business-day walk-back

**Files:**
- Create: `worker/src/tcmb.ts`, `worker/test/tcmb.test.ts`, `worker/test/fixtures/tcmb-today.xml`

**Interfaces:**
- Consumes: nothing (injected `fetch`, injected `today`).
- Produces:
  - `parseUsdBuying(xml: string): number | null` — regex-extract the `<ForexBuying>` inside the `<Currency … Kod="USD">` block; `null` if absent.
  - `fetchUsdTry(fetchImpl?: typeof fetch, today?: Date): Promise<{ date: string; usdtry: number }>` — try `https://www.tcmb.gov.tr/kurlar/today.xml`; if non-ok or unparseable, walk back day by day (max 7) hitting `https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml`; `date` is the ISO date that produced the rate (`today`'s ISO for `today.xml`). Throws `Error('TCMB kuru alınamadı')` after 7 misses.

- [ ] **Step 1: Capture the fixture**

```bash
cd worker && curl -s 'https://www.tcmb.gov.tr/kurlar/today.xml' -o test/fixtures/tcmb-today.xml
grep -q 'Kod="USD"' test/fixtures/tcmb-today.xml && grep -q 'ForexBuying' test/fixtures/tcmb-today.xml && echo OK
```
If unreachable, hand-write `test/fixtures/tcmb-today.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="03.09.2026" Date="09/03/2026">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><Isim>ABD DOLARI</Isim><CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>48.2238</ForexBuying><ForexSelling>48.3107</ForexSelling>
  </Currency>
</Tarih_Date>
```

- [ ] **Step 2: Write the failing test `worker/test/tcmb.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseUsdBuying, fetchUsdTry } from '../src/tcmb'

const xml = readFileSync(new URL('./fixtures/tcmb-today.xml', import.meta.url), 'utf8')

describe('parseUsdBuying', () => {
  it('extracts the USD ForexBuying value', () => {
    expect(parseUsdBuying(xml)).toBeCloseTo(48.2238, 4)
  })
  it('returns null when USD is missing', () => {
    expect(parseUsdBuying('<Tarih_Date></Tarih_Date>')).toBeNull()
  })
})

describe('fetchUsdTry', () => {
  it('uses today.xml when it succeeds', async () => {
    const f = vi.fn(async (u: string | URL) =>
      String(u).endsWith('today.xml') ? new Response(xml) : new Response('x', { status: 404 }),
    ) as unknown as typeof fetch
    const out = await fetchUsdTry(f, new Date('2026-09-03T10:00:00Z'))
    expect(out).toEqual({ date: '2026-09-03', usdtry: expect.closeTo(48.2238, 4) })
  })

  it('walks back to the previous business day when today 404s', async () => {
    const f = vi.fn(async (u: string | URL) => {
      const s = String(u)
      if (s.endsWith('today.xml')) return new Response('', { status: 404 })
      if (s.includes('/202609/01092026.xml')) return new Response(xml)
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch
    const out = await fetchUsdTry(f, new Date('2026-09-02T10:00:00Z'))
    expect(out.date).toBe('2026-09-01')
    expect(out.usdtry).toBeCloseTo(48.2238, 4)
  })

  it('throws after 7 misses', async () => {
    const f = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    await expect(fetchUsdTry(f, new Date('2026-09-02T10:00:00Z'))).rejects.toThrow('TCMB kuru alınamadı')
  })
})
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd worker && npm test -- tcmb`
Expected: FAIL — cannot resolve `../src/tcmb`.

- [ ] **Step 4: Write `worker/src/tcmb.ts`**

```ts
export function parseUsdBuying(xml: string): number | null {
  // <Currency ... Kod="USD" ...> ... <ForexBuying>48.2238</ForexBuying> ...
  const block = xml.match(/<Currency\b[^>]*Kod="USD"[^>]*>([\s\S]*?)<\/Currency>/)
  if (!block) return null
  const m = block[1].match(/<ForexBuying>([\d.]+)<\/ForexBuying>/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function datedUrl(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
}

export async function fetchUsdTry(
  fetchImpl: typeof fetch = fetch,
  today: Date = new Date(),
): Promise<{ date: string; usdtry: number }> {
  const attempts: { url: string; date: string }[] = [
    { url: 'https://www.tcmb.gov.tr/kurlar/today.xml', date: iso(today) },
  ]
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    attempts.push({ url: datedUrl(d), date: iso(d) })
  }
  for (const a of attempts) {
    try {
      const res = await fetchImpl(a.url)
      if (!res.ok) continue
      const rate = parseUsdBuying(await res.text())
      if (rate != null) return { date: a.date, usdtry: rate }
    } catch {
      /* next */
    }
  }
  throw new Error('TCMB kuru alınamadı')
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd worker && npm test -- tcmb`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add worker/src/tcmb.ts worker/test/tcmb.test.ts worker/test/fixtures/tcmb-today.xml
git commit -m "feat(worker): TCMB USD/TRY with business-day walk-back"
```

---

## Task 5: `worker/src/index.ts` — `/prices` + `/fx/latest` routes

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/test/index.test.ts`

**Interfaces:**
- Consumes: `fetchQuotes` (Task 3), `parseChart` unused here, `fetchUsdTry` (Task 4), `usdPerGramFromOunce` + `GOLD_YAHOO_SYMBOL` (Task 2).
- Produces:
  - `GET /prices?symbols=A,B,C` (max 60; `?fresh=1` skips the cache) →
    ```json
    { "asOf": "<iso>", "usdtry": 48.2238,
      "prices": { "THYAO.IS": {"price":294,"currency":"TRY","priceUsd":6.0965},
                  "GC=F": {"price":4516.9,"currency":"USD","priceUsd":4516.9,"usdPerGram":145.22} } }
    ```
    `priceUsd = currency === 'TRY' ? price / usdtry : price`. A failed symbol stays `{ "error": "kaynak" }`. Missing/empty `symbols` → `400 {"error":"symbols parametresi gerekli"}`. >60 → `400`.
  - `GET /fx/latest` → `{ "date": "2026-09-03", "usdtry": 48.2238 }`; TCMB failure → `502 {"error":"TCMB kuru alınamadı"}`.
  - Both responses carry CORS headers and (except errors) `cache-control: s-maxage=300`. When `globalThis.caches?.default` exists, `GET` responses are stored/served through it keyed by the request URL; absent (tests) it is skipped.
  - The worker's own outbound calls use the real global `fetch`; tests stub `globalThis.fetch`.

- [ ] **Step 1: Extend the test `worker/test/index.test.ts`** (append these cases; keep the Task 1 cases)

```ts
import { vi, beforeEach, afterEach } from 'vitest'
import thyao from './fixtures/yahoo-thyao.json'
import { readFileSync } from 'node:fs'
const tcmbXml = readFileSync(new URL('./fixtures/tcmb-today.xml', import.meta.url), 'utf8')

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
    const s = String(u)
    if (s.includes('tcmb.gov.tr')) return new Response(tcmbXml)
    if (s.includes('THYAO')) return new Response(JSON.stringify(thyao))
    if (s.includes('GC%3DF') || s.includes('GC=F'))
      return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 4516.9, currency: 'USD' } }] } }))
    return new Response('x', { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('/fx/latest', () => {
  it('returns the TCMB rate', async () => {
    const res = await worker.fetch(new Request('https://w/fx/latest'), env, ctx)
    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.usdtry).toBeCloseTo(48.2238, 4)
    expect(b.date).toBe('2026-09-03')
  })
})

describe('/prices', () => {
  it('400 without symbols', async () => {
    const res = await worker.fetch(new Request('https://w/prices'), env, ctx)
    expect(res.status).toBe(400)
  })

  it('returns priceUsd per symbol and folds in usdtry + usdPerGram', async () => {
    const res = await worker.fetch(new Request('https://w/prices?symbols=THYAO.IS,GC=F'), env, ctx)
    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.usdtry).toBeCloseTo(48.2238, 4)
    expect(b.prices['THYAO.IS'].currency).toBe('TRY')
    expect(b.prices['THYAO.IS'].priceUsd).toBeCloseTo(294 / 48.2238, 4)
    expect(b.prices['GC=F'].priceUsd).toBe(4516.9)
    expect(b.prices['GC=F'].usdPerGram).toBeCloseTo(4516.9 / 31.1034768, 3)
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
  })

  it('rejects more than 60 symbols', async () => {
    const many = Array.from({ length: 61 }, (_, i) => `S${i}`).join(',')
    const res = await worker.fetch(new Request('https://w/prices?symbols=' + many), env, ctx)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd worker && npm test -- index`
Expected: FAIL — `/prices` and `/fx/latest` return 404.

- [ ] **Step 3: Rewrite `worker/src/index.ts`**

```ts
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

    const cache = globalThis.caches?.default
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd worker && npm test`
Expected: PASS (all worker tests: routing 3 + symbols 4 + yahoo 4 + tcmb 5 + index new 5 = 21).

- [ ] **Step 5: Type-check + dry-run deploy**

Run: `cd worker && npx tsc --noEmit && npx wrangler deploy --dry-run --outdir /tmp/bbb-worker-dry`
Expected: no type errors; "Total Upload" line.

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.ts worker/test/index.test.ts
git commit -m "feat(worker): /prices + /fx/latest with CORS and edge cache"
```

---

## Task 6: `worker/smoke.mjs` + `worker/README.md`

**Files:**
- Create: `worker/smoke.mjs`, `worker/README.md`

**Interfaces:**
- Consumes: a running deployment or `wrangler dev`.
- Produces: `node smoke.mjs [baseUrl]` — hits `/health`, `/fx/latest`, `/prices?symbols=THYAO.IS,GC=F,SPCX` against `baseUrl` (default `http://localhost:8787`) and prints the JSON; exits non-zero on any non-200 or on a `.error`. Not run in CI.

- [ ] **Step 1: Write `worker/smoke.mjs`**

```js
const base = process.argv[2] ?? 'http://localhost:8787'

async function hit(path) {
  const res = await fetch(base + path)
  const body = await res.json()
  console.log(`\n${path} → ${res.status}`)
  console.log(JSON.stringify(body, null, 2))
  if (res.status !== 200 || body.error) {
    console.error('FAIL')
    process.exit(1)
  }
  return body
}

await hit('/health')
await hit('/fx/latest')
const p = await hit('/prices?symbols=THYAO.IS,GC=F,SPCX')
for (const [sym, v] of Object.entries(p.prices)) {
  if (v.error) {
    console.error(`symbol ${sym} failed: ${v.error}`)
    process.exit(1)
  }
}
console.log('\nsmoke OK')
```

- [ ] **Step 2: Write `worker/README.md`**

```markdown
# bbb-prices — fiyat / FX proxy

Durumsuz Cloudflare Worker. BIST/ABD hisseleri ve altın için Yahoo Finance,
USD/TRY için TCMB. Kimlik/anahtar yok; CORS yalnızca PWA origin'ine açık.

## Uçlar
- `GET /health` → `{ok:true}`
- `GET /fx/latest` → `{date, usdtry}` (TCMB "Döviz Alış", iş-günü geri-yürüyüş)
- `GET /prices?symbols=THYAO.IS,GC=F,SPCX` → `{asOf, usdtry, prices:{SYM:{price,currency,priceUsd[,usdPerGram]}}}`
  - en fazla 60 sembol; `?fresh=1` kenar önbelleğini atlar
  - `altin-turev` enstrümanları uygulamada `GC=F`'ye eşlenir; Worker `usdPerGram` döndürür

## Test
```bash
cd worker && npm install && npm test
```

## Gerçek uçları elle doğrula
```bash
npx wrangler dev        # ayrı terminal, http://localhost:8787
npm run smoke           # ya da: node smoke.mjs https://bbb-prices.<sub>.workers.dev
```

## Deploy (Enis)
```bash
npm i -g wrangler
wrangler login                 # tarayıcıda onayla
cd worker && npm install && wrangler deploy
```
Çıkan `https://bbb-prices.<subdomain>.workers.dev` adresini kopyala:
GitHub repo → Settings → Secrets and variables → Actions → **Variables** →
`VITE_PRICE_API` = o adres. Sonra Actions → son "Deploy dashboard to Pages" → **Re-run all jobs**.

Repo adın `bbb-tracker` değilse `wrangler.toml` içindeki `ALLOWED_ORIGIN`'i güncelle
(`https://<kullanıcı>.github.io`).
```

- [ ] **Step 3: Verify smoke script parses**

Run: `cd worker && node --check smoke.mjs`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add worker/smoke.mjs worker/README.md
git commit -m "docs(worker): smoke script + deploy README"
```

---

## Task 7: App env plumbing — `VITE_PRICE_API`

**Files:**
- Modify: `app/src/vite-env.d.ts`
- Modify: `.github/workflows/pages.yml`
- Modify: `app/vitest-setup.ts`

**Interfaces:**
- Produces: `import.meta.env.VITE_PRICE_API: string | undefined` typed; CI passes the repo variable into `npm run build`; the CI also runs the worker test suite; jsdom tests have a `sessionStorage` shim.

- [ ] **Step 1: Add the type to `app/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_APP_ID?: string
  readonly VITE_PRICE_API?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 2: Add the `sessionStorage` shim to `app/vitest-setup.ts`**

The file currently shims `localStorage` only. Add an identical block for `sessionStorage` right after it:

```ts
if (!globalThis.sessionStorage) {
  const store = new Map<string, string>()
  ;(globalThis as any).sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}
```

- [ ] **Step 3: Update `.github/workflows/pages.yml`**

In the `build` job, add `VITE_PRICE_API` to the `npm run build` `env:` block:

```yaml
      - run: npm run build
        env:
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
          VITE_GOOGLE_API_KEY: ${{ vars.VITE_GOOGLE_API_KEY }}
          VITE_GOOGLE_APP_ID: ${{ vars.VITE_GOOGLE_APP_ID }}
          VITE_PRICE_API: ${{ vars.VITE_PRICE_API }}
```

And add a second job (top level, sibling of `build`), so the worker is tested on every push that touches it:

```yaml
  worker:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: worker
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: worker/package-lock.json
      - run: npm ci
      - run: npm test
```

Also widen the workflow `paths:` trigger to include the worker:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'app/**'
      - 'worker/**'
      - '.github/workflows/pages.yml'
```

- [ ] **Step 4: Generate `worker/package-lock.json`**

Run: `cd worker && npm install` (creates the lockfile the CI `npm ci` needs). Commit it.

- [ ] **Step 5: Verify app still green with no env var set**

Run: `cd app && npm run check && npm test && npm run build`
Expected: `check` 0/0, tests 76 pass, build OK. (`VITE_PRICE_API` unset → `import.meta.env.VITE_PRICE_API` is `undefined`.)

- [ ] **Step 6: Commit**

```bash
git add app/src/vite-env.d.ts app/vitest-setup.ts .github/workflows/pages.yml worker/package-lock.json
git commit -m "chore(app): wire VITE_PRICE_API + worker CI job + sessionStorage test shim"
```

---

## Task 8: `app/src/lib/data/unrealized.ts` — pure unrealized-P/L math

**Files:**
- Create: `app/src/lib/data/unrealized.ts`, `app/src/lib/data/unrealized.test.ts`

**Interfaces:**
- Consumes: `OpenPosition` from `./derive` (`{ kod: string; lot: number; ortMaliyetUsd: number; toplamMaliyetUsd: number }`); `Instrument` from `./types` (`{ kod; sinif; fiyatKaynagi; fiyatSembolu; ... altinKatsayi?: number }` — note `altinKatsayi` is present on gold rows in `instruments.json` but NOT in the `Instrument` type yet; Step 3 adds it).
- Produces:
  - `interface PriceLookup { bySymbol: Record<string, { priceUsd: number }>; usdPerGram: number | null }`
  - `interface Unrealized { kod: string; guncelFiyatUsd: number | null; kzUsd: number | null; kzPct: number | null }`
  - `unrealizedByKod(open: OpenPosition[], instruments: Instrument[], p: PriceLookup): Map<string, Unrealized>`
  - `unrealizedTotalUsd(open: OpenPosition[], instruments: Instrument[], p: PriceLookup): number | null` — sum of `kzUsd` over positions that have a price; `null` if none do.
  - Gold: `guncelFiyatUsd = p.usdPerGram * (inst.altinKatsayi ?? 0)` (needs `usdPerGram` and `altinKatsayi`). BIST/USA: `guncelFiyatUsd = p.bySymbol[inst.fiyatSembolu]?.priceUsd`. Missing → all three fields `null`.
  - `kzUsd = (guncelFiyatUsd - pos.ortMaliyetUsd) * pos.lot`; `kzPct = pos.toplamMaliyetUsd ? kzUsd / pos.toplamMaliyetUsd : null`.

- [ ] **Step 1: Add `altinKatsayi` to the `Instrument` type**

In `app/src/lib/data/types.ts`, the `Instrument` interface — add one optional field after `seviyeler`:

```ts
export interface Instrument {
  kod: string
  ad: string
  sinif: 'BIST' | 'ALTIN' | 'FON_PARA' | 'FON_HISSE' | 'USA'
  girisParaBirimi: string
  fiyatKaynagi: string
  fiyatSembolu: string
  seviyeler: {
    destek?: number
    direnc?: number
    hedef?: number
    birim?: string
    not?: string
    guncelleme?: string
  } | null
  /** grams of fine gold per unit — present only on `fiyatKaynagi: "altin-turev"` rows */
  altinKatsayi?: number
}
```

- [ ] **Step 2: Write the failing test `app/src/lib/data/unrealized.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { unrealizedByKod, unrealizedTotalUsd, type PriceLookup } from './unrealized'
import type { OpenPosition } from './derive'
import type { Instrument } from './types'

const inst = (over: Partial<Instrument>): Instrument => ({
  kod: 'X', ad: 'X', sinif: 'BIST', girisParaBirimi: 'TL',
  fiyatKaynagi: 'yahoo', fiyatSembolu: 'X.IS', seviyeler: null, ...over,
})

const open: OpenPosition[] = [
  { kod: 'THYAO', lot: 10, ortMaliyetUsd: 5, toplamMaliyetUsd: 50 },
  { kod: 'XAU', lot: 4, ortMaliyetUsd: 100, toplamMaliyetUsd: 400 },
  { kod: 'NOPRICE', lot: 2, ortMaliyetUsd: 3, toplamMaliyetUsd: 6 },
]
const instruments: Instrument[] = [
  inst({ kod: 'THYAO', fiyatSembolu: 'THYAO.IS' }),
  inst({ kod: 'XAU', sinif: 'ALTIN', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'XAUUSD', altinKatsayi: 1 }),
  inst({ kod: 'NOPRICE', fiyatSembolu: 'NP.IS' }),
]
const p: PriceLookup = { bySymbol: { 'THYAO.IS': { priceUsd: 8 } }, usdPerGram: 130 }

describe('unrealizedByKod', () => {
  it('computes K/Z for a BIST holding with a price', () => {
    const m = unrealizedByKod(open, instruments, p)
    expect(m.get('THYAO')).toEqual({ kod: 'THYAO', guncelFiyatUsd: 8, kzUsd: (8 - 5) * 10, kzPct: 30 / 50 })
  })
  it('prices gold from usdPerGram × altinKatsayi', () => {
    const m = unrealizedByKod(open, instruments, p)
    expect(m.get('XAU')).toEqual({ kod: 'XAU', guncelFiyatUsd: 130, kzUsd: (130 - 100) * 4, kzPct: 120 / 400 })
  })
  it('leaves a priceless holding null', () => {
    const m = unrealizedByKod(open, instruments, p)
    expect(m.get('NOPRICE')).toEqual({ kod: 'NOPRICE', guncelFiyatUsd: null, kzUsd: null, kzPct: null })
  })
})

describe('unrealizedTotalUsd', () => {
  it('sums only the priced positions', () => {
    expect(unrealizedTotalUsd(open, instruments, p)).toBe((8 - 5) * 10 + (130 - 100) * 4)
  })
  it('is null when nothing is priced', () => {
    expect(unrealizedTotalUsd(open, instruments, { bySymbol: {}, usdPerGram: null })).toBeNull()
  })
})
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd app && npm test -- unrealized`
Expected: FAIL — cannot resolve `./unrealized`.

- [ ] **Step 4: Write `app/src/lib/data/unrealized.ts`**

```ts
import type { OpenPosition } from './derive'
import type { Instrument } from './types'

export interface PriceLookup {
  bySymbol: Record<string, { priceUsd: number }>
  usdPerGram: number | null
}

export interface Unrealized {
  kod: string
  guncelFiyatUsd: number | null
  kzUsd: number | null
  kzPct: number | null
}

function currentUsd(inst: Instrument | undefined, p: PriceLookup): number | null {
  if (!inst) return null
  if (inst.fiyatKaynagi === 'altin-turev') {
    if (p.usdPerGram == null || inst.altinKatsayi == null) return null
    return p.usdPerGram * inst.altinKatsayi
  }
  const hit = p.bySymbol[inst.fiyatSembolu]
  return hit ? hit.priceUsd : null
}

export function unrealizedByKod(
  open: OpenPosition[],
  instruments: Instrument[],
  p: PriceLookup,
): Map<string, Unrealized> {
  const byKod = new Map(instruments.map((i) => [i.kod, i]))
  const out = new Map<string, Unrealized>()
  for (const pos of open) {
    const cur = currentUsd(byKod.get(pos.kod), p)
    if (cur == null) {
      out.set(pos.kod, { kod: pos.kod, guncelFiyatUsd: null, kzUsd: null, kzPct: null })
      continue
    }
    const kzUsd = (cur - pos.ortMaliyetUsd) * pos.lot
    out.set(pos.kod, {
      kod: pos.kod,
      guncelFiyatUsd: cur,
      kzUsd,
      kzPct: pos.toplamMaliyetUsd ? kzUsd / pos.toplamMaliyetUsd : null,
    })
  }
  return out
}

export function unrealizedTotalUsd(
  open: OpenPosition[],
  instruments: Instrument[],
  p: PriceLookup,
): number | null {
  const m = unrealizedByKod(open, instruments, p)
  let total = 0
  let any = false
  for (const u of m.values()) {
    if (u.kzUsd != null) {
      total += u.kzUsd
      any = true
    }
  }
  return any ? total : null
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd app && npm test -- unrealized`
Expected: PASS (5 tests).

- [ ] **Step 6: Full app check**

Run: `cd app && npm run check && npm test`
Expected: `check` 0/0; 81 tests pass (76 + 5).

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/data/unrealized.ts app/src/lib/data/unrealized.test.ts app/src/lib/data/types.ts
git commit -m "feat(app): pure unrealized-P/L math (BIST + gold)"
```

---

## Task 9: `app/src/lib/prices.svelte.ts` — price store + refresh/hydrate

**Files:**
- Create: `app/src/lib/prices.svelte.ts`, `app/src/lib/prices.test.ts`

**Interfaces:**
- Consumes: `Dataset` from `./data/types`; `derivePositions` from `./data/derive`; `yahooSymbolFor` logic is re-implemented inline here as `apiSymbolFor` (the worker's `symbols.ts` is not importable from the app — different package); `applyLiveRate` from `./settings.svelte` (Task 12 adds it — until then this task stubs the call behind a typeof check; **implementer note:** Task 12 lands `applyLiveRate`; here, import it and call it — if Task 12 is done out of order, add the export first).
- Produces:
  - `const GOLD_API_SYMBOL = 'GC=F'`
  - `export const PRICE_API: string | undefined = import.meta.env.VITE_PRICE_API`
  - `export function priceApiEnabled(): boolean` — `!!PRICE_API`
  - `export const prices = $state<{ bySymbol: Record<string, { price: number; currency: string; priceUsd: number }>; usdPerGram: number | null; usdtry: number | null; asOf: string | null; status: 'idle' | 'loading' | 'ready' | 'error'; error?: string }>({...})`
  - `export function symbolsForHeldInstruments(ds: Dataset): string[]` — open positions → their instrument's API symbol (`fiyatKaynagi==='yahoo'` → `fiyatSembolu`; `'altin-turev'` → `GOLD_API_SYMBOL`; else skipped), de-duplicated.
  - `export async function refreshPrices(ds: Dataset): Promise<void>` — no-op if `!priceApiEnabled()`; sets `status:'loading'`; `GET ${PRICE_API}/prices?symbols=<joined>&fresh=1`; on ok JSON → fill `prices` (`bySymbol` excludes `{error}` entries; `usdPerGram` from `prices['GC=F']?.usdPerGram ?? null`), `status:'ready'`, `asOf` from payload, persist to `sessionStorage['bbb-prices']` (JSON of the state minus `status`), and call `applyLiveRate(payload.usdtry)`; on failure → `status:'error'`, `error` message.
  - `export function hydratePrices(): void` — read `sessionStorage['bbb-prices']`; if `asOf` older than 30 min or unparseable, ignore; else populate `prices` with `status:'ready'`.
  - All `sessionStorage` access in `try/catch`.

- [ ] **Step 1: Write the failing test `app/src/lib/prices.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fixture } from '../fixtures/dataset'
import { prices, refreshPrices, hydratePrices, symbolsForHeldInstruments, priceApiEnabled } from './prices.svelte'
import { settings } from './settings.svelte'

beforeEach(() => {
  sessionStorage.clear()
  prices.bySymbol = {}
  prices.usdPerGram = null
  prices.usdtry = null
  prices.asOf = null
  prices.status = 'idle'
  prices.error = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('symbolsForHeldInstruments', () => {
  it('collects API symbols for open holdings, gold folded to GC=F', () => {
    const syms = symbolsForHeldInstruments(fixture)
    expect(syms).toContain('THYAO.IS')
    expect(syms).toContain('GC=F') // XAU is fully exited in the fixture… see note
  })
})

describe('refreshPrices', () => {
  it('is a no-op without VITE_PRICE_API', async () => {
    await refreshPrices(fixture)
    expect(prices.status).toBe('idle')
    expect(priceApiEnabled()).toBe(false)
  })

  it('fills the store and the live rate on success', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      asOf: '2999-01-01T00:00:00Z',
      usdtry: 40,
      prices: {
        'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 10 },
        'GC=F': { price: 3110.34768, currency: 'USD', priceUsd: 3110.34768, usdPerGram: 100 },
        'BAD.IS': { error: 'kaynak' },
      },
    }))))
    await refreshPrices(fixture)
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBe(10)
    expect(prices.bySymbol['BAD.IS']).toBeUndefined()
    expect(prices.usdPerGram).toBe(100)
    expect(settings.rate).toBe(40)
    expect(JSON.parse(sessionStorage.getItem('bbb-prices')!).asOf).toBe('2999-01-01T00:00:00Z')
  })

  it('sets status "error" when the request fails', async () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })))
    await refreshPrices(fixture)
    expect(prices.status).toBe('error')
  })
})

describe('hydratePrices', () => {
  it('restores a fresh snapshot', () => {
    sessionStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: { 'THYAO.IS': { price: 1, currency: 'TRY', priceUsd: 0.02 } },
      usdPerGram: 90, usdtry: 41, asOf: new Date().toISOString(),
    }))
    hydratePrices()
    expect(prices.status).toBe('ready')
    expect(prices.bySymbol['THYAO.IS'].priceUsd).toBe(0.02)
  })

  it('ignores a snapshot older than 30 minutes', () => {
    sessionStorage.setItem('bbb-prices', JSON.stringify({
      bySymbol: {}, usdPerGram: null, usdtry: null,
      asOf: new Date(Date.now() - 31 * 60_000).toISOString(),
    }))
    hydratePrices()
    expect(prices.status).toBe('idle')
  })
})
```

**Implementer note on the fixture:** `app/src/fixtures/dataset.ts` currently has XAU fully exited (no open XAU position) and THYAO open. Before writing this task's code, add one held gold position to the fixture so `symbolsForHeldInstruments` exercises the gold branch: append to `fixture.transactions` a buy `{ id: 't_g', tarih: '2025-01-02', hesap: 'KASA', portfoy: 'ENIS', enstruman: 'XAU', yon: 'AL', lot: 5, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 90, kur: 35, komisyon_usd: 0, brut_usd: 450, net_usd: 450, not: '', kaynak: 'migration', olusturulma: null }` and add `altinKatsayi: 1` to the `XAU` entry in `fixture.instruments`. Re-run the full suite after — `derive`/`Panorama`/`Pozisyonlar`/`store` tests that count XAU quantities or realized totals may shift; update those expected numbers (XAU realized stays +300 from the existing exit; a new open 5-lot XAU position appears; `positions.open` count +1). Keep each such change minimal and obvious.

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd app && npm test -- prices`
Expected: FAIL — cannot resolve `./prices.svelte`.

- [ ] **Step 3: Write `app/src/lib/prices.svelte.ts`**

```ts
import type { Dataset } from './data/types'
import { derivePositions } from './data/derive'
import { applyLiveRate } from './settings.svelte'

const GOLD_API_SYMBOL = 'GC=F'
const MAX_AGE_MS = 30 * 60_000
const STORE_KEY = 'bbb-prices'

export const PRICE_API: string | undefined = import.meta.env.VITE_PRICE_API
export function priceApiEnabled(): boolean {
  return !!PRICE_API
}

type Entry = { price: number; currency: string; priceUsd: number }

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
  if (!PRICE_API) return
  const symbols = symbolsForHeldInstruments(ds)
  if (symbols.length === 0) return
  prices.status = 'loading'
  prices.error = undefined
  try {
    const url = `${PRICE_API}/prices?symbols=${encodeURIComponent(symbols.join(','))}&fresh=1`
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
      bySymbol[sym] = { price: v.price, currency: v.currency, priceUsd: v.priceUsd }
      if (sym === GOLD_API_SYMBOL && typeof (v as any).usdPerGram === 'number') {
        usdPerGram = (v as any).usdPerGram
      }
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
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && npm test -- prices`
Expected: PASS (7 tests). If `applyLiveRate` does not yet exist in `settings.svelte.ts`, add it now (see Task 12 Step 1) — it is a 3-line export.

- [ ] **Step 5: Full app check**

Run: `cd app && npm run check && npm test`
Expected: `check` 0/0; all tests pass (fixture change may have shifted a few numbers — update expectations per the implementer note).

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/prices.svelte.ts app/src/lib/prices.test.ts app/src/fixtures/dataset.ts app/src/lib/settings.svelte.ts app/src/lib/data/*.test.ts app/src/routes/*.test.ts
git commit -m "feat(app): price store — refresh, hydrate, held-symbol collection"
```

---

## Task 10: Pozisyonlar — Güncel Fiyat + Gerçekleşmemiş K/Z columns

**Files:**
- Modify: `app/src/routes/Pozisyonlar.svelte`
- Modify: `app/src/routes/Pozisyonlar.test.ts`

**Interfaces:**
- Consumes: `prices` (Task 9), `unrealizedByKod` (Task 8), `money` (existing).
- Produces: the open-positions table's `guncelFiyat` and `gerceklesmemisKz` cells show live values when a price exists, `—` otherwise. No prop changes.

- [ ] **Step 1: Add a failing test to `app/src/routes/Pozisyonlar.test.ts`**

```ts
import { prices } from '../lib/prices.svelte'

it('fills Güncel Fiyat + Gerçekleşmemiş K/Z from the price store', async () => {
  const d = await v()
  // THYAO is open in the fixture; price it.
  prices.bySymbol = { 'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 12 } }
  prices.usdPerGram = null
  prices.status = 'ready'
  const { container } = render(Pozisyonlar, { props: { dataset: d.dataset, derived: d.derived } })
  const openBody = openTbody(container).textContent!
  expect(openBody).toContain('$12.00')          // güncel fiyat (THYAO ort maliyet < 12 → pozitif K/Z)
  prices.bySymbol = {}
  prices.status = 'idle'
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd app && npm test -- Pozisyonlar`
Expected: FAIL — `$12.00` not found (columns still `—`).

- [ ] **Step 3: Wire the columns in `app/src/routes/Pozisyonlar.svelte`**

Add imports:
```ts
import { prices } from '../lib/prices.svelte'
import { unrealizedByKod } from '../lib/data/unrealized'
```

In `buildView(ds, d)`, after `openRaw` is computed, build the unrealized map and merge it into each open row. Replace the `guncelFiyat` / `gerceklesmemisKz` placeholders:
```ts
    const unreal = unrealizedByKod(openRaw, ds.instruments, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })

    const openRows = openRaw.map((p) => {
      const inst = instByKod.get(p.kod)
      const tx = latestTx.get(p.kod)
      const u = unreal.get(p.kod)
      return {
        kod: p.kod,
        sinif: inst?.sinif ?? DASH,
        portfoy: tx?.portfoy ?? DASH,
        hesap: tx?.hesap ?? DASH,
        lot: p.lot,
        ortMaliyetUsd: p.ortMaliyetUsd,
        toplamMaliyetUsd: p.toplamMaliyetUsd,
        pay: p.toplamMaliyetUsd / totalCost,
        guncelFiyat: u?.guncelFiyatUsd ?? null,
        gerceklesmemisKz: u?.kzUsd ?? null,
        gerceklesmemisPct: u?.kzPct ?? null,
        seviye: seviyeStr(inst),
      }
    })
```

Update the two column defs in `openColumns` (currently value-less placeholders):
```ts
    {
      key: 'guncelFiyat',
      label: 'Güncel Fiyat',
      align: 'right' as const,
      fmt: (v: number | null) => (v == null ? DASH : money(v)),
    },
    {
      key: 'gerceklesmemisKz',
      label: 'Gerçekleşmemiş K/Z',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number | null, row: { gerceklesmemisPct: number | null }) =>
        v == null ? DASH : `${money(v, { sign: true })} · ${row.gerceklesmemisPct == null ? DASH : pct(row.gerceklesmemisPct)}`,
    },
```

`void prices.status` at the top of `buildView` so the `{@const vm = buildView(...)}` re-runs when a refresh completes.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && npm test -- Pozisyonlar`
Expected: PASS. The earlier `— placeholder` test (`expect(container.textContent).toContain('—')`) still passes — priceless rows and the closed table keep dashes.

- [ ] **Step 5: Full app check**

Run: `cd app && npm run check && npm test`
Expected: `check` 0/0; all pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/routes/Pozisyonlar.svelte app/src/routes/Pozisyonlar.test.ts
git commit -m "feat(app): live Güncel Fiyat + Gerçekleşmemiş K/Z on Pozisyonlar"
```

---

## Task 11: Panorama — "Gerçekleşmemiş K/Z" KPI

**Files:**
- Modify: `app/src/routes/Panorama.svelte`
- Modify: `app/src/routes/Panorama.test.ts`

**Interfaces:**
- Consumes: `prices` (Task 9), `unrealizedTotalUsd` (Task 8), `money` (existing).
- Produces: KPI band has a 6th item, "Gerçekleşmemiş K/Z", showing `money(total)` (tone by sign) or `—` when no prices.

- [ ] **Step 1: Add a failing test to `app/src/routes/Panorama.test.ts`**

```ts
import { prices } from '../lib/prices.svelte'

it('shows an unrealized-P/L KPI once prices are loaded', async () => {
  const v = await derived()
  prices.bySymbol = { 'THYAO.IS': { price: 400, currency: 'TRY', priceUsd: 99 } }
  prices.usdPerGram = null
  prices.status = 'ready'
  const { getByText } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
  expect(getByText('Gerçekleşmemiş K/Z')).toBeInTheDocument()
  prices.bySymbol = {}
  prices.status = 'idle'
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd app && npm test -- Panorama`
Expected: FAIL — no "Gerçekleşmemiş K/Z" text.

- [ ] **Step 3: Add the KPI in `app/src/routes/Panorama.svelte`**

Imports:
```ts
import { prices } from '../lib/prices.svelte'
import { unrealizedTotalUsd } from '../lib/data/unrealized'
```

In `buildView(ds, d)`, compute the total from open positions (guard on `d.positions.open`):
```ts
    void prices.status
    const openRaw = d.positions.open.filter((pp) => pp.lot > 1e-9)
    const unrealTotal = unrealizedTotalUsd(openRaw, ds.instruments, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })
```

Add to `kpiItems`, right after the `YTD K/Z` entry and before `İşlem`:
```ts
        {
          label: 'Gerçekleşmemiş K/Z',
          value: unrealTotal == null ? DASH : money(unrealTotal),
          num: unrealTotal == null ? undefined : unrealTotal,
          fmt: unrealTotal == null ? undefined : (n: number) => money(n),
          tone: unrealTotal == null ? undefined : toneOf(unrealTotal),
        },
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && npm test -- Panorama`
Expected: PASS. The existing "renders each chart once" and "$475.00 / $5,475.00" assertions are unaffected.

- [ ] **Step 5: Full app check**

Run: `cd app && npm run check && npm test`
Expected: `check` 0/0; all pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/routes/Panorama.svelte app/src/routes/Panorama.test.ts
git commit -m "feat(app): unrealized-P/L KPI on Panorama"
```

---

## Task 12: App.svelte — "Fiyatları yenile" button + live-rate hook

**Files:**
- Modify: `app/src/App.svelte`
- Modify: `app/src/lib/settings.svelte.ts`
- Create: `app/src/lib/settings.test.ts` additions (or a new `app/src/App.test.ts`)

**Interfaces:**
- Consumes: `prices`, `refreshPrices`, `hydratePrices`, `priceApiEnabled` (Task 9).
- Produces:
  - `settings.svelte.ts` new export `applyLiveRate(usdtry: number): void` — sets `settings.rate = usdtry` and `settings.rateDate = new Date().toISOString().slice(0,10)`; does NOT write to localStorage (live rate is per-session).
  - `App.svelte` `.controls` group gains a **"Fiyatları yenile"** `<button>` shown only when `priceApiEnabled()`; label switches to "Yenileniyor…" while `prices.status === 'loading'` (button `disabled`); when `prices.asOf` is set, a `HH:MM` stamp beside it; when `prices.status === 'error'`, a small red note. `onMount` calls `hydratePrices()` (no network).
  - Button `onclick` → `refreshPrices($store.dataset)` (guarded: only when `$store.status === 'ready'`).

- [ ] **Step 1: Add `applyLiveRate` to `app/src/lib/settings.svelte.ts`**

After `initRate`:
```ts
/** Adopt a freshly fetched TCMB rate for this session (not persisted). */
export function applyLiveRate(usdtry: number): void {
  if (!Number.isFinite(usdtry) || usdtry <= 0) return
  settings.rate = usdtry
  settings.rateDate = new Date().toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Add a failing test** — new file `app/src/App.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/svelte'
import App from './App.svelte'
import { prices } from './lib/prices.svelte'

beforeEach(() => {
  vi.unstubAllEnvs()
  prices.status = 'idle'
  prices.asOf = null
})

describe('App — fiyat yenile', () => {
  it('hides the refresh button when VITE_PRICE_API is unset', () => {
    const { queryByText } = render(App)
    expect(queryByText('Fiyatları yenile')).toBeNull()
  })

  it('shows the refresh button when VITE_PRICE_API is set', () => {
    vi.stubEnv('VITE_PRICE_API', 'https://api.test')
    const { getByText } = render(App)
    expect(getByText('Fiyatları yenile')).toBeInTheDocument()
  })
})
```

**Implementer note:** `App.svelte` calls `onMount(() => load(store, source))` which kicks a `LocalFileSource` fetch; in jsdom that fetch rejects and the store lands in `status:'error'` — fine, the button's visibility depends only on `priceApiEnabled()`, not on store status. If `render(App)` throws on missing `google`/GIS globals, guard by checking `pickSource()` returns `LocalFileSource` here (no `VITE_GOOGLE_CLIENT_ID` in tests, so it does).

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd app && npm test -- App`
Expected: FAIL — "Fiyatları yenile" never present.

- [ ] **Step 4: Edit `app/src/App.svelte`**

Add imports:
```ts
import { prices, refreshPrices, hydratePrices, priceApiEnabled } from './lib/prices.svelte'
```

In the existing `onMount`, add `hydratePrices()` before `load(...)`:
```ts
  onMount(() => {
    hydratePrices()
    load(store, source)
    return onRouteChange((r) => (route = r))
  })
```

Add a derived label + handler in `<script>`:
```ts
  const priceStamp = $derived(
    prices.asOf
      ? new Date(prices.asOf).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : null,
  )
  function onRefreshPrices() {
    if ($store.status === 'ready' && $store.dataset) refreshPrices($store.dataset)
  }
```

In the `.controls` `<div>`, before the `<ThemeToggle />`, add:
```svelte
    {#if priceApiEnabled()}
      <button
        class="pricebtn"
        onclick={onRefreshPrices}
        disabled={prices.status === 'loading'}
      >
        {prices.status === 'loading' ? 'Yenileniyor…' : 'Fiyatları yenile'}
      </button>
      {#if priceStamp}<span class="stamp num">{priceStamp}</span>{/if}
      {#if prices.status === 'error'}<span class="priceerr">fiyat alınamadı</span>{/if}
    {/if}
```

Add scoped styles (plain `<style>`, Ruling P1-9):
```css
  .pricebtn {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  .pricebtn:hover:not(:disabled) { border-color: var(--gold); }
  .pricebtn:disabled { opacity: 0.6; cursor: default; }
  .priceerr { color: var(--loss); font-size: 0.75rem; }
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd app && npm test -- App`
Expected: PASS (2 tests).

- [ ] **Step 6: Full app check + build**

Run: `cd app && npm run check && npm test && npm run build`
Expected: `check` 0/0; all tests pass; build OK. Also run once with the var set to confirm no build break: `VITE_PRICE_API=https://x.test npm run build`.

- [ ] **Step 7: Commit**

```bash
git add app/src/App.svelte app/src/App.test.ts app/src/lib/settings.svelte.ts
git commit -m "feat(app): Fiyatları yenile button + live TCMB rate for TL mode"
```

---

## Task 13: `app/README.md` — P3 setup section

**Files:**
- Modify: `app/README.md`

**Interfaces:**
- Produces: a "P3 — canlı fiyat" section documenting the worker deploy + repo variable, mirroring spec §9. No code.

- [ ] **Step 1: Append to `app/README.md`** (after the existing "Enis'in bir kerelik kurulumu" list)

```markdown
## P3 — canlı fiyat (fiyat proxy'si)

Açık pozisyonlarda **Güncel Fiyat** / **Gerçekleşmemiş K/Z** ve TL modunda canlı kur için
küçük bir Cloudflare Worker gerekir (`worker/` klasörü). Kimlik/anahtar yok.

1. Ücretsiz **Cloudflare** hesabı aç.
2. `npm i -g wrangler` → `wrangler login`.
3. `cd worker && npm install && wrangler deploy` → çıkan
   `https://bbb-prices.<subdomain>.workers.dev` adresini kopyala.
4. `worker/wrangler.toml` içindeki `ALLOWED_ORIGIN`, repo adın `bbb-tracker` değilse
   `https://<kullanıcı>.github.io` olacak şekilde güncelle, tekrar `wrangler deploy`.
5. GitHub repo → Settings → Secrets and variables → **Actions → Variables** →
   `VITE_PRICE_API` = Worker URL'i.
6. Actions → son "Deploy dashboard to Pages" çalışması → **Re-run all jobs**.
7. Sitede başlıkta **"Fiyatları yenile"** düğmesi çıkar; bas → fiyatlar dolar.

Worker'ı elle doğrulamak: `cd worker && npx wrangler dev` (ayrı terminal) + `npm run smoke`.
Worker kodu değişince `wrangler deploy`'u tekrar çalıştır (CI yalnızca testini koşar, deploy etmez).
```

- [ ] **Step 2: Commit**

```bash
git add app/README.md
git commit -m "docs(app): P3 price-proxy setup steps"
```

---

## Self-Review

**Spec coverage:**
- §3 Worker (stateless, CORS, cache, no keys) → Tasks 1, 5. ✓
- §4 Yahoo single source (BIST TRY / USA USD / gold `GC=F`) → Tasks 2, 3, 5. ✓
- §5 TCMB + walk-back → Task 4; `/prices` folds `usdtry`, `/fx/latest` standalone → Task 5. ✓
- §5.1 response shapes, CORS, `?fresh=1`, `s-maxage=300`, 400/502 → Task 5. ✓
- §6.1 `prices.svelte.ts` (refresh/hydrate/priceApiEnabled/symbol collection, sessionStorage, live rate) → Task 9. ✓
- §6.2 `unrealized.ts` (BIST + gold, null-safe, total) → Task 8. ✓
- §6.3 Pozisyonlar two columns → Task 10. ✓
- §6.4 Panorama unrealized KPI (6th item; the "canlı toplam" line is explicitly YAGNI-cut in the spec) → Task 11. ✓
- §6.5 header button + stamp + hidden-when-unset + hydrate-on-load (no auto fetch) → Task 12. ✓
- §7 file structure, `.env` full-URL (no dev proxy), workflow env + worker job → Tasks 1, 7. ✓
- §8 test strategy (worker pure fns, unrealized, prices store, pages, 76 green, CI worker step) → every task + Task 7. ✓
- §9 Enis setup → Tasks 6, 13. ✓
- §10 risks — documented in spec; `altinPrim`/premium is explicitly out of scope, no task needed. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases". Task 9's "implementer note" about the fixture and Task 12's note about jsdom are concrete instructions with exact values, not deferrals. Task 9 Step 1 references `applyLiveRate` before Task 12 defines it — flagged in both places with the 3-line body inline, so an out-of-order implementer is unblocked.

**Type consistency:**
- `PriceLookup { bySymbol: Record<string,{priceUsd:number}>; usdPerGram: number|null }` — Task 8 defines, Tasks 10/11 pass `{ bySymbol: prices.bySymbol, usdPerGram: prices.usdPerGram }`. `prices.bySymbol` entries are `{price,currency,priceUsd}` — a structural superset of `{priceUsd}`, assignable. ✓
- `Unrealized { kod; guncelFiyatUsd; kzUsd; kzPct }` — Task 8 defines, Task 10 reads `.guncelFiyatUsd`/`.kzUsd`/`.kzPct`. ✓
- `prices` state shape identical across Tasks 9, 10, 11, 12. ✓
- Worker `Quote = {price,currency} | {error}` — Task 3 defines, Task 5 narrows with `'error' in q`. ✓
- `fetchUsdTry` returns `{date,usdtry}` — Task 4 defines, Task 5 uses `fx.usdtry`. ✓
- `yahooSymbolFor` (worker, Task 2) vs `apiSymbolFor` (app, Task 9) — deliberately separate implementations of the same rule in two packages; both covered by tests. Documented in Task 9 Interfaces.
- `applyLiveRate(usdtry: number): void` — Task 12 Step 1 defines, Task 9 Step 3 imports/calls. ✓

No gaps found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-04-bbb-p3-prices.md`.

Enis has delegated execution and is away. Proceeding **Subagent-Driven** (REQUIRED SUB-SKILL: superpowers:subagent-driven-development) in the existing `worktree-p1-dashboard` worktree (== `origin/main` @ `16d154a`), pushing each reviewed task to `main` as it lands.
