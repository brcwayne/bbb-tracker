export type Volume = 'yatirim' | 'hesaplar'

export type Route =
  | 'panorama'
  | 'portfoyler'
  | 'kurumlar'
  | 'pozisyonlar'
  | 'aylik'
  | 'banka'
  | 'temettu'
  | 'ekle'
  | 'log'

export type HesapRoute = 'h-ozet' | 'h-harcamalar' | 'h-taksitler' | 'h-borclar'

export interface RouteEntry<T extends string = string> {
  id: T
  path: string
  label: string
}

export const ROUTES: RouteEntry<Route>[] = [
  { id: 'panorama', path: '#/', label: 'Panorama' },
  { id: 'portfoyler', path: '#/portfoyler', label: 'Portföyler' },
  { id: 'kurumlar', path: '#/kurumlar', label: 'Kurumlar' },
  { id: 'pozisyonlar', path: '#/pozisyonlar', label: 'Pozisyonlar' },
  { id: 'aylik', path: '#/aylik', label: 'Aylık' },
  { id: 'banka', path: '#/banka', label: 'Banka' },
  { id: 'temettu', path: '#/temettu', label: 'Temettü' },
  { id: 'ekle', path: '#/ekle', label: 'Ekle' },
  { id: 'log', path: '#/log', label: 'Log' },
]

export const HESAP_ROUTES: RouteEntry<HesapRoute>[] = [
  { id: 'h-ozet', path: '#/h/ozet', label: 'Özet' },
  { id: 'h-harcamalar', path: '#/h/harcamalar', label: 'Harcamalar' },
  { id: 'h-taksitler', path: '#/h/taksitler', label: 'Taksitler' },
  { id: 'h-borclar', path: '#/h/borclar', label: 'Borçlar' },
]

export const FIRST_PATH: Record<Volume, string> = {
  yatirim: '#/',
  hesaplar: '#/h/ozet',
}

export function routesFor(volume: Volume): RouteEntry<Route | HesapRoute>[] {
  return volume === 'hesaplar' ? HESAP_ROUTES : ROUTES
}

export interface CurrentRouteResult {
  volume: Volume
  route: Route | HesapRoute
}

export function otherVolume(v: Volume): { volume: Volume; href: string; label: string; ariaLabel: string } {
  if (v === 'yatirim') {
    return {
      volume: 'hesaplar',
      href: FIRST_PATH.hesaplar,
      label: 'Hesaplar',
      ariaLabel: 'Hesaplar defterine geç',
    }
  }
  return {
    volume: 'yatirim',
    href: FIRST_PATH.yatirim,
    label: 'Yatırım',
    ariaLabel: 'Yatırım defterine geç',
  }
}

export function currentRoute(): CurrentRouteResult {
  const h = location.hash.replace(/^#\/?/, '')

  if (h.startsWith('h/')) {
    const sub = h.slice(2).replace(/^\//, '')
    const hesapMap: Record<string, HesapRoute> = {
      ozet: 'h-ozet',
      harcamalar: 'h-harcamalar',
      taksitler: 'h-taksitler',
      borclar: 'h-borclar',
    }
    const matched = hesapMap[sub]
    if (matched) {
      return { volume: 'hesaplar', route: matched }
    }
    return { volume: 'hesaplar', route: 'h-ozet' }
  }

  const ids = ['portfoyler', 'kurumlar', 'pozisyonlar', 'aylik', 'banka', 'temettu', 'ekle', 'log'] as const
  const matched = ids.find((r) => r === h)
  return { volume: 'yatirim', route: matched ?? 'panorama' }
}

export function onRouteChange(cb: (r: CurrentRouteResult) => void): () => void {
  const h = () => cb(currentRoute())
  addEventListener('hashchange', h)
  return () => removeEventListener('hashchange', h)
}
