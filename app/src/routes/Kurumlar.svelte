<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Broker } from '../lib/data/types'
  import type { AppState, DerivedBundle } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import { holdingsByBroker, type HoldingGroup } from '../lib/data/breakdowns'
  import {
    cashSplitByHesap,
    type BrokerCashSplit,
    formatBrokerCash,
    formatBrokerCashTable,
  } from '../lib/data/cashBalances'
  import { prices } from '../lib/prices.svelte'
  import { money, settings } from '../lib/settings.svelte'
  import { pct, lot, tryFmt, usd, DASH } from '../lib/format'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import KurumNakitDuzelt from './KurumNakitDuzelt.svelte'

  let {
    dataset,
    view,
    source,
    store,
  }: { dataset?: Dataset; view?: DerivedBundle; source?: DataSource; store?: Writable<AppState> } = $props()

  function findBrokerKod(ad: string, brokers: Broker[]): string {
    return brokers.find((b) => b.ad === ad)?.kod ?? ad
  }

  function formatBrokerCashTableHtml(split: BrokerCashSplit | undefined): string {
    if (!split) return `<span class="cash-zero">${settings.currency === 'TRY' ? tryFmt(0) : usd(0)}</span>`
    const hasTl = Math.abs(split.tl) >= 0.005
    const hasUsd = Math.abs(split.usd) >= 0.005

    if (hasTl && hasUsd) {
      return `<span class="cash-tl">${tryFmt(split.tl)}</span><span class="cash-sep"> · </span><span class="cash-usd">${usd(split.usd)}</span>`
    }
    if (hasTl) return `<span class="cash-tl">${tryFmt(split.tl)}</span>`
    if (hasUsd) return `<span class="cash-usd">${usd(split.usd)}</span>`
    return `<span class="cash-zero">${settings.currency === 'TRY' ? tryFmt(0) : usd(0)}</span>`
  }

  let duzeltHesap = $state<string | null>(null)
  const isDrive = $derived(Boolean(source?.save))

  const splits = $derived(
    dataset ? cashSplitByHesap(dataset, settings.rate) : {},
  )

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
    groups.map((g) => {
      const kod = findBrokerKod(g.key, dataset?.brokers ?? [])
      const split = splits[kod] ?? { tl: 0, usd: 0, totalUsd: 0 }
      return {
        kurum: g.key,
        sahip: g.sahip ?? '',
        nakit: split.totalUsd,
        nakitSplit: split,
        maliyet: g.totalCostUsd,
        deger: g.totalValueUsd,
        kz: g.unrealUsd,
      }
    }),
  )
  const summaryCols = [
    { key: 'kurum', label: 'Kurum', sortable: true },
    { key: 'sahip', label: 'Sahip' },
    {
      key: 'nakit',
      label: 'Nakit',
      align: 'right' as const,
      sortable: true,
      html: true,
      fmt: (_: number, r: any) => formatBrokerCashTableHtml(r.nakitSplit),
    },
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
      {@const kod = findBrokerKod(g.key, dataset.brokers)}
      {@const split = splits[kod] ?? { tl: 0, usd: 0, totalUsd: 0 }}
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title-area">
            <SectionHeader title={g.key} note={g.sahip} />
            <div class="broker-cash-box" title="Kurum Nakit Bakiyesi">
              <span class="cash-label">Nakit:</span>
              {#if Math.abs(split.tl) >= 0.005}
                <span class="cash-badge cash-tl">{tryFmt(split.tl)}</span>
              {/if}
              {#if Math.abs(split.tl) >= 0.005 && Math.abs(split.usd) >= 0.005}
                <span class="cash-sep">·</span>
              {/if}
              {#if Math.abs(split.usd) >= 0.005}
                <span class="cash-badge cash-usd">{usd(split.usd)}</span>
              {/if}
              {#if Math.abs(split.tl) < 0.005 && Math.abs(split.usd) < 0.005}
                <span class="cash-badge cash-zero">{settings.currency === 'TRY' ? tryFmt(0) : usd(0)}</span>
              {/if}
              {#if Math.abs(split.tl) >= 0.005 && Math.abs(split.usd) >= 0.005}
                <span class="cash-total">(Toplam: {settings.currency === 'TRY' ? tryFmt(split.tl + split.usd * settings.rate) : usd(split.usd + (settings.rate > 0 ? split.tl / settings.rate : 0))})</span>
              {/if}
            </div>
          </div>
          <button
            type="button"
            class="btn-duzelt"
            disabled={!isDrive}
            title={isDrive ? undefined : 'Sadece Google Drive kaynağında düzenlenebilir'}
            onclick={() => (duzeltHesap = kod)}
          >
            ⚖ Nakit Düzelt
          </button>
        </div>
        {#if duzeltHesap === kod}
          <div class="form-modal">
            <KurumNakitDuzelt
              {source}
              {store}
              hesap={kod}
              hesapAdi={g.key}
              hesaplananTl={split.tl}
              hesaplananUsd={split.usd}
              onSaved={() => (duzeltHesap = null)}
              onCancel={() => (duzeltHesap = null)}
            />
          </div>
        {/if}
        {#if g.rows.length}
          <DataTable columns={cols} rows={g.rows} initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }} />
        {:else}
          <p class="muted">Bu kurumda açık pozisyon yok.</p>
        {/if}
      </div>
    {/each}
    <p class="muted foot">Yeni kurum eklemek için "Ekle" sekmesini kullanın.</p>
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
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.25rem 0 0.5rem;
  }
  .panel-title-area {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
  }
  .panel-title-area :global(.section-header) {
    margin: 0.5rem 0;
  }
  .broker-cash-box {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.35rem 0.75rem;
    font-size: 0.95rem;
    line-height: 1.25;
  }
  .cash-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
  }
  .cash-badge {
    font-family: var(--font-num);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }
  .cash-tl,
  :global(.cash-tl) {
    color: var(--cash-tl);
  }
  .cash-usd,
  :global(.cash-usd) {
    color: var(--cash-usd);
  }
  .cash-zero,
  :global(.cash-zero) {
    color: var(--ink-soft);
    font-family: var(--font-num);
    font-weight: 600;
  }
  .cash-sep,
  :global(.cash-sep) {
    color: var(--hairline);
    font-weight: bold;
    margin: 0 0.15rem;
  }
  :global(.dt-wrap table td[data-col="nakit"]) {
    font-size: 0.92rem;
  }
  :global(.dt-wrap table td[data-col="nakit"] .cash-tl),
  :global(.dt-wrap table td[data-col="nakit"] .cash-usd) {
    font-family: var(--font-num);
    font-weight: 600;
  }
  :global(.dt-wrap table td[data-col="nakit"] .cash-sep) {
    color: var(--ink-soft);
    opacity: 0.6;
    margin: 0 0.2rem;
  }
  .cash-total {
    font-family: var(--font-num);
    font-size: 0.85rem;
    color: var(--ink-soft);
    margin-left: 0.25rem;
  }
  .btn-duzelt {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.78rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-duzelt:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--gold);
  }
  .btn-duzelt:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .form-modal {
    margin: 0.5rem 0 0.85rem;
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
