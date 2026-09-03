import { line, area, pie, arc } from 'd3-shape'

export function linePath(pts: [number, number][]): string {
  return line<[number, number]>().x((p) => p[0]).y((p) => p[1])(pts) ?? ''
}

export function areaPath(pts: [number, number][], y0: number): string {
  return area<[number, number]>().x((p) => p[0]).y0(y0).y1((p) => p[1])(pts) ?? ''
}

export function arcs(values: number[], r: number, ir: number) {
  const p = pie<number>().sort(null).value((v) => v)(values)
  const a = arc<any>().innerRadius(ir).outerRadius(r)
  return p.map((s) => ({ d: a(s) ?? '', startAngle: s.startAngle, endAngle: s.endAngle }))
}
