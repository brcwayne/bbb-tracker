<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import {
    holdingsByPortfolio,
    derivePositionsByBroker,
    type HoldingGroup,
    type HoldingRow,
  } from '../lib/data/breakdowns'
  import type { OpenPosition } from '../lib/data/derive'
  import { prices } from '../lib/prices.svelte'
  import { money } from '../lib/settings.svelte'
  import { pct, lot, dateShort, DASH } from '../lib/format'
  import Donut from '../lib/charts/Donut.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  let { dataset, view }: { dataset?: Dataset; view?: DerivedBundle } = $props()

  const positionsByBroker = $derived.by(() => {
    if (!dataset) return new Map<string, OpenPosition[]>()
    return derivePositionsByBroker(dataset.transactions, dataset.assetTransfers ?? [])
  })

  function getBrokerBreakdownFor(kod: string) {
    if (!dataset) return []
    const res: { kod: string; hesap: string; ad: string; lot: number; pay: number; ortMaliyetUsd: number }[] = []
    let totalSymbolLot = 0

    for (const [hesap, posList] of positionsByBroker) {
      const pos = posList.find((p) => p.kod === kod)
      if (pos && pos.lot > 1e-9) {
        const broker = dataset.brokers?.find((b) => b.kod === hesap)
        res.push({
          kod,
          hesap,
          ad: broker?.ad ?? hesap,
          lot: pos.lot,
          pay: 0,
          ortMaliyetUsd: pos.ortMaliyetUsd,
        })
        totalSymbolLot += pos.lot
      }
    }

    if (totalSymbolLot > 0) {
      for (const item of res) {
        item.pay = item.lot / totalSymbolLot
      }
    }
    return res.sort((a, b) => b.lot - a.lot)
  }

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

{#snippet rowDetail(row: { kod: string; lot: number })}
  {@const brokers = getBrokerBreakdownFor(row.kod)}
  {@const txns = (dataset?.transactions ?? [])
    .filter((t) => t.enstruman === row.kod)
    .sort((a, b) =>
      a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
    )}
  <div class="rowdetail">
    <div class="bd-section">
      <div class="bd-title">📍 Kurum Dağılımı ({row.kod})</div>
      {#if brokers.length}
        <div class="bd-grid">
          {#each brokers as b}
            <div class="bd-card">
              <div class="bd-broker-title">
                <span class="bd-name">{b.ad}</span>
                {#if b.hesap !== b.ad}<span class="bd-code">({b.hesap})</span>{/if}
              </div>
              <div class="bd-lot-info">
                <span class="bd-lot">{lot(b.lot)} Lot</span>
                <span class="bd-pct">%{ (b.pay * 100).toFixed(1) }</span>
              </div>
              {#if b.ortMaliyetUsd > 0}
                <div class="bd-cost">Ort: {money(b.ortMaliyetUsd)}</div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted">Açık kurum pozisyonu bulunamadı.</p>
      {/if}
    </div>

    {#if txns.length}
      <div class="rd-sum">
        <span>İşlem Geçmişi ({txns.length} işlem):</span>
      </div>
      <div class="subtable-wrap">
        <table class="subtable">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Yön</th>
              <th class="r">Lot</th>
              <th class="r">Fiyat</th>
              <th>Kurum</th>
              <th>Portföy</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {#each txns.slice(0, 10) as t}
              <tr>
                <td>{dateShort(t.tarih)}</td>
                <td class="yon" class:al={t.yon === 'AL'} class:sat={t.yon === 'SAT'}>{t.yon}</td>
                <td class="r num">{lot(t.lot)}</td>
                <td class="r num">{t.girisParaBirimi === 'USD' ? money(t.fiyat_usd) : `${t.fiyat_tl ? t.fiyat_tl.toFixed(2) : t.fiyat_usd} TL`}</td>
                <td><strong class="hsp-tag">{t.hesap}</strong></td>
                <td>{t.portfoy}</td>
                <td class="note">{t.not || DASH}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if txns.length > 10}
        <p class="more-txns">ve {txns.length - 10} işlem daha...</p>
      {/if}
    {/if}
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
        <DataTable
          columns={cols}
          rows={rowsFor(g)}
          initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }}
          detail={rowDetail}
          rowKey={(r) => `${g.key}-${r.kod}`}
        />
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
  .rowdetail {
    padding: 0.75rem 1rem 1rem;
    background: var(--surface);
    border-top: 1px solid var(--hairline);
  }
  .bd-section {
    margin-bottom: 0.85rem;
  }
  .bd-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0.02em;
    margin-bottom: 0.45rem;
  }
  .bd-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .bd-card {
    background: var(--surface-raised, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.45rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 140px;
  }
  .bd-broker-title {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
  }
  .bd-name {
    font-weight: 600;
    color: var(--ink);
  }
  .bd-code {
    color: var(--ink-soft);
    font-size: 0.85em;
  }
  .bd-lot-info {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .bd-lot {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--gold, #f59e0b);
  }
  .bd-pct {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .bd-cost {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .rd-sum {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
    margin-bottom: 0.4rem;
  }
  .subtable-wrap {
    overflow-x: auto;
  }
  .subtable {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  .subtable th {
    text-align: left;
    font-weight: 600;
    color: var(--ink-soft);
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--hairline);
  }
  .subtable td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--hairline);
    color: var(--ink);
  }
  .subtable .r {
    text-align: right;
  }
  .subtable .num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }
  .subtable .yon.al {
    color: var(--gain, #10b981);
    font-weight: 600;
  }
  .subtable .yon.sat {
    color: var(--loss, #ef4444);
    font-weight: 600;
  }
  .hsp-tag {
    color: var(--ink);
  }
  .subtable .note {
    color: var(--ink-soft);
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more-txns {
    font-size: 0.78rem;
    color: var(--ink-soft);
    margin: 0.35rem 0 0;
    font-style: italic;
  }
  .muted {
    font-size: 0.82rem;
    color: var(--ink-soft);
    margin: 0;
  }
</style>
