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
    return holdingsByPortfolio(view.positions.open, dataset.transactions, dataset.instruments, dataset.assetTransfers, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })
  })

  const overall = $derived(
    (view?.byPortfolio ?? []).map((r) => ({ label: r.key, value: r.tutarUsd })),
  )

  // Mirrors the slice palette in Donut.svelte so the legend swatches line up.
  const PALETTE = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']

  // Legend entries for a set of donut slices: amount (no kuruş) + share of the whole.
  function legendFor(slices: { label: string; value: number }[]) {
    const sum = slices.reduce((s, x) => s + x.value, 0)
    return slices.map((s, i) => ({
      label: s.label,
      color: PALETTE[i % PALETTE.length],
      amount: money(s.value, { whole: true }),
      share: sum ? pct(s.value / sum) : DASH,
    }))
  }

  // Top 4 holdings by cost, the rest bucketed into "Diğer" — keeps slice count at or under
  // the shared Donut palette's 4 colors, so a portfolio with many small positions doesn't
  // end up with repeated, indistinguishable slice colors.
  function instrumentMix(g: HoldingGroup) {
    const sorted = [...g.rows].sort((a, b) => b.toplamMaliyetUsd - a.toplamMaliyetUsd)
    const top = sorted.slice(0, 4)
    const rest = sorted.slice(4)
    const slices = top.map((r) => ({ label: r.kod, value: r.toplamMaliyetUsd }))
    if (rest.length) slices.push({ label: 'Diğer', value: rest.reduce((s, r) => s + r.toplamMaliyetUsd, 0) })
    return slices
  }

  // Each row carries its weight within its own portfolio: `_costW` by cost, `_valW` by
  // current value (null when prices aren't in yet).
  function rowsFor(g: HoldingGroup) {
    return g.rows.map((r) => ({
      ...r,
      _costW: g.totalCostUsd ? r.toplamMaliyetUsd / g.totalCostUsd : null,
      _valW:
        g.totalValueUsd != null && g.totalValueUsd !== 0 && r.degerUsd != null
          ? r.degerUsd / g.totalValueUsd
          : null,
    }))
  }

  const cols = [
    { key: '_costW', label: '% Mlyt', align: 'right' as const, sortable: true, fmt: (v: number | null) => (v == null ? DASH : pct(v)) },
    { key: 'kod', label: 'Hisse', sortable: true },
    { key: 'sinif', label: 'Sınıf', sortable: true },
    { key: 'lot', label: 'Lot', align: 'right' as const, sortable: true, fmt: (v: number) => lot(v) },
    { key: 'ortMaliyetUsd', label: 'Ort. Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'toplamMaliyetUsd', label: 'Toplam Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'guncelFiyatUsd', label: 'Güncel Fiyat', align: 'right' as const, fmt: (v: number | null) => (v == null ? DASH : money(v)) },
    { key: 'degerUsd', label: 'Değer', align: 'right' as const, sortable: true, fmt: (v: number | null) => (v == null ? DASH : money(v)) },
    { key: 'kzUsd', label: 'Gerç.mmiş K/Z', align: 'right' as const, sortable: true, tone: 'sign' as const, fmt: (v: number | null) => (v == null ? DASH : money(v, { sign: true })) },
    { key: 'kzPct', label: '%', align: 'right' as const, sortable: true, tone: 'sign' as const, fmt: (v: number | null) => (v == null ? DASH : pct(v)) },
    { key: '_valW', label: '% Portföy', align: 'right' as const, sortable: true, fmt: (v: number | null) => (v == null ? DASH : pct(v)) },
  ]
</script>

{#if dataset && view}
  <section class="portfoyler">
    <SectionHeader title="Portföyler" />
    <div class="pie-row">
      <div class="pie-item">
        <span class="pie-label">Tümü</span>
        <Donut slices={overall} fmt={(v) => money(v, { whole: true })} />
        <ul class="legend">
          {#each legendFor(overall) as e}
            <li>
              <span class="sw" style:background={e.color}></span>
              <span class="lg-label">{e.label}</span>
              <span class="lg-amt">{e.amount}</span>
              <span class="lg-pct">{e.share}</span>
            </li>
          {/each}
        </ul>
      </div>
      {#each groups as g}
        <div class="pie-item">
          <span class="pie-label">{g.key}</span>
          <Donut
            slices={instrumentMix(g)}
            size={104}
            thickness={16}
            fmt={(v) => money(v, { whole: true })}
          />
          <ul class="legend">
            {#each legendFor(instrumentMix(g)) as e}
              <li>
                <span class="sw" style:background={e.color}></span>
                <span class="lg-label">{e.label}</span>
                <span class="lg-amt">{e.amount}</span>
                <span class="lg-pct">{e.share}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
    {#each groups as g}
      <div class="panel">
        <SectionHeader
          title={g.key}
          note={`${money(g.totalCostUsd)} maliyet · ${g.totalValueUsd == null ? DASH : money(g.totalValueUsd)} değer · ${g.unrealUsd == null ? DASH : money(g.unrealUsd, { sign: true })}`}
        />
        <DataTable columns={cols} rows={rowsFor(g)} initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }} />
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
  .pie-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1.75rem;
    margin: 0.5rem 0 1.5rem;
  }
  .pie-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .pie-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .legend {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
    min-width: 160px;
  }
  .legend li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: baseline;
    column-gap: 0.5rem;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  .sw {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    align-self: center;
  }
  .lg-label {
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lg-amt {
    color: var(--ink);
  }
  .lg-pct {
    color: var(--ink-soft);
    min-width: 3.2em;
    text-align: right;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.25rem 1rem 1rem;
    margin-bottom: 1.25rem;
  }
</style>
