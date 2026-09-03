<script lang="ts">
  import { arcs } from './scales'

  let { slices = [], size = 180, thickness = 28 }: {
    slices?: { label: string; value: number }[]; size?: number; thickness?: number
  } = $props()

  const r = $derived(size / 2)
  const parts = $derived(arcs(slices.map((s) => s.value), r, r - thickness))
  const palette = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']
</script>

<svg viewBox={`${-r} ${-r} ${size} ${size}`} role="img" aria-label="halka grafik">
  {#each parts as p, i}
    <path data-slice={slices[i].label} d={p.d} fill={palette[i % palette.length]} />
  {/each}
</svg>
