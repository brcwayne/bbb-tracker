<script lang="ts">
  import { onMount } from 'svelte'
  import { currentRoute, onRouteChange, ROUTES, type Route } from './router'
  import ThemeToggle from './lib/ui/ThemeToggle.svelte'
  import EmptyState from './lib/ui/EmptyState.svelte'
  import ConnectDrive from './lib/ui/ConnectDrive.svelte'
  import { createAppStore, load, pickSource, deriveAll } from './lib/data/store'
  import { DriveSource } from './lib/data/drive'
  import {
    settings,
    setCurrency,
    setPeriod,
    PERIODS,
    periodRange,
    type PeriodKey,
  } from './lib/settings.svelte'
  import { dateShort, tryFmt } from './lib/format'
  import Panorama from './routes/Panorama.svelte'
  import Pozisyonlar from './routes/Pozisyonlar.svelte'
  import AylikRapor from './routes/AylikRapor.svelte'

  let route = $state<Route>(currentRoute())
  const store = createAppStore()
  const source = pickSource()
  const drive = source instanceof DriveSource ? source : null
  onMount(() => {
    load(store, source)
    return onRouteChange((r) => (route = r))
  })
  const pages = { panorama: Panorama, pozisyonlar: Pozisyonlar, aylik: AylikRapor }
  const Active = $derived(pages[route])
  const title = $derived(ROUTES.find((r) => r.id === route)!.label)

  // Re-derive reactively when the global period changes (no reload).
  const activeDerived = $derived(
    $store.dataset
      ? settings.period === 'all'
        ? $store.derived
        : deriveAll($store.dataset, periodRange(settings.period))
      : undefined,
  )

  function onSrcChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value
    try {
      localStorage.setItem('bbb-source', value)
    } catch {
      /* ignore storage failures */
    }
    location.reload()
  }
</script>

<header class="running">
  <strong>{title}</strong>
  <div class="controls">
    <div class="seg" role="group" aria-label="Para birimi">
      <button class:on={settings.currency === 'USD'} onclick={() => setCurrency('USD')}>USD</button>
      <button class:on={settings.currency === 'TRY'} onclick={() => setCurrency('TRY')}>₺ TL</button>
    </div>
    <select
      class="period"
      aria-label="Dönem"
      value={settings.period}
      onchange={(e) => setPeriod((e.currentTarget as HTMLSelectElement).value as PeriodKey)}
    >
      {#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}
    </select>
    <span class="stamp num" data-testid="source-stamp">{$store.sourceText ?? '—'}</span>
    <select class="src num" aria-label="Veri kaynağı" value={source.id} onchange={onSrcChange}>
      <option value="local">local</option>
      <option value="drive">Drive</option>
    </select>
    <ThemeToggle />
  </div>
</header>
{#if settings.currency === 'TRY' && settings.rate > 1}
  <p class="ratenote">
    1 USD = {tryFmt(settings.rate)} · {settings.rateDate ? dateShort(settings.rateDate) : ''} (TCMB, son bilinen kur)
  </p>
{/if}

{#if $store.status === 'loading'}
  <p class="loading">Yükleniyor…</p>
{:else if $store.status === 'error' && $store.errorKind === 'auth' && drive}
  <ConnectDrive
    connect={() => drive.connect()}
    chooseFolder={() => drive.chooseFolder()}
    hasFolder={() => drive.hasFolder()}
    onConnected={() => load(store, source)}
  />
{:else if $store.status === 'error'}
  <EmptyState title="Veri yüklenemedi" detail={$store.error} />
{:else}
  <Active dataset={$store.dataset} derived={activeDerived} view={activeDerived} />
{/if}

<nav class="tabs">
  {#each ROUTES as r}
    <a href={r.path} class:active={r.id === route}>{r.label}</a>
  {/each}
</nav>

<style>
  .running {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--hairline);
  }
  .running strong {
    font-size: 1.15rem;
    letter-spacing: 0.01em;
  }
  .controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button {
    appearance: none;
    border: 0;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.55rem;
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--hairline);
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--ink);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .period,
  .src {
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
  }
  .stamp {
    color: var(--ink-soft);
    font-size: 0.75rem;
  }
  .ratenote {
    margin: 0;
    padding: 0.35rem 1.25rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
    border-bottom: 1px solid var(--hairline);
    background: var(--surface);
  }
  .loading {
    padding: 2rem 1.25rem;
    color: var(--ink-soft);
  }
  /* Excel-style sheet tabs, pinned bottom-left at every width. */
  .tabs {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    padding: 0 0.5rem;
    border-top: 1px solid var(--hairline);
    background: var(--surface);
    z-index: 5;
  }
  .tabs a {
    padding: 0.55rem 1.15rem;
    color: var(--ink-soft);
    text-decoration: none;
    font-size: 0.9rem;
    letter-spacing: 0.01em;
    border-right: 1px solid var(--hairline);
    transition: color 0.12s ease, background 0.12s ease;
  }
  .tabs a:first-child {
    border-left: 1px solid var(--hairline);
  }
  .tabs a:hover {
    color: var(--ink);
  }
  .tabs a.active {
    color: var(--ink);
    background: var(--bg);
    box-shadow: inset 0 2px 0 var(--gold);
  }
  :global(body) {
    padding-bottom: 2.75rem;
  }
</style>
