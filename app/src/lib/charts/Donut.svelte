<script lang="ts">
  import { arcs } from './scales'
  import { CATEGORICAL } from './palette'

  let {
    slices = [],
    size = 132,
    thickness = 22,
    fmt = (v: number) => String(v),
    total = undefined,
    totalLabel = 'Toplam',
    captionBelow = false,
    maxSlices = 8,
  }: {
    slices?: { label: string; value: number }[]
    size?: number
    thickness?: number
    fmt?: (v: number) => string
    total?: number
    totalLabel?: string
    /** Show the hovered slice's name in the ring and its value + share on a line below. */
    captionBelow?: boolean
    maxSlices?: number
  } = $props()

  const effectiveSlices = $derived.by(() => {
    if (slices.length <= maxSlices) return slices
    const visible = slices.slice(0, maxSlices - 1)
    const otherVal = slices.slice(maxSlices - 1).reduce((s, x) => s + x.value, 0)
    return otherVal > 0 ? [...visible, { label: 'Diğer', value: otherVal }] : visible
  })

  const r = $derived(size / 2)
  const parts = $derived(arcs(effectiveSlices.map((s) => s.value), r, r - thickness))
  const sum = $derived(total ?? effectiveSlices.reduce((s, x) => s + x.value, 0))
  let hoverI = $state<number | null>(null)

  const share = (v: number) => (sum ? ((v / sum) * 100).toFixed(1) + '%' : '—')
</script>

<div class="donut" class:stacked={captionBelow}>
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
        data-slice={effectiveSlices[i].label}
        role="img"
        aria-label={`${effectiveSlices[i].label}: ${fmt(effectiveSlices[i].value)}`}
        d={p.d}
        fill={CATEGORICAL[i % CATEGORICAL.length]}
        style:cursor="pointer"
        style:opacity={hoverI == null || hoverI === i ? 1 : 0.35}
        style:transition="opacity .12s ease"
        onmouseenter={() => (hoverI = i)}
      />
    {/each}
    {#if hoverI != null}
      <text x="0" y={captionBelow ? 4 : -3} text-anchor="middle" style="font-size:0.8125rem; fill:var(--ink-soft);"
        >{effectiveSlices[hoverI].label}</text
      >
      {#if !captionBelow}
        <text
          x="0"
          y="12"
          text-anchor="middle"
          style="font-size:1rem; fill:var(--ink); font-variant-numeric:tabular-nums;"
          >{fmt(effectiveSlices[hoverI].value)}</text
        >
      {/if}
    {:else}
      <text x="0" y="-3" text-anchor="middle" style="font-size:0.8125rem; fill:var(--ink-soft); letter-spacing:.04em;"
        >{totalLabel}</text
      >
      <text
        x="0"
        y="12"
        text-anchor="middle"
        style="font-size:1rem; fill:var(--ink); font-variant-numeric:tabular-nums;">{fmt(sum)}</text
      >
    {/if}
  </svg>
  {#if captionBelow}
    <div class="cap" aria-live="polite">
      {#if hoverI != null}
        <span class="cap-val">{fmt(effectiveSlices[hoverI].value)}</span>
        <span class="cap-pct">{share(effectiveSlices[hoverI].value)}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .donut {
    display: contents;
  }
  .donut.stacked {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }
  .cap {
    height: 1.2rem;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .cap-val {
    color: var(--ink);
    font-weight: 600;
  }
  .cap-pct {
    color: var(--ink-soft);
  }
</style>
