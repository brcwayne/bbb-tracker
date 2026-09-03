export type Route = 'panorama' | 'pozisyonlar' | 'aylik'

export const ROUTES: { id: Route; path: string; label: string }[] = [
  { id: 'panorama', path: '#/', label: 'Panorama' },
  { id: 'pozisyonlar', path: '#/pozisyonlar', label: 'Pozisyonlar' },
  { id: 'aylik', path: '#/aylik', label: 'Aylık' },
]

export function currentRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  return (['pozisyonlar', 'aylik'] as const).find((r) => r === h) ?? 'panorama'
}

export function onRouteChange(cb: (r: Route) => void): () => void {
  const h = () => cb(currentRoute())
  addEventListener('hashchange', h)
  return () => removeEventListener('hashchange', h)
}
