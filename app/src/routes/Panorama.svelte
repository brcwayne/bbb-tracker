<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { usd, pct, dateShort, DASH } from '../lib/format'
  import { money, settings, PERIODS } from '../lib/settings.svelte'
  import KpiBand from '../lib/ui/KpiBand.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import LineChart from '../lib/charts/LineChart.svelte'
  import Donut from '../lib/charts/Donut.svelte'
  import Histogram from '../lib/charts/Histogram.svelte'
  import BarChart from '../lib/charts/BarChart.svelte'

  // RULING P1-3 annotation form; props optional, guarded in the template.
  // The prop name `derived` collides with the `$derived` rune, so the view
  // model is assembled by a plain function under a template guard.
  let { dataset, derived }: { dataset?: Dataset; derived?: DerivedBundle } = $props()

  const PALETTE = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']

  const toneOf = (n: number): 'gain' | 'loss' | 'neutral' =>
    n > 0 ? 'gain' : n < 0 ? 'loss' : 'neutral'

  function buildView(ds: Dataset, d: DerivedBundle) {
    void settings.currency // re-run buildView when the display currency flips
    const snaps = d.snapshots
    const lastSnap = snaps.at(-1)
    const equityUsd = lastSnap ? lastSnap.toplamOzkaynak_usd : NaN
    const realizedUsd = d.positions.realizedTotalUsd
    const nakitUsd = Object.values(ds.meta.nakitHesapBazli).reduce((s, v) => s + v, 0)
    const ytd = d.periods.find((p) => p.period === 'YTD')
    const ytdUsd = ytd ? ytd.netKzUsd : NaN
    const periodLabel = PERIODS.find((p) => p.key === settings.period)?.label ?? ''

    return {
      kpiItems: [
        { label: 'Toplam Özkaynak', value: money(equityUsd), num: equityUsd, fmt: (n: number) => money(n) },
        {
          label: 'Gerçekleşmiş Kâr',
          value: money(realizedUsd),
          num: realizedUsd,
          fmt: (n: number) => money(n),
          tone: toneOf(realizedUsd),
        },
        { label: 'Nakit', value: money(nakitUsd), num: nakitUsd, fmt: (n: number) => money(n) },
        {
          label: 'YTD K/Z',
          value: money(ytdUsd),
          num: Number.isFinite(ytdUsd) ? ytdUsd : 0,
          fmt: (n: number) => money(n),
          tone: toneOf(Number.isFinite(ytdUsd) ? ytdUsd : 0),
        },
        { label: 'İşlem', value: String(ds.transactions.length) },
      ],
      headerNote:
        `son bilinen — ${dateShort(ds.meta.olusturulma.slice(0, 10))}` +
        (settings.period === 'all' ? '' : ` · ${periodLabel}`),
      equitySeries: snaps.map((s, i) => ({ x: i, y: s.toplamOzkaynak_usd })),
      equityLabels: snaps.map((s) => dateShort(s.tarih.slice(0, 10))),
      classSlices: d.byClass.map((r) => ({ label: r.key, value: r.tutarUsd })),
      classTotal: d.byClass.reduce((s, r) => s + r.tutarUsd, 0),
      classLegend: d.byClass.map((r) => ({
        label: r.key,
        value: `${money(r.tutarUsd)} · ${pct(r.pay)}`,
      })),
      portfolioSlices: d.byPortfolio.map((r) => ({ label: r.key, value: r.tutarUsd })),
      portfolioTotal: d.byPortfolio.reduce((s, r) => s + r.tutarUsd, 0),
      portfolioLegend: d.byPortfolio.map((r) => ({
        label: r.key,
        value: `${money(r.tutarUsd)} · ${pct(r.pay)}`,
      })),
      histBuckets: d.buckets.map((b) => ({
        label: b.label,
        count: b.count,
        items: [...b.items]
          .sort((x, y) => (y.tarih < x.tarih ? -1 : y.tarih > x.tarih ? 1 : 0))
          .slice(0, 5)
          .map((it) => `${it.kod.padEnd(8, ' ').slice(0, 8)} ${pct(it.r)}`),
      })),
      winLossSlices: [
        { label: 'Kazanç', value: d.winLoss.wins },
        { label: 'Kayıp', value: d.winLoss.losses },
      ],
      winLossLegend: [
        { label: 'Kazanç', value: String(d.winLoss.wins) },
        { label: 'Kayıp', value: String(d.winLoss.losses) },
      ],
      profitLossSlices: [
        { label: 'Kâr', value: d.winLoss.kazancToplam },
        { label: 'Zarar', value: Math.abs(d.winLoss.zararToplam) },
      ],
      profitLossLegend: [
        { label: 'Kâr', value: money(d.winLoss.kazancToplam) },
        { label: 'Zarar', value: money(Math.abs(d.winLoss.zararToplam)) },
      ],
      moverBars: [...d.movers.gainers, ...d.movers.losers].map((c) => ({
        label: c.kod,
        value: c.gerceklesmisKzUsd,
      })),
      periods: d.periods,
    }
  }

  const periodColumns = [
    { key: 'period', label: 'Dönem' },
    {
      key: 'netKzUsd',
      label: 'K/Z',
      align: 'right' as const,
      fmt: (v: number) => money(v, { sign: true }),
    },
    {
      key: 'pct',
      label: '%',
      align: 'right' as const,
      fmt: (v: number | null) => (v == null ? DASH : pct(v)),
    },
  ]
</script>

{#snippet legend(rows: { label: string; value: string }[])}
  <ul class="legend">
    {#each rows as r, i}
      <li>
        <span class="swatch" style:background={PALETTE[i % PALETTE.length]}></span>
        <span class="lg-label">{r.label}</span>
        <span class="lg-value num">{r.value}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#if dataset && derived}
  {@const vm = buildView(dataset, derived)}
  <section class="panorama">
    <KpiBand items={vm.kpiItems} />

    <SectionHeader title="Panorama" note={vm.headerNote} />

    <SectionHeader title="Özkaynak eğrisi" />
    <LineChart series={vm.equitySeries} labels={vm.equityLabels} fmtY={(v) => money(v)} />

    <div class="grid-2">
      <div class="panel">
        <SectionHeader title="Varlık sınıfı dağılımı" note="maliyet bazlı" />
        <div class="donut-row">
          <Donut slices={vm.classSlices} total={vm.classTotal} fmt={(v) => money(v)} />
          {@render legend(vm.classLegend)}
        </div>
      </div>
      <div class="panel">
        <SectionHeader title="Portföy dağılımı" note="maliyet bazlı" />
        <div class="donut-row">
          <Donut slices={vm.portfolioSlices} total={vm.portfolioTotal} fmt={(v) => money(v)} />
          {@render legend(vm.portfolioLegend)}
        </div>
      </div>
    </div>

    <SectionHeader title="Kâr/zarar dağılımı" note="üzerine gel → o dilimin son işlemleri" />
    <Histogram buckets={vm.histBuckets} />

    <div class="grid-2">
      <div class="panel">
        <SectionHeader title="Kazanç / kayıp" note="adet" />
        <div class="donut-row">
          <Donut slices={vm.winLossSlices} size={112} thickness={18} totalLabel="İşlem" fmt={(v) => `${v}`} />
          {@render legend(vm.winLossLegend)}
        </div>
      </div>
      <div class="panel">
        <SectionHeader title="Kâr / zarar toplamı" />
        <div class="donut-row">
          <Donut slices={vm.profitLossSlices} size={112} thickness={18} fmt={(v) => money(v)} />
          {@render legend(vm.profitLossLegend)}
        </div>
      </div>
    </div>

    <SectionHeader title="Kümülatif en çok kazandıran / kaybettiren" />
    <BarChart bars={vm.moverBars} orient="h" fmt={(v) => money(v, { sign: true })} />

    <SectionHeader title="Dönemsel performans" />
    <DataTable columns={periodColumns} rows={vm.periods} />
  </section>
{:else}
  <EmptyState title="Panorama" detail="Veri bekleniyor." />
{/if}

<style>
  .panorama {
    padding: 1.25rem 1.25rem 2rem;
    max-width: 900px;
    margin: 0 auto;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .panel {
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.25rem 1rem 1rem;
  }
  .donut-row {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85em;
  }
  .legend li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .swatch {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
    flex: none;
    align-self: center;
  }
  .lg-label {
    color: var(--ink-soft);
    min-width: 4.5rem;
  }
  .lg-value {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }
  @media (min-width: 720px) {
    .grid-2 {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
