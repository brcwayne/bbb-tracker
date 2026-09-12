import { line, area, pie, arc } from 'd3-shape'

export function linePath(pts: ([number, number] | null)[]): string {
  return (
    line<[number, number] | null>()
      .defined((p): p is [number, number] => p !== null && !isNaN(p[0]) && !isNaN(p[1]))
      .x((p) => (p ? p[0] : 0))
      .y((p) => (p ? p[1] : 0))(pts) ?? ''
  )
}

export function areaPath(pts: [number, number][], y0: number): string {
  return area<[number, number]>().x((p) => p[0]).y0(y0).y1((p) => p[1])(pts) ?? ''
}

export function arcs(values: number[], r: number, ir: number) {
  const p = pie<number>().sort(null).value((v) => v)(values)
  const a = arc<any>().innerRadius(ir).outerRadius(r)
  return p.map((s) => ({ d: a(s) ?? '', startAngle: s.startAngle, endAngle: s.endAngle }))
}
