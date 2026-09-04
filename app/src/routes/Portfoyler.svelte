<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { holdingsByPortfolio, type HoldingGroup } from '../lib/data/breakdowns'
  import { prices } from '../lib/prices.svelte'
  import { money } from '../lib/settings.svelte'
  import { pct, lot, DASH } from '../lib/format'
  import Donut from '../lib/charts/Donut.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  let { dataset, view }: { dataset?: Dataset; view?: DerivedBundle } = $props()

  const groups = $derived.by<HoldingGroup[]>(() => {
    if (!dataset || !view) return []
    void prices.status
    return holdingsByPortfolio(view.positions.open, dataset.transactions, dataset.instruments, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })
  })

  const overall = $derived(
    (view?.byPortfolio ?? []).map((r) => ({ label: r.key, value: r.tutarUsd })),
  )

  function classMix(g: HoldingGroup) {
    const m = new Map<string, number>()
    for (const r of g.rows) m.set(r.sinif, (m.get(r.sinif) ?? 0) + r.toplamMaliyetUsd)
    return [...m.entries()].map(([label, value]) => ({ label, value }))
  }

  const cols = [
    { key: 'kod', label: 'Hisse', sortable: true },
    { key: 'sinif', label: 'Sınıf', sortable: true },
    { key: 'lot', label: 'Lot', align: 'right' as const, sortable: true, fmt: (v: number) => lot(v) },
    { key: 'ortMaliyetUsd', label: 'Ort. Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'toplamMaliyetUsd', label: 'Toplam Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'guncelFiyatUsd', label: 'Güncel Fiyat', align: 'right' as const, fmt: (v: number | null) => (v == null ? DASH : money(v)) },
    { key: 'degerUsd', label: 'Değer', align: 'right' as const, sortable: true, fmt: (v: number | null) => (v == null ? DASH : money(v)) },
    { key: 'kzUsd', label: 'Gerç.mmiş K/Z', align: 'right' as const, sortable: true, tone: 'sign' as const, fmt: (v: number | null) => (v == null ? DASH : money(v, { sign: true })) },
    { key: 'kzPct', label: '%', align: 'right' as const, sortable: true, tone: 'sign' as const, fmt: (v: number | null) => (v == null ? DASH : pct(v)) },
  ]
</script>

{#if dataset && view}
  <section class="portfoyler">
    <SectionHeader title="Portföyler" />
    <div class="overall">
      <Donut slices={overall} fmt={(v) => money(v)} />
    </div>
    {#each groups as g}
      <div class="panel">
        <SectionHeader
          title={g.key}
          note={`${money(g.totalCostUsd)} maliyet · ${g.totalValueUsd == null ? DASH : money(g.totalValueUsd)} değer · ${g.unrealUsd == null ? DASH : money(g.unrealUsd, { sign: true })}`}
        />
        <div class="mix"><Donut slices={classMix(g)} size={104} thickness={16} fmt={(v) => money(v)} /></div>
        <DataTable columns={cols} rows={g.rows} initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }} />
      </div>
    {/each}
  </section>
{:else}
  <EmptyState title="Portföyler" detail="Veri bekleniyor." />
{/if}

<style>
  .portfoyler {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1240px, 96vw);
    margin: 0 auto;
  }
  .overall {
    margin: 0.5rem 0 1rem;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.25rem 1rem 1rem;
    margin-bottom: 1.25rem;
  }
  .mix {
    margin: 0.25rem 0 0.75rem;
  }
</style>
