<script lang="ts">
  import type { DerivedBundle } from '../lib/data/store'
  import { money } from '../lib/settings.svelte'
  import { dateShort, lot } from '../lib/format'
  import KpiBand from '../lib/ui/KpiBand.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  let { view }: { view?: DerivedBundle } = $props()

  const kpi = $derived([
    { label: 'Toplam Yatan', value: money(view?.transfers.totalIn ?? 0), num: view?.transfers.totalIn ?? 0, fmt: (n: number) => money(n) },
    { label: 'Toplam Çekilen', value: money(view?.transfers.totalOut ?? 0), num: view?.transfers.totalOut ?? 0, fmt: (n: number) => money(n) },
    { label: 'Net', value: money(view?.transfers.net ?? 0), num: view?.transfers.net ?? 0, fmt: (n: number) => money(n) },
  ])

  const cols = [
    { key: 'tarih', label: 'Tarih', sortable: true, fmt: (v: string) => dateShort(v) },
    { key: 'tur', label: 'Tür', sortable: true },
    { key: 'tutarUsd', label: 'Tutar', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'hesap', label: 'Hesap' },
    { key: 'aciklama', label: 'Açıklama' },
  ]
  const mmCols = [
    { key: 'tarih', label: 'Tarih', sortable: true, fmt: (v: string) => dateShort(v) },
    { key: 'kod', label: 'Fon', sortable: true },
    { key: 'yon', label: 'Yön' },
    { key: 'lot', label: 'Lot', align: 'right' as const, fmt: (v: number) => lot(v) },
    { key: 'tutarUsd', label: 'Tutar', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
  ]
</script>

{#if view}
  <section class="banka">
    <SectionHeader title="Banka" />
    <KpiBand items={kpi} />
    <SectionHeader title="Para yatırma / çekme" note={`${view.transfers.rows.length} kayıt`} />
    <DataTable columns={cols} rows={view.transfers.rows} initialSort={{ key: 'tarih', dir: 'desc' }} />
    <SectionHeader title="Para piyasası hareketleri" note={`${view.mmMoves.length} işlem`} />
    <DataTable columns={mmCols} rows={view.mmMoves} initialSort={{ key: 'tarih', dir: 'desc' }} />
    <p class="muted">
      Para piyasası fonu alım/satımları bilgi amaçlı listelenir; yatan/çekilen toplamına dahil değildir.
    </p>
  </section>
{:else}
  <EmptyState title="Banka" detail="Veri bekleniyor." />
{/if}

<style>
  .banka {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1100px, 96vw);
    margin: 0 auto;
  }
  .muted {
    color: var(--ink-soft);
    font-size: 0.85em;
    margin: 0.5rem 0 0;
  }
</style>
