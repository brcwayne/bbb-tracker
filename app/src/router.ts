export type Route =
  | 'panorama'
  | 'portfoyler'
  | 'kurumlar'
  | 'pozisyonlar'
  | 'aylik'
  | 'banka'
  | 'temettu'

export const ROUTES: { id: Route; path: string; label: string }[] = [
  { id: 'panorama', path: '#/', label: 'Panorama' },
  { id: 'portfoyler', path: '#/portfoyler', label: 'Portföyler' },
  { id: 'kurumlar', path: '#/kurumlar', label: 'Kurumlar' },
  { id: 'pozisyonlar', path: '#/pozisyonlar', label: 'Pozisyonlar' },
  { id: 'aylik', path: '#/aylik', label: 'Aylık' },
  { id: 'banka', path: '#/banka', label: 'Banka' },
  { id: 'temettu', path: '#/temettu', label: 'Temettü' },
]

export function currentRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const ids = ['portfoyler', 'kurumlar', 'pozisyonlar', 'aylik', 'banka', 'temettu'] as const
  return (ids.find((r) => r === h) as Route) ?? 'panorama'
}

export function onRouteChange(cb: (r: Route) => void): () => void {
  const h = () => cb(currentRoute())
  addEventListener('hashchange', h)
  return () => removeEventListener('hashchange', h)
}
