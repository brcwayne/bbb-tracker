<script lang="ts">
  import type { Dataset, Snapshot } from '../lib/data/types'
  import { usd, pct, monthLabel, DASH } from '../lib/format'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import BarChart from '../lib/charts/BarChart.svelte'
  import LineChart from '../lib/charts/LineChart.svelte'

  // RULING P1-3: annotation form, optional + guarded. This page takes only
  // `dataset` (no `derived`), so the runes below carry no store_rune_conflict.
  let { dataset }: { dataset?: Dataset } = $props()

  // Selected row for the month card; null falls back to the newest month.
  let selectedMonth = $state<Snapshot | null>(null)

  const snaps = $derived(dataset?.snapshots ?? [])
  // Newest month first for the table.
  const rows = $derived([...snaps].sort((a, b) => (b.tarih < a.tarih ? -1 : 1)))
  // Ascending by date for the left-to-right chart timelines.
  const sortedAsc = $derived([...snaps].sort((a, b) => (a.tarih < b.tarih ? -1 : 1)))
  const current = $derived(selectedMonth ?? rows[0])

  const bars = $derived(
    sortedAsc.map((s) => ({ label: monthLabel(s.tarih), value: s.netKZ_usd })),
  )
  const series = $derived(
    sortedAsc.map((s, i) => ({ x: i, y: s.toplamOzkaynak_usd })),
  )

  function getiri(s: Snapshot): string {
    const b = s.baslangicSermayesi_usd
    return b == null || b === 0 ? DASH : pct(s.netKZ_usd / b)
  }

  const columns = [
    { key: 'tarih', label: 'Ay', fmt: (v: string) => monthLabel(v) },
    {
      key: 'baslangicSermayesi_usd',
      label: 'Başlangıç Sermaye',
      align: 'right' as const,
      fmt: (v: number | null) => usd(v as number),
    },
    {
      key: 'netMevduatCekim_usd',
      label: 'Net Mevduat/Çekim',
      align: 'right' as const,
      fmt: (v: number) => usd(v),
    },
    {
      key: 'netKZ_usd',
      label: 'Kazanç',
      align: 'right' as const,
      fmt: (v: number) => (v > 0 ? usd(v) : DASH),
    },
    {
      key: 'netKZ_usd',
      label: 'Kayıp',
      align: 'right' as const,
      fmt: (v: number) => (v < 0 ? usd(v) : DASH),
    },
    {
      key: 'nakitTemettu_usd',
      label: 'Nakit Temettü',
      align: 'right' as const,
      fmt: (v: number) => usd(v),
    },
    {
      key: 'toplamOzkaynak_usd',
      label: 'Dönem Sonu',
      align: 'right' as const,
      fmt: (v: number) => usd(v),
    },
    {
      key: 'vergiKomisyon_usd',
      label: 'Vergi & Komisyon',
      align: 'right' as const,
      fmt: (v: number) => usd(v),
    },
    {
      key: '_getiri',
      label: '% Getiri',
      align: 'right' as const,
      fmt: (_v: unknown, row: Snapshot) => getiri(row),
    },
  ]
</script>

{#if dataset}
  <section class="aylik">
    <SectionHeader title="Aylık Rapor" note={`${rows.length} ay`} />

    <DataTable {columns} rows={rows} onRowClick={(row) => (selectedMonth = row)} />

    {#if current}
      <SectionHeader title="Seçili ay" />
      <dl class="month-card" data-testid="month-card">
        <div><dt>Ay</dt><dd>{monthLabel(current.tarih)}</dd></div>
        <div>
          <dt>Başlangıç Sermaye</dt>
          <dd class="num">{usd(current.baslangicSermayesi_usd as number)}</dd>
        </div>
        <div>
          <dt>Net Mevduat/Çekim</dt>
          <dd class="num">{usd(current.netMevduatCekim_usd)}</dd>
        </div>
        <div>
          <dt>Net K/Z</dt>
          <dd class="num">{usd(current.netKZ_usd, { sign: true })}</dd>
        </div>
        <div>
          <dt>Nakit Temettü</dt>
          <dd class="num">{usd(current.nakitTemettu_usd)}</dd>
        </div>
        <div>
          <dt>Dönem Sonu</dt>
          <dd class="num">{usd(current.toplamOzkaynak_usd)}</dd>
        </div>
        <div>
          <dt>Vergi & Komisyon</dt>
          <dd class="num">{usd(current.vergiKomisyon_usd)}</dd>
        </div>
        <div><dt>% Getiri</dt><dd class="num">{getiri(current)}</dd></div>
      </dl>
    {/if}

    <SectionHeader title="Aylık net K/Z" />
    <BarChart {bars} orient="v" fmt={(v) => usd(v, { sign: true })} />

    <SectionHeader title="Özkaynak performans eğrisi" />
    <LineChart {series} labels={sortedAsc.map((s) => monthLabel(s.tarih))} fmtY={(v) => usd(v)} />
  </section>
{:else}
  <EmptyState title="Aylık Rapor" detail="Veri bekleniyor." />
{/if}

<style>
  .aylik {
    padding: 1.25rem;
    max-width: 960px;
  }
  .month-card {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem 1.5rem;
    margin: 0.5rem 0 0.75rem;
  }
  .month-card div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--hairline);
    padding: 0.35rem 0;
  }
  .month-card dt {
    color: var(--ink-soft);
    font-size: 0.85em;
    letter-spacing: 0.02em;
  }
  .month-card dd {
    margin: 0;
    color: var(--ink);
    font-size: 1.1em;
    font-weight: 600;
  }
  .month-card dd.num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }
  @media (min-width: 720px) {
    .month-card {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
