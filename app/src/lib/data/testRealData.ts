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
  const canonicalName = name.replace('.json', '_canonical.json')
  const fixturePath = path.resolve(process.cwd(), '../bbb-telegram-bot/tests/fixtures', canonicalName)
  if (fs.existsSync(fixturePath)) {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as T
  }
  const canonicalPath = path.join(DATA_DIR, canonicalName)
  if (fs.existsSync(canonicalPath)) {
    return JSON.parse(fs.readFileSync(canonicalPath, 'utf-8')) as T
  }
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf-8')) as T
}

export function loadRealData<T = unknown>(name: string): T {
  return readJson<T>(name)
}
