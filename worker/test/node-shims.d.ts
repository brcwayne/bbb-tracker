// Minimal ambient shims so `npx tsc --noEmit` passes without pulling in @types/node.
// The Worker runtime never uses these; they exist only for the test that reads a
// fixture file from disk (Node/Vitest environment).

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}

// `@cloudflare/workers-types` declares a global `ImportMeta` without `url`;
// merge the Node/ESM `url` field back in for the fixture-path resolution.
interface ImportMeta {
  url: string
}
