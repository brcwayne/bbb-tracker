import type { OpenPosition } from './derive'
import type { Instrument } from './types'

export interface PriceLookup {
  bySymbol: Record<string, { priceUsd: number | null }>
  usdPerGram: number | null
  usdPerSilverGram?: number | null
}

const TROY_OUNCE_GRAMS = 31.1034768

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
  if (inst.fiyatKaynagi === 'gumus-turev') {
    const silverGram =
      p.usdPerSilverGram ??
      (p.bySymbol['SI=F']?.priceUsd != null ? p.bySymbol['SI=F'].priceUsd / TROY_OUNCE_GRAMS : null)
    if (silverGram == null) return null
    return silverGram * (inst.altinKatsayi ?? 1)
  }
  const hit = p.bySymbol[inst.fiyatSembolu]
  return hit && hit.priceUsd != null ? hit.priceUsd : null
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
