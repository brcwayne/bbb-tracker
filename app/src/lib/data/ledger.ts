import type { Transaction, AssetTransfer } from './types'
import type { OpenPosition } from './derive'

/** Defterin hangi boyutta tutulacağı. 'global' = sembol bazlı (bugünkü derivePositions). */
export type ScopeKind = 'global' | 'portfoy' | 'hesap'

/** Bir SAT işleminin gerçekleşen kâr/zararı — her satış için TEK kayıt. */
export interface SaleEvent {
  /** Kaynak Transaction.id — Log sayfasından eşleme için. */
  txId: string
  tarih: string
  kod: string
  hesap: string
  portfoy: string
  /** Bu satışta çıkan lot (aşırı satış kırpılmışsa kırpılmış hali). */
  lot: number
  satisFiyatUsd: number
  /** Satış anındaki ortalama maliyet (USD/lot). */
  ortMaliyetUsd: number
  /** lot × ortMaliyetUsd */
  maliyetUsd: number
  /** lot × satisFiyatUsd − komisyonUsd */
  hasilatUsd: number
  komisyonUsd: number
  /** hasilatUsd − maliyetUsd. derive.ts'teki formülle BİREBİR aynı sonucu vermeli. */
  kzUsd: number
  /** maliyetUsd > 0 ise kzUsd / maliyetUsd, değilse null. */
  kzPct: number | null
  /** Satıştan SONRA bu kapsamda kalan lot. */
  kalanLot: number
  /** kalanLot <= EPS → pozisyon bu satışla tamamen kapandı. */
  pozisyonKapandi: boolean
  /** Bu kapsamdaki ilk AL tarihi (pozisyon kapanınca sıfırlanır). */
  ilkAlisTarih: string
  /** ilkAlisTarih → tarih arası gün sayısı; hesaplanamıyorsa null. */
  tutmaGunu: number | null
  /** Satış için başka portföyden ödünç lot alınıp alınmadığı. */
  oduncAlindi: boolean
}

export interface ScopeLedger {
  /** 'global' için ''; diğerlerinde portföy/hesap kodu. */
  scope: string
  open: OpenPosition[]
  sales: SaleEvent[]
  realizedUsd: number
  /** Bu kapsamda şimdiye kadar yapılmış TÜM alımların net maliyeti (devreden sermaye ölçüsü). */
  toplamAlimMaliyetiUsd: number
  /** Açık pozisyon maliyetinin zaman-ağırlıklı ortalaması (ilk işlemden bugüne). G7 kullanır. */
  ortKullanilanSermayeUsd: number
  /** İlk işlem tarihi → bugün arası gün sayısı. */
  gunSayisi: number
}

export interface LedgerResult {
  /** scope → defter. 'global' kipinde tek anahtar: ''. */
  byScope: Map<string, ScopeLedger>
  /** Tüm kapsamlardaki satışlar, tarih sırasında. */
  allSales: SaleEvent[]
  errors: string[]
}

const EPS = 1e-9

export function parseDays(iso?: string | null): number {
  if (!iso || typeof iso !== 'string') return 0
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y || 1970, (m || 1) - 1, d || 1) / 86400000)
}

export function dayDiff(d1?: string | null, d2?: string | null): number {
  if (!d1 || !d2) return 0
  return parseDays(d2) - parseDays(d1)
}

interface PosState {
  kod: string
  lot: number
  ortMaliyetUsd: number
  toplamMaliyetUsd: number
  ilkAlisTarih: string
}

interface ScopeState {
  scope: string
  positions: Map<string, PosState>
  sales: SaleEvent[]
  realizedUsd: number
  toplamAlimMaliyetiUsd: number
  firstEventDate: string | null
  timeline: { tarih: string; cost: number }[]
}

export function buildLedger(
  txns: Transaction[],
  transfers: AssetTransfer[] = [],
  kind: ScopeKind = 'global',
  today?: Date,
): LedgerResult {
  const todayDate = today ?? new Date()
  const todayIso = todayDate.toISOString().slice(0, 10)

  type RawEvent =
    | { kind: 'txn'; raw: Transaction; tarih: string; id: string }
    | { kind: 'transfer'; raw: AssetTransfer; tarih: string; id: string }

  const events: RawEvent[] = [
    ...txns.map((t) => ({ kind: 'txn' as const, raw: t, tarih: t.tarih, id: t.id })),
    ...(kind === 'global' ? [] : transfers).map((tr) => ({
      kind: 'transfer' as const,
      raw: tr,
      tarih: tr.tarih,
      id: tr.id,
    })),
  ]

  events.sort((a, b) => {
    if (a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1
    if (a.kind !== b.kind) return a.kind === 'txn' ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const scopes = new Map<string, ScopeState>()

  function getScope(name: string): ScopeState {
    let s = scopes.get(name)
    if (!s) {
      s = {
        scope: name,
        positions: new Map(),
        sales: [],
        realizedUsd: 0,
        toplamAlimMaliyetiUsd: 0,
        firstEventDate: null,
        timeline: [],
      }
      scopes.set(name, s)
    }
    return s
  }

  function getPos(scope: ScopeState, kod: string): PosState {
    let p = scope.positions.get(kod)
    if (!p) {
      p = { kod, lot: 0, ortMaliyetUsd: 0, toplamMaliyetUsd: 0, ilkAlisTarih: '' }
      scope.positions.set(kod, p)
    }
    return p
  }

  function computeTotalCost(scope: ScopeState): number {
    let sum = 0
    for (const p of scope.positions.values()) {
      if (p.lot > EPS) {
        sum += p.toplamMaliyetUsd
      }
    }
    return sum
  }

  if (kind === 'global') {
    getScope('')
  }

  const allSales: SaleEvent[] = []
  const errors: string[] = []

  for (const e of events) {
    if (e.kind === 'txn') {
      const t = e.raw
      const scopeName = kind === 'global' ? '' : kind === 'portfoy' ? t.portfoy : t.hesap
      const scope = getScope(scopeName)
      if (!scope.firstEventDate) {
        scope.firstEventDate = t.tarih
      }

      const pos = getPos(scope, t.enstruman)

      if (t.yon === 'AL') {
        pos.toplamMaliyetUsd += t.net_usd
        pos.lot += t.lot
        pos.ortMaliyetUsd = pos.lot > EPS ? pos.toplamMaliyetUsd / pos.lot : 0
        if (!pos.ilkAlisTarih) {
          pos.ilkAlisTarih = t.tarih
        }
        scope.toplamAlimMaliyetiUsd += t.net_usd
        scope.timeline.push({ tarih: t.tarih, cost: computeTotalCost(scope) })
      } else {
        let sell = t.lot
        let wasBorrowed = false

        if (sell > pos.lot + EPS && kind === 'portfoy') {
          // (2) Ödünç alınacak portföyü Map sırasına göre değil, o sembolü en çok lotla tutan
          // portföye göre seç (deterministik ve anlamlı olsun). Eşitlikte ada göre alfabetik.
          const candidates: { name: string; scope: ScopeState; pos: PosState }[] = []
          for (const [otherName, otherScope] of scopes) {
            if (otherName === scopeName) continue
            const otherPos = otherScope.positions.get(t.enstruman)
            if (otherPos && otherPos.lot > EPS) {
              candidates.push({ name: otherName, scope: otherScope, pos: otherPos })
            }
          }
          candidates.sort((a, b) => b.pos.lot - a.pos.lot || a.name.localeCompare(b.name))

          for (const { name: verenPortfoy, scope: otherScope, pos: otherPos } of candidates) {
            if (pos.lot + EPS >= sell) break
            const borrowLot = Math.min(sell - pos.lot, otherPos.lot)
            const borrowCost = borrowLot * otherPos.ortMaliyetUsd
            otherPos.lot -= borrowLot
            otherPos.toplamMaliyetUsd -= borrowCost
            otherPos.ortMaliyetUsd = otherPos.lot > EPS ? otherPos.toplamMaliyetUsd / otherPos.lot : 0
            if (otherPos.lot <= EPS) {
              otherPos.lot = 0
              otherPos.toplamMaliyetUsd = 0
              otherPos.ortMaliyetUsd = 0
              otherPos.ilkAlisTarih = ''
            }
            pos.lot += borrowLot
            pos.toplamMaliyetUsd += borrowCost
            pos.ortMaliyetUsd = pos.lot > EPS ? pos.toplamMaliyetUsd / pos.lot : 0
            if (!pos.ilkAlisTarih) pos.ilkAlisTarih = otherPos.ilkAlisTarih || t.tarih
            otherScope.timeline.push({ tarih: t.tarih, cost: computeTotalCost(otherScope) })
            wasBorrowed = true

            // (1) Ödünç alınan her lot için errors'a şu biçimde uyarı ekle:
            // "<txId>: <KOD> <satanPortfoy> portföyünde yok, <verenPortfoy> portföyünden <lot> lot alındı — portföy etiketi hatalı olabilir"
            errors.push(
              `${t.id}: ${t.enstruman} ${scopeName} portföyünde yok, ${verenPortfoy} portföyünden ${borrowLot} lot alındı — portföy etiketi hatalı olabilir`,
            )
          }
        }

        // NOT (G11 - kind === 'hesap' değerlendirmesi):
        // 'portfoy' mantıksal/sanal bir etiketleme olduğundan portföyler arası etiket kaymaları
        // veya unutulan portföy atıfları defterde ödünç alma ile tolere edilir ve uyarılır.
        // 'hesap' (kurum) ise Takasbank/saklama nezdinde fiziksel/hukuki kurumlardır (Midas, Garanti vb.).
        // Gerçek dünyada bir kurumdaki hisse, resmi virman (AssetTransfer) kaydı olmadan başka kurumdan
        // satılamaz. Bu nedenle 'hesap' kapsamı için otomatik ödünç alma uygulanmaz; kurumda yeterli lot
        // yoksa bu durum gerçek bir virman eksikliği veya yetersiz bakiye (aşırı satış) olarak kabul edilip
        // açıkça hata olarak raporlanır.

        if (sell > pos.lot + EPS) {
          errors.push(`${t.id}: aşırı satış ${t.enstruman} (istenen ${sell}, mevcut ${pos.lot})`)
          sell = pos.lot
        }
        if (sell <= EPS) continue

        const ort = pos.ortMaliyetUsd
        const maliyetUsd = sell * ort
        const hasilatUsd = sell * t.fiyat_usd - t.komisyon_usd
        const kzUsd = hasilatUsd - maliyetUsd
        const kzPct = maliyetUsd > EPS ? kzUsd / maliyetUsd : null

        scope.realizedUsd += kzUsd
        pos.lot -= sell
        pos.toplamMaliyetUsd -= maliyetUsd
        pos.ortMaliyetUsd = pos.lot > EPS ? pos.toplamMaliyetUsd / pos.lot : 0

        const kalanLot = pos.lot > EPS ? pos.lot : 0
        const pozisyonKapandi = kalanLot <= EPS
        const ilkAlis = pos.ilkAlisTarih
        const tutmaGunu = ilkAlis ? Math.max(0, dayDiff(ilkAlis, t.tarih)) : null

        if (pozisyonKapandi) {
          pos.lot = 0
          pos.toplamMaliyetUsd = 0
          pos.ortMaliyetUsd = 0
          pos.ilkAlisTarih = ''
        }

        const saleEvent: SaleEvent = {
          txId: t.id,
          tarih: t.tarih,
          kod: t.enstruman,
          hesap: t.hesap,
          portfoy: t.portfoy,
          lot: sell,
          satisFiyatUsd: t.fiyat_usd,
          ortMaliyetUsd: ort,
          maliyetUsd,
          hasilatUsd,
          komisyonUsd: t.komisyon_usd,
          kzUsd,
          kzPct,
          kalanLot,
          pozisyonKapandi,
          ilkAlisTarih: ilkAlis,
          tutmaGunu,
          oduncAlindi: wasBorrowed,
        }

        scope.sales.push(saleEvent)
        allSales.push(saleEvent)
        scope.timeline.push({ tarih: t.tarih, cost: computeTotalCost(scope) })
      }
    } else {
      // Transfer event (only reached if kind !== 'global')
      const tr = e.raw
      const srcScopeName = kind === 'portfoy' ? tr.kaynakPortfoy ?? '' : tr.kaynakHesap
      const dstScopeName = kind === 'portfoy' ? tr.hedefPortfoy : tr.hedefHesap

      // kind === 'portfoy' iken hedefPortfoy == null olan transfer portföyü değiştirmez -> kaynak kapsamda bırak
      if (dstScopeName == null) continue
      if (srcScopeName === dstScopeName) continue

      const srcScope = getScope(srcScopeName)
      const dstScope = getScope(dstScopeName)

      if (!srcScope.firstEventDate) srcScope.firstEventDate = tr.tarih
      if (!dstScope.firstEventDate) dstScope.firstEventDate = tr.tarih

      const srcPos = getPos(srcScope, tr.enstruman)
      const dstPos = getPos(dstScope, tr.enstruman)

      const moveLot = Math.min(tr.lot, srcPos.lot > EPS ? srcPos.lot : tr.lot)
      const moveCost = srcPos.lot > EPS ? srcPos.ortMaliyetUsd * moveLot : 0

      if (srcPos.lot > EPS) {
        srcPos.lot -= moveLot
        srcPos.toplamMaliyetUsd -= moveCost
        srcPos.ortMaliyetUsd = srcPos.lot > EPS ? srcPos.toplamMaliyetUsd / srcPos.lot : 0
        if (srcPos.lot <= EPS) {
          srcPos.lot = 0
          srcPos.toplamMaliyetUsd = 0
          srcPos.ortMaliyetUsd = 0
          srcPos.ilkAlisTarih = ''
        }
      }

      if (!dstPos.ilkAlisTarih) {
        dstPos.ilkAlisTarih = srcPos.ilkAlisTarih || tr.tarih
      }
      dstPos.lot += moveLot
      dstPos.toplamMaliyetUsd += moveCost
      dstPos.ortMaliyetUsd = dstPos.lot > EPS ? dstPos.toplamMaliyetUsd / dstPos.lot : 0

      dstScope.toplamAlimMaliyetiUsd += moveCost

      srcScope.timeline.push({ tarih: tr.tarih, cost: computeTotalCost(srcScope) })
      dstScope.timeline.push({ tarih: tr.tarih, cost: computeTotalCost(dstScope) })
    }
  }

  // Finalize ScopeLedger for each scope
  const byScope = new Map<string, ScopeLedger>()

  for (const [scopeName, s] of scopes) {
    const open: OpenPosition[] = [...s.positions.values()]
      .filter((p) => p.lot > EPS)
      .map((p) => ({
        kod: p.kod,
        lot: p.lot,
        ortMaliyetUsd: p.ortMaliyetUsd,
        toplamMaliyetUsd: p.toplamMaliyetUsd,
      }))
      .sort((a, b) => (a.kod < b.kod ? -1 : 1))

    let ortKullanilanSermayeUsd = 0
    let gunSayisi = 0

    if (s.firstEventDate) {
      gunSayisi = Math.max(0, dayDiff(s.firstEventDate, todayIso))
      const effectiveDays = gunSayisi < 1 ? 1 : gunSayisi

      if (s.timeline.length > 0) {
        // Group points by date (end-of-day cost wins)
        const dailyPoints: { tarih: string; cost: number }[] = []
        for (const pt of s.timeline) {
          const last = dailyPoints[dailyPoints.length - 1]
          if (last && last.tarih === pt.tarih) {
            last.cost = pt.cost
          } else {
            dailyPoints.push({ tarih: pt.tarih, cost: pt.cost })
          }
        }

        let integral = 0
        for (let i = 0; i < dailyPoints.length; i++) {
          const cur = dailyPoints[i]
          const nextDate = i + 1 < dailyPoints.length ? dailyPoints[i + 1].tarih : todayIso
          const deltaDays = Math.max(0, dayDiff(cur.tarih, nextDate))
          integral += cur.cost * deltaDays
        }

        if (gunSayisi === 0) {
          const lastCost = dailyPoints[dailyPoints.length - 1]?.cost ?? 0
          integral = lastCost * 1
        }

        ortKullanilanSermayeUsd = integral / effectiveDays
      }
    }

    byScope.set(scopeName, {
      scope: scopeName,
      open,
      sales: s.sales,
      realizedUsd: s.realizedUsd,
      toplamAlimMaliyetiUsd: s.toplamAlimMaliyetiUsd,
      ortKullanilanSermayeUsd,
      gunSayisi,
    })
  }

  return {
    byScope,
    allSales,
    errors,
  }
}
