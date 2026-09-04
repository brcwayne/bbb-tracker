<script lang="ts">
  import { arcs } from './scales'

  let {
    slices = [],
    size = 132,
    thickness = 22,
    fmt = (v: number) => String(v),
    total = undefined,
    totalLabel = 'Toplam',
  }: {
    slices?: { label: string; value: number }[]
    size?: number
    thickness?: number
    fmt?: (v: number) => string
    total?: number
    totalLabel?: string
  } = $props()

  const r = $derived(size / 2)
  const parts = $derived(arcs(slices.map((s) => s.value), r, r - thickness))
  const palette = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']
  const sum = $derived(total ?? slices.reduce((s, x) => s + x.value, 0))
  let hoverI = $state<number | null>(null)
</script>

<svg
  width={size}
  height={size}
  viewBox={`${-r} ${-r} ${size} ${size}`}
  role="img"
  aria-label="halka grafik"
  style="max-width:100%; height:auto;"
  onmouseleave={() => (hoverI = null)}
>
  {#each parts as p, i}
    <path
      data-slice={slices[i].label}
      role="img"
      aria-label={`${slices[i].label}: ${fmt(slices[i].value)}`}
      d={p.d}
      fill={palette[i % palette.length]}
      style:cursor="pointer"
      style:opacity={hoverI == null || hoverI === i ? 1 : 0.35}
      style:transition="opacity .12s ease"
      onmouseenter={() => (hoverI = i)}
    />
  {/each}
  {#if hoverI != null}
    <text x="0" y="-3" text-anchor="middle" style="font-size:10px; fill:var(--ink-soft);"
      >{slices[hoverI].label}</text
    >
    <text
      x="0"
      y="12"
      text-anchor="middle"
      style="font-size:12px; fill:var(--ink); font-variant-numeric:tabular-nums;"
      >{fmt(slices[hoverI].value)}</text
    >
  {:else}
    <text x="0" y="-3" text-anchor="middle" style="font-size:9px; fill:var(--ink-soft); letter-spacing:.04em;"
      >{totalLabel}</text
    >
    <text
      x="0"
      y="12"
      text-anchor="middle"
      style="font-size:12px; fill:var(--ink); font-variant-numeric:tabular-nums;">{fmt(sum)}</text
    >
  {/if}
</svg>
