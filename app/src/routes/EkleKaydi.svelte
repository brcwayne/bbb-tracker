<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import type { Writable } from 'svelte/store'
  import type { AppState } from '../lib/data/store'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import IslemFormu from './forms/IslemFormu.svelte'
  import NakitHareketiFormu from './forms/NakitHareketiFormu.svelte'
  import VarlikTransferiFormu from './forms/VarlikTransferiFormu.svelte'
  import KurumFormu from './forms/KurumFormu.svelte'

  let {
    dataset,
    view,
    source,
    store,
  }: { dataset?: Dataset; view?: DerivedBundle; source?: DataSource; store?: Writable<AppState> } = $props()

  type Kind = 'islem' | 'nakit' | 'transfer' | 'kurum'
  let kind = $state<Kind | null>(null)

  const labels: Record<Kind, string> = {
    islem: 'İşlem (Al/Sat)',
    nakit: 'Nakit Hareketi',
    transfer: 'Varlık Transferi',
    kurum: 'Kurum Ekle',
  }
</script>

{#if dataset && view && source && store}
  <section class="ekle">
    <SectionHeader title="Yeni Kayıt Ekle" />
    <div class="picker">
      {#each Object.entries(labels) as [k, label]}
        <button class:active={kind === k} onclick={() => (kind = k as Kind)}>{label}</button>
      {/each}
    </div>
    {#if kind === 'islem'}
      <div class="form-area">
        <IslemFormu {dataset} {view} {source} {store} onSaved={() => (kind = null)} />
      </div>
    {:else if kind === 'nakit'}
      <div class="form-area">
        <NakitHareketiFormu {dataset} {source} {store} onSaved={() => (kind = null)} />
      </div>
    {:else if kind === 'transfer'}
      <div class="form-area">
        <VarlikTransferiFormu {dataset} {view} {source} {store} onSaved={() => (kind = null)} />
      </div>
    {:else if kind === 'kurum'}
      <div class="form-area">
        <KurumFormu {dataset} {source} {store} onSaved={() => (kind = null)} />
      </div>
    {/if}
  </section>
{:else}
  <EmptyState title="Ekle" detail="Veri bekleniyor." />
{/if}

<style>
  .ekle {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(760px, 96vw);
    margin: 0 auto;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0 1.25rem;
  }
  .picker button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }
  .picker button.active {
    border-color: var(--gold);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .form-area {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem;
  }
</style>
