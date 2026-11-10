<script lang="ts">
  import type { Dataset, SyncState } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import { pct, lot, dateShort, dateTimeShort, DASH, monthLabel, todayLocalIso } from '../lib/format'
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

  function formatSync(sync: SyncState | null | undefined): string {
    if (!sync?.sonKosu) return 'bilinmiyor'
    try {
      const d = new Date(sync.sonKosu)
      if (Number.isNaN(d.getTime())) return 'bilinmiyor'
      const day = d.getDate()
      const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
      const m = AY[d.getMonth()]
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const statusText = sync.sonucu === 'basarili' ? 'başarılı' : sync.sonucu
      return `${day} ${m} ${hh}:${mm} · ${statusText}`
    } catch {
      return 'bilinmiyor'
    }
  }

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
      usdPerSilverGram: prices.usdPerSilverGram,
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
    const kpiEquityUsd = Number.isFinite(equityUsd) ? equityUsd : live.canliOzkaynakUsd

    // Month note
    const todayIso = todayLocalIso()
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
        { label: 'Toplam Özkaynak', value: money(kpiEquityUsd), num: kpiEquityUsd, fmt: (n: number) => money(n) },
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
        senkron: formatSync(ds.syncState),
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
              const toplamGetiri = live.canliOzkaynakUsd + b.cekimler - b.toplamSermaye
              const toplamGetiriPct =
                b.toplamSermaye > 0 && Number.isFinite(toplamGetiri)
                  ? toplamGetiri / b.toplamSermaye
                  : null
              return {
                guncelOzkaynak: Number.isFinite(equityUsd) ? equityUsd : live.canliOzkaynakUsd,
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
  let selectedAllocClass = $state<string | null>(null)

  function toggleLatestWaterfall(sliceLen: number) {
    if (selectedSnapIdx != null) {
      selectedSnapIdx = null
    } else {
      selectedSnapIdx = sliceLen > 0 ? sliceLen - 1 : 0
    }
  }

  function navigateToFilteredPositions(cls: string) {
    try {
      sessionStorage.setItem('bbb-v2-filter-class', cls)
    } catch {
      /* ignore */
    }
    window.location.hash = '#/pozisyonlar'
  }

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
  {@const isV2 = (settings as any)?.uiMode === 'v2'}
  <section class="panorama" class:v2-mode={isV2}>
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
      <span class="sep">·</span>
      <span data-testid="meta-sync">Senkron: {vm.metaStrip.senkron}</span>
    </div>

    <!-- V2 Hero Bento Grid (Yalnızca settings.uiMode === 'v2') -->
    {#if isV2}
      {@const ytdObj = vm.periods.find((p) => p.period === 'YTD')}
      {@const ytdNet = ytdObj?.netKzUsd ?? 0}
      <div class="v2-panorama-hero" data-testid="v2-panorama-hero">
        <!-- Sol Kart: Canlı Özkaynak & Performans -->
        <div class="v2-hero-card v2-equity-card">
          <div class="v2-card-head">
            <div class="v2-badge-row">
              <span class="v2-live-indicator"><span class="v2-pulse-dot"></span> CANLI ÖZKAYNAK</span>
              {#if vm.unpricedInDeger}
                <span class="v2-tag-warn">≈ Maliyet Bazlı</span>
              {/if}
            </div>
            {#if Number.isFinite(ytdNet) && ytdNet !== 0}
              <div class="v2-perf-pill" class:pos={ytdNet > 0} class:neg={ytdNet < 0}>
                <span>{ytdNet > 0 ? '▲' : '▼'} {money(ytdNet, { sign: true })} YTD</span>
              </div>
            {/if}
          </div>

          <div class="v2-big-equity">
            <span class="v2-equity-val">{vm.unpricedInDeger ? '≈ ' : ''}{money(vm.live.canliOzkaynakUsd)}</span>
            {#if vm.ozet?.toplamGetiriPct != null}
              <span class="v2-total-return" class:pos={vm.ozet.toplamGetiri > 0} class:neg={vm.ozet.toplamGetiri < 0}>
                {vm.ozet.toplamGetiri > 0 ? '+' : ''}{pct(vm.ozet.toplamGetiriPct)} tüm zamanlar getiri
              </span>
            {/if}
          </div>

          <!-- 3 Hızlı Metrik -->
          <div class="v2-metric-triad">
            <div class="v2-metric-box">
              <span class="v2-m-lbl">Açık K/Z (Unrealized)</span>
              <span
                class="v2-m-val num"
                class:pos={(vm.ozet?.gerceklesmemisKz ?? 0) > 0}
                class:neg={(vm.ozet?.gerceklesmemisKz ?? 0) < 0}
              >
                {vm.unpricedInDeger ? '≈ ' : ''}{vm.ozet?.gerceklesmemisKz == null ? DASH : money(vm.ozet.gerceklesmemisKz, { sign: true })}
              </span>
            </div>
            <div class="v2-metric-box">
              <span class="v2-m-lbl">Gerçekleşmiş Kâr</span>
              <span
                class="v2-m-val num"
                class:pos={(vm.ozet?.gerceklesmisKz ?? 0) > 0}
                class:neg={(vm.ozet?.gerceklesmisKz ?? 0) < 0}
              >
                {money(vm.ozet?.gerceklesmisKz ?? 0, { sign: true })}
              </span>
            </div>
            <div class="v2-metric-box">
              <span class="v2-m-lbl">Toplam Nakit & Oran</span>
              <span class="v2-m-val num">
                {money(vm.cashRatio.nakitVeFonParaUsd)}
                <span class="v2-sub-val">({vm.cashRatio.nakitOrani == null ? DASH : pct(vm.cashRatio.nakitOrani)})</span>
              </span>
            </div>
          </div>

          <!-- Hızlı Şelale İncele Aksiyonu -->
          <div class="v2-card-footer">
            <button
              type="button"
              class="v2-action-btn"
              onclick={() => toggleLatestWaterfall(vm.equityCurveSlice.length)}
            >
              <span>🔍 {selectedSnapIdx != null ? 'Şelale Dökümünü Kapat' : 'Bu Ayın Şelalesini (Waterfall) İncele'}</span>
              <span class="v2-btn-arrow">→</span>
            </button>
          </div>
        </div>

        <!-- Sağ Kart: İnteraktif Varlık Dağılımı & Keşfet Çubuğu -->
        <div class="v2-hero-card v2-alloc-card">
          <div class="v2-card-head">
            <div class="v2-badge-row">
              <span class="v2-card-title">Varlık Dağılımı</span>
              <span class="v2-tag-neutral">Tıkla & Keşfet</span>
            </div>
            <span class="v2-alloc-total num">{money(vm.alloc.toplamUsd)}</span>
          </div>

          <!-- İnteraktif Yığılmış Bar (Stacked Allocation Bar) -->
          <div class="v2-stacked-bar" role="group" aria-label="Varlık Dağılım Çubuğu">
            {#each vm.alloc.slices as sl, idx}
              <button
                type="button"
                class="v2-bar-segment"
                class:active={selectedAllocClass === sl.key}
                style:width="{Math.max(sl.pay * 100, 2)}%"
                style:background={CATEGORICAL[idx % CATEGORICAL.length]}
                title="{sl.etiket}: {money(sl.tutarUsd)} ({pct(sl.pay)})"
                onclick={() => (selectedAllocClass = selectedAllocClass === sl.key ? null : sl.key)}
              ></button>
            {/each}
          </div>

          <!-- Sınıf Butonları Izgarası -->
          <div class="v2-class-pill-grid">
            {#each vm.alloc.slices as sl, idx}
              {@const isSelected = selectedAllocClass === sl.key}
              <button
                type="button"
                class="v2-class-pill-btn"
                class:active={isSelected}
                onclick={() => (selectedAllocClass = isSelected ? null : sl.key)}
              >
                <span class="v2-pill-dot" style:background={CATEGORICAL[idx % CATEGORICAL.length]}></span>
                <span class="v2-pill-name">{sl.etiket}</span>
                <span class="v2-pill-pct">{pct(sl.pay)}</span>
                <span class="v2-pill-usd num">{money(sl.tutarUsd)}</span>
              </button>
            {/each}
          </div>

          <!-- Seçilen Sınıf Mini Çekmecesi -->
          {#if selectedAllocClass}
            {@const chosenSlice = vm.alloc.slices.find((s) => s.key === selectedAllocClass)}
            {@const classPositions = derived.positions.open.filter((p) => {
              const inst = dataset.instruments.find((i) => i.kod === p.kod)
              return (inst?.sinif ?? 'DİĞER') === selectedAllocClass && p.lot > 1e-9
            })}
            <div class="v2-alloc-drawer">
              <div class="v2-drawer-head">
                <div class="v2-drawer-info">
                  <strong class="v2-drawer-title">{chosenSlice?.etiket ?? selectedAllocClass}</strong>
                  <span class="v2-drawer-meta num">{chosenSlice ? money(chosenSlice.tutarUsd) : ''} · {chosenSlice ? pct(chosenSlice.pay) : ''}</span>
                </div>
                <button
                  type="button"
                  class="v2-filter-link"
                  onclick={() => navigateToFilteredPositions(selectedAllocClass!)}
                >
                  Pozisyonlarda Filtrele →
                </button>
              </div>
              {#if classPositions.length > 0}
                <div class="v2-drawer-pos-list">
                  {#each classPositions as cp}
                    <span class="v2-drawer-pos-badge">
                      <span class="v2-badge-sym">{cp.kod}</span>
                      <span class="v2-badge-lot num">{lot(cp.lot)} lot</span>
                      <span class="v2-badge-val num">{money(cp.toplamMaliyetUsd)}</span>
                    </span>
                  {/each}
                </div>
              {:else}
                <p class="v2-drawer-empty">Bu sınıfta açık pozisyon (hisse/emtia) bulunmuyor (nakit veya bakiye).</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}

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

  /* =========================================================
     V2 KOMUTA MERKEZİ (Obsidyen & Kehribar Bento)
     ========================================================= */
  .v2-panorama-hero {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.25rem;
    margin-bottom: 2rem;
  }
  @media (min-width: 860px) {
    .v2-panorama-hero {
      grid-template-columns: 1.15fr 1fr;
    }
  }

  .v2-hero-card {
    background: linear-gradient(145deg, rgba(26, 28, 34, 0.95), rgba(18, 19, 23, 0.98));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    padding: 1.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1.25rem;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .v2-hero-card:hover {
    transform: translateY(-2px);
    border-color: rgba(245, 158, 11, 0.3);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
  }

  .v2-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .v2-badge-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .v2-live-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #10b981;
  }
  .v2-pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 10px #10b981;
    animation: v2-pulse 2s infinite;
  }
  .v2-tag-warn {
    font-size: 0.75rem;
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-weight: 600;
  }
  .v2-tag-neutral {
    font-size: 0.75rem;
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .v2-perf-pill {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .v2-perf-pill.pos {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .v2-perf-pill.neg {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .v2-big-equity {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .v2-equity-val {
    font-size: 2.6rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: #f8fafc;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }
  .v2-total-return {
    font-size: 0.95rem;
    font-weight: 600;
    color: #94a3b8;
  }
  .v2-total-return.pos {
    color: #10b981;
  }
  .v2-total-return.neg {
    color: #ef4444;
  }

  .v2-metric-triad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 0.85rem;
  }
  .v2-metric-box {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .v2-m-lbl {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .v2-m-val {
    font-size: 1.05rem;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
  }
  .v2-m-val.pos {
    color: #10b981;
  }
  .v2-m-val.neg {
    color: #ef4444;
  }
  .v2-sub-val {
    font-size: 0.8125rem;
    font-weight: 400;
    color: #94a3b8;
    margin-left: 0.25rem;
  }

  .v2-card-footer {
    margin-top: 0.25rem;
  }
  .v2-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 10px;
    color: #fbbf24;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .v2-action-btn:hover {
    background: rgba(245, 158, 11, 0.2);
    border-color: #fbbf24;
    transform: translateX(2px);
  }
  .v2-btn-arrow {
    font-size: 1.1rem;
    transition: transform 0.2s ease;
  }
  .v2-action-btn:hover .v2-btn-arrow {
    transform: translateX(3px);
  }

  .v2-card-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: #f8fafc;
  }
  .v2-alloc-total {
    font-size: 1.35rem;
    font-weight: 800;
    color: #f59e0b;
  }

  .v2-stacked-bar {
    display: flex;
    height: 16px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    gap: 2px;
    padding: 2px;
  }
  .v2-bar-segment {
    border: none;
    padding: 0;
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.15s ease;
    border-radius: 4px;
  }
  .v2-bar-segment:hover,
  .v2-bar-segment.active {
    opacity: 1;
    transform: scaleY(1.25);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    z-index: 2;
  }

  .v2-class-pill-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.5rem;
  }
  .v2-class-pill-btn {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .v2-class-pill-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(245, 158, 11, 0.4);
  }
  .v2-class-pill-btn.active {
    background: rgba(245, 158, 11, 0.15);
    border-color: #f59e0b;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
  }
  .v2-pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-bottom: 0.2rem;
  }
  .v2-pill-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #f8fafc;
  }
  .v2-pill-pct {
    font-size: 1.05rem;
    font-weight: 700;
    color: #fbbf24;
  }
  .v2-pill-usd {
    font-size: 0.8125rem;
    color: #94a3b8;
  }

  .v2-alloc-drawer {
    background: rgba(15, 16, 20, 0.95);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 12px;
    padding: 1rem;
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: v2-drawer-slide 0.25s ease-out;
  }
  .v2-drawer-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 0.5rem;
  }
  .v2-drawer-info {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .v2-drawer-title {
    font-size: 1rem;
    font-weight: 700;
    color: #f8fafc;
  }
  .v2-drawer-meta {
    font-size: 0.875rem;
    color: #94a3b8;
  }
  .v2-filter-link {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid #f59e0b;
    color: #fbbf24;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .v2-filter-link:hover {
    background: #f59e0b;
    color: #000;
  }
  .v2-drawer-pos-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .v2-drawer-pos-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    font-size: 0.85rem;
  }
  .v2-badge-sym {
    font-weight: 700;
    color: #f8fafc;
  }
  .v2-badge-lot {
    color: #94a3b8;
    font-size: 0.8125rem;
  }
  .v2-badge-val {
    color: #fbbf24;
    font-weight: 600;
  }
  .v2-drawer-empty {
    margin: 0;
    font-size: 0.85rem;
    color: #94a3b8;
    font-style: italic;
  }

  /* Panorama V2 Mode Genel İyileştirmeleri */
  .panorama.v2-mode {
    max-width: 1040px;
  }
  .panorama.v2-mode .panel,
  .panorama.v2-mode .waterfall-card {
    border-radius: 16px;
    padding: 1.5rem;
    border: 1px solid var(--hairline);
    background: var(--surface);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .panorama.v2-mode .panel:hover,
  .panorama.v2-mode .waterfall-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }
  .panorama.v2-mode .mini dt {
    font-size: 0.95rem;
  }
  .panorama.v2-mode .mini dd {
    font-size: 1.15rem;
  }
  .panorama.v2-mode .mini dd.strong {
    font-size: 1.75rem;
  }
  .panorama.v2-mode .mini div {
    padding: 0.65rem 0;
  }

  @keyframes v2-pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.85);
    }
  }
  @keyframes v2-drawer-slide {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
