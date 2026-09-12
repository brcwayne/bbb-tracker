<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import { pct, dateShort, dateTimeShort, DASH, monthLabel } from '../lib/format'
  import { money as formatMoney, settings, PERIODS } from '../lib/settings.svelte'
  import KpiBand from '../lib/ui/KpiBand.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import LineChart from '../lib/charts/LineChart.svelte'
  import Donut from '../lib/charts/Donut.svelte'
  import Histogram from '../lib/charts/Histogram.svelte'
  import BarChart from '../lib/charts/BarChart.svelte'
  import { prices, priceApiEnabled } from '../lib/prices.svelte'
  import { unrealizedTotalUsd, type PriceLookup } from '../lib/data/unrealized'
  import { CATEGORICAL } from '../lib/charts/palette'
  import { allocationByClassWithCash, cashRatios } from '../lib/data/allocation'
  import { liveEquity, type LiveEquity } from '../lib/data/dashboard'
  import { buildLedger } from '../lib/data/ledger'
  import { buildWaterfall, type WaterfallBreakdown } from '../lib/data/waterfall'
  import { buildEquityCurve, type AylikSermaye } from '../lib/data/equityCurve'
  import { holdingsByPortfolio } from '../lib/data/breakdowns'

  // Panorama displays high-level macro overview numbers, so strip cents/kuruş (whole: true)
  const money = (v: number | null | undefined, opts: Parameters<typeof formatMoney>[1] = {}) =>
    formatMoney(v, { whole: true, ...opts })

  let {
    dataset,
    derived,
    view,
    source,
  }: {
    dataset?: Dataset
    derived?: DerivedBundle
    view?: DerivedBundle
    source?: DataSource
  } = $props()

  function toneOf(n: number | null | undefined): 'gain' | 'loss' | 'neutral' | undefined {
    if (n == null || !Number.isFinite(n) || n === 0) return undefined
    return n > 0 ? 'gain' : 'loss'
  }

  function buildView(ds: Dataset, d: DerivedBundle) {
    void settings.period // re-run buildView when period changes
    void settings.basis // re-run buildView when valuation basis flips (H8)
    void prices.status // re-run buildView when live prices land

    const p: PriceLookup = {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    }

    const openRaw = d.positions.open.filter((pp) => pp.lot > 1e-9)
    const unrealTotal = unrealizedTotalUsd(openRaw, ds.instruments, p)
    const snaps = d.snapshots
    const lastSnap = snaps.at(-1)
    const equityUsd = lastSnap ? lastSnap.toplamOzkaynak_usd : NaN
    const realizedUsd = d.positions.realizedTotalUsd

    const fullEquityCurve = buildEquityCurve(ds, d.positions.sales)
    const equityCurveSlice = fullEquityCurve.slice(-13)

    const nakitUsd = Object.values(d.cashByHesap).reduce((s, v) => s + v, 0)
    const ytd = d.periods.find((pp) => pp.period === 'YTD')
    const ytdUsd = ytd ? ytd.netKzUsd : NaN
    const periodLabel = PERIODS.find((pp) => pp.key === settings.period)?.label ?? ''

    // G3, G4 & H8 allocation and cash ratios
    const alloc = allocationByClassWithCash(d.positions.open, ds.instruments, nakitUsd, p, settings.basis)

    const portLedger = buildLedger(ds.transactions, ds.assetTransfers ?? [], 'portfoy')
    const xauOpen = portLedger.byScope.get('XAU')?.open ?? []
    const cashRatio = cashRatios(d.positions.open, ds.instruments, nakitUsd, p, xauOpen)

    // H8 Portfolio breakdown respecting settings.basis
    const pfGroups = holdingsByPortfolio(
      d.positions.open,
      ds.transactions,
      ds.instruments,
      ds.assetTransfers ?? [],
      p,
    )
    const isDeger = settings.basis === 'deger'
    const pfItems = pfGroups.map((g) => {
      const val = isDeger ? (g.totalValueUsd ?? g.totalCostUsd) : g.totalCostUsd
      const hasFallback = isDeger && g.rows.some((r) => r.guncelFiyatUsd == null)
      return { key: g.key, tutarUsd: val, hasFallback }
    })
    const pfTotal = pfItems.reduce((s, r) => s + r.tutarUsd, 0) || 1
    const pfSorted = pfItems.sort((a, b) => b.tutarUsd - a.tutarUsd)
    const hasUnpricedPortfolio = isDeger && pfItems.some((r) => r.hasFallback)

    // G10 live equity
    const live = liveEquity(ds, d.positions, p, nakitUsd)

    // Month note
    const todayIso = new Date().toISOString().slice(0, 10)
    const thisMonthIso = todayIso.slice(0, 7)
    const snapMonthIso = lastSnap ? lastSnap.tarih.slice(0, 7) : ''
    const isPastMonth = snapMonthIso !== '' && snapMonthIso < thisMonthIso
    const monthNote = isPastMonth ? `son kapanan ay · ${monthLabel(todayIso)} verisi henüz girilmedi` : undefined

    const monthAy = d.monthPerf ? d.monthPerf.ay : (lastSnap ? monthLabel(lastSnap.tarih) : 'Ağustos 2026')

    const isDrive = source?.id === 'drive'
    const kaynakLabel = isDrive ? 'Google Drive' : 'Yerel dosya'
    const sonYazmaRaw = source?.lastModified ?? ds.meta.olusturulma
    const sonYazma = sonYazmaRaw ? dateTimeShort(sonYazmaRaw) : '—'

    // Fiyat kapsaması (I5)
    const totalPosCount = d.positions.open.length
    const pricedPosCount = totalPosCount - live.fiyatsizPozisyon
    let fiyatZamani = 'alınamadı (maliyet)'
    if (prices.asOf) {
      const asOfTime = prices.asOf.includes('T') ? prices.asOf.slice(11, 16) : prices.asOf
      fiyatZamani = `${pricedPosCount}/${totalPosCount} pozisyon · ${asOfTime}`
    } else if (!priceApiEnabled() || prices.status === 'idle') {
      fiyatZamani = 'API kapalı (maliyet)'
    } else if (prices.status === 'error') {
      fiyatZamani = 'alınamadı (maliyet)'
    }

    const unpricedInDeger = isDeger && live.fiyatsizPozisyon > 0

    return {
      alloc,
      cashRatio,
      live,
      monthAy,
      monthNote,
      unpricedInDeger,
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
          value: unrealTotal == null ? DASH : `${unpricedInDeger ? '≈ ' : ''}${money(unrealTotal)}`,
          num: unrealTotal == null ? undefined : unrealTotal,
          fmt: unrealTotal == null ? undefined : (n: number) => `${unpricedInDeger ? '≈ ' : ''}${money(n)}`,
          tone: unrealTotal == null ? undefined : toneOf(unrealTotal),
        },
        { label: 'İşlem', value: String(ds.transactions.length) },
      ],
      metaStrip: {
        kaynak: kaynakLabel,
        sonYazma,
        islemSayisi: ds.transactions.length,
        isDrive,
        fiyatZamani,
        kur: settings.rate ? settings.rate.toFixed(2) : '—',
        periodLabel: settings.period === 'all' ? '' : periodLabel,
      },
      equityCurveSlice,
      fullEquityCurve,
      equitySeries: equityCurveSlice.map((c, i) => ({ x: i, y: c.sermaye })),
      compareSeries: equityCurveSlice.map((c, i) => ({ x: i, y: c.excelSermaye })),
      equityLabels: equityCurveSlice.map((c) => monthLabel(c.ay)),
      classSlices: alloc.slices.map((r) => ({ label: r.etiket, value: r.tutarUsd })),
      classTotal: alloc.toplamUsd,
      classUnpriced: alloc.unpricedFallback,
      classLegend: alloc.slices.map((r) => ({
        label: r.etiket,
        value: `${money(r.tutarUsd)} · ${pct(r.pay)}`,
      })),
      portfolioSlices: pfSorted.map((r) => ({ label: r.key, value: r.tutarUsd })),
      portfolioTotal: pfTotal,
      portfolioUnpriced: hasUnpricedPortfolio,
      portfolioLegend: pfSorted.map((r) => ({
        label: r.key,
        value: `${money(r.tutarUsd)} · ${pct(r.tutarUsd / pfTotal)}`,
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
      ozet:
        view == null
          ? null
          : (() => {
              const b = view.dashboard
              const toplamGetiri = equityUsd - b.toplamSermaye
              const toplamGetiriPct = b.toplamSermaye > 0 ? toplamGetiri / b.toplamSermaye : null
              return {
                guncelOzkaynak: equityUsd,
                yatirilanSermaye: b.toplamSermaye,
                toplamGetiri,
                toplamGetiriPct,
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

  let selectedSnapIdx = $state<number | null>(null)

  function getWaterfall(
    ds: Dataset,
    d: DerivedBundle,
    equityCurveSlice: AylikSermaye[],
    fullEquityCurve: AylikSermaye[],
    idx: number | null,
  ): WaterfallBreakdown | null {
    if (idx == null) return null
    const cur = equityCurveSlice[idx]
    if (!cur) return null
    const fullIdx = fullEquityCurve.indexOf(cur)
    const prev = fullIdx > 0 ? fullEquityCurve[fullIdx - 1] : undefined
    const snap = ds.snapshots.find((s) => s.tarih.slice(0, 7) === cur.ay)
    return buildWaterfall(cur.ay, cur, prev, snap, d.positions.sales, ds.transactions)
  }
</script>

{#snippet legend(rows: { label: string; value: string }[])}
  <ul class="legend">
    {#each rows as r, i}
      <li>
        <span class="swatch" style:background={CATEGORICAL[i % CATEGORICAL.length]}></span>
        <span class="lg-label">{r.label}</span>
        <span class="lg-value num">{r.value}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#if dataset && derived}
  {@const vm = buildView(dataset, derived)}
  {@const waterfall = getWaterfall(dataset, derived, vm.equityCurveSlice, vm.fullEquityCurve, selectedSnapIdx)}
  <section class="panorama">
    <!-- Künye Şeridi (K7 / H2) -->
    <div class="meta-strip">
      <span>Kaynak: {vm.metaStrip.kaynak}</span>
      <span class="sep">·</span>
      <span>son yazma: {vm.metaStrip.sonYazma}</span>
      <span class="sep">·</span>
      <span>{vm.metaStrip.islemSayisi} işlem</span>
      {#if !vm.metaStrip.isDrive}
        <span class="badge local-warn" data-testid="local-badge" title="Yerel dosya kopyası — canlı veri olmayabilir">
          ⚠ yerel kopya — canlı veri olmayabilir
        </span>
      {/if}
      <span class="sep">·</span>
      <span>Fiyatlar: {vm.metaStrip.fiyatZamani}</span>
      <span class="sep">·</span>
      <span>Kur: {vm.metaStrip.kur} ₺/$</span>
      {#if vm.metaStrip.periodLabel}
        <span class="sep">·</span>
        <span>{vm.metaStrip.periodLabel}</span>
      {/if}
    </div>

    <!-- Blok 1: BU AY — <Ay Adı> (K5) -->
    {#if vm.month}
      <SectionHeader title={`Bu Ay — ${vm.monthAy}`} note={vm.monthNote} />
      <dl class="mini month">
        <div>
          <dt>Başlangıç Sermaye <span class="scope">{vm.monthAy}</span></dt>
          <dd class="num">{money(vm.month.begCapital as number)}</dd>
        </div>
        <div>
          <dt>Eklenen Mevduat <span class="scope">{vm.monthAy}</span></dt>
          <dd class="num">{money(vm.month.addDeposit)}</dd>
        </div>
        <div>
          <dt>Alınan Temettü <span class="scope">{vm.monthAy}</span></dt>
          <dd class="num">{money(vm.month.divReceived)}</dd>
        </div>
        <div>
          <dt>
            Net K/Z <span class="scope">{vm.monthAy}</span>
            {#if vm.month.begCapital && vm.month.begCapital > 0}
              <span class="hint">{pct(vm.month.netKz / vm.month.begCapital)}</span>
            {/if}
          </dt>
          <dd class="num" class:pos={vm.month.netKz > 0} class:neg={vm.month.netKz < 0}>
            {money(vm.month.netKz, { sign: true })}
          </dd>
        </div>
        <div>
          <dt>Çekim <span class="scope">{vm.monthAy}</span></dt>
          <dd class="num">{money(vm.month.withdrawal)}</dd>
        </div>
        <div>
          <dt>Dönem Sonu <span class="scope">{vm.monthAy}</span></dt>
          <dd class="num strong">{money(vm.month.endCapital)}</dd>
        </div>
      </dl>
    {/if}

    <!-- Blok 2: Özkaynak (K5) -->
    {#if vm.ozet}
      <SectionHeader title="Özkaynak" />
      <dl class="mini">
        <div>
          <dt>Güncel Özkaynak <span class="scope">{vm.monthAy}</span><span class="hint">aylık rapordaki son kapanış</span></dt>
          <dd class="num strong">{money(vm.ozet.guncelOzkaynak)}</dd>
        </div>
        <div>
          <dt>Canlı Özkaynak <span class="scope">bugün</span><span class="hint">açık pozisyon değeri + nakit</span></dt>
          <dd class="num strong">{vm.unpricedInDeger ? '≈ ' : ''}{money(vm.live.canliOzkaynakUsd)}</dd>
          {#if vm.unpricedInDeger}
            <span class="hint" style="display:block;font-size:0.8125rem;">güncel fiyat alınamadı, maliyet gösteriliyor</span>
          {/if}
        </div>
        <div>
          <dt>Yatırılan Sermaye <span class="scope">tüm zamanlar</span><span class="hint">bugüne dek yatırdığın para</span></dt>
          <dd class="num">{money(vm.ozet.yatirilanSermaye)}</dd>
        </div>
        <div>
          <dt>
            Toplam Getiri <span class="scope">tüm zamanlar</span>
            <span class="hint">bugünkü değerin, yatırdığın toplam paranın ne kadar üstünde</span>
          </dt>
          <dd class="num" class:pos={vm.ozet.toplamGetiri > 0} class:neg={vm.ozet.toplamGetiri < 0}>
            {vm.unpricedInDeger ? '≈ ' : ''}{money(vm.ozet.toplamGetiri, { sign: true })}
            {#if vm.ozet.toplamGetiriPct != null}
              <span class="hint inline">{pct(vm.ozet.toplamGetiriPct)}</span>
            {/if}
          </dd>
          {#if vm.unpricedInDeger}
            <span class="hint" style="display:block;font-size:0.8125rem;">güncel fiyat alınamadı, maliyet gösteriliyor</span>
          {/if}
        </div>
      </dl>

      <!-- Blok 3: Kâr / Zarar — tüm zamanlar (K5) -->
      <SectionHeader title="Kâr / Zarar" note="tüm zamanlar" />
      <dl class="mini">
        <div>
          <dt>Gerçekleşmiş K/Z <span class="scope">2026-02'den bu yana</span></dt>
          <dd class="num" class:pos={vm.ozet.gerceklesmisKz > 0} class:neg={vm.ozet.gerceklesmisKz < 0}>
            {money(vm.ozet.gerceklesmisKz, { sign: true })}
          </dd>
        </div>
        <div>
          <dt>Gerçekleşmemiş K/Z <span class="scope">tüm zamanlar</span></dt>
          <dd
            class="num"
            class:pos={(vm.ozet.gerceklesmemisKz ?? 0) > 0}
            class:neg={(vm.ozet.gerceklesmemisKz ?? 0) < 0}
          >
            {vm.unpricedInDeger ? '≈ ' : ''}{vm.ozet.gerceklesmemisKz == null ? DASH : money(vm.ozet.gerceklesmemisKz, { sign: true })}
          </dd>
          {#if vm.unpricedInDeger}
            <span class="hint" style="display:block;font-size:0.8125rem;">güncel fiyat alınamadı, maliyet gösteriliyor</span>
          {/if}
        </div>
        <div>
          <dt>Alınan Temettü <span class="scope">tüm zamanlar</span></dt>
          <dd class="num">{money(vm.ozet.temettu)}</dd>
        </div>
        <div>
          <dt>Çekimler <span class="scope">tüm zamanlar</span></dt>
          <dd class="num">{vm.ozet.cekimler === 0 ? DASH : money(vm.ozet.cekimler)}</dd>
        </div>
      </dl>

      <!-- Blok 4: Nakit (G3 / G4) -->
      <SectionHeader title="Nakit" />
      <dl class="mini">
        <div>
          <dt>Nakit & Para Piyasası <span class="scope">bugün</span><span class="hint">kurum bakiyeleri + para piyasası fonları</span></dt>
          <dd class="num">{money(vm.cashRatio.nakitVeFonParaUsd)}</dd>
        </div>
        <div>
          <dt>Nakit Oranı (XAU hariç) <span class="scope">bugün</span><span class="hint">altın hariç portföyün likit kısmı</span></dt>
          <dd class="num strong">{vm.cashRatio.nakitOrani == null ? DASH : pct(vm.cashRatio.nakitOrani)}</dd>
        </div>
        <div>
          <dt>— sadece nakit <span class="scope">bugün</span><span class="hint">para piyasası fonları hariç</span></dt>
          <dd class="num">{vm.cashRatio.sadeceNakitOrani == null ? DASH : pct(vm.cashRatio.sadeceNakitOrani)}</dd>
        </div>
      </dl>

      <!-- Blok 5: Kapanan İşlemler — tüm zamanlar (K5) -->
      <SectionHeader title="Kapanan İşlemler" note="2026-02'den bu yana" />
      <dl class="mini">
        <div>
          <dt>Toplam Kazanç <span class="scope">2026-02'den bu yana</span></dt>
          <dd class="num pos">{money(vm.ozet.kapananKazanc)}</dd>
        </div>
        <div>
          <dt>Toplam Kayıp <span class="scope">2026-02'den bu yana</span></dt>
          <dd class="num neg">{money(vm.ozet.kapananKayip)}</dd>
        </div>
        <div>
          <dt>Net <span class="scope">2026-02'den bu yana</span></dt>
          <dd class="num strong" class:pos={vm.ozet.kapananNet > 0} class:neg={vm.ozet.kapananNet < 0}>
            {money(vm.ozet.kapananNet, { sign: true })}
          </dd>
        </div>
      </dl>
    {/if}

    <!-- Blok 6: KpiBand -->
    <KpiBand items={vm.kpiItems} />

    <!-- Blok 7: Grafikler -->
    <div class="equity-header">
      <SectionHeader title="Realize Sermaye" note="son 12 ay · aya tıklayarak ayrıştırmayı gör" />
      <span class="hint">yatırılan para + gerçekleşen kâr + temettü; açık pozisyonların güncel değeri bu eğride yok</span>
    </div>
    <LineChart
      series={vm.equitySeries}
      compareSeries={vm.compareSeries}
      labels={vm.equityLabels}
      fmtY={(v) => money(v)}
      selectedPoint={selectedSnapIdx}
      onPointClick={(idx) => (selectedSnapIdx = selectedSnapIdx === idx ? null : idx)}
    />
    <p class="chart-reconcile-note">
      Excel aylık raporu kurucu sermayenin $113.209'unu içermiyor (bkz. mutabakat raporu).
    </p>

    {#if selectedSnapIdx != null}
      <div class="waterfall-card" data-testid="waterfall-breakdown">
        {#if waterfall}
          <div class="wf-header">
            <div>
              <div class="wf-title">
                <h3>Neden değişti? · {waterfall.ayLabel}</h3>
                <span class="wf-tag">Şelale Dökümü</span>
              </div>
              <p class="wf-subtitle">Aylık özkaynak hareketinin kalem kalem ayrıştırması</p>
            </div>
            <button class="wf-close" onclick={() => (selectedSnapIdx = null)} aria-label="Kapat">✕</button>
          </div>

          <div class="wf-steps">
            {#each waterfall.steps as step}
              <div
                class="wf-row"
                class:wf-end={step.sign === '='}
                class:wf-start={step.label === 'Başlangıç'}
                class:wf-info={step.isInfo}
              >
                <div class="wf-row-label">
                  <div class="wf-label-line">
                    <span class="wf-sign">{step.sign}</span>
                    <span class="wf-name">{step.label}</span>
                  </div>
                  {#if step.hint}
                    <span class="hint">{step.hint}</span>
                  {/if}
                  {#if step.altLabel && step.altTutarUsd != null}
                    <div class="wf-alt-note">
                      <span>Defter (SaleEvent): <strong>{formatMoney(waterfall.gerceklesenKar)}</strong></span>
                      <span>·</span>
                      <span>{step.altLabel}: <strong>{formatMoney(step.altTutarUsd)}</strong></span>
                      {#if step.farkUsd != null}
                        <span class="hint inline">({step.farkLabel}: {formatMoney(step.farkUsd, { sign: true })})</span>
                      {/if}
                    </div>
                  {/if}
                </div>
                <div
                  class="wf-row-val num"
                  class:pos={!step.isInfo && step.sign === '+' && step.tutarUsd > 0}
                  class:neg={!step.isInfo && step.sign === '−' && step.tutarUsd > 0}
                  class:strong={step.sign === '='}
                  class:info={step.isInfo}
                >
                  {!step.isInfo && step.sign === '−' ? '−' : !step.isInfo && step.sign === '+' ? '+' : ''}{formatMoney(step.tutarUsd)}
                </div>
              </div>
            {/each}
          </div>

          <!-- Ayın işlemleri -->
          <details class="wf-txns">
            <summary>
              O ayın işlemleri ({waterfall.monthTransactions.length})
            </summary>
            {#if waterfall.monthTransactions.length === 0}
              <p class="wf-empty">Bu ayda işlem bulunmuyor.</p>
            {:else}
              <div class="wf-txns-table-wrap">
                <table class="wf-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Yön</th>
                      <th>Enstrüman</th>
                      <th>Portföy</th>
                      <th class="num">Lot</th>
                      <th class="num">Fiyat (USD)</th>
                      <th class="num">Net (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each waterfall.monthTransactions as tx}
                      <tr>
                        <td>{dateShort(tx.tarih)}</td>
                        <td>
                          <span class="badge" class:buy={tx.yon === 'AL'} class:sell={tx.yon === 'SAT'}>
                            {tx.yon}
                          </span>
                        </td>
                        <td class="strong">{tx.enstruman}</td>
                        <td>{tx.portfoy}</td>
                        <td class="num">{tx.lot.toLocaleString('tr-TR')}</td>
                        <td class="num">{tx.fiyat_usd ? formatMoney(tx.fiyat_usd) : '—'}</td>
                        <td class="num">{formatMoney(tx.net_usd)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </details>
        {:else}
          <div class="wf-header">
            <div>
              <h3>Neden değişti?</h3>
              <p class="wf-subtitle">Seçilen ay için detaylı rapor kaydı (snapshot) bulunamadı.</p>
            </div>
            <button class="wf-close" onclick={() => (selectedSnapIdx = null)} aria-label="Kapat">✕</button>
          </div>
        {/if}
      </div>
    {/if}

    <div class="grid-2">
      <div class="panel">
        <SectionHeader
          title="Varlık sınıfı dağılımı"
          note={settings.basis === 'deger' ? 'güncel değer · nakit dahil' : 'maliyet · nakit dahil'}
        />
        <div class="donut-row">
          <Donut slices={vm.classSlices} total={vm.classTotal} fmt={(v) => money(v)} />
          {@render legend(vm.classLegend)}
        </div>
        {#if settings.basis === 'deger' && vm.classUnpriced}
          <p class="hint unpriced-hint">
            * Fiyatı gelmemiş satırlar maliyetine dahil edilmiştir.
          </p>
        {/if}
      </div>
      <div class="panel">
        <SectionHeader
          title="Portföy dağılımı"
          note={settings.basis === 'deger' ? 'güncel değer' : 'maliyet bazlı'}
        />
        <div class="donut-row">
          <Donut slices={vm.portfolioSlices} total={vm.portfolioTotal} fmt={(v) => money(v)} />
          {@render legend(vm.portfolioLegend)}
        </div>
        {#if settings.basis === 'deger' && vm.portfolioUnpriced}
          <p class="hint unpriced-hint">
            * Fiyatı gelmemiş satırlar maliyetine dahil edilmiştir.
          </p>
        {/if}
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
  .meta-strip {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--hairline);
  }
  .meta-strip .sep {
    color: var(--hairline);
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
    font-size: 0.875rem;
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
    font-size: 0.875rem;
  }
  .lg-value {
    color: var(--ink);
    font-size: 0.9375rem;
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
  @media (min-width: 720px) {
    .mini {
      grid-template-columns: 1fr 1fr;
    }
  }
  .mini dt {
    color: var(--ink-soft);
    font-size: 0.875rem;
  }
  .mini dt .hint {
    display: block;
    font-size: 0.8125rem;
    color: var(--ink-soft);
    font-weight: 400;
    margin-top: 0.15rem;
  }
  .mini dt .scope {
    display: inline-block;
    font-size: 0.8125rem;
    color: var(--ink-soft);
    letter-spacing: 0.02em;
    border: 1px solid var(--hairline);
    border-radius: 3px;
    padding: 0 0.3rem;
    margin-left: 0.35rem;
    vertical-align: middle;
  }
  .mini dd {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .mini dd .hint.inline {
    display: inline;
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--ink-soft);
    margin-left: 0.35rem;
  }
  .mini dd.strong {
    font-size: 1.5rem;
    border-top: 2px solid var(--hairline);
    padding-top: 0.2rem;
  }
  .mini div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--hairline);
    padding: 0.45rem 0;
  }
  .mini dd.pos {
    color: var(--gain);
  }
  .mini dd.neg {
    color: var(--loss);
  }
  .mini.month {
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .mini.month {
      grid-template-columns: 1fr 1fr;
    }
  }

  .waterfall-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.25rem;
    margin: 1rem 0 1.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }
  .wf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid var(--hairline);
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
  }
  .wf-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .wf-title h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .wf-tag {
    font-size: 0.8125rem;
    background: var(--hairline);
    color: var(--ink-soft);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }
  .wf-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .wf-close {
    background: transparent;
    border: none;
    font-size: 1.25rem;
    line-height: 1;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }
  .wf-close:hover {
    color: var(--ink);
    background: var(--hairline);
  }
  .wf-steps {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .wf-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.4rem 0;
    border-bottom: 1px dashed var(--hairline);
  }
  .wf-row.wf-start {
    font-weight: 500;
  }
  .wf-row.wf-info {
    opacity: 0.9;
    background: var(--surface-subtle, rgba(0, 0, 0, 0.02));
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
  }
  .wf-row.wf-end {
    border-top: 1px solid var(--ink);
    border-bottom: 2px solid var(--ink);
    padding: 0.6rem 0;
    margin-top: 0.25rem;
    font-weight: 600;
  }
  .wf-row-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .wf-label-line {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .wf-sign {
    display: inline-block;
    width: 1.2rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .wf-name {
    font-size: 0.875rem;
  }
  .wf-row-label .hint {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin-left: 1.7rem;
  }
  .wf-alt-note {
    margin-left: 1.7rem;
    font-size: 0.8125rem;
    color: var(--ink-soft);
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--bg);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin-top: 0.25rem;
  }
  .wf-row-val {
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
    white-space: nowrap;
  }
  .wf-row-val.strong {
    font-size: 1.0625rem;
    font-weight: 700;
  }
  .wf-row-val.pos {
    color: var(--gain);
  }
  .wf-row-val.neg {
    color: var(--loss);
  }
  .wf-txns {
    margin-top: 1.25rem;
    border-top: 1px solid var(--hairline);
    padding-top: 0.75rem;
  }
  .wf-txns summary {
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--ink);
    padding: 0.25rem 0;
  }
  .wf-txns summary:hover {
    color: var(--gold);
  }
  .wf-txns-table-wrap {
    overflow-x: auto;
    margin-top: 0.75rem;
  }
  .wf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .wf-table th, .wf-table td {
    padding: 0.4rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--hairline);
  }
  .wf-table th {
    color: var(--ink-soft);
    font-weight: 500;
    background: var(--bg);
  }
  .wf-empty {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin: 0.5rem 0 0;
  }
  .badge.buy {
    background: rgba(46, 160, 67, 0.15);
    color: #2ea043;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .badge.sell {
    background: rgba(218, 54, 51, 0.15);
    color: #da3633;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .equity-header {
    margin-bottom: 0.2rem;
  }
  .equity-header .hint {
    display: block;
    font-size: 0.8rem;
    color: var(--ink-soft);
    margin-top: -0.4rem;
    margin-bottom: 0.5rem;
  }
  .chart-reconcile-note {
    font-size: 0.78rem;
    color: var(--ink-soft);
    margin-top: 0.35rem;
    margin-bottom: 0.5rem;
    font-style: italic;
  }
</style>
