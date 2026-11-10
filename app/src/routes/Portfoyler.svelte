<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import {
    holdingsByPortfolio,
    type HoldingGroup,
    type HoldingRow,
  } from '../lib/data/breakdowns'
  import type { OpenPosition } from '../lib/data/derive'
  import { buildLedger, type SaleEvent } from '../lib/data/ledger'
  import { prices } from '../lib/prices.svelte'
  import { money, settings } from '../lib/settings.svelte'
  import { pct, lot, dateShort, DASH } from '../lib/format'
  import Donut from '../lib/charts/Donut.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  let { dataset, view }: { dataset?: Dataset; view?: DerivedBundle } = $props()
  let selectedPortfolio = $state<string>('ALL')

  const isV2 = $derived(Boolean((settings as any)?.uiMode === 'v2'))

  const positionsByBroker = $derived.by(() => {
    if (!dataset) return new Map<string, OpenPosition[]>()
    const ledger = buildLedger(dataset.transactions, dataset.assetTransfers ?? [], 'hesap')
    const map = new Map<string, OpenPosition[]>()
    for (const [hesap, scope] of ledger.byScope) {
      if (hesap) map.set(hesap, scope.open)
    }
    return map
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
    return holdingsByPortfolio(view.positions.open, dataset.transactions, dataset.instruments, dataset.assetTransfers ?? [], {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })
  })

  const visibleGroups = $derived(
    isV2 && selectedPortfolio !== 'ALL'
      ? groups.filter((g) => g.key === selectedPortfolio)
      : groups,
  )

  const portfoyLedger = $derived.by(() => {
    if (!dataset) return null
    return buildLedger(dataset.transactions, dataset.assetTransfers ?? [], 'portfoy')
  })

  interface PortfolioSummary {
    kod: string
    ad: string
    isSaklama: boolean
    acikDegerUsd: number
    acikMaliyetUsd: number
    gerceklesmisKz: number
    gerceklesmemisKz: number | null
    temettuUsd: number
    toplamKz: number
    getiriPct: number | null
    yillikPct: number | null
    salesCount: number
    winRate: number | null
    sales: SaleEvent[]
  }

  const summaries = $derived.by<PortfolioSummary[]>(() => {
    if (!dataset || !portfoyLedger) return []
    const portfolioMap = new Map<string, string>()
    for (const p of dataset.portfolios ?? []) {
      portfolioMap.set(p.kod, p.ad)
    }
    for (const [scopeName] of portfoyLedger.byScope) {
      if (scopeName && !portfolioMap.has(scopeName)) {
        portfolioMap.set(scopeName, scopeName)
      }
    }

    const res: PortfolioSummary[] = []
    for (const [kod, ad] of portfolioMap) {
      const scope = portfoyLedger.byScope.get(kod)
      const hGroup = groups.find((g) => g.key === kod)
      const acikMaliyetUsd = hGroup?.totalCostUsd ?? 0
      const acikDegerUsd = hGroup?.totalValueUsd ?? acikMaliyetUsd
      const gerceklesmemisKz = hGroup?.unrealUsd ?? 0
      const gerceklesmisKz = scope?.realizedUsd ?? 0
      const temettuUsd = (dataset.cashflows ?? [])
        .filter((c) => c.tur === 'TEMETTU' && c.portfoy === kod)
        .reduce((s, c) => s + c.tutar_usd, 0)
      const toplamKz = gerceklesmisKz + (gerceklesmemisKz ?? 0) + temettuUsd
      const toplamAlimMaliyetiUsd = scope?.toplamAlimMaliyetiUsd ?? 0
      const getiriPct = toplamAlimMaliyetiUsd > 1e-9 ? toplamKz / toplamAlimMaliyetiUsd : null
      const ortKullanilanSermayeUsd = scope?.ortKullanilanSermayeUsd ?? 0
      const gunSayisi = scope?.gunSayisi ?? 0
      const yillikPct =
        gunSayisi >= 30 && ortKullanilanSermayeUsd > 1e-9
          ? (toplamKz / ortKullanilanSermayeUsd) * (365 / gunSayisi)
          : null
      const sales = [...(scope?.sales ?? [])].sort(
        (a, b) => b.tarih.localeCompare(a.tarih) || b.txId.localeCompare(a.txId),
      )
      const salesCount = sales.length
      const winCount = sales.filter((s) => s.kzUsd > 0).length
      const winRate = salesCount > 0 ? winCount / salesCount : null

      res.push({
        kod,
        ad,
        isSaklama: kod === 'XAU',
        acikDegerUsd,
        acikMaliyetUsd,
        gerceklesmisKz,
        gerceklesmemisKz,
        temettuUsd,
        toplamKz,
        getiriPct,
        yillikPct,
        salesCount,
        winRate,
        sales,
      })
    }

    return res.sort((a, b) => b.toplamKz - a.toplamKz)
  })

  const summaryByKod = $derived(new Map(summaries.map((s) => [s.kod, s])))

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

  const hasUnpricedHoldings = $derived(
    groups.some((g) => g.rows.some((r) => r.guncelFiyatUsd == null)),
  )

  // Each row carries its weight within its own portfolio: `_costW` by cost, `_valW` by
  // current value (falls back to cost when unpriced in deger mode).
  function rowsFor(g: HoldingGroup) {
    const isDeger = settings.basis === 'deger'
    return g.rows.map((r) => {
      const unpricedFallback = isDeger && r.guncelFiyatUsd == null
      const effectiveDeger = r.degerUsd ?? (isDeger ? r.toplamMaliyetUsd : null)
      return {
        ...r,
        degerUsd: effectiveDeger,
        unpricedFallback,
        _costW: g.totalCostUsd ? r.toplamMaliyetUsd / g.totalCostUsd : null,
        _valW:
          g.totalValueUsd != null && g.totalValueUsd !== 0 && effectiveDeger != null
            ? effectiveDeger / g.totalValueUsd
            : null,
      }
    })
  }

  // Collapsible pie row — remembered per viewer.
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
  let showPie = $state(loadFlag('bbb-pf-pies', true))
  $effect(() => saveFlag('bbb-pf-pies', showPie))

  const cols = [
    { key: '_costW', label: '% Mlyt', align: 'right' as const, sortable: true, fmt: (v: number | null) => (v == null ? DASH : pct(v)) },
    { key: 'kod', label: 'Hisse', sortable: true },
    { key: 'sinif', label: 'Sınıf', sortable: true },
    { key: 'lot', label: 'Lot', align: 'right' as const, sortable: true, fmt: (v: number) => lot(v) },
    { key: 'ortMaliyetUsd', label: 'Ort. Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'toplamMaliyetUsd', label: 'Toplam Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'guncelFiyatUsd', label: 'Güncel Fiyat', align: 'right' as const, fmt: (v: number | null) => (v == null ? DASH : money(v)) },
    {
      key: 'degerUsd',
      label: 'Değer',
      align: 'right' as const,
      sortable: true,
      html: true,
      fmt: (v: number | null, row: any) => {
        if (settings.basis === 'deger' && row.unpricedFallback) {
          return `≈ ${money(row.toplamMaliyetUsd)} <span class="hint" style="display:block;font-size:0.8125rem;">güncel fiyat alınamadı, maliyet gösteriliyor</span>`
        }
        return v == null ? DASH : money(v)
      },
    },
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
  <section class="portfoyler" class:v2-mode={(settings as any)?.uiMode === 'v2'}>
    <SectionHeader title="Portföyler" />

    {#if (settings as any)?.uiMode === 'v2'}
      <div class="v2-bento-section">
        <div class="v2-bento-header">
          <div class="v2-bento-title-row">
            <span class="v2-section-badge">⚡ OBSİDYEN & KEHRİBAR V2</span>
            <h3 class="v2-bento-title">Portföy Performans Bento</h3>
          </div>
          <div class="v2-filter-pills">
            <button
              type="button"
              class="v2-pill"
              class:active={selectedPortfolio === 'ALL'}
              onclick={() => (selectedPortfolio = 'ALL')}
            >
              Tümü ({summaries.length})
            </button>
            {#each summaries as s}
              <button
                type="button"
                class="v2-pill"
                class:active={selectedPortfolio === s.kod}
                onclick={() => (selectedPortfolio = s.kod)}
              >
                {s.kod}
              </button>
            {/each}
          </div>
        </div>

        <div class="v2-bento-grid">
          {#each summaries as s}
            {@const isSelected = selectedPortfolio === s.kod}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
            <div
              class="v2-bento-card"
              class:selected={isSelected}
              role="button"
              tabindex="0"
              onclick={() => { selectedPortfolio = selectedPortfolio === s.kod ? 'ALL' : s.kod }}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { selectedPortfolio = selectedPortfolio === s.kod ? 'ALL' : s.kod } }}
            >
              <div class="v2-card-head">
                <div class="v2-card-name-group">
                  <strong class="v2-card-kod">{s.kod}</strong>
                  {#if s.ad && s.ad !== s.kod}<span class="v2-card-ad">{s.ad}</span>{/if}
                </div>
                {#if s.isSaklama}
                  <span class="v2-badge-saklama">Saklama</span>
                {:else}
                  <span class="v2-kz-badge" class:gain={s.toplamKz > 0} class:loss={s.toplamKz < 0}>
                    {money(s.toplamKz, { sign: true })}
                  </span>
                {/if}
              </div>

              <div class="v2-card-body">
                <div class="v2-stat-row">
                  <span class="v2-stat-label">Açık Değer</span>
                  <span class="v2-stat-val num">{money(s.acikDegerUsd)}</span>
                </div>
                <div class="v2-stat-row">
                  <span class="v2-stat-label">Getiri %</span>
                  <span class="v2-stat-val num" class:gain={(s.getiriPct ?? 0) > 0} class:loss={(s.getiriPct ?? 0) < 0}>
                    {s.getiriPct != null ? pct(s.getiriPct, 1) : DASH}
                  </span>
                </div>
              </div>

              {#if !s.isSaklama}
                <div class="v2-winrate-box">
                  <div class="v2-winrate-labels">
                    <span class="v2-wr-text">İsabet Oranı (Win Rate)</span>
                    <span class="v2-wr-pct num">{s.winRate != null ? `%${(s.winRate * 100).toFixed(0)}` : '—'}</span>
                  </div>
                  <div class="v2-progress-bg">
                    <div
                      class="v2-progress-fill"
                      style:width="{s.winRate != null ? Math.min(100, Math.max(0, s.winRate * 100)) : 0}%"
                    ></div>
                  </div>
                  <div class="v2-trade-count num">{s.salesCount} işlem</div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Genel özet: Tüm portföyleri karşılaştıran performans tablosu -->
    <div class="summary-card">
      <div class="summary-header">
        <h3>Portföy Karşılaştırması</h3>
        <span class="summary-sub">Tüm zamanlar kümülatif performans · Toplam K/Z azalan</span>
      </div>
      <div class="tbl-wrap">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Portföy</th>
              <th class="r">Açık Değer</th>
              <th class="r">Gerçekleşmiş</th>
              <th class="r">Gerçekleşmemiş</th>
              <th class="r">Temettü</th>
              <th class="r">Toplam K/Z</th>
              <th class="r">Getiri %</th>
              <th class="r">Yıllık ≈ %</th>
            </tr>
          </thead>
          <tbody>
            {#each summaries as s}
              <tr>
                <td class="pf-name-cell">
                  <strong>{s.kod}</strong>
                  {#if s.ad && s.ad !== s.kod}<span class="pf-ad">({s.ad})</span>{/if}
                  {#if s.isSaklama}
                    <span class="badge-saklama">saklama</span>
                    <span class="hint">alım-satım portföyleriyle doğrudan kıyaslanmaz</span>
                  {/if}
                </td>
                <td class="r num">{money(s.acikDegerUsd)}</td>
                <td class="r num" class:gain={s.gerceklesmisKz > 0} class:loss={s.gerceklesmisKz < 0}>
                  {money(s.gerceklesmisKz, { sign: true })}
                </td>
                <td class="r num" class:gain={(s.gerceklesmemisKz ?? 0) > 0} class:loss={(s.gerceklesmemisKz ?? 0) < 0}>
                  {s.gerceklesmemisKz != null ? money(s.gerceklesmemisKz, { sign: true }) : DASH}
                </td>
                <td class="r num">{money(s.temettuUsd)}</td>
                <td class="r num bold-kz" class:gain={s.toplamKz > 0} class:loss={s.toplamKz < 0}>
                  {money(s.toplamKz, { sign: true })}
                </td>
                <td class="r num" class:gain={(s.getiriPct ?? 0) > 0} class:loss={(s.getiriPct ?? 0) < 0}>
                  {s.getiriPct != null ? pct(s.getiriPct, 1) : DASH}
                </td>
                <td class="r num" class:gain={(s.yillikPct ?? 0) > 0} class:loss={(s.yillikPct ?? 0) < 0}>
                  {s.yillikPct != null ? pct(s.yillikPct, 1) : DASH}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="hint honesty-hint">
        Yaklaşık ölçüdür — gerçek zaman ağırlıklı getiri (TWR/IRR) değildir; nakit bekleme süresini ve ara para giriş-çıkışlarını tam modellemez.
      </p>
    </div>

    <div class="pie-group">
      <button
        class="pie-toggle"
        aria-expanded={showPie}
        onclick={() => (showPie = !showPie)}
        data-testid="pf-pie-toggle"
      >
        <span class="chev" class:open={showPie} aria-hidden="true">▸</span>
        Portföy dağılımı ({settings.basis === 'deger' ? 'güncel değer bazlı' : 'maliyet bazlı'})
      </button>
      {#if showPie}
        {@render pieRow(
          settings.basis === 'deger' ? overallValue : overallCost,
          settings.basis === 'deger' ? 'value' : 'cost',
        )}
        {#if settings.basis === 'deger' && hasUnpricedHoldings}
          <p class="hint unpriced-hint">
            * Fiyatı gelmemiş varlıklar maliyet değeriyle dahil edilmiştir.
          </p>
        {/if}
      {/if}
    </div>

    {#each visibleGroups as g}
      {@const p = summaryByKod.get(g.key)}
      <div class="panel">
        <div class="panel-header">
          <div class="ph-top">
            <h2 class="ph-title">{g.key}</h2>
            {#if p}
              <div class="ph-kz" class:gain={p.toplamKz > 0} class:loss={p.toplamKz < 0}>
                Toplam K/Z {money(p.toplamKz, { sign: true })}
                {#if p.getiriPct != null}
                  <span>({pct(p.getiriPct, 1)})</span>
                {/if}
              </div>
            {/if}
          </div>
          {#if p}
            <div class="ph-line">
              <span>açık: {money(p.acikMaliyetUsd)} maliyet</span>
              <span>·</span>
              <span>{money(p.acikDegerUsd)} değer</span>
              <span>·</span>
              <span class:gain={(p.gerceklesmemisKz ?? 0) > 0} class:loss={(p.gerceklesmemisKz ?? 0) < 0}>
                {p.gerceklesmemisKz != null ? money(p.gerceklesmemisKz, { sign: true }) : DASH} gerç.mmiş
              </span>
            </div>
            <div class="ph-line">
              <span>kapanan: <strong class:gain={p.gerceklesmisKz > 0} class:loss={p.gerceklesmisKz < 0}>{money(p.gerceklesmisKz, { sign: true })}</strong> gerçekleşmiş</span>
              <span>·</span>
              <span>temettü {money(p.temettuUsd)}</span>
              <span>·</span>
              <span>{p.salesCount} işlem</span>
              {#if p.winRate != null}
                <span>·</span>
                <span>%{ (p.winRate * 100).toFixed(0) } isabet</span>
              {/if}
              {#if p.yillikPct != null}
                <span>·</span>
                <span>yıllık ≈ {pct(p.yillikPct, 1)}</span>
              {/if}
            </div>
          {/if}
        </div>

        <DataTable
          columns={cols}
          rows={rowsFor(g)}
          initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }}
          detail={rowDetail}
          rowKey={(r) => `${g.key}-${r.kod}`}
        />

        {#if p && p.sales.length > 0}
          <details class="closed-trades">
            <summary class="closed-trades-summary">Kapanan İşlemler ({p.sales.length})</summary>
            <div class="subtable-wrap">
              <table class="subtable">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Hisse</th>
                    <th class="r">Lot</th>
                    <th class="r">K/Z</th>
                    <th class="r">%</th>
                    <th>Kurum</th>
                  </tr>
                </thead>
                <tbody>
                  {#each p.sales as s}
                    <tr>
                      <td>{dateShort(s.tarih)}</td>
                      <td>
                        <strong>{s.kod}</strong>
                        {#if s.oduncAlindi}
                          <span class="badge-warn" title="Başka portföyden ödünç alındı">⚠ ödünç</span>
                        {/if}
                      </td>
                      <td class="r num">{lot(s.lot)}</td>
                      <td class="r num" class:gain={s.kzUsd > 0} class:loss={s.kzUsd < 0}>
                        {money(s.kzUsd, { sign: true })}
                      </td>
                      <td class="r num" class:gain={(s.kzPct ?? 0) > 0} class:loss={(s.kzPct ?? 0) < 0}>
                        {s.kzPct != null ? pct(s.kzPct, 1) : DASH}
                      </td>
                      <td>{s.hesap}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
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
  .summary-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }
  .summary-header {
    margin-bottom: 0.75rem;
  }
  .summary-header h3 {
    margin: 0 0 0.2rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--ink);
  }
  .summary-sub {
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .summary-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .summary-table th {
    text-align: left;
    font-weight: 600;
    color: var(--ink-soft);
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--hairline);
  }
  .summary-table td {
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--hairline);
    color: var(--ink);
  }
  .summary-table .r {
    text-align: right;
  }
  .summary-table .num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }
  .bold-kz {
    font-weight: 700;
  }
  .pf-name-cell {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .pf-ad {
    color: var(--ink-soft);
    font-weight: 400;
  }
  .badge-saklama {
    display: inline-block;
    background: rgba(234, 179, 8, 0.15);
    color: var(--gold);
    border: 1px solid rgba(234, 179, 8, 0.3);
    border-radius: 4px;
    padding: 0.05rem 0.35rem;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .badge-warn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    background: rgba(234, 179, 8, 0.15);
    color: var(--gold);
    border: 1px solid rgba(234, 179, 8, 0.35);
    border-radius: 4px;
    padding: 0.05rem 0.35rem;
    font-size: 0.8125rem;
    font-weight: 600;
    margin-left: 0.35rem;
    vertical-align: middle;
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .honesty-hint {
    margin-top: 0.75rem;
    margin-bottom: 0;
    font-style: italic;
    line-height: 1.4;
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
    font-size: 0.8125rem;
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
    font-size: 0.8125rem;
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
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem 1.25rem 1.25rem;
    margin-bottom: 1.5rem;
  }
  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.85rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--hairline);
  }
  .ph-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .ph-title {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 0;
    color: var(--ink);
  }
  .ph-kz {
    font-size: 0.95rem;
    font-weight: 700;
  }
  .ph-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .closed-trades {
    margin-top: 1rem;
    border-top: 1px solid var(--hairline);
    padding-top: 0.5rem;
  }
  .closed-trades-summary {
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink-soft);
    padding: 0.25rem 0;
    user-select: none;
  }
  .closed-trades-summary:hover {
    color: var(--ink);
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
    font-size: 0.8125rem;
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
    font-size: 0.8125rem;
  }
  .bd-name {
    font-weight: 600;
    color: var(--ink);
  }
  .bd-code {
    color: var(--ink-soft);
    font-size: 0.8125rem;
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
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .bd-cost {
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .rd-sum {
    font-size: 0.8125rem;
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
    font-size: 0.8125rem;
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
  .gain {
    color: var(--gain, #10b981);
    font-weight: 600;
  }
  .loss {
    color: var(--loss, #ef4444);
    font-weight: 600;
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
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin: 0.35rem 0 0;
    font-style: italic;
  }
  .muted {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin: 0;
  }

  /* =========================================================================
     V2 KOMUTA MERKEZİ (OBSİDYEN & KEHRİBAR) STİLLERİ
     ========================================================================= */
  .v2-bento-section {
    margin-bottom: 1.75rem;
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.04) 0%, transparent 100%);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 18px;
    padding: 1.25rem 1.5rem 1.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .v2-bento-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .v2-bento-title-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .v2-section-badge {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold, #f59e0b);
  }
  .v2-bento-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--ink);
  }
  .v2-filter-pills {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .v2-pill {
    appearance: none;
    background: var(--surface-2, #181b22);
    border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    color: var(--ink-soft);
    padding: 0.4rem 0.85rem;
    border-radius: 9999px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .v2-pill:hover {
    color: var(--ink);
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.08);
  }
  .v2-pill.active {
    background: var(--gold, #f59e0b);
    color: #0b0d11;
    border-color: var(--gold, #f59e0b);
    font-weight: 700;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
  }

  .v2-bento-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1.15rem;
  }
  .v2-bento-card {
    background: var(--surface, #12141a);
    border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 1.15rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    outline: none;
  }
  .v2-bento-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    border-color: rgba(245, 158, 11, 0.4);
  }
  .v2-bento-card.selected {
    border-color: var(--gold, #f59e0b);
    box-shadow: 0 0 20px rgba(245, 158, 11, 0.28);
    background: linear-gradient(160deg, var(--surface, #12141a) 60%, rgba(245, 158, 11, 0.08));
  }
  .v2-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .v2-card-name-group {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .v2-card-kod {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .v2-card-ad {
    font-size: 0.88rem;
    color: var(--ink-soft);
    font-weight: 500;
  }
  .v2-badge-saklama {
    font-size: 0.78rem;
    font-weight: 700;
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    background: rgba(234, 179, 8, 0.15);
    color: var(--gold, #f59e0b);
    border: 1px solid rgba(234, 179, 8, 0.35);
  }
  .v2-kz-badge {
    font-size: 0.92rem;
    font-weight: 700;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
    font-family: var(--font-num);
    background: rgba(255, 255, 255, 0.05);
  }
  .v2-kz-badge.gain {
    color: var(--gain, #10b981);
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .v2-kz-badge.loss {
    color: var(--loss, #ef4444);
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .v2-card-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--hairline, rgba(255, 255, 255, 0.06));
    border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.06));
  }
  .v2-stat-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .v2-stat-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .v2-stat-val {
    font-size: 1.12rem;
    font-weight: 700;
    color: var(--ink);
  }

  .v2-winrate-box {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .v2-winrate-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.82rem;
  }
  .v2-wr-text {
    color: var(--ink-soft);
    font-weight: 600;
  }
  .v2-wr-pct {
    color: var(--gold, #f59e0b);
    font-weight: 700;
  }
  .v2-progress-bg {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 9999px;
    overflow: hidden;
  }
  .v2-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #d97706, #fbbf24);
    border-radius: 9999px;
    transition: width 0.35s ease;
  }
  .v2-trade-count {
    font-size: 0.78rem;
    color: var(--ink-soft);
    text-align: right;
  }

  /* V2 Typography and Card Elevation in .v2-mode */
  .portfoyler.v2-mode .summary-card,
  .portfoyler.v2-mode .panel {
    border-radius: 16px;
    padding: 1.5rem;
    background: var(--surface);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .portfoyler.v2-mode .summary-card:hover,
  .portfoyler.v2-mode .panel:hover {
    border-color: rgba(245, 158, 11, 0.3);
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.38);
  }

  .portfoyler.v2-mode .summary-header h3 {
    font-size: 1.25rem;
    font-weight: 800;
  }
  .portfoyler.v2-mode .summary-sub {
    font-size: 0.95rem;
  }
  .portfoyler.v2-mode .summary-table,
  .portfoyler.v2-mode .subtable {
    font-size: 0.95rem;
  }
  .portfoyler.v2-mode .summary-table th,
  .portfoyler.v2-mode .subtable th {
    font-size: 0.88rem;
    padding: 0.65rem 0.75rem;
  }
  .portfoyler.v2-mode .summary-table td,
  .portfoyler.v2-mode .subtable td {
    padding: 0.65rem 0.75rem;
  }
  .portfoyler.v2-mode .ph-title {
    font-size: 1.4rem;
    font-weight: 800;
  }
  .portfoyler.v2-mode .ph-kz {
    font-size: 1.15rem;
  }
  .portfoyler.v2-mode .ph-line {
    font-size: 0.95rem;
    gap: 0.6rem;
  }
  .portfoyler.v2-mode .pie-toggle {
    font-size: 0.95rem;
    padding: 0.5rem 0;
  }
  .portfoyler.v2-mode .pie-label {
    font-size: 0.92rem;
  }
  .portfoyler.v2-mode .hint,
  .portfoyler.v2-mode .muted,
  .portfoyler.v2-mode .closed-trades-summary {
    font-size: 0.92rem;
  }
  .portfoyler.v2-mode .bd-card {
    border-radius: 12px;
    padding: 0.65rem 0.95rem;
  }
  .portfoyler.v2-mode .bd-title {
    font-size: 0.95rem;
  }
  .portfoyler.v2-mode .bd-lot {
    font-size: 1.1rem;
  }
</style>
