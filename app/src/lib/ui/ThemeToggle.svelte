<script lang="ts">
  import { getTheme, setTheme, type Theme } from '../theme'
  import { settings, toggleUiMode, setFontScale, type FontScale } from '../settings.svelte'

  const order: Theme[] = ['system', 'light', 'dark']
  const labels: Record<Theme, string> = { system: 'Sistem', light: 'Açık', dark: 'Koyu' }

  let current = $state<Theme>(getTheme())

  function cycle() {
    current = order[(order.indexOf(current) + 1) % order.length]
    setTheme(current)
  }
</script>

<div class="theme-capsule">
  {#if settings.uiMode === 'v2'}
    <div class="font-scale-group" data-testid="font-scale-group" role="group" aria-label="Okuma boyutu">
      <button
        type="button"
        class="scale-btn"
        class:active={settings.fontScale === 16}
        onclick={() => setFontScale(16)}
        title="Standart Okuma Boyutu (16px)"
        aria-label="Okuma boyutu: 16px"
      >A</button>
      <button
        type="button"
        class="scale-btn"
        class:active={settings.fontScale === 18}
        onclick={() => setFontScale(18)}
        title="Rahat Okuma Boyutu (18px - Varsayılan)"
        aria-label="Okuma boyutu: 18px"
      >A+</button>
      <button
        type="button"
        class="scale-btn"
        class:active={settings.fontScale === 20}
        onclick={() => setFontScale(20)}
        title="Büyük Okuma Boyutu (20px)"
        aria-label="Okuma boyutu: 20px"
      >A++</button>
    </div>
  {/if}

  <button
    type="button"
    class="v2-toggle"
    class:v2-active={settings.uiMode === 'v2'}
    data-testid="v2-toggle"
    onclick={() => toggleUiMode()}
    title="Yeni interaktif V2 Komuta Merkezi tasarımını aç/kapat"
  >
    {settings.uiMode === 'v2' ? '✨ V2 Aktif' : '✨ V2 Tasarım'}
  </button>

  <button
    type="button"
    class="theme-toggle num"
    aria-label={`Tema: ${labels[current]}`}
    onclick={cycle}>{labels[current]}</button
  >
</div>

<style>
  .theme-capsule {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .theme-toggle {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.85em;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .theme-toggle:hover {
    color: var(--ink);
    border-color: var(--ink-soft);
  }
  .v2-toggle {
    appearance: none;
    padding: 0.25rem 0.65rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.82em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .v2-toggle:hover {
    color: var(--gold);
    border-color: var(--gold);
  }
  .v2-toggle.v2-active {
    background: rgba(232, 192, 122, 0.14);
    border-color: var(--gold);
    color: var(--gold);
    box-shadow: 0 0 10px rgba(232, 192, 122, 0.2);
  }
  .font-scale-group {
    display: inline-flex;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    overflow: hidden;
    background: var(--surface);
  }
  .scale-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.45rem;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .scale-btn + .scale-btn {
    border-left: 1px solid var(--hairline);
  }
  .scale-btn:hover {
    color: var(--ink);
  }
  .scale-btn.active {
    background: rgba(232, 192, 122, 0.22);
    color: var(--gold);
  }
</style>
