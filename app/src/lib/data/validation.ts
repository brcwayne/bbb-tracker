import type { Transaction, AssetTransfer } from './types'
import { buildLedger } from './ledger'

export interface ScopeAlternative {
  scope: string
  availableLot: number
}

export interface ScopeWarning {
  kind: 'portfoy' | 'hesap'
  currentScope: string
  currentLot: number
  requestedLot: number
  alternative?: ScopeAlternative
  mesaj: string
}

export interface SaleValidationResult {
  valid: boolean
  warnings: ScopeWarning[]
  portfoyWarning?: ScopeWarning
  hesapWarning?: ScopeWarning
}

export function formatLot(n: number): string {
  return Number(n.toFixed(6)).toLocaleString('tr-TR', { maximumFractionDigits: 6 })
}

export function secButtonLabel(scope: string): string {
  const vowels = ['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü']
  const lower = scope.toLowerCase()
  let lastVowel = ''
  for (let i = lower.length - 1; i >= 0; i--) {
    if (vowels.includes(lower[i])) {
      lastVowel = lower[i]
      break
    }
  }
  const endsWithVowel = vowels.includes(lower[lower.length - 1])
  let suffix = ''
  if (['a', 'ı'].includes(lastVowel)) {
    suffix = endsWithVowel ? "'yı seç" : "'ı seç"
  } else if (['e', 'i'].includes(lastVowel)) {
    suffix = endsWithVowel ? "'yi seç" : "'i seç"
  } else if (['o', 'u'].includes(lastVowel)) {
    suffix = endsWithVowel ? "'yu seç" : "'u seç"
  } else if (['ö', 'ü'].includes(lastVowel)) {
    suffix = endsWithVowel ? "'yü seç" : "'ü seç"
  } else {
    suffix = "'i seç"
  }
  return `${scope}${suffix}`
}

/**
 * Validates whether the selected portfolio and broker have sufficient lots for a SAT transaction.
 * Uses buildLedger(..., 'portfoy') and buildLedger(..., 'hesap') directly.
 */
export function validateSaleScope(
  txns: Transaction[],
  transfers: AssetTransfer[],
  enstruman: string,
  lotNum: number,
  portfoy: string,
  hesap: string,
): SaleValidationResult {
  const warnings: ScopeWarning[] = []
  let portfoyWarning: ScopeWarning | undefined
  let hesapWarning: ScopeWarning | undefined

  if (!enstruman || lotNum <= 0) {
    return { valid: true, warnings }
  }

  const portLedger = buildLedger(txns, transfers, 'portfoy')
  const hesapLedger = buildLedger(txns, transfers, 'hesap')

  // 1) Portföy check
  if (portfoy) {
    const portScope = portLedger.byScope.get(portfoy)
    const curLot = portScope?.open.find((p) => p.kod === enstruman)?.lot ?? 0
    if (curLot + 1e-9 < lotNum) {
      const alternatives = Array.from(portLedger.byScope.entries())
        .filter(([key]) => key !== portfoy && key !== '')
        .map(([key, s]) => ({
          scope: key,
          availableLot: s.open.find((p) => p.kod === enstruman)?.lot ?? 0,
        }))
        .filter((a) => a.availableLot > 0)
        .sort((a, b) => b.availableLot - a.availableLot)

      const alt = alternatives[0]
      let mesaj = ''
      if (alt) {
        if (curLot <= 0) {
          mesaj = `⚠ ${portfoy} portföyünde ${enstruman} yok. ${alt.scope} portföyünde ${formatLot(alt.availableLot)} lot var.`
        } else {
          mesaj = `⚠ ${portfoy} portföyünde yeterli ${enstruman} yok (${formatLot(curLot)} lot var, istenen: ${formatLot(lotNum)}). ${alt.scope} portföyünde ${formatLot(alt.availableLot)} lot var.`
        }
      } else {
        if (curLot <= 0) {
          mesaj = `⚠ ${portfoy} portföyünde ${enstruman} yok.`
        } else {
          mesaj = `⚠ ${portfoy} portföyünde yeterli ${enstruman} yok (${formatLot(curLot)} lot var, istenen: ${formatLot(lotNum)}).`
        }
      }

      portfoyWarning = {
        kind: 'portfoy',
        currentScope: portfoy,
        currentLot: curLot,
        requestedLot: lotNum,
        alternative: alt,
        mesaj,
      }
      warnings.push(portfoyWarning)
    }
  }

  // 2) Kurum (hesap) check
  if (hesap) {
    const hesapScope = hesapLedger.byScope.get(hesap)
    const curLot = hesapScope?.open.find((p) => p.kod === enstruman)?.lot ?? 0
    if (curLot + 1e-9 < lotNum) {
      const alternatives = Array.from(hesapLedger.byScope.entries())
        .filter(([key]) => key !== hesap && key !== '')
        .map(([key, s]) => ({
          scope: key,
          availableLot: s.open.find((p) => p.kod === enstruman)?.lot ?? 0,
        }))
        .filter((a) => a.availableLot > 0)
        .sort((a, b) => b.availableLot - a.availableLot)

      const alt = alternatives[0]
      let mesaj = ''
      if (alt) {
        if (curLot <= 0) {
          mesaj = `⚠ ${hesap} kurumunda ${enstruman} yok. ${alt.scope} kurumunda ${formatLot(alt.availableLot)} lot var.`
        } else {
          mesaj = `⚠ ${hesap} kurumunda yeterli ${enstruman} yok (${formatLot(curLot)} lot var, istenen: ${formatLot(lotNum)}). ${alt.scope} kurumunda ${formatLot(alt.availableLot)} lot var.`
        }
      } else {
        if (curLot <= 0) {
          mesaj = `⚠ ${hesap} kurumunda ${enstruman} yok.`
        } else {
          mesaj = `⚠ ${hesap} kurumunda yeterli ${enstruman} yok (${formatLot(curLot)} lot var, istenen: ${formatLot(lotNum)}).`
        }
      }

      hesapWarning = {
        kind: 'hesap',
        currentScope: hesap,
        currentLot: curLot,
        requestedLot: lotNum,
        alternative: alt,
        mesaj,
      }
      warnings.push(hesapWarning)
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    portfoyWarning,
    hesapWarning,
  }
}
