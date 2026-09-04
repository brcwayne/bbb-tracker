export interface Env {
  ALLOWED_ORIGIN: string
}

function cors(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) },
  })
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })

    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true }, 200, origin)

    return json({ error: 'bilinmeyen uç' }, 404, origin)
  },
}
