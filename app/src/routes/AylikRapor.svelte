<script lang="ts">
  import type { Dataset, Snapshot } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { pct, monthLabel, DASH } from '../lib/format'
  import { money } from '../lib/settings.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import BarChart from '../lib/charts/BarChart.svelte'
  import LineChart from '../lib/charts/LineChart.svelte'

  // RULING P1-3: annotation form, optional + guarded. The bundle prop is named
  // `view` (not `derived`) so the $derived runes below stay legal (P1-10).
  let { dataset, view }: { dataset?: Dataset; view?: DerivedBundle } = $props()

  // Selected row for the month card; null falls back to the newest month.
  let selectedMonth = $state<Snapshot | null>(null)

  const snaps = $derived(view?.snapshots ?? dataset?.snapshots ?? [])
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

  // Group the flat month list by year so the default view is ~10 rows, not 124 — each
  // year expands (DataTable's built-in detail mechanism) into its own months, still with
  // every original column.
  type YearGroup = {
    year: string
    months: Snapshot[]
    startCapital: number | null
    endCapital: number
    netMevduatCekim: number
    netKZ: number
    nakitTemettu: number
    vergiKomisyon: number
  }

  const yearGroups = $derived.by<YearGroup[]>(() => {
    const byYear = new Map<string, Snapshot[]>()
    for (const s of rows) {
      const arr = byYear.get(s.tarih.slice(0, 4)) ?? []
      arr.push(s)
      byYear.set(s.tarih.slice(0, 4), arr)
    }
    // `rows` is newest-first, so years come out of the map newest-first too.
    return [...byYear.entries()].map(([year, months]) => {
      const ascInYear = [...months].sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
      const first = ascInYear[0]
      const last = ascInYear[ascInYear.length - 1]
      return {
        year,
        months,
        startCapital: first.baslangicSermayesi_usd,
        endCapital: last.toplamOzkaynak_usd,
        netMevduatCekim: months.reduce((s, m) => s + m.netMevduatCekim_usd, 0),
        netKZ: months.reduce((s, m) => s + m.netKZ_usd, 0),
        nakitTemettu: months.reduce((s, m) => s + m.nakitTemettu_usd, 0),
        vergiKomisyon: months.reduce((s, m) => s + m.vergiKomisyon_usd, 0),
      }
    })
  })

  function yearGetiri(g: YearGroup): string {
    return g.startCapital == null || g.startCapital === 0 ? DASH : pct(g.netKZ / g.startCapital)
  }

  const yearColumns = [
    { key: 'year', label: 'Yıl', sortable: true },
    {
      key: 'startCapital',
      label: 'Başlangıç Sermaye',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number | null) => money(v as number),
    },
    {
      key: 'endCapital',
      label: 'Dönem Sonu',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number) => money(v),
    },
    {
      key: 'netKZ',
      label: 'Net K/Z',
      align: 'right' as const,
      sortable: true,
      tone: 'sign' as const,
      fmt: (v: number) => money(v, { sign: true }),
    },
    {
      key: '_getiri',
      label: '% Getiri',
      align: 'right' as const,
      fmt: (_v: unknown, row: YearGroup) => yearGetiri(row),
    },
  ]

  const columns = [
    { key: 'tarih', label: 'Ay', fmt: (v: string) => monthLabel(v) },
    {
      key: 'baslangicSermayesi_usd',
      label: 'Başlangıç Sermaye',
      align: 'right' as const,
      fmt: (v: number | null) => money(v as number),
    },
    {
      key: 'netMevduatCekim_usd',
      label: 'Net Mevduat/Çekim',
      align: 'right' as const,
      fmt: (v: number) => money(v),
    },
    {
      key: 'netKZ_usd',
      label: 'Kazanç',
      align: 'right' as const,
      fmt: (v: number) => (v > 0 ? money(v) : DASH),
    },
    {
      key: 'netKZ_usd',
      label: 'Kayıp',
      align: 'right' as const,
      fmt: (v: number) => (v < 0 ? money(v) : DASH),
    },
    {
      key: 'nakitTemettu_usd',
      label: 'Nakit Temettü',
      align: 'right' as const,
      fmt: (v: number) => money(v),
    },
    {
      key: 'toplamOzkaynak_usd',
      label: 'Dönem Sonu',
      align: 'right' as const,
      fmt: (v: number) => money(v),
    },
    {
      key: 'vergiKomisyon_usd',
      label: 'Vergi & Komisyon',
      align: 'right' as const,
      fmt: (v: number) => money(v),
    },
    {
      key: '_getiri',
      label: '% Getiri',
      align: 'right' as const,
      fmt: (_v: unknown, row: Snapshot) => getiri(row),
    },
  ]
</script>

{#snippet monthDetail(g: YearGroup)}
  <div class="year-detail">
    <DataTable {columns} rows={g.months} onRowClick={(row) => (selectedMonth = row)} />
  </div>
{/snippet}

{#if dataset}
  <section class="aylik">
    <SectionHeader title="Aylık Rapor" note={`${rows.length} ay · ${yearGroups.length} yıl — bir yıla tıklayın`} />

    <DataTable
      columns={yearColumns}
      rows={yearGroups}
      rowKey={(g) => g.year}
      detail={monthDetail}
      initialSort={{ key: 'year', dir: 'desc' }}
    />

    {#if current}
      <SectionHeader title="Seçili ay" />
      <dl class="month-card" data-testid="month-card">
        <div><dt>Ay</dt><dd>{monthLabel(current.tarih)}</dd></div>
        <div>
          <dt>Başlangıç Sermaye</dt>
          <dd class="num">{money(current.baslangicSermayesi_usd as number)}</dd>
        </div>
        <div>
          <dt>Net Mevduat/Çekim</dt>
          <dd class="num">{money(current.netMevduatCekim_usd)}</dd>
        </div>
        <div>
          <dt>Net K/Z</dt>
          <dd class="num">{money(current.netKZ_usd, { sign: true })}</dd>
        </div>
        <div>
          <dt>Nakit Temettü</dt>
          <dd class="num">{money(current.nakitTemettu_usd)}</dd>
        </div>
        <div>
          <dt>Dönem Sonu</dt>
          <dd class="num">{money(current.toplamOzkaynak_usd)}</dd>
        </div>
        <div>
          <dt>Vergi & Komisyon</dt>
          <dd class="num">{money(current.vergiKomisyon_usd)}</dd>
        </div>
        <div><dt>% Getiri</dt><dd class="num">{getiri(current)}</dd></div>
      </dl>
    {/if}

    <SectionHeader title="Aylık net K/Z" />
    <BarChart {bars} orient="v" fmt={(v) => money(v, { sign: true })} />

    <SectionHeader title="Özkaynak performans eğrisi" />
    <LineChart {series} labels={sortedAsc.map((s) => monthLabel(s.tarih))} fmtY={(v) => money(v)} />
  </section>
{:else}
  <EmptyState title="Aylık Rapor" detail="Veri bekleniyor." />
{/if}

<style>
  .aylik {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1100px, 96vw);
    margin: 0 auto;
    font-size: 1.05rem;
  }
  .year-detail {
    margin: 0.4rem 0 0.6rem;
  }
  /* Slightly roomier cells than the shared DataTable default, scoped to this page only
     (other pages' tables are dense by design and shouldn't inherit this). */
  .aylik :global(.dt-wrap th),
  .aylik :global(.dt-wrap td) {
    padding: 0.55rem 0.75rem;
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
