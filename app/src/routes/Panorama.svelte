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
  import { prices } from '../lib/prices.svelte'
  import { unrealizedTotalUsd } from '../lib/data/unrealized'

  // RULING P1-3 annotation form; props optional, guarded in the template.
  // The prop name `derived` collides with the `$derived` rune, so the view
  // model is assembled by a plain function under a template guard.
  let { dataset, derived, view }: { dataset?: Dataset; derived?: DerivedBundle; view?: DerivedBundle } = $props()

  const PALETTE = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']

  const toneOf = (n: number): 'gain' | 'loss' | 'neutral' =>
    n > 0 ? 'gain' : n < 0 ? 'loss' : 'neutral'

  function buildView(ds: Dataset, d: DerivedBundle) {
    void settings.currency // re-run buildView when the display currency flips
    void prices.status // re-run buildView when live prices land
    const openRaw = d.positions.open.filter((pp) => pp.lot > 1e-9)
    const unrealTotal = unrealizedTotalUsd(openRaw, ds.instruments, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })
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
        {
          label: 'Gerçekleşmemiş K/Z',
          value: unrealTotal == null ? DASH : money(unrealTotal),
          num: unrealTotal == null ? undefined : unrealTotal,
          fmt: unrealTotal == null ? undefined : (n: number) => money(n),
          tone: unrealTotal == null ? undefined : toneOf(unrealTotal),
        },
        { label: 'İşlem', value: String(ds.transactions.length) },
      ],
      headerNote:
        `son bilinen — ${dateShort(ds.meta.olusturulma.slice(0, 10))}` +
        (settings.period === 'all' ? '' : ` · ${periodLabel}`),
      // Panorama's equity curve is a "recent shape" view — last ~12 months. The full
      // all-time curve lives on the Aylık Rapor page.
      equitySeries: snaps.slice(-13).map((s, i) => ({ x: i, y: s.toplamOzkaynak_usd })),
      equityLabels: snaps.slice(-13).map((s) => dateShort(s.tarih.slice(0, 10))),
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
      // One reconciled summary instead of the old hero band + two overlapping mini panels
      // (which showed the same concepts under 5 different TR/EN labels and two different
      // "total equity" numbers). "Güncel Özkaynak" is the actual latest monthly snapshot;
      // everything else is a supporting figure around it.
      ozet:
        view == null
          ? null
          : (() => {
              const b = view.dashboard
              return {
                guncelOzkaynak: equityUsd,
                yatirilanSermaye: b.toplamSermaye,
                ozkaynakGetiri: equityUsd - b.toplamSermaye,
                gerceklesmisKz: b.realized,
                gerceklesmemisKz: unrealTotal,
                temettu: b.temettu,
                cekimler: b.cekimler,
                nakit: nakitUsd,
                kapananKazanc: b.totalGain,
                kapananKayip: b.totalLoss,
                kapananNet: b.gainLoss,
              }
            })(),
      month: view?.monthPerf ?? null,
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
    {#if vm.ozet}
      <SectionHeader title="Özet" />
      <dl class="mini">
        <div>
          <dt>Güncel Özkaynak <span class="hint">son ay</span></dt>
          <dd class="num strong">{money(vm.ozet.guncelOzkaynak)}</dd>
        </div>
        <div><dt>Yatırılan Sermaye</dt><dd class="num">{money(vm.ozet.yatirilanSermaye)}</dd></div>
        <div>
          <dt>Özkaynak Getirisi <span class="hint">güncel − yatırılan</span></dt>
          <dd class="num" class:pos={vm.ozet.ozkaynakGetiri > 0} class:neg={vm.ozet.ozkaynakGetiri < 0}>
            {money(vm.ozet.ozkaynakGetiri, { sign: true })}
          </dd>
        </div>
        <div>
          <dt>Gerçekleşmiş K/Z</dt>
          <dd class="num" class:pos={vm.ozet.gerceklesmisKz > 0} class:neg={vm.ozet.gerceklesmisKz < 0}>
            {money(vm.ozet.gerceklesmisKz, { sign: true })}
          </dd>
        </div>
        <div>
          <dt>Gerçekleşmemiş K/Z</dt>
          <dd
            class="num"
            class:pos={(vm.ozet.gerceklesmemisKz ?? 0) > 0}
            class:neg={(vm.ozet.gerceklesmemisKz ?? 0) < 0}
          >
            {vm.ozet.gerceklesmemisKz == null ? DASH : money(vm.ozet.gerceklesmemisKz, { sign: true })}
          </dd>
        </div>
        <div><dt>Alınan Temettü</dt><dd class="num">{money(vm.ozet.temettu)}</dd></div>
        <div><dt>Çekimler</dt><dd class="num">{vm.ozet.cekimler === 0 ? DASH : money(vm.ozet.cekimler)}</dd></div>
        <div><dt>Nakit</dt><dd class="num">{money(vm.ozet.nakit)}</dd></div>
      </dl>

      <SectionHeader title="Kapanan İşlemler" note="tüm zamanlar" />
      <dl class="mini">
        <div><dt>Toplam Kazanç</dt><dd class="num pos">{money(vm.ozet.kapananKazanc)}</dd></div>
        <div><dt>Toplam Kayıp</dt><dd class="num neg">{money(vm.ozet.kapananKayip)}</dd></div>
        <div>
          <dt>Net</dt>
          <dd class="num" class:pos={vm.ozet.kapananNet > 0} class:neg={vm.ozet.kapananNet < 0}>
            {money(vm.ozet.kapananNet, { sign: true })}
          </dd>
        </div>
      </dl>

      {#if vm.month}
        <SectionHeader title="Bu Ay" />
        <dl class="mini month">
          <div><dt>Ay</dt><dd>{vm.month.ay}</dd></div>
          <div><dt>Başlangıç Sermaye</dt><dd class="num">{money(vm.month.begCapital as number)}</dd></div>
          <div><dt>Eklenen Mevduat</dt><dd class="num">{money(vm.month.addDeposit)}</dd></div>
          <div><dt>Alınan Temettü</dt><dd class="num">{money(vm.month.divReceived)}</dd></div>
          <div><dt>Net K/Z</dt><dd class="num" class:pos={vm.month.netKz > 0} class:neg={vm.month.netKz < 0}>{money(vm.month.netKz, { sign: true })}</dd></div>
          <div><dt>Çekim</dt><dd class="num">{money(vm.month.withdrawal)}</dd></div>
          <div><dt>Dönem Sonu</dt><dd class="num">{money(vm.month.endCapital)}</dd></div>
        </dl>
      {/if}
    {/if}
    <KpiBand items={vm.kpiItems} />

    <SectionHeader title="Panorama" note={vm.headerNote} />

    <SectionHeader title="Özkaynak eğrisi" note="son 12 ay" />
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
  .mini {
    margin: 0.25rem 0 0.75rem;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.25rem 1.5rem;
  }
  .mini dt .hint {
    font-size: 0.78em;
    color: var(--ink-soft);
    font-weight: 400;
  }
  .mini dd.strong {
    font-size: 1.15em;
  }
  .mini div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--hairline);
    padding: 0.3rem 0;
  }
  .mini dt {
    color: var(--ink-soft);
    font-size: 0.82em;
  }
  .mini dd {
    margin: 0;
    font-weight: 600;
  }
  .mini dd.pos {
    color: var(--gain);
  }
  .mini dd.neg {
    color: var(--loss);
  }
  .mini.month {
    grid-template-columns: 1fr 1fr;
  }
</style>
