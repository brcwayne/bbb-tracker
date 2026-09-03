<script lang="ts">
  import { getTheme, setTheme, type Theme } from '../theme'

  const order: Theme[] = ['system', 'light', 'dark']
  const labels: Record<Theme, string> = { system: 'Sistem', light: 'Açık', dark: 'Koyu' }

  let current = $state<Theme>(getTheme())

  function cycle() {
    current = order[(order.indexOf(current) + 1) % order.length]
    setTheme(current)
  }
</script>

<button
  type="button"
  class="theme-toggle num"
  aria-label={`Tema: ${labels[current]}`}
  onclick={cycle}>{labels[current]}</button
>

<style>
  .theme-toggle {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.85em;
    letter-spacing: 0.02em;
    cursor: pointer;
  }
  .theme-toggle:hover {
    color: var(--ink);
    border-color: var(--ink-soft);
  }
</style>
