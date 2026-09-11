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

  function barColor(b: { label: string }, i: number, total: number): string {
    let ratio: number | null = null
    if (b.label.startsWith('<-')) {
      ratio = -1
    } else if (b.label.startsWith('>')) {
      ratio = 1
    } else if (b.label.includes('–')) {
      const parts = b.label.replace(/%/g, '').split('–').map(Number)
      if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        const midVal = (parts[0] + parts[1]) / 2
        ratio = midVal < 0 ? Math.max(-1, midVal / 22) : Math.min(1, midVal / 20)
      }
    }
    if (ratio == null) {
      const mid = (total - 1) / 2
      ratio = total > 1 ? (i - mid) / mid : 0
    }

    if (ratio < -0.05) {
      const t = (ratio - -1) / 0.95
      const h = 2 + t * 14
      const s = 82 - t * 35
      const l = 50 + t * 16
      return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`
    }
    if (ratio <= 0.05) {
      return 'var(--ink-soft)'
    }
    const t = (ratio - 0.05) / 0.95
    const h = 152 - t * 12
    const s = 45 + t * 35
    const l = 66 - t * 24
    return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`
  }
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
      fill={hoverI === i ? 'var(--gold)' : barColor(b, i, buckets.length)}
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
      <rect x="-68" y="0" width="136" height="2" fill={barColor(b, hoverI, buckets.length)} />
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
