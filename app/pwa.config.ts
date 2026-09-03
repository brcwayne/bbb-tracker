import type { IconResource, ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa'

// App-shell PWA settings, extracted here so they can be unit-tested without
// running a full `vite build`. `vite.config.ts` imports these and hands them
// straight to `VitePWA({ manifest, workbox })`.

const icons: IconResource[] = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

export const manifest: Partial<ManifestOptions> & { icons: IconResource[] } = {
  name: 'BBB Tracker',
  short_name: 'BBB',
  lang: 'tr',
  theme_color: '#17161c',
  background_color: '#17161c',
  display: 'standalone',
  start_url: './',
  scope: './',
  icons,
}

// Precache the app shell only. Local data files and every Google endpoint are
// NetworkOnly so user data is never written to the cache.
export const workbox: VitePWAOptions['workbox'] = {
  globPatterns: ['**/*.{js,css,html,svg,woff2}'],
  navigateFallback: 'index.html',
  runtimeCaching: [
    { urlPattern: /\/data\/.*\.json$/, handler: 'NetworkOnly' },
    {
      urlPattern: /^https:\/\/(www\.googleapis\.com|accounts\.google\.com|apis\.google\.com)\//,
      handler: 'NetworkOnly',
    },
  ],
}
