<script lang="ts">
  import type { DerivedBundle } from '../lib/data/store'
  import { money } from '../lib/settings.svelte'
  import { dateShort, DASH } from '../lib/format'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  let { view }: { view?: DerivedBundle } = $props()

  const byInstCols = [
    { key: 'kod', label: 'Enstrüman', sortable: true },
    { key: 'toplamUsd', label: 'Toplam Temettü', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
  ]
  const rowCols = [
    { key: 'tarih', label: 'Tarih', sortable: true, fmt: (v: string) => dateShort(v) },
    { key: 'enstruman', label: 'Enstrüman', sortable: true },
    { key: 'tutarUsd', label: 'Tutar', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'aciklama', label: 'Açıklama' },
    {
      key: 'reinvestKod',
      label: 'Yeniden yatırım',
      fmt: (v: string | null) => (v == null ? DASH : `≈ ${v} alımı`),
    },
  ]
</script>

{#if view}
  <section class="temettu">
    <SectionHeader title="Temettü" note={`toplam ${money(view.divs.total)}`} />
    <SectionHeader title="Enstrüman bazında" />
    <DataTable columns={byInstCols} rows={view.divs.byInstrument} initialSort={{ key: 'toplamUsd', dir: 'desc' }} />
    <SectionHeader title="Tüm temettüler" note={`${view.divs.rows.length} kayıt`} />
    <DataTable columns={rowCols} rows={view.divs.rows} initialSort={{ key: 'tarih', dir: 'desc' }} />
  </section>
{:else}
  <EmptyState title="Temettü" detail="Veri bekleniyor." />
{/if}

<style>
  .temettu {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1000px, 96vw);
    margin: 0 auto;
  }
</style>
