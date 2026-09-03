<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale'
  let { buckets = [], width = 640, height = 200, pad = 24 }: {
    buckets?: { label: string; count: number }[]; width?: number; height?: number; pad?: number
  } = $props()
  const band = $derived(scaleBand<string>().domain(buckets.map((b) => b.label)).range([pad, width - pad]).padding(0.15))
  const y = $derived(scaleLinear().domain([0, Math.max(1, ...buckets.map((b) => b.count))]).range([height - pad, pad]))
</script>

<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="histogram">
  {#each buckets as b}
    <rect data-bucket={b.label} x={band(b.label)} width={band.bandwidth()}
      y={y(b.count)} height={height - pad - y(b.count)} fill="var(--ink-soft)" />
  {/each}
</svg>
