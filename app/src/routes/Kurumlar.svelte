<script lang="ts">
  import type { Dataset, Broker } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { holdingsByBroker, type HoldingGroup } from '../lib/data/breakdowns'
  import { prices } from '../lib/prices.svelte'
  import { money } from '../lib/settings.svelte'
  import { pct, lot, DASH } from '../lib/format'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  let { dataset, view }: { dataset?: Dataset; view?: DerivedBundle } = $props()

  function findBrokerKod(ad: string, brokers: Broker[]): string {
    return brokers.find((b) => b.ad === ad)?.kod ?? ad
  }

  const groups = $derived.by<HoldingGroup[]>(() => {
    if (!dataset || !view) return []
    void prices.status
    return holdingsByBroker(
      view.positions.open,
      dataset.transactions,
      dataset.instruments,
      dataset.brokers,
      dataset.assetTransfers,
      { bySymbol: prices.bySymbol, usdPerGram: prices.usdPerGram },
    )
  })

  const summaryRows = $derived(
    groups.map((g) => ({
      kurum: g.key,
      sahip: g.sahip ?? '',
      maliyet: g.totalCostUsd,
      deger: g.totalValueUsd,
      kz: g.unrealUsd,
    })),
  )
  const summaryCols = [
    { key: 'kurum', label: 'Kurum', sortable: true },
    { key: 'sahip', label: 'Sahip' },
    { key: 'maliyet', label: 'Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'deger', label: 'Değer', align: 'right' as const, fmt: (v: number | null) => (v == null ? DASH : money(v)) },
    { key: 'kz', label: 'K/Z', align: 'right' as const, tone: 'sign' as const, fmt: (v: number | null) => (v == null ? DASH : money(v, { sign: true })) },
  ]
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
  <section class="kurumlar">
    <SectionHeader title="Kurumlar" />
    <DataTable columns={summaryCols} rows={summaryRows} initialSort={{ key: 'maliyet', dir: 'desc' }} />
    {#each groups as g}
      <div class="panel">
        <SectionHeader
          title={g.key}
          note={`${g.sahip} · Nakit: ${money(view.cashByHesap[findBrokerKod(g.key, dataset.brokers)] ?? 0)}`}
        />
        {#if g.rows.length}
          <DataTable columns={cols} rows={g.rows} initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }} />
        {:else}
          <p class="muted">Bu kurumda açık pozisyon yok.</p>
        {/if}
      </div>
    {/each}
    <p class="muted foot">Kurum ekleme P2'de gelecek.</p>
  </section>
{:else}
  <EmptyState title="Kurumlar" detail="Veri bekleniyor." />
{/if}

<style>
  .kurumlar {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1240px, 96vw);
    margin: 0 auto;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.25rem 1rem 1rem;
    margin-bottom: 1.25rem;
  }
  .muted {
    color: var(--ink-soft);
    font-size: 0.85em;
    margin: 0.4rem 0 0;
  }
  .foot {
    margin-top: 1.5rem;
  }
</style>
