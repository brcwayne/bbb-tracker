import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { SAHIPSIZ, ownerDeltas, ownerLedger } from './owners'
import { accountBalances } from './accounts'

// Same file the Python bot tests read — one fixture holds both implementations to identical output.
const cases = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/fixtures/owner_ledger_cases.json'), 'utf-8'),
).cases

describe('ownerLedger', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(ownerLedger(c.rows, c.accounts, c.people, c.today)).toEqual(c.expected)
    })
  }

  it('unknown tur is inert', () => {
    expect(ownerDeltas({ tur: 'BILINMEYEN', tutar: 5, sahip: 'A' } as any, new Set())).toEqual([])
  })

  it('empty owner falls into the sahipsiz bucket', () => {
    expect(ownerDeltas({ tur: 'GIDER', tutar: 10, sahip: '' } as any, new Set())).toEqual([[SAHIPSIZ, -10]])
  })

  it('a SAHIP_AKTARIM row changes no account balance', () => {
    const c = cases[0]
    const without = c.rows.filter((r: any) => r.tur !== 'SAHIP_AKTARIM')
    expect(accountBalances(c.rows, c.accounts, c.today)).toEqual(accountBalances(without, c.accounts, c.today))
  })
})
