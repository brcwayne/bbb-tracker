<script lang="ts">
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import {
    monthlyTotals,
    monthSummary,
    categoryBreakdown,
    instalmentSchedule,
    ozetDimensionGroups,
    type OzetDimension,
    type MonthlyTotal,
    type CategoryBreakdown,
    type InstalmentScheduleItem,
  } from '../../lib/data/personal'
  import { tryFmt, usd, monthLabel, monthShort } from '../../lib/format'
  import BarChart from '../../lib/charts/BarChart.svelte'
  import Donut from '../../lib/charts/Donut.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    today?: string
  } = $props()

  const rows = $derived<PersonalTx[]>(
    dataset?.personalTx ?? [],
  )
  const categories = $derived(dataset?.categories ?? [])
  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))
  const accounts = $derived((dataset?.personalAccounts ?? []).filter((a) => a.aktif !== false))
  const showDimensionSelector = $derived(people.length >= 2 && accounts.length >= 2)
  let dimension = $state<OzetDimension>('kisi')

  const hasRows = $derived(rows.length > 0)

  const [currYear, currMonth] = $derived(today.split('-').map(Number))

  /** Twelve "Eki 2025"-style labels collide on a 12-month axis, so show the
   *  month alone and carry the year only where it changes. */
  const axisLabel = (ay: string, i: number) => {
    const m = Number(ay.split('-')[1])
    return i === 0 || m === 1
      ? `${monthShort(ay + '-01')} ${ay.slice(2, 4)}`
      : monthShort(ay + '-01')
  }

  const emptyMonths = $derived.by(() => {
    const res: { label: string; value: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const mIndex = currYear * 12 + (currMonth - 1) - i
      const y = Math.floor(mIndex / 12)
      const m = (mIndex % 12) + 1
      const ay = `${y}-${String(m).padStart(2, '0')}`
      res.push({ label: axisLabel(ay, 11 - i), value: 0 })
    }
    return res
  })

  // Tekil / global sade görünüm türetmeleri
  const monthly = $derived(monthlyTotals(rows, today, 12))
  const summary = $derived(monthSummary(rows, currYear, currMonth, today))
  const catBreakdown = $derived(categoryBreakdown(rows, currYear, currMonth, today, 'TRY'))
  const upcomingInstalments = $derived(instalmentSchedule(rows, today, 3))

  const hasTry = $derived(rows.some((r) => r.paraBirimi === 'TRY' && r.tarih <= today))
  const hasUsd = $derived(rows.some((r) => r.paraBirimi === 'USD' && r.tarih <= today))

  const tryMonthlyBars = $derived(
    monthly
      .filter((m) => m.para === 'TRY')
      .map((m, i) => ({ label: axisLabel(m.ay, i), value: m.toplam })),
  )
  const usdMonthlyBars = $derived(
    monthly
      .filter((m) => m.para === 'USD')
      .map((m, i) => ({ label: axisLabel(m.ay, i), value: m.toplam })),
  )

  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod
  const donutSlices = $derived(
    catBreakdown.map((c) => ({
      label: catName(c.kod),
      value: c.toplam,
    })),
  )

  const instBars = $derived(
    upcomingInstalments
      .filter((s) => s.para === 'TRY')
      .map((s) => ({
        label: monthLabel(s.ay + '-01'),
        value: s.toplam,
      })),
  )
  const hasInstalments = $derived(instBars.some((b) => b.value > 0))

  const giderTry = $derived(summary.gider['TRY'] ?? 0)
  const giderUsd = $derived(summary.gider['USD'] ?? 0)
  const gelirTry = $derived(summary.gelir['TRY'] ?? 0)
  const gelirUsd = $derived(summary.gelir['USD'] ?? 0)

  // Boyutlu kırılım türetmeleri
  const dimensionGroups = $derived(
    showDimensionSelector
      ? ozetDimensionGroups(rows, dimension, people, accounts, today, currYear, currMonth)
      : [],
  )

  function getGroupBars(list: MonthlyTotal[], para: string) {
    return list
      .filter((m) => m.para === para)
      .map((m, i) => ({ label: axisLabel(m.ay, i), value: m.toplam }))
  }
  function getGroupDonut(breakdown: CategoryBreakdown[]) {
    return breakdown.map((c) => ({
      label: catName(c.kod),
      value: c.toplam,
    }))
  }
  function getGroupInstalments(instalments: InstalmentScheduleItem[]) {
    return instalments
      .filter((s) => s.para === 'TRY')
      .map((s) => ({
        label: monthLabel(s.ay + '-01'),
        value: s.toplam,
      }))
  }
</script>

<div class="ozet-container">
  {#if showDimensionSelector}
    <div class="dimension-selector-row" data-testid="dimension-selector">
      <span class="selector-label">Kırılım:</span>
      <div class="seg" role="group" aria-label="Kırılım Boyutu">
        <button
          type="button"
          class:on={dimension === 'kisi'}
          onclick={() => (dimension = 'kisi')}
        >
          Kişi
        </button>
        <button
          type="button"
          class:on={dimension === 'hesap'}
          onclick={() => (dimension = 'hesap')}
        >
          Hesap
        </button>
      </div>
    </div>
  {/if}

  {#if !hasRows}
    <div class="empty-banner">
      <EmptyState
        title="Henüz kayıt yok"
        detail="Telegram botundan harcama girdikçe burası dolacak. Örnek: markette 340 lira"
      />
    </div>

    <!-- Boş durumda da eksenleri çizili aylık grafik gösterilir -->
    <div class="charts-row">
      <section class="chart-card" data-chart="aylik-seyir">
        <h3 class="chart-title">Aylık Seyir (₺ TL)</h3>
        <BarChart bars={emptyMonths} fmt={(v) => tryFmt(v, { whole: true })} />
      </section>
    </div>
  {:else if showDimensionSelector}
    <!-- Boyutlandırılmış Bölümler (Kişi veya Hesap) -->
    <div class="dimension-groups">
      {#each dimensionGroups as g (g.key)}
        {@const gTryMonthly = getGroupBars(g.monthly, 'TRY')}
        {@const gUsdMonthly = getGroupBars(g.monthly, 'USD')}
        {@const gDonut = getGroupDonut(g.categoryBreakdown)}
        {@const gInst = getGroupInstalments(g.instalments)}
        {@const gGiderTry = g.summary.gider['TRY'] ?? 0}
        {@const gGiderUsd = g.summary.gider['USD'] ?? 0}
        {@const gGelirTry = g.summary.gelir['TRY'] ?? 0}
        {@const gGelirUsd = g.summary.gelir['USD'] ?? 0}
        {@const gHasActivity = g.summary.adet > 0 || gTryMonthly.some(b => b.value > 0) || gInst.some(b => b.value > 0)}

        {#if gHasActivity}
          <div class="dimension-group-card" data-testid="dimension-group-{g.key}">
            <div class="group-header">
              <h3 class="group-title">{dimension === 'kisi' ? '👤' : '💳'} {g.label}</h3>
              <span class="count-badge num">{g.summary.adet} kayıt</span>
            </div>

            <div class="summary-figures">
              <div class="figure-block">
                <span class="figure-label">Toplam Gider</span>
                <span class="figure-value num">{tryFmt(gGiderTry)}</span>
                {#if gGiderUsd > 0}
                  <span class="figure-sub num">+ {usd(gGiderUsd)}</span>
                {/if}
              </div>
              {#if gGelirTry > 0 || gGelirUsd > 0}
                <div class="figure-block">
                  <span class="figure-label">Toplam Gelir</span>
                  <span class="figure-value num gain">{tryFmt(gGelirTry)}</span>
                  {#if gGelirUsd > 0}
                    <span class="figure-sub num gain">+ {usd(gGelirUsd)}</span>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Aylık Seyir -->
            {#if gTryMonthly.some(b => b.value > 0) || gUsdMonthly.some(b => b.value > 0)}
              <div class="charts-row">
                {#if gTryMonthly.some(b => b.value > 0)}
                  <section class="chart-card" data-chart="aylik-seyir">
                    <h4 class="chart-title">Aylık Seyir (₺ TL)</h4>
                    <BarChart bars={gTryMonthly} fmt={(v) => tryFmt(v, { whole: true })} />
                  </section>
                {/if}
                {#if gUsdMonthly.some(b => b.value > 0)}
                  <section class="chart-card" data-chart="aylik-seyir">
                    <h4 class="chart-title">Aylık Seyir ($ USD)</h4>
                    <BarChart bars={gUsdMonthly} fmt={(v) => usd(v, { whole: true })} />
                  </section>
                {/if}
              </div>
            {/if}

            <!-- Kategori Dağılımı ve Taksit Yükü -->
            {#if gDonut.length > 0 || gInst.some(b => b.value > 0)}
              <div class="detail-row">
                {#if gDonut.length > 0}
                  <section class="breakdown-card">
                    <h4 class="chart-title">Kategori Dağılımı (Bu Ay)</h4>
                    <div class="donut-wrap">
                      <Donut
                        slices={gDonut}
                        total={gGiderTry}
                        totalLabel="Bu ay"
                        fmt={(v) => tryFmt(v, { whole: true })}
                      />
                    </div>
                  </section>
                {/if}

                {#if gInst.some((b) => b.value > 0)}
                  <section class="instalment-card">
                    <h4 class="chart-title">Önümüzdeki 3 Ay Taksit Yükü (₺)</h4>
                    <BarChart bars={gInst} height={180} fmt={(v) => tryFmt(v, { whole: true })} />
                  </section>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <!-- Klasik / Tekil Sade Görünüm -->
    <!-- Bu Ay Özeti Kartı -->
    <section class="summary-card">
      <div class="card-header">
        <h2>Bu ay</h2>
        <span class="count-badge num">{summary.adet} kayıt</span>
      </div>
      <div class="summary-figures">
        <div class="figure-block">
          <span class="figure-label">Toplam Gider</span>
          <span class="figure-value num">{tryFmt(giderTry)}</span>
          {#if giderUsd > 0}
            <span class="figure-sub num">+ {usd(giderUsd)}</span>
          {/if}
        </div>
        {#if gelirTry > 0 || gelirUsd > 0}
          <div class="figure-block">
            <span class="figure-label">Toplam Gelir</span>
            <span class="figure-value num gain">{tryFmt(gelirTry)}</span>
            {#if gelirUsd > 0}
              <span class="figure-sub num gain">+ {usd(gelirUsd)}</span>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- Aylık Seyir Grafikleri -->
    <div class="charts-row">
      {#if hasTry}
        <section class="chart-card" data-chart="aylik-seyir">
          <h3 class="chart-title">Aylık Seyir (₺ TL)</h3>
          <BarChart bars={tryMonthlyBars} fmt={(v) => tryFmt(v, { whole: true })} />
        </section>
      {/if}
      {#if hasUsd}
        <section class="chart-card" data-chart="aylik-seyir">
          <h3 class="chart-title">Aylık Seyir ($ USD)</h3>
          <BarChart bars={usdMonthlyBars} fmt={(v) => usd(v, { whole: true })} />
        </section>
      {/if}
    </div>

    <!-- Kategori Dağılımı ve Taksit Yükü -->
    <div class="detail-row">
      {#if donutSlices.length > 0}
        <section class="breakdown-card">
          <h3 class="chart-title">Kategori Dağılımı (Bu Ay)</h3>
          <div class="donut-wrap">
            <Donut
              slices={donutSlices}
              total={giderTry}
              totalLabel="Bu ay"
              fmt={(v) => tryFmt(v, { whole: true })}
            />
          </div>
        </section>
      {/if}

      {#if hasInstalments}
        <section class="instalment-card">
          <h3 class="chart-title">Önümüzdeki 3 Ay Taksit Yükü (₺)</h3>
          <BarChart bars={instBars} height={180} fmt={(v) => tryFmt(v, { whole: true })} />
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .empty-banner {
    padding: 1rem 0;
  }
  .ozet-container {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  .dimension-selector-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    justify-content: flex-end;
  }
  .selector-label {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button {
    appearance: none;
    border: 0;
    background: var(--surface);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.65rem;
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--hairline);
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }
  .dimension-groups {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .dimension-group-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--hairline);
    padding-bottom: 0.6rem;
  }
  .group-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--ink);
  }
  .summary-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.1rem 1.25rem;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .card-header h2 {
    font-size: 1.1rem;
    margin: 0;
    font-weight: 600;
  }
  .count-badge {
    font-size: 0.8rem;
    color: var(--ink-soft);
    background: var(--surface-2);
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
  }
  .summary-figures {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }
  .figure-block {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .figure-label {
    font-size: 0.78rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .figure-value {
    font-size: 1.6rem;
    font-weight: 700;
  }
  .figure-sub {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .gain {
    color: var(--gain);
  }
  .charts-row,
  .detail-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }
  .chart-card,
  .breakdown-card,
  .instalment-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
  }
  .dimension-group-card .chart-card,
  .dimension-group-card .breakdown-card,
  .dimension-group-card .instalment-card {
    background: var(--surface-2);
  }
  .chart-title {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--ink-soft);
  }
  .donut-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 180px;
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
</style>
