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
    expect(routesFor('hesaplar')).toHaveLength(5)
    expect(HESAP_ROUTES.map((r) => r.label)).toEqual(['Hesaplar', 'Özet', 'Harcamalar', 'Taksitler', 'Borçlar'])
  })

  it('her cildin bir giriş sayfası var', () => {
    expect(FIRST_PATH).toEqual({ yatirim: '#/', hesaplar: '#/h/hesaplar' })
  })
})

describe('hesap rotaları', () => {
  it('#/h/hesaplar Hesaplar listesine gider', () => {
    location.hash = '#/h/hesaplar'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-hesaplar' })
  })

  it('#/h/hesap/NAKIT parametreyi ayrıştırır', () => {
    location.hash = '#/h/hesap/NAKIT'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-hesap', param: 'NAKIT' })
  })

  it('#/h/borclar/BORA kişiyi parametre olarak taşır', () => {
    location.hash = '#/h/borclar/BORA'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-borclar', param: 'BORA' })
  })

  it('parametresiz #/h/borclar hâlâ çalışır', () => {
    location.hash = '#/h/borclar'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-borclar' })
  })

  it('kodu olmayan #/h/hesap listeye düşer', () => {
    location.hash = '#/h/hesap'
    expect(currentRoute()).toEqual({ volume: 'hesaplar', route: 'h-hesaplar' })
  })

  it('Hesaplar defteri artık hesap listesinde açılır', () => {
    expect(FIRST_PATH.hesaplar).toBe('#/h/hesaplar')
  })

  it('sekme şeridinde beş sekme var, detay sekme değil', () => {
    const ids = routesFor('hesaplar').map((r) => r.id)
    expect(ids).toEqual(['h-hesaplar', 'h-ozet', 'h-harcamalar', 'h-taksitler', 'h-borclar'])
  })

  it('yatırım rotaları değişmedi', () => {
    location.hash = '#/pozisyonlar'
    expect(currentRoute()).toEqual({ volume: 'yatirim', route: 'pozisyonlar' })
    expect(FIRST_PATH.yatirim).toBe('#/')
  })
})

