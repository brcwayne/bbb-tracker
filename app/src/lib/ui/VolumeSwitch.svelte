<script lang="ts">
  import { otherVolume, type Volume } from '../../router'

  let { volume }: { volume: Volume } = $props()
  let target = $derived(otherVolume(volume))
</script>

<a
  href={target.href}
  class="volume-switch"
  class:to-hesaplar={target.volume === 'hesaplar'}
  class:to-yatirim={target.volume === 'yatirim'}
  aria-label={target.ariaLabel}
>
  {target.label} →
</a>

<style>
  .volume-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.82rem;
    font-weight: 600;
    text-decoration: none;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    border: 1px solid var(--hairline);
    background: var(--surface);
    transition: border-color 0.15s, color 0.15s;
  }
  .volume-switch.to-hesaplar {
    color: var(--accent-defter);
  }
  .volume-switch.to-yatirim {
    color: var(--gold);
  }
  .volume-switch:hover {
    border-color: currentColor;
  }
  .volume-switch:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
