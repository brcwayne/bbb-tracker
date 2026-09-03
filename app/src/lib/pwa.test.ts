import { describe, it, expect } from 'vitest'
import { manifest, workbox } from '../../pwa.config'

describe('PWA manifest', () => {
  it('is a standalone, Turkish-language app', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('tr')
  })

  it('ships three icons including a maskable one', () => {
    expect(manifest.icons.length).toBe(3)
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })
})

describe('PWA workbox — user data is never cached', () => {
  it('serves local data/*.json with NetworkOnly', () => {
    const rule = workbox.runtimeCaching?.find((r) => String(r.urlPattern).includes('data'))
    expect(rule?.handler).toBe('NetworkOnly')
  })

  it('serves Google API / auth domains with NetworkOnly', () => {
    const rule = workbox.runtimeCaching?.find((r) => String(r.urlPattern).includes('google'))
    expect(rule?.handler).toBe('NetworkOnly')
  })
})
