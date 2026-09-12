import type { Snapshot, Transaction } from './types'
import type { SaleEvent } from './ledger'
import { monthLabel } from '../format'

export interface WaterfallStep {
  label: string
  sign: '+' | '−' | '=' | '' | 'ℹ'
  tutarUsd: number
  hint?: string
  altTutarUsd?: number
  altLabel?: string
  farkUsd?: number
  farkLabel?: string
  isInfo?: boolean
}

export interface WaterfallBreakdown {
  ay: string
  ayLabel: string
  hasSnapshot: boolean
  baslangic: number
  yeniMevduat: number
  cekim: number
  gerceklesenKar: number
  snapNetKz: number
  kzFarki: number
  kzFarkiVar: boolean
  temettu: number
  vergiKomisyon: number
  degerlemeBakiye: number
  donemSonu: number
  steps: WaterfallStep[]
  monthSales: SaleEvent[]
  monthTransactions: Transaction[]
}

/**
 * Calculates monthly equity waterfall breakdown:
 * Başlangıç
 * + Yeni mevduat (netMevduatCekim_usd)
 * [− Çekim (cekim_usd) if > 0]
 * + Gerçekleşen kâr (from SaleEvents, compared to snapshot.netKZ_usd)
 * + Temettü (nakitTemettu_usd)
 * [ℹ] Vergi & komisyon (vergiKomisyon_usd — bilgi amaçlı gösterilir, net K/Z'ye dahil olduğundan ayrıca düşülmez)
 * + Değerleme (bakiye) (STRICT RESIDUAL: donemSonu - araToplam)
 * = Dönem sonu (toplamOzkaynak_usd)
 */
export function buildWaterfall(
  ay: string,
  snap: Snapshot | undefined,
  prevSnap: Snapshot | undefined,
  sales: SaleEvent[] = [],
  transactions: Transaction[] = [],
): WaterfallBreakdown | null {
  if (!snap) {
    return null
  }

  const baslangic = snap.baslangicSermayesi_usd ?? (prevSnap ? prevSnap.toplamOzkaynak_usd : 0)
  const yeniMevduat = snap.netMevduatCekim_usd ?? 0
  const cekim = snap.cekim_usd ?? 0

  const monthSales = sales.filter((s) => s.tarih.slice(0, 7) === ay)
  const gerceklesenKar = monthSales.reduce((acc, s) => acc + s.kzUsd, 0)
  const snapNetKz = snap.netKZ_usd ?? 0
  const kzFarki = gerceklesenKar - snapNetKz
  const kzFarkiVar = Math.abs(kzFarki) > 0.005

  const temettu = snap.nakitTemettu_usd ?? 0
  const vergiKomisyon = snap.vergiKomisyon_usd ?? 0
  const donemSonu = snap.toplamOzkaynak_usd

  // Değerleme: STRICT RESIDUAL
  // donemSonu = baslangic + yeniMevduat - cekim + gerceklesenKar + temettu + degerlemeBakiye
  // Note: vergiKomisyon is NOT subtracted here because snapshot.netKZ_usd (and SaleEvents realized P/L)
  // is already net of tax and commission (H4-fix).
  const araToplam = baslangic + yeniMevduat - cekim + gerceklesenKar + temettu
  const degerlemeBakiye = donemSonu - araToplam

  const monthTransactions = transactions
    .filter((t) => t.tarih.slice(0, 7) === ay)
    .sort((a, b) => (b.tarih > a.tarih ? 1 : b.tarih < a.tarih ? -1 : 0))

  const steps: WaterfallStep[] = [
    {
      label: 'Başlangıç',
      sign: '',
      tutarUsd: baslangic,
    },
    {
      label: 'Yeni mevduat',
      sign: '+',
      tutarUsd: yeniMevduat,
    },
  ]

  if (cekim > 0) {
    steps.push({
      label: 'Çekim',
      sign: '−',
      tutarUsd: cekim,
    })
  }

  steps.push({
    label: 'Gerçekleşen kâr',
    sign: gerceklesenKar >= 0 ? '+' : '−',
    tutarUsd: Math.abs(gerceklesenKar),
    altTutarUsd: kzFarkiVar ? snapNetKz : undefined,
    altLabel: kzFarkiVar ? 'Aylık rapor (netKZ)' : undefined,
    farkUsd: kzFarkiVar ? kzFarki : undefined,
    farkLabel: kzFarkiVar ? (kzFarki >= 0 ? '+ Defter fazlası' : '− Defter eksiği') : undefined,
  })

  steps.push({
    label: 'Temettü',
    sign: '+',
    tutarUsd: temettu,
  })

  steps.push({
    label: 'Vergi & komisyon',
    sign: 'ℹ',
    tutarUsd: vergiKomisyon,
    hint: "net K/Z'ye zaten dahil, ayrıca düşülmez",
    isInfo: true,
  })

  steps.push({
    label: 'Değerleme (bakiye)',
    sign: degerlemeBakiye >= 0 ? '+' : '−',
    tutarUsd: Math.abs(degerlemeBakiye),
    hint: 'aylık rapordan doğrudan gelmeyen, kapanış farkından hesaplanan kalan',
  })

  steps.push({
    label: 'Dönem sonu',
    sign: '=',
    tutarUsd: donemSonu,
  })

  return {
    ay,
    ayLabel: monthLabel(snap.tarih.slice(0, 7)),
    hasSnapshot: true,
    baslangic,
    yeniMevduat,
    cekim,
    gerceklesenKar,
    snapNetKz,
    kzFarki,
    kzFarkiVar,
    temettu,
    vergiKomisyon,
    degerlemeBakiye,
    donemSonu,
    steps,
    monthSales,
    monthTransactions,
  }
}
