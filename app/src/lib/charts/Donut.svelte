<script lang="ts">
  import { arcs } from './scales'

  let {
    slices = [],
    size = 180,
    thickness = 28,
    fmt = (v: number) => String(v),
  }: {
    slices?: { label: string; value: number }[]
    size?: number
    thickness?: number
    fmt?: (v: number) => string
  } = $props()

  const r = $derived(size / 2)
  const parts = $derived(arcs(slices.map((s) => s.value), r, r - thickness))
  const palette = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']
  let hoverI = $state<number | null>(null)
</script>

<svg
  viewBox={`${-r} ${-r} ${size} ${size}`}
  role="img"
  aria-label="halka grafik"
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
      style:opacity={hoverI == null || hoverI === i ? 1 : 0.4}
      style:transition="opacity .12s ease"
      onmouseenter={() => (hoverI = i)}
    />
  {/each}
  {#if hoverI != null}
    <text x="0" y="-3" text-anchor="middle" style="font-size:11px; fill:var(--ink-soft);"
      >{slices[hoverI].label}</text
    >
    <text
      x="0"
      y="13"
      text-anchor="middle"
      style="font-size:13px; fill:var(--ink); font-variant-numeric:tabular-nums;"
      >{fmt(slices[hoverI].value)}</text
    >
  {/if}
</svg>
