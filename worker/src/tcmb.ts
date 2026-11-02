export function parseCurrencyBuying(xml: string, code: string): number | null {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<Currency\\b[^>]*Kod="${escaped}"[^>]*>([\\s\\S]*?)<\\/Currency>`)
  const block = xml.match(re)
  if (!block) return null
  const m = block[1].match(/<ForexBuying>([\d.]+)<\/ForexBuying>/)
  if (!m) return null
  const unitMatch = block[1].match(/<Unit>(\d+)<\/Unit>/)
  const unit = unitMatch ? Number(unitMatch[1]) : 1
  const n = Number(m[1]) / (Number.isFinite(unit) && unit > 0 ? unit : 1)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseUsdBuying(xml: string): number | null {
  return parseCurrencyBuying(xml, 'USD')
}

export function parseTcmbRates(xml: string): Record<string, number> | null {
  const usd = parseCurrencyBuying(xml, 'USD')
  if (usd == null) return null
  const rates: Record<string, number> = { TRY: 1, USD: usd }
  const re = /<Currency\b[^>]*Kod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    const code = match[1]
    const body = match[2]
    const m = body.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/)
    if (!m) continue
    const unitMatch = body.match(/<Unit>(\d+)<\/Unit>/)
    const unit = unitMatch ? Number(unitMatch[1]) : 1
    const val = Number(m[1]) / (Number.isFinite(unit) && unit > 0 ? unit : 1)
    if (Number.isFinite(val) && val > 0) {
      rates[code] = val
    }
  }
  return rates
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

export interface TcmbFxSnapshot {
  date: string
  usdtry: number
  eurtry: number | null
  rates: Record<string, number>
}

export async function fetchTcmbRates(
  fetchImpl: typeof fetch = fetch,
  today: Date = new Date(),
): Promise<TcmbFxSnapshot> {
  const attempts: { url: string; date: string }[] = [
    { url: 'https://www.tcmb.gov.tr/kurlar/today.xml', date: iso(today) },
  ]
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    attempts.push({ url: datedUrl(d), date: iso(d) })
  }
  const useSignal = fetchImpl === fetch && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
  for (const a of attempts) {
    try {
      const res = useSignal
        ? await fetchImpl(a.url, { signal: AbortSignal.timeout(8000) })
        : await fetchImpl(a.url)
      if (!res.ok) continue
      const rates = parseTcmbRates(await res.text())
      if (rates && rates.USD > 0) {
        return {
          date: a.date,
          usdtry: rates.USD,
          eurtry: rates.EUR ?? null,
          rates,
        }
      }
    } catch {
      /* next */
    }
  }
  throw new Error('TCMB kuru alınamadı')
}

export async function fetchUsdTry(
  fetchImpl: typeof fetch = fetch,
  today: Date = new Date(),
): Promise<{ date: string; usdtry: number }> {
  const snap = await fetchTcmbRates(fetchImpl, today)
  return { date: snap.date, usdtry: snap.usdtry }
}
