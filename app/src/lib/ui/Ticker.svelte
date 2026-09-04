<script lang="ts">
  import { untrack } from 'svelte'

  // Count-up number. Animates from the previous value to the new one with an
  // ease-out; honours prefers-reduced-motion by snapping. First paint is
  // instant (starts at `value`) so it never flashes 0 and stays test-friendly.
  let {
    value,
    fmt = (n: number) => String(n),
    ms = 520,
  }: {
    value: number
    fmt?: (n: number) => string
    ms?: number
  } = $props()

  let shown = $state(untrack(() => (Number.isFinite(value) ? value : 0)))
  let raf = 0

  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    const target = Number.isFinite(value) ? value : 0
    if (reduced) {
      shown = target
      return
    }
    const from = shown
    const t0 = performance.now()
    cancelAnimationFrame(raf)
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      shown = from + (target - from) * e
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  })
</script>

<span class="num">{fmt(shown)}</span>
