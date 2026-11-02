import type { Person, PersonalAccount, PersonalTx } from './types'
import { accountBalances, round2 } from './accounts'

/** Bucket for rows whose `sahip` is empty, so the invariant still holds and the gap stays attributable. */
export const SAHIPSIZ = '__sahipsiz__'

export type Money = Record<string, number>

export interface OwnerLedger {
  owners: Record<string, Money>
  ownerTotal: Money
  accountTotal: Money
  /** ownerTotal − accountTotal per currency; anything but 0 means a record is missing or orphaned. */
  gap: Money
}

const add = (m: Money, cur: string, n: number) => {
  m[cur] = (m[cur] ?? 0) + n
}

const roundMoney = (m: Money): Money =>
  Object.fromEntries(Object.entries(m).map(([c, v]) => [c, round2(v)]))

/** What one row does to owner balances (spec §3.2). */
export function ownerDeltas(row: PersonalTx, personal: Set<string>): [string, number][] {
  const owner = row.sahip || SAHIPSIZ
  switch (row.tur) {
    case 'GELIR':
    case 'DUZELTME':
      return [[owner, row.tutar]]
    case 'GIDER':
      return [[owner, -row.tutar]]
    case 'SAHIP_AKTARIM':
      return [[owner, -row.tutar], [row.karsiSahip || SAHIPSIZ, row.tutar]]
    case 'TRANSFER': {
      const src = personal.has(row.hesap)
      const dst = !!row.karsiHesap && personal.has(row.karsiHesap)
      if (src && !dst) return [[owner, -row.tutar]]
      if (dst && !src) return [[owner, row.tutar]]
      return []
    }
    default:
      return []
  }
}

export function ownerLedger(
  rows: PersonalTx[],
  accounts: PersonalAccount[],
  people: Person[],
  today: string,
): OwnerLedger {
  const accByKod = new Map(accounts.map((a) => [a.kod, a]))
  const personalByCurrency = new Map<string, Set<string>>()
  for (const a of accounts) {
    let set = personalByCurrency.get(a.paraBirimi)
    if (!set) {
      set = new Set<string>()
      personalByCurrency.set(a.paraBirimi, set)
    }
    set.add(a.kod)
  }

  const owners: Record<string, Money> = {}
  for (const p of people) if (p.aktif !== false) owners[p.kod] = {}

  for (const r of rows) {
    if (r.tarih > today || r.durum === 'planlandi' || r.durum === 'atlandi') continue
    if (r.tur === 'GELIR' || r.tur === 'GIDER' || r.tur === 'DUZELTME') {
      const acc = accByKod.get(r.hesap)
      // Spec §3.4: a known account skips rows in a foreign currency; an unknown account
      // (`!acc`) still accrues to the owner so orphaned rows surface in `gap`.
      if (acc && acc.paraBirimi !== r.paraBirimi) continue
    }
    const matchingPersonal = personalByCurrency.get(r.paraBirimi) ?? new Set<string>()
    for (const [who, d] of ownerDeltas(r, matchingPersonal)) add((owners[who] ??= {}), r.paraBirimi, d)
  }

  const ownerTotal: Money = {}
  for (const m of Object.values(owners)) for (const [c, v] of Object.entries(m)) add(ownerTotal, c, v)

  const accountTotal: Money = {}
  const bal = accountBalances(rows, accounts, today)
  for (const a of accounts) add(accountTotal, a.paraBirimi, bal.get(a.kod) ?? 0)

  const gap: Money = {}
  for (const c of new Set([...Object.keys(ownerTotal), ...Object.keys(accountTotal)])) {
    gap[c] = round2((ownerTotal[c] ?? 0) - (accountTotal[c] ?? 0))
  }

  return {
    owners: Object.fromEntries(Object.entries(owners).map(([k, m]) => [k, roundMoney(m)])),
    ownerTotal: roundMoney(ownerTotal),
    accountTotal: roundMoney(accountTotal),
    gap,
  }
}
