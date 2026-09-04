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
