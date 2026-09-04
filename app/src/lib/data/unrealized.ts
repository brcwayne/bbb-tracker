import type { OpenPosition } from './derive'
import type { Instrument } from './types'

export interface PriceLookup {
  bySymbol: Record<string, { priceUsd: number | null }>
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
