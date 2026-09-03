<script lang="ts">
  import { onMount } from 'svelte'
  import { currentRoute, onRouteChange, ROUTES, type Route } from './router'
  import ThemeToggle from './lib/ui/ThemeToggle.svelte'
  import EmptyState from './lib/ui/EmptyState.svelte'
  import { createAppStore, load, pickSource } from './lib/data/store'
  import Panorama from './routes/Panorama.svelte'
  import Pozisyonlar from './routes/Pozisyonlar.svelte'
  import AylikRapor from './routes/AylikRapor.svelte'

  let route = $state<Route>(currentRoute())
  const store = createAppStore()
  onMount(() => {
    load(store, pickSource())
    return onRouteChange((r) => (route = r))
  })
  const pages = { panorama: Panorama, pozisyonlar: Pozisyonlar, aylik: AylikRapor }
  const Active = $derived(pages[route])
  const title = $derived(ROUTES.find((r) => r.id === route)!.label)
</script>

<header class="running">
  <strong>{title}</strong>
  <span class="stamp num" data-testid="source-stamp">{$store.sourceText ?? '—'}</span>
  <ThemeToggle />
</header>

{#if $store.status === 'loading'}
  <p class="loading">Yükleniyor…</p>
{:else if $store.status === 'error'}
  <EmptyState title="Veri yüklenemedi" detail={$store.error} />
{:else}
  <Active dataset={$store.dataset} derived={$store.derived} />
{/if}

<nav class="tabs">
  {#each ROUTES as r}
    <a href={r.path} class:active={r.id === route}>{r.label}</a>
  {/each}
</nav>

<style>
  .running { display: flex; gap: 1rem; align-items: baseline; padding: 1rem 1.25rem; border-bottom: 1px solid var(--hairline); }
  .running strong { font-size: 1.1rem; }
  .stamp { margin-left: auto; color: var(--ink-soft); font-size: 0.8rem; }
  .loading { padding: 2rem 1.25rem; color: var(--ink-soft); }
  .tabs { position: sticky; bottom: 0; display: flex; border-top: 1px solid var(--hairline); background: var(--surface); }
  .tabs a { flex: 1; text-align: center; padding: 0.9rem; color: var(--ink-soft); text-decoration: none; }
  .tabs a.active { color: var(--ink); box-shadow: inset 0 2px 0 var(--gold); }
  @media (min-width: 900px) {
    .tabs { position: fixed; left: 0; top: 0; bottom: 0; flex-direction: column; width: 180px; border-top: 0; border-right: 1px solid var(--hairline); }
    :global(body) { padding-left: 180px; }
  }
</style>
