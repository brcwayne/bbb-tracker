<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale'
  let {
    buckets = [],
    width = 640,
    height = 200,
    pad = 24,
  }: {
    buckets?: { label: string; count: number; items?: string[] }[]
    width?: number
    height?: number
    pad?: number
  } = $props()
  const band = $derived(
    scaleBand<string>().domain(buckets.map((b) => b.label)).range([pad, width - pad]).padding(0.15),
  )
  const y = $derived(
    scaleLinear().domain([0, Math.max(1, ...buckets.map((b) => b.count))]).range([height - pad, pad]),
  )
  // Spec §10: direct labelling instead of a legend. Sparse band-axis ticks —
  // every 4th bucket plus the last — keep the axis readable at 23 buckets.
  const ticks = $derived(buckets.filter((_, i) => i % 4 === 0 || i === buckets.length - 1))
  let hoverI = $state<number | null>(null)
</script>

<svg
  viewBox={`0 0 ${width} ${height}`}
  role="img"
  aria-label="histogram"
  onmouseleave={() => (hoverI = null)}
>
  {#each buckets as b, i}
    <rect
      data-bucket={b.label}
      role="img"
      aria-label={`${b.label}: ${b.count} işlem`}
      x={band(b.label)}
      width={band.bandwidth()}
      y={y(b.count)}
      height={height - pad - y(b.count)}
      fill={hoverI === i ? 'var(--gold)' : 'var(--ink-soft)'}
      style:cursor="pointer"
      onmouseenter={() => (hoverI = i)}
    />
  {/each}
  {#each ticks as b}
    <text
      data-tick={b.label}
      x={(band(b.label) ?? 0) + band.bandwidth() / 2}
      y={height - pad + 12}
      text-anchor="middle"
      style="font-size: 9px; fill: var(--ink-soft);">{b.label}</text
    >
  {/each}
  {#if hoverI != null}
    {@const b = buckets[hoverI]}
    {@const rows = b.items ?? []}
    {@const boxH = 30 + rows.length * 12}
    {@const cx = Math.min(Math.max((band(b.label) ?? 0) + band.bandwidth() / 2, 72), width - 72)}
    <g transform={`translate(${cx}, ${pad})`} style="pointer-events:none;">
      <rect x="-68" y="0" width="136" height={boxH} rx="3" fill="var(--surface)" stroke="var(--hairline)" />
      <rect x="-68" y="0" width="136" height="2" fill="var(--gold)" />
      <text x="0" y="12" text-anchor="middle" style="font-size:9px; fill:var(--ink-soft);">{b.label}</text>
      <text
        x="0"
        y="24"
        text-anchor="middle"
        style="font-size:11px; fill:var(--ink); font-variant-numeric:tabular-nums;">{b.count} işlem</text
      >
      {#each rows as row, ri}
        <text
          x="-60"
          y={38 + ri * 12}
          style="font-size:9px; fill:var(--ink-soft); font-variant-numeric:tabular-nums;">{row}</text
        >
      {/each}
    </g>
  {/if}
</svg>
