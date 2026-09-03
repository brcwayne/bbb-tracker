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
  it('exposes 3 routes', () => expect(ROUTES.map((r) => r.id)).toEqual(['panorama', 'pozisyonlar', 'aylik']))
})
