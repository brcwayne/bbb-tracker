<script lang="ts">
  import { scaleLinear } from 'd3-scale'
  import { linePath, areaPath } from './scales'

  let {
    series = [],
    labels = [],
    width = 640,
    height = 200,
    pad = 24,
    fmtY = (y: number) => String(y),
  }: {
    series?: { x: number; y: number }[]
    labels?: string[]
    width?: number
    height?: number
    pad?: number
    fmtY?: (y: number) => string
  } = $props()

  const xs = $derived(series.map((d) => d.x))
  const ys = $derived(series.map((d) => d.y))
  const sx = $derived(scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([pad, width - pad]))
  const sy = $derived(scaleLinear().domain([Math.min(...ys, 0), Math.max(...ys)]).range([height - pad, pad]))
  const pts = $derived(series.map((d) => [sx(d.x), sy(d.y)] as [number, number]))
  // Thin horizontal reference lines at nice round values.
  const grid = $derived(series.length ? sy.ticks(4).map((v) => ({ v, y: sy(v) })) : [])
  // A handful of evenly spaced date ticks along the bottom, so the covered period is legible
  // without having to hover — first, last, and a few in between.
  const xTickIdx = $derived.by(() => {
    const n = series.length
    if (n === 0) return []
    if (n <= 5) return series.map((_, i) => i)
    const count = 5
    const idx = new Set<number>()
    for (let k = 0; k < count; k++) idx.add(Math.round((k * (n - 1)) / (count - 1)))
    return [...idx].sort((a, b) => a - b)
  })

  let hoverI = $state<number | null>(null)

  // Client px → viewBox px, then snap to the nearest plotted point.
  function onMove(e: MouseEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    if (!r.width || pts.length === 0) return
    const localX = ((e.clientX - r.left) / r.width) * width
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i][0] - localX)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    hoverI = best
  }

  const tipX = $derived(
    hoverI == null ? 0 : Math.min(Math.max(pts[hoverI][0], pad + 48), width - pad - 48),
  )
</script>

<svg
  viewBox={`0 0 ${width} ${height}`}
  role="img"
  aria-label="çizgi grafik"
  onmousemove={onMove}
  onmouseleave={() => (hoverI = null)}
>
  <rect x="0" y="0" {width} {height} fill="transparent" />
  {#each grid as g}
    <line
      x1={pad}
      x2={width - pad}
      y1={g.y}
      y2={g.y}
      stroke="var(--hairline)"
      stroke-width="1"
      stroke-dasharray="1 3"
    />
    <text x={pad} y={g.y - 3} style="font-size:8px; fill:var(--ink-soft);">{fmtY(g.v)}</text>
  {/each}
  {#each xTickIdx as i}
    <text
      x={pts[i][0]}
      y={height - pad + 12}
      text-anchor={i === 0 ? 'start' : i === xTickIdx[xTickIdx.length - 1] ? 'end' : 'middle'}
      style="font-size:8px; fill:var(--ink-soft);">{labels[i] ?? ''}</text
    >
  {/each}
  <path class="area" d={areaPath(pts, height - pad)} fill="var(--gain)" fill-opacity="0.08" />
  <path
    class="line"
    data-testid="line"
    d={linePath(pts)}
    fill="none"
    stroke="var(--gain)"
    stroke-width="1.25"
  />
  {#if hoverI != null}
    {@const p = pts[hoverI]}
    <line x1={p[0]} x2={p[0]} y1={pad} y2={height - pad} stroke="var(--hairline)" stroke-width="1" />
    <circle cx={p[0]} cy={p[1]} r="3" fill="var(--gain)" stroke="var(--bg)" stroke-width="1.5" />
    <g transform={`translate(${tipX}, ${pad + 2})`} style="pointer-events:none;">
      <rect x="-48" y="0" width="96" height="30" rx="3" fill="var(--surface)" stroke="var(--hairline)" />
      <rect x="-48" y="0" width="96" height="2" fill="var(--gold)" />
      <text
        x="0"
        y="12"
        text-anchor="middle"
        style="font-size:9px; fill:var(--ink-soft);">{labels[hoverI] ?? `#${hoverI + 1}`}</text
      >
      <text
        x="0"
        y="24"
        text-anchor="middle"
        style="font-size:11px; fill:var(--ink); font-variant-numeric:tabular-nums;"
        >{fmtY(series[hoverI].y)}</text
      >
    </g>
  {/if}
</svg>
