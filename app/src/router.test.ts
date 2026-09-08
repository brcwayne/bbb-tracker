import { beforeEach, describe, expect, it } from 'vitest'
import {
  currentRoute,
  FIRST_PATH,
  HESAP_ROUTES,
  ROUTES,
  routesFor,
} from './router'

const go = (h: string) => { location.hash = h }

beforeEach(() => { location.hash = '' })

describe('router with volumes', () => {
  it('kişisel yollar hesaplar cildine çözülür', () => {
    go('#/h/ozet'); expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-ozet' })
    go('#/h/borclar'); expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-borclar' })
    go('#/h/harcamalar'); expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-harcamalar' })
    go('#/h/taksitler'); expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-taksitler' })
  })

  it('mevcut yatırım yolları aynen çalışmaya devam eder', () => {
    for (const r of ROUTES) {
      go(r.path)
      expect(currentRoute()).toEqual({ volume: 'yatirim', route: r.id })
    }
  })

  it('bilinmeyen adres panoramaya düşer', () => {
    go('#/yok-boyle-bir-sey')
    expect(currentRoute()).toEqual({ volume: 'yatirim', route: 'panorama' })
  })

  it('sekme şeridi cilde göre değişir', () => {
    expect(routesFor('yatirim')).toHaveLength(9)
    expect(routesFor('hesaplar')).toHaveLength(4)
    expect(HESAP_ROUTES.map((r) => r.label)).toEqual(['Özet', 'Harcamalar', 'Taksitler', 'Borçlar'])
  })

  it('her cildin bir giriş sayfası var', () => {
    expect(FIRST_PATH).toEqual({ yatirim: '#/', hesaplar: '#/h/ozet' })
  })
})
