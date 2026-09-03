<script lang="ts">
  import { scaleLinear } from 'd3-scale'
  import { linePath, areaPath } from './scales'

  let { series = [], width = 640, height = 200, pad = 24 }: {
    series?: { x: number; y: number }[]; width?: number; height?: number; pad?: number
  } = $props()

  const xs = $derived(series.map((d) => d.x))
  const ys = $derived(series.map((d) => d.y))
  const sx = $derived(scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([pad, width - pad]))
  const sy = $derived(scaleLinear().domain([Math.min(...ys, 0), Math.max(...ys)]).range([height - pad, pad]))
  const pts = $derived(series.map((d) => [sx(d.x), sy(d.y)] as [number, number]))
</script>

<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="çizgi grafik">
  <path class="area" d={areaPath(pts, height - pad)} fill="var(--gain)" fill-opacity="0.08" />
  <path class="line" data-testid="line" d={linePath(pts)} fill="none" stroke="var(--gain)" stroke-width="1.25" />
</svg>
