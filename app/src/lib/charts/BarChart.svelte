<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale'
  let { bars = [], orient = 'v', width = 640, height = 220, pad = 28 }: {
    bars?: { label: string; value: number }[]; orient?: 'h' | 'v'; width?: number; height?: number; pad?: number
  } = $props()

  const vals = $derived(bars.map((b) => b.value))
  const band = $derived(
    scaleBand<string>().domain(bars.map((b) => b.label)).range(orient === 'v' ? [pad, width - pad] : [pad, height - pad]).padding(0.3),
  )
  const lin = $derived(
    scaleLinear().domain([Math.min(0, ...vals), Math.max(0, ...vals)]).range(orient === 'v' ? [height - pad, pad] : [pad, width - pad]),
  )
  const zero = $derived(lin(0))
</script>

<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="bar grafik">
  {#each bars as b}
    {#if orient === 'v'}
      <rect data-bar={b.label} x={band(b.label)} width={band.bandwidth()}
        y={Math.min(zero, lin(b.value))} height={Math.abs(lin(b.value) - zero)}
        fill={b.value < 0 ? 'var(--loss)' : 'var(--gain)'} />
    {:else}
      <rect data-bar={b.label} y={band(b.label)} height={band.bandwidth()}
        x={Math.min(zero, lin(b.value))} width={Math.abs(lin(b.value) - zero)}
        fill={b.value < 0 ? 'var(--loss)' : 'var(--gain)'} />
      <text data-bar-label={b.label}
        x={Math.max(zero, lin(b.value)) + 4}
        y={(band(b.label) ?? 0) + band.bandwidth() / 2}
        dominant-baseline="central"
        style="font-size: 10px; fill: var(--ink);">{b.label}</text>
    {/if}
  {/each}
</svg>
