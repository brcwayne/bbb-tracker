import type { Snapshot, Transaction } from './types'
import type { SaleEvent } from './ledger'
import type { AylikSermaye } from './equityCurve'
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

function isAylikSermaye(obj: unknown): obj is AylikSermaye {
  return obj != null && typeof (obj as AylikSermaye).sermaye === 'number'
}

/**
 * Calculates monthly equity waterfall breakdown rewired onto the ledger equity curve.
 *
 * In a ledger-derived equity curve series (AylikSermaye), the waterfall items:
 * Başlangıç + Yeni mevduat − Çekim + Gerçekleşen kâr + Temettü
 * sum EXACTLY to the period end (Dönem sonu).
 * Consequently, Değerleme (bakiye) is strictly ZERO; any non-zero residual indicates a bug.
 */
export function buildWaterfall(
  ay: string,
  cur: AylikSermaye | Snapshot | undefined,
  prev: AylikSermaye | Snapshot | undefined,
  snapOrSales?: Snapshot | SaleEvent[],
  salesOrTxns?: SaleEvent[] | Transaction[],
  txns?: Transaction[],
): WaterfallBreakdown | null {
  if (!cur) {
    return null
  }

  let snap: Snapshot | undefined
  let sales: SaleEvent[] = []
  let transactions: Transaction[] = []

  if (Array.isArray(snapOrSales)) {
    sales = snapOrSales
    transactions = (salesOrTxns as Transaction[]) ?? []
    snap = isAylikSermaye(cur) ? undefined : (cur as Snapshot)
  } else {
    snap = snapOrSales
    sales = (salesOrTxns as SaleEvent[]) ?? []
    transactions = txns ?? []
    if (!snap && !isAylikSermaye(cur)) {
      snap = cur as Snapshot
    }
  }

  let baslangic = 0
  let yeniMevduat = 0
  let cekim = 0
  let gerceklesenKar = 0
  let temettu = 0
  let donemSonu = 0

  if (isAylikSermaye(cur)) {
    const prevSermaye = prev && isAylikSermaye(prev) ? prev : undefined
    baslangic = prevSermaye ? prevSermaye.sermaye : 0
    yeniMevduat = Math.round((cur.mevduatKumulatif - (prevSermaye ? prevSermaye.mevduatKumulatif : 0)) * 100) / 100
    cekim = Math.round((cur.cekimKumulatif - (prevSermaye ? prevSermaye.cekimKumulatif : 0)) * 100) / 100
    gerceklesenKar = Math.round((cur.gerceklesenKzKumulatif - (prevSermaye ? prevSermaye.gerceklesenKzKumulatif : 0)) * 100) / 100
    temettu = Math.round((cur.temettuKumulatif - (prevSermaye ? prevSermaye.temettuKumulatif : 0)) * 100) / 100
    donemSonu = cur.sermaye
  } else {
    // Legacy Snapshot fallback
    const snapCur = cur as Snapshot
    const snapPrev = prev as Snapshot | undefined
    baslangic = snapCur.baslangicSermayesi_usd ?? (snapPrev ? snapPrev.toplamOzkaynak_usd : 0)
    yeniMevduat = snapCur.netMevduatCekim_usd ?? 0
    cekim = snapCur.cekim_usd ?? 0
    const mSales = sales.filter((s) => s.tarih.slice(0, 7) === ay)
    gerceklesenKar = mSales.reduce((acc, s) => acc + s.kzUsd, 0)
    temettu = snapCur.nakitTemettu_usd ?? 0
    donemSonu = snapCur.toplamOzkaynak_usd
    if (!snap) snap = snapCur
  }

  // Değerleme (bakiye) = donemSonu - araToplam
  const araToplam = Math.round((baslangic + yeniMevduat - cekim + gerceklesenKar + temettu) * 100) / 100
  const degerlemeBakiye = Math.round((donemSonu - araToplam) * 100) / 100

  const snapNetKz = snap?.netKZ_usd ?? 0
  const kzFarki = snap != null ? gerceklesenKar - snapNetKz : 0
  const kzFarkiVar = snap != null && Math.abs(kzFarki) > 0.005
  const vergiKomisyon = snap?.vergiKomisyon_usd ?? 0

  const monthSales = sales.filter((s) => s.tarih.slice(0, 7) === ay)
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
    hint: isAylikSermaye(cur)
      ? 'defter bazlı seride kalemler toplamı dönem sonuna tam eşittir'
      : 'aylık rapordan doğrudan gelmeyen, kapanış farkından hesaplanan kalan',
  })

  steps.push({
    label: 'Dönem sonu',
    sign: '=',
    tutarUsd: donemSonu,
  })

  return {
    ay,
    ayLabel: monthLabel(ay),
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
