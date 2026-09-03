import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest, workbox } from './pwa.config'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Dev-only: Vite's root is `app/`, so `fetch('./data/*.json')` from
// LocalFileSource would fall through to the SPA index.html (HTTP 200, HTML) and
// blow up in `res.json()`. This middleware maps `/data/*` to the repo-root
// `../data` directory so `npm run dev` can serve migration output. It is NOT a
// `public/data` copy on purpose — that would bundle real financial data into a
// local `npm run build`. `apply: 'serve'` keeps it out of every build.
const serveRepoData = {
  name: 'serve-repo-data',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/data/')) return next()
      const f = resolve(__dirname, '..', req.url.slice(1).split('?')[0])
      if (!existsSync(f)) {
        res.statusCode = 404
        return res.end('not found')
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(readFileSync(f))
    })
  },
}

export default defineConfig({
  // Dev/preview + relative builds use './'. On GitHub Actions the app is served
  // from a repo sub-path (https://<user>.github.io/bbb-tracker/), so assets need
  // an absolute base. If the repo is NOT named `bbb-tracker`, change '/bbb-tracker/'
  // here and the URL in app/README.md (Enis kurulumu, adım 6).
  base: process.env.GITHUB_ACTIONS ? '/bbb-tracker/' : './',
  plugins: [
    serveRepoData,
    svelte(),
    svelteTesting(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest,
      workbox,
    }),
  ],
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    globals: true,
    setupFiles: ['./vitest-setup.ts'],
  },
})
