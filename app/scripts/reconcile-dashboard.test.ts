import { describe, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Manual check — compares dashboardTotals against the 2026-09-04 Excel screenshot.
// This test is guarded with skipIf and runs only where data/ exists (manual reconciliation, not CI).

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '../../data')

describe.skipIf(!existsSync(dataDir))('reconcile-dashboard', () => {
  it('prints the comparison table', async () => {
    const read = (n: string) => JSON.parse(readFileSync(resolve(dataDir, `${n}.json`), 'utf8'))
    const ds = {
      transactions: read('transactions'),
      cashflows: read('cashflows'),
      snapshots: read('snapshots'),
      instruments: read('instruments'),
      brokers: read('brokers'),
      portfolios: read('portfolios'),
      meta: read('meta'),
      fxrates: read('fxrates'),
    }

    const { derivePositions } = await import('../src/lib/data/derive')
    const { dashboardTotals } = await import('../src/lib/data/dashboard')

    const d = dashboardTotals(ds, derivePositions(ds.transactions), null)
    const excel = {
      toplamSermaye: 184608.62,
      icerideKalan: 119740.16,
      cekimler: 0,
      donemSonu: 304348.78,
      nakitBakiyesi: 40659.69,
    }

    console.log('\n--- Dashboard Reconciliation ---')
    for (const [k, want] of Object.entries(excel)) {
      const got = d[k as keyof typeof excel]
      console.log(k.padEnd(16), 'got', (got as number).toFixed(2).padStart(14), 'excel', want.toFixed(2).padStart(14), 'Δ', ((got as number) - want).toFixed(2))
    }
    console.log('\nNot: realized farkı (~$4k) beklenen — Excel Dashboard "Total Gain/Loss" farklı bir tabandan gelir; Stock Position mutabakatı P0\'da tamdı.')
  })

  it('validates all core anchors remain unchanged', async () => {
    const read = (n: string) => JSON.parse(readFileSync(resolve(dataDir, `${n}.json`), 'utf8'))
    const ds = {
      transactions: read('transactions'),
      cashflows: read('cashflows'),
      snapshots: read('snapshots'),
      instruments: read('instruments'),
      brokers: read('brokers'),
      portfolios: read('portfolios'),
      meta: read('meta'),
      fxrates: read('fxrates'),
    }

    const { derivePositions } = await import('../src/lib/data/derive')
    const { buildLedger } = await import('../src/lib/data/ledger')
    const { buildEquityCurve } = await import('../src/lib/data/equityCurve')
    const { buildVergiOzeti } = await import('../src/lib/data/vergi')
    const { kimlikKontrol } = await import('../src/lib/data/kimlik')

    const ledger = buildLedger(ds.transactions, [], 'enstruman')
    const positions = derivePositions(ds.transactions)

    // 1. Realized P/L: $113,704.47
    expect(positions.realizedTotalUsd).toBeCloseTo(113704.47, 2)

    // 2. Open positions: 34
    expect(positions.open.length).toBe(34)

    // 3. Open cost: $264,826.36
    const totalCost = positions.open.reduce((s: number, p: any) => s + p.toplamMaliyetUsd, 0)
    expect(totalCost).toBeCloseTo(264826.36, 2)

    // 4. Cash (displayed, total): $18,795.01
    const { cashBalanceByHesap } = await import('../src/lib/data/cashBalances')
    const brokerCash = cashBalanceByHesap(ds as any)
    const cashTotal = Object.values(brokerCash).reduce((s, v) => s + v, 0)
    expect(cashTotal).toBeCloseTo(18795.01, 2)

    // 5. Equity curve last month: $298,611.16
    const curve = buildEquityCurve(ds as any, positions.sales)
    expect(curve.at(-1)?.sermaye).toBeCloseTo(298611.16, 2)

    // 6. Identity gap: < $1
    const kimlik = kimlikKontrol(ds as any, positions.sales, positions.open, cashTotal)
    expect(Math.abs(kimlik.fark)).toBeLessThan(1)

    // 7. Vergi 2026 sales: 47, realized P/L: $113,704.47
    const vergi = buildVergiOzeti(ds as any, positions.sales, 2026)
    expect(vergi.satisSayisi).toBe(47)
    expect(vergi.gerceklesenKzUsd).toBeCloseTo(113704.47, 2)
  })
})
