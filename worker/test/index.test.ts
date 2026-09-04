import { describe, it, expect } from 'vitest'
import worker from '../src/index'

const env = { ALLOWED_ORIGIN: 'https://example.test' }
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

describe('worker routing', () => {
  it('GET /health → 200 {ok:true} with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/health'), env, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('OPTIONS → 204 with CORS', async () => {
    const res = await worker.fetch(new Request('https://w/prices', { method: 'OPTIONS' }), env, ctx)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('unknown route → 404 {error}', async () => {
    const res = await worker.fetch(new Request('https://w/nope'), env, ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'bilinmeyen uç' })
  })
})
