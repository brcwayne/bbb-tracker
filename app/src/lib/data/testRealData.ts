// Test-only helper for the handful of tests that regression-check computed
// numbers against Enis's real financial data (`data/*.json` at the repo
// root). That directory is intentionally gitignored — it never exists in CI
// — so these files must be read via plain `fs` at test runtime rather than
// a static/dynamic ES import, which Vite would otherwise try to resolve at
// build time and fail the whole test file on. Gate any such test with
// `describe.skipIf(!hasRealData())` so CI skips it instead of crashing.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), '../data')

export function hasRealData(): boolean {
  return fs.existsSync(path.join(DATA_DIR, 'transactions.json'))
}

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf-8')) as T
}

export function loadRealData<T = unknown>(name: string): T {
  return readJson<T>(name)
}
