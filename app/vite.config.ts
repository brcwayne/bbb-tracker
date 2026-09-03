import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest, workbox } from './pwa.config'

export default defineConfig({
  // Dev/preview + relative builds use './'. On GitHub Actions the app is served
  // from a repo sub-path (https://<user>.github.io/bbb-tracker/), so assets need
  // an absolute base. If the repo is NOT named `bbb-tracker`, change '/bbb-tracker/'
  // here and the URL in app/README.md (Enis kurulumu, adım 6).
  base: process.env.GITHUB_ACTIONS ? '/bbb-tracker/' : './',
  plugins: [
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
