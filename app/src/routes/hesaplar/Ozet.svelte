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
  import { cardStatement } from '../../lib/data/accounts'
  import { fmtCurrency, tryFmt, usd, monthLabel, monthShort } from '../../lib/format'
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
  const currentMonthKey = $derived(`${currYear}-${String(currMonth).padStart(2, '0')}`)
  let selectedMonth = $state<string | null>(null)
  const activeMonth = $derived(selectedMonth ?? currentMonthKey)
  const [activeYear, activeMonthNum] = $derived(activeMonth.split('-').map(Number))
  const isCurrentMonth = $derived(activeMonth === currentMonthKey)
  const activeMonthLabel = $derived(monthLabel(activeMonth + '-01'))

  /** Twelve "Eki 2025"-style labels collide on a 12-month axis, so show the
   *  month alone and carry the year only where it changes. */
  const axisLabel = (ay: string, i: number) => {
    const m = Number(ay.split('-')[1])
    return i === 0 || m === 1
      ? `${monthShort(ay + '-01')} ${ay.slice(2, 4)}`
      : monthShort(ay + '-01')
  }

  const emptyMonths = $derived.by(() => {
    const res: { label: string; value: number; key: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const mIndex = currYear * 12 + (currMonth - 1) - i
      const y = Math.floor(mIndex / 12)
      const m = (mIndex % 12) + 1
      const ay = `${y}-${String(m).padStart(2, '0')}`
      res.push({ label: axisLabel(ay, 11 - i), value: 0, key: ay })
    }
    return res
  })

  // Tekil / global sade görünüm türetmeleri
  const monthly = $derived(monthlyTotals(rows, today, 12))
  const summary = $derived(monthSummary(rows, currYear, currMonth, today))
  const catBreakdown = $derived(categoryBreakdown(rows, activeYear, activeMonthNum, today, 'TRY'))
  const upcomingInstalments = $derived(instalmentSchedule(rows, today, 3))
  const activeMonthGiderTry = $derived(catBreakdown.reduce((sum, c) => sum + c.toplam, 0))

  const hasTry = $derived(rows.some((r) => r.paraBirimi === 'TRY' && r.tarih <= today))
  const hasUsd = $derived(rows.some((r) => r.paraBirimi === 'USD' && r.tarih <= today))

  const tryMonthlyBars = $derived(
    monthly
      .filter((m) => m.para === 'TRY')
      .map((m, i) => ({ label: axisLabel(m.ay, i), value: m.toplam, key: m.ay })),
  )
  const usdMonthlyBars = $derived(
    monthly
      .filter((m) => m.para === 'USD')
      .map((m, i) => ({ label: axisLabel(m.ay, i), value: m.toplam, key: m.ay })),
  )

  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod
  const donutSlices = $derived(
    catBreakdown.map((c) => ({
      label: catName(c.kod),
      value: c.toplam,
    })),
  )

  let selectedCatKod = $state<string | null>(null)
  const activeCatKod = $derived(
    (selectedCatKod && catBreakdown.some((c) => c.kod === selectedCatKod))
      ? selectedCatKod
      : catBreakdown[0]?.kod ?? null,
  )
  const activeCatLabel = $derived(activeCatKod ? catName(activeCatKod) : null)

  const activeCatTransactions = $derived.by(() => {
    if (!activeCatKod) return []
    const prefix = activeMonth
    return rows
      .filter(
        (r) =>
          r.tarih.startsWith(prefix) &&
          r.tarih <= today &&
          r.durum !== 'planlandi' &&
          r.tur === 'GIDER' &&
          r.paraBirimi === 'TRY' &&
          r.kategori === activeCatKod,
      )
      .sort((a, b) => b.tarih.localeCompare(a.tarih) || b.id.localeCompare(a.id))
  })

  const activeCatTotal = $derived(
    activeCatTransactions.reduce((sum, r) => sum + r.tutar, 0),
  )

  let groupSelectedCat = $state<Record<string, string>>({})

  function getGroupActiveCat(groupKey: string, breakdown: CategoryBreakdown[]): string | null {
    const sel = groupSelectedCat[groupKey]
    if (sel && breakdown.some((c) => c.kod === sel)) return sel
    return breakdown[0]?.kod ?? null
  }

  function getGroupCatTransactions(groupKey: string, catKod: string | null): PersonalTx[] {
    if (!catKod) return []
    const prefix = activeMonth
    return rows
      .filter((r) => {
        if (!r.tarih.startsWith(prefix) || r.tarih > today || r.durum === 'planlandi' || r.tur !== 'GIDER' || r.paraBirimi !== 'TRY') {
          return false
        }
        if (r.kategori !== catKod) return false
        if (dimension === 'kisi' && r.sahip !== groupKey) return false
        if (dimension === 'hesap' && r.hesap !== groupKey) return false
        return true
      })
      .sort((a, b) => b.tarih.localeCompare(a.tarih) || b.id.localeCompare(a.id))
  }

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
      ? ozetDimensionGroups(rows, dimension, people, accounts, today, activeYear, activeMonthNum)
      : [],
  )

  function getGroupBars(list: MonthlyTotal[], para: string) {
    return list
      .filter((m) => m.para === para)
      .map((m, i) => ({ label: axisLabel(m.ay, i), value: m.toplam, key: m.ay }))
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

  interface PersonCardDebt {
    kartKod: string
    kartAd: string
    paraBirimi: string
    tip: 'ODENECEK' | 'DONEM_ICI'
    etiket: string
    tutar: number
    sonOdeme?: string
    kesim?: string
  }

  function getPersonCardDebts(personKod: string): PersonCardDebt[] {
    const list: PersonCardDebt[] = []
    const creditCards = accounts.filter((a) => a.tur === 'KREDI_KARTI')

    for (const card of creditCards) {
      const stmt = cardStatement(rows, card, today)

      // Ödenecek Ekstre
      if (stmt.odenecekEkstre) {
        const tutar = stmt.odenecekEkstre.sahipToplami[personKod] ?? 0
        if (tutar > 0) {
          list.push({
            kartKod: card.kod,
            kartAd: card.ad,
            paraBirimi: card.paraBirimi,
            tip: 'ODENECEK',
            etiket: stmt.odenecekEkstre.etiket,
            tutar,
            sonOdeme: stmt.odenecekEkstre.sonOdemeTarihi,
            kesim: stmt.odenecekEkstre.kesimTarihi,
          })
        }
      }

      // Dönem İçi
      if (stmt.donemIci) {
        const tutar = stmt.donemIci.sahipToplami[personKod] ?? 0
        if (tutar > 0) {
          list.push({
            kartKod: card.kod,
            kartAd: card.ad,
            paraBirimi: card.paraBirimi,
            tip: 'DONEM_ICI',
            etiket: 'Dönem İçi (Gelecek Ekstre)',
            tutar,
            sonOdeme: stmt.donemIci.sonOdemeTarihi,
            kesim: stmt.donemIci.kesimTarihi,
          })
        }
      }
    }

    return list
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

            {#if dimension === 'kisi'}
              {@const cardDebts = getPersonCardDebts(g.key)}
              {#if cardDebts.length > 0}
                <div class="card-debt-alerts">
                  <span class="alerts-title">💳 Kredi Kartı Ekstre Borçları:</span>
                  <div class="debt-pills">
                    {#each cardDebts as cd}
                      <div class="debt-pill" class:due={cd.tip === 'ODENECEK'}>
                        <div class="pill-info">
                          <strong>{cd.kartAd}</strong>
                          <span class="pill-type">
                            {cd.tip === 'ODENECEK' ? 'Ödenecek Ekstre' : 'Dönem İçi'}
                            {#if cd.sonOdeme} · Son Ödeme: <b>{cd.sonOdeme}</b>{/if}
                          </span>
                        </div>
                        <span class="pill-amount num loss">
                          {fmtCurrency(cd.tutar, cd.paraBirimi)}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}

            <!-- Aylık Seyir -->
            {#if gTryMonthly.some(b => b.value > 0) || gUsdMonthly.some(b => b.value > 0)}
              <div class="charts-row">
                {#if gTryMonthly.some(b => b.value > 0)}
                  <section class="chart-card" data-chart="aylik-seyir">
                    <div class="chart-card-header">
                      <h4 class="chart-title">Aylık Seyir (₺ TL)</h4>
                      <span class="chart-hint">Kategori dağılımı için aya tıklayın</span>
                    </div>
                    <BarChart
                      bars={gTryMonthly}
                      selectedKey={activeMonth}
                      onSelect={(b) => {
                        if (b.key) {
                          selectedMonth = b.key === selectedMonth ? null : b.key
                        }
                      }}
                      fmt={(v) => tryFmt(v, { whole: true })}
                    />
                  </section>
                {/if}
                {#if gUsdMonthly.some(b => b.value > 0)}
                  <section class="chart-card" data-chart="aylik-seyir">
                    <div class="chart-card-header">
                      <h4 class="chart-title">Aylık Seyir ($ USD)</h4>
                      <span class="chart-hint">Kategori dağılımı için aya tıklayın</span>
                    </div>
                    <BarChart
                      bars={gUsdMonthly}
                      selectedKey={activeMonth}
                      onSelect={(b) => {
                        if (b.key) {
                          selectedMonth = b.key === selectedMonth ? null : b.key
                        }
                      }}
                      fmt={(v) => usd(v, { whole: true })}
                    />
                  </section>
                {/if}
              </div>
            {/if}

            <!-- Kategori Dağılımı ve Taksit Yükü -->
            {#if gDonut.length > 0 || gInst.some(b => b.value > 0) || !isCurrentMonth}
              <div class="detail-row">
                {#if gDonut.length > 0}
                  {@const activeGroupCatKod = getGroupActiveCat(g.key, g.categoryBreakdown)}
                  {@const activeGroupCatLabel = activeGroupCatKod ? catName(activeGroupCatKod) : null}
                  {@const groupCatTxs = getGroupCatTransactions(g.key, activeGroupCatKod)}
                  {@const groupCatTotal = groupCatTxs.reduce((sum, r) => sum + r.tutar, 0)}
                  {@const activeGroupGiderTry = g.categoryBreakdown.reduce((sum, c) => sum + c.toplam, 0)}
                  <section class="breakdown-card">
                    <div class="breakdown-card-header">
                      <div class="breakdown-title-group">
                        <h4 class="chart-title">
                          Kategori Dağılımı ({isCurrentMonth ? 'Bu Ay · ' : ''}{activeMonthLabel})
                        </h4>
                        {#if !isCurrentMonth}
                          <button
                            type="button"
                            class="btn-reset-month"
                            onclick={() => (selectedMonth = null)}
                            title="Bu aya dön"
                          >
                            ↺ Bu aya dön
                          </button>
                        {/if}
                      </div>
                      <span class="breakdown-hint">Harcamaları görmek için kategoriye tıklayın</span>
                    </div>
                    <div class="breakdown-split">
                      <div class="breakdown-left">
                        <div class="donut-wrap">
                          <Donut
                            slices={gDonut}
                            total={activeGroupGiderTry}
                            totalLabel={isCurrentMonth ? 'Bu ay' : monthShort(activeMonth + '-01')}
                            selectedLabel={activeGroupCatLabel}
                            onSelect={(slice) => {
                              const cat = g.categoryBreakdown.find((c) => catName(c.kod) === slice.label)
                              if (cat) groupSelectedCat = { ...groupSelectedCat, [g.key]: cat.kod }
                            }}
                            fmt={(v) => tryFmt(v, { whole: true })}
                          />
                        </div>
                        <div class="cat-chips">
                          {#each g.categoryBreakdown as c}
                            {@const isSelected = c.kod === activeGroupCatKod}
                            {@const pct = activeGroupGiderTry > 0 ? Math.round((c.toplam / activeGroupGiderTry) * 100) : 0}
                            <button
                              type="button"
                              class="cat-chip"
                              class:active={isSelected}
                              onclick={() => { groupSelectedCat = { ...groupSelectedCat, [g.key]: c.kod } }}
                            >
                              <span class="chip-name">{catName(c.kod)}</span>
                              <span class="chip-amount num">{tryFmt(c.toplam)}</span>
                              <span class="chip-pct num">%{pct}</span>
                            </button>
                          {/each}
                        </div>
                      </div>
                      <div class="breakdown-right">
                        {#if activeGroupCatKod}
                          <div class="detail-header">
                            <div class="detail-title-row">
                              <h5 class="detail-cat-title">{activeGroupCatLabel}</h5>
                              <span class="detail-count num">{groupCatTxs.length} işlem</span>
                            </div>
                            <div class="detail-total-row">
                              <span class="detail-total-label">Toplam:</span>
                              <span class="detail-total-val num">{tryFmt(groupCatTotal)} TRY</span>
                            </div>
                          </div>
                          {#if groupCatTxs.length === 0}
                            <div class="detail-empty">Bu kategoride işlem bulunmuyor.</div>
                          {:else}
                            <div class="detail-tx-list">
                              {#each groupCatTxs as tx (tx.id)}
                                <div class="detail-tx-item">
                                  <div class="tx-item-left">
                                    <div class="tx-date-row">
                                      <span class="tx-date num">{tx.tarih}</span>
                                      {#if tx.taksitPlaniId && tx.taksitNo != null && tx.taksitToplam != null}
                                        <span class="tx-instalment-badge num" title="Taksit">💳 {tx.taksitNo}/{tx.taksitToplam}</span>
                                      {/if}
                                      <span class="tx-account-badge">{dimension === 'kisi' ? tx.hesap : tx.sahip}</span>
                                    </div>
                                    <div class="tx-desc" title={tx.aciklama}>{tx.aciklama}</div>
                                  </div>
                                  <div class="tx-item-right">
                                    <span class="tx-amount num">{tryFmt(tx.tutar)} ₺</span>
                                  </div>
                                </div>
                              {/each}
                            </div>
                          {/if}
                        {/if}
                      </div>
                    </div>
                  </section>
                {:else if !isCurrentMonth}
                  <section class="breakdown-card empty-card">
                    <div class="breakdown-card-header">
                      <div class="breakdown-title-group">
                        <h4 class="chart-title">Kategori Dağılımı ({activeMonthLabel})</h4>
                        <button
                          type="button"
                          class="btn-reset-month"
                          onclick={() => (selectedMonth = null)}
                        >
                          ↺ Bu aya dön
                        </button>
                      </div>
                    </div>
                    <div class="detail-empty">
                      <p>{activeMonthLabel} döneminde harcama kaydı bulunamadı.</p>
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
          <div class="chart-card-header">
            <h3 class="chart-title">Aylık Seyir (₺ TL)</h3>
            <span class="chart-hint">Kategori dağılımı için aya tıklayın</span>
          </div>
          <BarChart
            bars={tryMonthlyBars}
            selectedKey={activeMonth}
            onSelect={(b) => {
              if (b.key) {
                selectedMonth = b.key === selectedMonth ? null : b.key
              }
            }}
            fmt={(v) => tryFmt(v, { whole: true })}
          />
        </section>
      {/if}
      {#if hasUsd}
        <section class="chart-card" data-chart="aylik-seyir">
          <div class="chart-card-header">
            <h3 class="chart-title">Aylık Seyir ($ USD)</h3>
            <span class="chart-hint">Kategori dağılımı için aya tıklayın</span>
          </div>
          <BarChart
            bars={usdMonthlyBars}
            selectedKey={activeMonth}
            onSelect={(b) => {
              if (b.key) {
                selectedMonth = b.key === selectedMonth ? null : b.key
              }
            }}
            fmt={(v) => usd(v, { whole: true })}
          />
        </section>
      {/if}
    </div>

    <!-- Kategori Dağılımı ve Taksit Yükü -->
    <div class="detail-row">
      {#if donutSlices.length > 0}
        <section class="breakdown-card">
          <div class="breakdown-card-header">
            <div class="breakdown-title-group">
              <h3 class="chart-title">
                Kategori Dağılımı ({isCurrentMonth ? 'Bu Ay · ' : ''}{activeMonthLabel})
              </h3>
              {#if !isCurrentMonth}
                <button
                  type="button"
                  class="btn-reset-month"
                  onclick={() => (selectedMonth = null)}
                  title="Bu aya dön"
                >
                  ↺ Bu aya dön ({monthShort(currentMonthKey + '-01')})
                </button>
              {/if}
            </div>
            <span class="breakdown-hint">Harcamaları görmek için kategoriye tıklayın</span>
          </div>
          <div class="breakdown-split">
            <div class="breakdown-left">
              <div class="donut-wrap">
                <Donut
                  slices={donutSlices}
                  total={activeMonthGiderTry}
                  totalLabel={isCurrentMonth ? 'Bu ay' : monthShort(activeMonth + '-01')}
                  selectedLabel={activeCatLabel}
                  onSelect={(slice) => {
                    const cat = catBreakdown.find((c) => catName(c.kod) === slice.label)
                    if (cat) selectedCatKod = cat.kod
                  }}
                  fmt={(v) => tryFmt(v, { whole: true })}
                />
              </div>
              <div class="cat-chips">
                {#each catBreakdown as c}
                  {@const isSelected = c.kod === activeCatKod}
                  {@const pct = activeMonthGiderTry > 0 ? Math.round((c.toplam / activeMonthGiderTry) * 100) : 0}
                  <button
                    type="button"
                    class="cat-chip"
                    class:active={isSelected}
                    onclick={() => (selectedCatKod = c.kod)}
                  >
                    <span class="chip-name">{catName(c.kod)}</span>
                    <span class="chip-amount num">{tryFmt(c.toplam)}</span>
                    <span class="chip-pct num">%{pct}</span>
                  </button>
                {/each}
              </div>
            </div>
            <div class="breakdown-right">
              {#if activeCatKod}
                <div class="detail-header">
                  <div class="detail-title-row">
                    <h4 class="detail-cat-title">{activeCatLabel}</h4>
                    <span class="detail-count num">{activeCatTransactions.length} işlem</span>
                  </div>
                  <div class="detail-total-row">
                    <span class="detail-total-label">Toplam:</span>
                    <span class="detail-total-val num">{tryFmt(activeCatTotal)} TRY</span>
                  </div>
                </div>
                {#if activeCatTransactions.length === 0}
                  <div class="detail-empty">Bu kategoride işlem bulunmuyor.</div>
                {:else}
                  <div class="detail-tx-list">
                    {#each activeCatTransactions as tx (tx.id)}
                      <div class="detail-tx-item">
                        <div class="tx-item-left">
                          <div class="tx-date-row">
                            <span class="tx-date num">{tx.tarih}</span>
                            {#if tx.taksitPlaniId && tx.taksitNo != null && tx.taksitToplam != null}
                              <span class="tx-instalment-badge num" title="Taksit">💳 {tx.taksitNo}/{tx.taksitToplam}</span>
                            {/if}
                            <span class="tx-account-badge">{tx.hesap}</span>
                          </div>
                          <div class="tx-desc" title={tx.aciklama}>{tx.aciklama}</div>
                        </div>
                        <div class="tx-item-right">
                          <span class="tx-amount num">{tryFmt(tx.tutar)} ₺</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else}
                <div class="detail-empty">Kategori seçilmedi.</div>
              {/if}
            </div>
          </div>
        </section>
      {:else if !isCurrentMonth}
        <section class="breakdown-card empty-card">
          <div class="breakdown-card-header">
            <div class="breakdown-title-group">
              <h3 class="chart-title">Kategori Dağılımı ({activeMonthLabel})</h3>
              <button
                type="button"
                class="btn-reset-month"
                onclick={() => (selectedMonth = null)}
              >
                ↺ Bu aya dön ({monthShort(currentMonthKey + '-01')})
              </button>
            </div>
          </div>
          <div class="detail-empty">
            <p>{activeMonthLabel} döneminde harcama kaydı bulunamadı.</p>
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
  .chart-card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .chart-card-header .chart-title {
    margin: 0;
  }
  .chart-hint {
    font-size: 0.72rem;
    color: var(--ink-soft);
    font-style: italic;
  }
  .breakdown-card {
    grid-column: 1 / -1;
    gap: 1rem;
  }
  .breakdown-card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem;
    border-bottom: 1px solid var(--hairline);
    padding-bottom: 0.5rem;
  }
  .breakdown-card-header .chart-title {
    margin: 0;
  }
  .breakdown-title-group {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
  }
  .btn-reset-month {
    background: var(--surface-2);
    border: 1px solid var(--accent-defter, #c9a86a);
    color: var(--accent-defter, #c9a86a);
    font-size: 0.72rem;
    padding: 0.15rem 0.55rem;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .btn-reset-month:hover {
    background: rgba(201, 168, 106, 0.2);
  }
  .empty-card {
    min-height: 120px;
  }
  .breakdown-hint {
    font-size: 0.76rem;
    color: var(--ink-soft);
    font-style: italic;
  }
  .breakdown-split {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }
  @media (max-width: 768px) {
    .breakdown-split {
      flex-direction: column;
    }
  }
  .breakdown-left {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
    flex: 0 0 320px;
    max-width: 100%;
  }
  .cat-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
    width: 100%;
  }
  .cat-chip {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--ink-soft);
    transition: all 0.15s ease;
  }
  .cat-chip:hover {
    border-color: var(--accent-defter, #c9a86a);
    color: var(--ink);
  }
  .cat-chip.active {
    background: rgba(201, 168, 106, 0.18);
    border-color: var(--accent-defter, #c9a86a);
    color: var(--ink);
    font-weight: 600;
  }
  .chip-amount {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--ink);
  }
  .chip-pct {
    font-size: 0.7rem;
    color: var(--ink-soft);
  }
  .breakdown-right {
    flex: 1;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .dimension-group-card .breakdown-right {
    background: var(--surface);
  }
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--hairline);
    padding-bottom: 0.5rem;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .detail-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .detail-cat-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
  }
  .detail-count {
    font-size: 0.74rem;
    background: var(--surface);
    color: var(--ink-soft);
    padding: 0.15rem 0.45rem;
    border-radius: 8px;
    border: 1px solid var(--hairline);
  }
  .dimension-group-card .detail-count {
    background: var(--surface-2);
  }
  .detail-total-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .detail-total-label {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .detail-total-val {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--ink);
  }
  .detail-tx-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 360px;
    overflow-y: auto;
    padding-right: 0.2rem;
  }
  .detail-tx-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.65rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 5px;
    gap: 0.75rem;
  }
  .dimension-group-card .detail-tx-item {
    background: var(--surface-2);
  }
  .tx-item-left {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    overflow: hidden;
  }
  .tx-date-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.74rem;
    color: var(--ink-soft);
  }
  .tx-desc {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tx-instalment-badge {
    font-size: 0.68rem;
    color: var(--gold, #c9a86a);
    background: rgba(201, 168, 106, 0.15);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    border: 1px solid rgba(201, 168, 106, 0.3);
  }
  .tx-account-badge {
    font-size: 0.68rem;
    color: var(--ink-soft);
    background: var(--surface-2);
    padding: 0.08rem 0.35rem;
    border-radius: 4px;
    border: 1px solid var(--hairline);
  }
  .dimension-group-card .tx-account-badge {
    background: var(--surface);
  }
  .tx-item-right {
    flex-shrink: 0;
  }
  .tx-amount {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--ink);
  }
  .detail-empty {
    padding: 2rem 1rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--ink-soft);
    font-style: italic;
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

  .card-debt-alerts {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .alerts-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .debt-pills {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .debt-pill {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    gap: 0.5rem;
  }
  .debt-pill.due {
    border-color: rgba(220, 53, 69, 0.4);
    background: rgba(220, 53, 69, 0.05);
  }
  .pill-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.82rem;
  }
  .pill-type {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .pill-amount {
    font-size: 0.92rem;
    font-weight: 600;
  }
</style>
