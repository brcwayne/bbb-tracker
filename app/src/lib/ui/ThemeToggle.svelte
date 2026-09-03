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
