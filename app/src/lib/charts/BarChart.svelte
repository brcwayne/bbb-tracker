<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale'
  let {
    bars = [],
    orient = 'v',
    width = 640,
    height = 220,
    pad = 28,
    fmt = (v: number) => String(v),
  }: {
    bars?: { label: string; value: number }[]
    orient?: 'h' | 'v'
    width?: number
    height?: number
    pad?: number
    fmt?: (v: number) => string
  } = $props()

  const vals = $derived(bars.map((b) => b.value))
  const band = $derived(
    scaleBand<string>()
      .domain(bars.map((b) => b.label))
      .range(orient === 'v' ? [pad, width - pad] : [pad, height - pad])
      .padding(0.3),
  )
  const lin = $derived(
    scaleLinear()
      .domain([Math.min(0, ...vals), Math.max(0, ...vals)])
      .range(orient === 'v' ? [height - pad, pad] : [pad, width - pad]),
  )
  const zero = $derived(lin(0))
  let hoverI = $state<number | null>(null)
  const dim = (i: number) => (hoverI == null || hoverI === i ? 1 : 0.45)
</script>

<svg
  viewBox={`0 0 ${width} ${height}`}
  role="img"
  aria-label="bar grafik"
  onmouseleave={() => (hoverI = null)}
>
  {#each bars as b, i}
    {#if orient === 'v'}
      <rect
        data-bar={b.label}
        role="img"
        aria-label={`${b.label}: ${fmt(b.value)}`}
        x={band(b.label)}
        width={band.bandwidth()}
        y={Math.min(zero, lin(b.value))}
        height={Math.abs(lin(b.value) - zero)}
        fill={b.value < 0 ? 'var(--loss)' : 'var(--gain)'}
        fill-opacity={dim(i)}
        style:cursor="pointer"
        onmouseenter={() => (hoverI = i)}
      />
    {:else}
      <rect
        data-bar={b.label}
        role="img"
        aria-label={`${b.label}: ${fmt(b.value)}`}
        y={band(b.label)}
        height={band.bandwidth()}
        x={Math.min(zero, lin(b.value))}
        width={Math.abs(lin(b.value) - zero)}
        fill={b.value < 0 ? 'var(--loss)' : 'var(--gain)'}
        fill-opacity={dim(i)}
        style:cursor="pointer"
        onmouseenter={() => (hoverI = i)}
      />
      <text
        data-bar-label={b.label}
        x={Math.max(zero, lin(b.value)) + 4}
        y={(band(b.label) ?? 0) + band.bandwidth() / 2}
        dominant-baseline="central"
        style="font-size: 10px; fill: var(--ink);">{b.label}</text
      >
    {/if}
  {/each}
  {#if hoverI != null}
    {@const b = bars[hoverI]}
    {@const rawX =
      orient === 'v'
        ? (band(b.label) ?? 0) + band.bandwidth() / 2
        : Math.max(zero, lin(b.value)) + 4}
    {@const rawY =
      orient === 'v'
        ? Math.min(zero, lin(b.value)) - 4
        : (band(b.label) ?? 0) + band.bandwidth() / 2}
    <g
      transform={`translate(${Math.min(Math.max(rawX, 46), width - 46)}, ${Math.max(rawY, 16)})`}
      style="pointer-events:none;"
    >
      <rect x="-44" y="-14" width="88" height="28" rx="3" fill="var(--surface)" stroke="var(--hairline)" />
      <rect x="-44" y="-14" width="88" height="2" fill="var(--gold)" />
      <text x="0" y="-3" text-anchor="middle" style="font-size:9px; fill:var(--ink-soft);">{b.label}</text>
      <text
        x="0"
        y="9"
        text-anchor="middle"
        style="font-size:11px; fill:var(--ink); font-variant-numeric:tabular-nums;">{fmt(b.value)}</text
      >
    </g>
  {/if}
</svg>
