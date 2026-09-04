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
})
