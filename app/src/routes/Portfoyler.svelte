<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { holdingsByPortfolio, type HoldingGroup, type HoldingRow } from '../lib/data/breakdowns'
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

  // Overall pie, one slice per portfolio: by cost, and by current value (value
  // falls back to cost per group until its prices are in).
  const overallCost = $derived(groups.map((g) => ({ label: g.key, value: g.totalCostUsd })))
  const overallValue = $derived(
    groups.map((g) => ({ label: g.key, value: g.totalValueUsd ?? g.totalCostUsd })),
  )

  // Top 4 holdings, the rest bucketed into "Diğer" — keeps slice count at or under
  // the shared Donut palette's 4 colors. `metric` picks cost vs. current value
  // (value falls back to a row's cost while that row is unpriced).
  function instrumentMix(g: HoldingGroup, metric: 'cost' | 'value') {
    const val = (r: HoldingRow) =>
      metric === 'value' ? r.degerUsd ?? r.toplamMaliyetUsd : r.toplamMaliyetUsd
    const sorted = [...g.rows].sort((a, b) => val(b) - val(a))
    const top = sorted.slice(0, 4)
    const rest = sorted.slice(4)
    const slices = top.map((r) => ({ label: r.kod, value: val(r) }))
    if (rest.length) slices.push({ label: 'Diğer', value: rest.reduce((s, r) => s + val(r), 0) })
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

  // Collapsible pie rows — remembered per viewer.
  function loadFlag(key: string, dflt: boolean): boolean {
    try {
      const v = localStorage.getItem(key)
      return v == null ? dflt : v === '1'
    } catch {
      return dflt
    }
  }
  function saveFlag(key: string, v: boolean) {
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  let showCost = $state(loadFlag('bbb-pf-pies-cost', true))
  let showValue = $state(loadFlag('bbb-pf-pies-value', true))
  $effect(() => saveFlag('bbb-pf-pies-cost', showCost))
  $effect(() => saveFlag('bbb-pf-pies-value', showValue))

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

{#snippet pieRow(overall: { label: string; value: number }[], metric: 'cost' | 'value')}
  <div class="pie-row">
    <div class="pie-item">
      <span class="pie-label">Tümü</span>
      <Donut slices={overall} captionBelow fmt={(v) => money(v, { whole: true })} />
    </div>
    {#each groups as g}
      <div class="pie-item">
        <span class="pie-label">{g.key}</span>
        <Donut
          slices={instrumentMix(g, metric)}
          size={104}
          thickness={16}
          captionBelow
          fmt={(v) => money(v, { whole: true })}
        />
      </div>
    {/each}
  </div>
{/snippet}

{#if dataset && view}
  <section class="portfoyler">
    <SectionHeader title="Portföyler" />

    <div class="pie-group">
      <button
        class="pie-toggle"
        aria-expanded={showCost}
        onclick={() => (showCost = !showCost)}
      >
        <span class="chev" class:open={showCost} aria-hidden="true">▸</span>
        Maliyet dağılımı
      </button>
      {#if showCost}{@render pieRow(overallCost, 'cost')}{/if}
    </div>

    <div class="pie-group">
      <button
        class="pie-toggle"
        aria-expanded={showValue}
        onclick={() => (showValue = !showValue)}
      >
        <span class="chev" class:open={showValue} aria-hidden="true">▸</span>
        Güncel değer dağılımı
      </button>
      {#if showValue}{@render pieRow(overallValue, 'value')}{/if}
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
  .pie-group {
    margin: 0.25rem 0 0.5rem;
  }
  .pie-toggle {
    appearance: none;
    border: 0;
    background: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .pie-toggle:hover {
    color: var(--ink);
  }
  .chev {
    display: inline-block;
    transition: transform 0.12s ease;
    font-size: 0.7em;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .pie-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    align-items: start;
    justify-items: center;
    gap: 1.25rem 1rem;
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
  .panel {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.25rem 1rem 1rem;
    margin-bottom: 1.25rem;
  }
</style>
