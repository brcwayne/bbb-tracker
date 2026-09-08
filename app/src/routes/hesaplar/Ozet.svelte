<script lang="ts">
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import {
    monthlyTotals,
    monthSummary,
    categoryBreakdown,
    instalmentSchedule,
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
    dataset?.personal_tx !== undefined ? dataset.personal_tx : dataset?.personalTx ?? [],
  )
  const categories = $derived(dataset?.categories ?? [])
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
</script>

<div class="ozet-container">
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
  {:else}
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
