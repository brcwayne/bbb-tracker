import { describe, it, expect, beforeEach } from 'vitest'
import { currentRoute, ROUTES } from './router'

beforeEach(() => { location.hash = '' })

describe('router', () => {
  it('defaults to panorama', () => expect(currentRoute()).toBe('panorama'))
  it('maps known hashes', () => {
    location.hash = '#/pozisyonlar'; expect(currentRoute()).toBe('pozisyonlar')
    location.hash = '#/aylik'; expect(currentRoute()).toBe('aylik')
  })
  it('unknown hash -> panorama', () => { location.hash = '#/zzz'; expect(currentRoute()).toBe('panorama') })
  it('exposes 8 routes', () => expect(ROUTES.length).toBe(8))
  it('maps the new P1.6 hashes', () => {
    location.hash = '#/portfoyler'
    expect(currentRoute()).toBe('portfoyler')
    location.hash = '#/kurumlar'
    expect(currentRoute()).toBe('kurumlar')
    location.hash = '#/banka'
    expect(currentRoute()).toBe('banka')
    location.hash = '#/temettu'
    expect(currentRoute()).toBe('temettu')
    location.hash = ''
  })
  it('ROUTES has 8 entries in nav order', () => {
    expect(ROUTES.map((r) => r.id)).toEqual([
      'panorama', 'portfoyler', 'kurumlar', 'pozisyonlar', 'aylik', 'banka', 'temettu', 'ekle',
    ])
  })
  it('maps #/ekle', () => {
    location.hash = '#/ekle'
    expect(currentRoute()).toBe('ekle')
    location.hash = ''
  })
  it('ROUTES has 8 entries', () => {
    expect(ROUTES).toHaveLength(8)
    expect(ROUTES.at(-1)?.id).toBe('ekle')
  })
})
