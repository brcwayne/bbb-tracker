<script lang="ts">
  import type { Dataset, Instrument, Transaction } from '../lib/data/types'
  import type { DerivedBundle, AppState } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import type { Writable } from 'svelte/store'
  import { pct, lot, dateShort, DASH } from '../lib/format'
  import { money } from '../lib/settings.svelte'
  import { prices } from '../lib/prices.svelte'
  import { unrealizedByKod } from '../lib/data/unrealized'
  import { dayDiff } from '../lib/data/ledger'
  import type { SaleEvent } from '../lib/data/ledger'
  import { calculateHoldingStats } from '../lib/data/holding'
  import KpiBand from '../lib/ui/KpiBand.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import LevelEditor from './LevelEditor.svelte'

  // RULING P1-3 annotation form; props optional, guarded in the template.
  // RULING P1-10: the prop name `derived` collides with the `$derived` rune, so
  // the view model is assembled by a plain function under the `{#if}` guard.
  let {
    dataset,
    derived,
    source,
    store,
  }: {
    dataset?: Dataset
    derived?: DerivedBundle
    source?: DataSource
    store?: Writable<AppState>
  } = $props()

  // Filter state (RULING P1-9: scoped page styles below). Empty string = "(hepsi)".
  let fClass = $state('')
  let fPortfoy = $state('')
  let fHesap = $state('')

  const distinct = (xs: string[]) => [...new Set(xs)]

  function latestTxByKod(txns: Transaction[]): Map<string, Transaction> {
    const m = new Map<string, Transaction>()
    for (const t of txns) {
      const prev = m.get(t.enstruman)
      if (
        !prev ||
        t.tarih > prev.tarih ||
        (t.tarih === prev.tarih && t.id > prev.id)
      )
        m.set(t.enstruman, t)
    }
    return m
  }

  function seviyeDisplay(
    inst: Instrument | undefined,
    currentPrice: number | null,
  ): string {
    const s = inst?.seviyeler
    if (!s) return DASH
    const parts: string[] = []
    const badges: string[] = []

    if (s.destek != null) {
      if (currentPrice != null && s.destek > 0) {
        const dist = ((currentPrice - s.destek) / s.destek) * 100
        const distStr = (dist > 0 ? '+' : '') + dist.toFixed(1) + '%'
        parts.push(`D: ${s.destek} (${distStr})`)
        if (currentPrice <= s.destek) {
          badges.push('<span class="badge-level-cross loss">D kırıldı</span>')
        }
      } else {
        parts.push(`D: ${s.destek}`)
      }
    }

    if (s.direnc != null) {
      if (currentPrice != null && s.direnc > 0) {
        const dist = ((currentPrice - s.direnc) / s.direnc) * 100
        const distStr = (dist > 0 ? '+' : '') + dist.toFixed(1) + '%'
        parts.push(`R: ${s.direnc} (${distStr})`)
        if (currentPrice >= s.direnc) {
          badges.push('<span class="badge-level-cross gain">R aşıldı</span>')
        }
      } else {
        parts.push(`R: ${s.direnc}`)
      }
    }

    if (s.hedef != null) {
      if (currentPrice != null && s.hedef > 0) {
        const dist = ((currentPrice - s.hedef) / s.hedef) * 100
        const distStr = (dist > 0 ? '+' : '') + dist.toFixed(1) + '%'
        parts.push(`H: ${s.hedef} (${distStr})`)
        if (currentPrice >= s.hedef) {
          badges.push('<span class="badge-level-cross gain">H ulaşıldı</span>')
        }
      } else {
        parts.push(`H: ${s.hedef}`)
      }
    }

    if (parts.length === 0) return DASH
    const text = parts.join(' / ')
    return badges.length > 0 ? `${text} ${badges.join(' ')}` : text
  }

  function buildView(ds: Dataset, d: DerivedBundle) {
    void prices.status // re-run buildView when a price refresh completes

    const instByKod = new Map(ds.instruments.map((i) => [i.kod, i]))
    const latestTx = latestTxByKod(ds.transactions)

    // Defensive: derivePositions can leave a phantom zero-lot entry.
    const openRaw = d.positions.open.filter((p) => p.lot > 1e-9)
    const totalCost = openRaw.reduce((s, p) => s + p.toplamMaliyetUsd, 0) || 1

    const unreal = unrealizedByKod(openRaw, ds.instruments, {
      bySymbol: prices.bySymbol,
      usdPerGram: prices.usdPerGram,
    })

    const salesByKod = new Map<string, SaleEvent[]>()
    for (const s of d.positions.sales ?? []) {
      const list = salesByKod.get(s.kod) ?? []
      list.push(s)
      salesByKod.set(s.kod, list)
    }

    const openRows = openRaw.map((p) => {
      const inst = instByKod.get(p.kod)
      const tx = latestTx.get(p.kod)
      const u = unreal.get(p.kod)

      let nativePrice: number | null = null
      if (inst) {
        const bySym = prices.bySymbol[inst.fiyatSembolu]
        if (inst.girisParaBirimi === 'TL' || inst.girisParaBirimi === 'TRY') {
          if (bySym && bySym.currency === 'TRY' && typeof bySym.price === 'number') {
            nativePrice = bySym.price
          } else if (typeof prices.usdtry === 'number' && typeof u?.guncelFiyatUsd === 'number') {
            nativePrice = u.guncelFiyatUsd * prices.usdtry
          }
        } else {
          // USD
          if (typeof u?.guncelFiyatUsd === 'number') {
            nativePrice = u.guncelFiyatUsd
          } else if (bySym && typeof bySym.priceUsd === 'number') {
            nativePrice = bySym.priceUsd
          } else if (bySym && typeof bySym.price === 'number') {
            nativePrice = bySym.price
          }
        }
      }

      return {
        isClosed: false,
        kod: p.kod,
        sinif: inst?.sinif ?? DASH,
        portfoy: tx?.portfoy ?? DASH,
        hesap: tx?.hesap ?? DASH,
        lot: p.lot,
        ortMaliyetUsd: p.ortMaliyetUsd,
        toplamMaliyetUsd: p.toplamMaliyetUsd,
        pay: p.toplamMaliyetUsd / totalCost,
        guncelFiyat: u?.guncelFiyatUsd ?? null,
        gerceklesmemisKz: u?.kzUsd ?? null,
        gerceklesmemisPct: u?.kzPct ?? null,
        seviye: seviyeDisplay(inst, nativePrice),
      }
    })

    const closedRows = d.positions.closed.map((c) => {
      const symSales = salesByKod.get(c.kod) ?? []
      return {
        isClosed: true,
        kod: c.kod,
        sonSatisTarih: c.sonSatisTarih,
        satisAdet: symSales.length,
        // Sold-lot cost basis, not the full-buy notional (F2): avg cost of the
        // lots actually sold, so a winning partial exit doesn't read as a loss.
        alisOrt: c.satisLot ? c.satisMaliyetUsd / c.satisLot : null,
        alisTutarUsd: c.satisMaliyetUsd,
        satisOrt: c.satisLot ? c.satisTutarUsd / c.satisLot : null,
        satisTutarUsd: c.satisTutarUsd,
        gerceklesmisKzUsd: c.gerceklesmisKzUsd,
        pctVal: c.satisMaliyetUsd === 0 ? null : c.gerceklesmisKzUsd / c.satisMaliyetUsd,
      }
    })

    const s = d.stats
    return {
      statItems: [
        { label: 'Win:Loss', value: `${s.win}:${s.loss}` },
        { label: 'Kazanma Oranı', value: pct(s.kazanmaOrani) },
        { label: 'Ort. Kazanç %', value: pct(s.ortKazancPct) },
        { label: 'Ort. Kayıp %', value: pct(s.ortKayipPct) },
        { label: 'En Büyük Kazanç', value: money(s.enBuyukKazanc) },
        { label: 'En Büyük Kayıp', value: money(s.enBuyukKayip) },
        {
          label: 'Risk/Ödül',
          value: s.riskOdul == null ? DASH : s.riskOdul.toFixed(2),
        },
      ],
      openRows,
      closedRows,
      holdingStats: calculateHoldingStats(d.positions.sales ?? []),
      classOptions: distinct(ds.instruments.map((i) => i.sinif)),
      portfoyOptions: distinct(ds.transactions.map((t) => t.portfoy)),
      hesapOptions: distinct(ds.transactions.map((t) => t.hesap)),
    }
  }

  const num = (v: number | null) => money(v as number)

  type OpenRow = ReturnType<typeof buildView>['openRows'][number]

  function applyFilters(
    rows: OpenRow[],
    cls: string,
    prt: string,
    hsp: string,
  ): OpenRow[] {
    return rows.filter(
      (r) =>
        (cls === '' || r.sinif === cls) &&
        (prt === '' || r.portfoy === prt) &&
        (hsp === '' || r.hesap === hsp),
    )
  }

  const openColumns = [
    { key: 'kod', label: 'Hisse', sortable: true },
    { key: 'sinif', label: 'Sınıf', sortable: true },
    { key: 'portfoy', label: 'Portföy', sortable: true },
    { key: 'lot', label: 'Lot', align: 'right' as const, sortable: true, fmt: (v: number) => lot(v) },
    {
      key: 'ortMaliyetUsd',
      label: 'Ort. Maliyet',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    {
      key: 'toplamMaliyetUsd',
      label: 'Toplam Maliyet',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    {
      key: 'pay',
      label: 'Pay %',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number) => pct(v),
    },
    {
      key: 'guncelFiyat',
      label: 'Güncel Fiyat',
      align: 'right' as const,
      fmt: (v: number | null) => (v == null ? DASH : money(v)),
    },
    {
      key: 'gerceklesmemisKz',
      label: 'Gerç.mmiş K/Z',
      align: 'right' as const,
      sortable: true,
      tone: 'sign' as const,
      fmt: (v: number | null) => (v == null ? DASH : money(v, { sign: true })),
    },
    {
      key: 'gerceklesmemisPct',
      label: 'Gerç.mmiş %',
      align: 'right' as const,
      sortable: true,
      tone: 'sign' as const,
      fmt: (v: number | null) => (v == null ? DASH : pct(v)),
    },
    { key: 'seviye', label: 'Seviye', html: true },
  ]

  const closedColumns = [
    { key: 'kod', label: 'Hisse', sortable: true },
    {
      key: 'sonSatisTarih',
      label: 'Son Satış',
      sortable: true,
      fmt: (v: string) => (v ? dateShort(v) : DASH),
    },
    {
      key: 'satisAdet',
      label: 'Satış',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number) => (v ? String(v) : DASH),
    },
    { key: 'alisOrt', label: 'Alış Ort.', align: 'right' as const, sortable: true, fmt: num },
    {
      key: 'alisTutarUsd',
      label: 'Alış Tutarı',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    { key: 'satisOrt', label: 'Satış Ort.', align: 'right' as const, sortable: true, fmt: num },
    {
      key: 'satisTutarUsd',
      label: 'Satış Tutarı',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    {
      key: 'gerceklesmisKzUsd',
      label: 'Gerçekleşmiş K/Z',
      align: 'right' as const,
      sortable: true,
      tone: 'sign' as const,
      fmt: (v: number) => money(v, { sign: true }),
    },
    {
      key: 'pctVal',
      label: '%',
      align: 'right' as const,
      sortable: true,
      tone: 'sign' as const,
      fmt: (v: number | null) => (v == null ? DASH : pct(v)),
    },
  ]
</script>

{#snippet rowTxns(row: { kod: string; isClosed?: boolean })}
  {@const isClosed = row.isClosed ?? false}
  {@const txns = (dataset?.transactions ?? [])
    .filter((t) => t.enstruman === row.kod)
    .sort((a, b) =>
      a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )}
  {@const alLot = txns.filter((t) => t.yon === 'AL').reduce((s, t) => s + t.lot, 0)}
  {@const satLot = txns.filter((t) => t.yon === 'SAT').reduce((s, t) => s + t.lot, 0)}
  {@const alUsd = txns.filter((t) => t.yon === 'AL').reduce((s, t) => s + t.net_usd, 0)}
  {@const satUsd = txns.filter((t) => t.yon === 'SAT').reduce((s, t) => s + t.fiyat_usd * t.lot - t.komisyon_usd, 0)}
  {@const symSales = (derived?.positions.sales ?? []).filter((s) => s.kod === row.kod)}
  {@const saleByTxId = new Map((derived?.positions.sales ?? []).map((s) => [s.txId, s]))}
  {@const openPos = derived?.positions.open.find((p) => p.kod === row.kod && p.lot > 1e-9)}
  {@const closedPos = derived?.positions.closed.find((c) => c.kod === row.kod)}
  {@const realizedKz = closedPos?.gerceklesmisKzUsd ?? symSales.reduce((s, x) => s + x.kzUsd, 0)}
  {@const realizedMaliyet = closedPos?.satisMaliyetUsd ?? symSales.reduce((s, x) => s + x.maliyetUsd, 0)}
  {@const realizedPct = realizedMaliyet > 1e-9 ? realizedKz / realizedMaliyet : null}
  {@const totalSoldLot = closedPos?.satisLot ?? symSales.reduce((s, x) => s + x.lot, 0)}
  {@const lastSaleDate = closedPos?.sonSatisTarih || (symSales.length ? symSales[symSales.length - 1].tarih : '')}
  {@const tutmaGunu = closedPos?.ilkAlisTarih && closedPos?.sonSatisTarih ? Math.max(0, dayDiff(closedPos.ilkAlisTarih, closedPos.sonSatisTarih)) : (symSales.length ? symSales[symSales.length - 1].tutmaGunu : null)}
  {@const u = openPos && dataset ? unrealizedByKod([openPos], dataset.instruments, { bySymbol: prices.bySymbol, usdPerGram: prices.usdPerGram }).get(row.kod) : null}

  <div class="rowdetail">
    <div class="summary-strip">
      {#if isClosed}
        <div class="strip-line1">
          <span>🔴 KAPANDI</span>
          <span>·</span>
          <span>{lastSaleDate ? dateShort(lastSaleDate) : DASH}</span>
          <span>·</span>
          <span>{symSales.length} satışta {lot(totalSoldLot)} lot</span>
        </div>
        <div class="strip-line2">
          <span>Gerçekleşen K/Z: <strong class:gain={realizedKz > 0} class:loss={realizedKz < 0}>{money(realizedKz, { sign: true })}</strong></span>
          {#if realizedPct != null}
            <span> ({pct(realizedPct, 1)})</span>
          {/if}
          <span>·</span>
          <span>Tutma süresi: {tutmaGunu != null ? `${tutmaGunu} gün` : DASH}</span>
        </div>
      {:else}
        <div class="strip-line1">
          <span>🟢 AÇIK</span>
          <span>·</span>
          <span>{lot(openPos ? openPos.lot : 0)} lot kaldı</span>
        </div>
        <div class="strip-line2">
          <span>Şimdiye dek gerçekleşen: <strong class:gain={realizedKz > 0} class:loss={realizedKz < 0}>{money(realizedKz, { sign: true })}</strong></span>
          <span>·</span>
          <span>Gerçekleşmemiş: <strong class:gain={(u?.kzUsd ?? 0) > 0} class:loss={(u?.kzUsd ?? 0) < 0}>{u?.kzUsd != null ? money(u.kzUsd, { sign: true }) : DASH}</strong></span>
          {#if u?.kzPct != null}
            <span> ({pct(u.kzPct, 1)})</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if !isClosed}
      <LevelEditor
        kod={row.kod}
        inst={dataset?.instruments.find((i) => i.kod === row.kod)}
        {source}
        {store}
        {dataset}
      />
    {/if}

    {#if symSales.length > 0}
      <div class="sales-block">
        <h4 class="sales-title">Satışlar (gerçekleşen kâr/zarar)</h4>
        <table class="subtable sales-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th class="r">Lot</th>
              <th class="r">Satış Fiyatı</th>
              <th class="r">Ort. Maliyet</th>
              <th class="r">Maliyet</th>
              <th class="r">Hasılat</th>
              <th class="r">Komisyon</th>
              <th class="r">K/Z</th>
              <th class="r">%</th>
              <th class="r">Kalan</th>
              <th>Kurum</th>
              <th>Portföy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each symSales as s}
              <tr>
                <td>{dateShort(s.tarih)}</td>
                <td class="r num">{lot(s.lot)}</td>
                <td class="r num">{money(s.satisFiyatUsd)}</td>
                <td class="r num">{money(s.ortMaliyetUsd)}</td>
                <td class="r num">{money(s.maliyetUsd)}</td>
                <td class="r num">{money(s.hasilatUsd)}</td>
                <td class="r num">{money(s.komisyonUsd)}</td>
                <td class="r num" class:gain={s.kzUsd > 0} class:loss={s.kzUsd < 0}>
                  {money(s.kzUsd, { sign: true })}
                </td>
                <td class="r num" class:gain={(s.kzPct ?? 0) > 0} class:loss={(s.kzPct ?? 0) < 0}>
                  {s.kzPct != null ? pct(s.kzPct, 1) : DASH}
                </td>
                <td class="r num">{lot(s.kalanLot)}</td>
                <td>{s.hesap}</td>
                <td>{s.portfoy}</td>
                <td class="badge-col">
                  {#if s.pozisyonKapandi}
                    <span class="badge-kapandi">KAPANDI</span>
                  {/if}
                  {#if s.oduncAlindi}
                    <span class="badge-warn" title="Başka portföyden ödünç alındı">⚠ ödünç</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <details class="all-txns">
      <summary class="all-txns-summary">Tüm işlemler ({txns.length})</summary>
      <div class="rd-sum">
        <span>{txns.length} işlem</span>
        <span>Alım {lot(alLot)} lot · {money(alUsd)}</span>
        <span>Satım {lot(satLot)} lot · {money(satUsd)}</span>
      </div>
      {#if txns.length}
        <table class="subtable">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Yön</th>
              <th class="r">Lot</th>
              <th class="r">Fiyat (USD)</th>
              <th class="r">Komisyon</th>
              <th class="r">Net (USD)</th>
              <th class="r">K/Z</th>
              <th>Hesap</th>
              <th>Portföy</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {#each txns as t}
              {@const sale = saleByTxId.get(t.id)}
              <tr>
                <td>{dateShort(t.tarih)}</td>
                <td class="yon" class:al={t.yon === 'AL'} class:sat={t.yon === 'SAT'}>{t.yon}</td>
                <td class="r num">{lot(t.lot)}</td>
                <td class="r num">{money(t.fiyat_usd)}</td>
                <td class="r num">{money(t.komisyon_usd)}</td>
                <td class="r num">{money(t.net_usd)}</td>
                <td class="r num" class:gain={sale && sale.kzUsd > 0} class:loss={sale && sale.kzUsd < 0}>
                  {sale ? money(sale.kzUsd, { sign: true }) : DASH}
                </td>
                <td>{t.hesap}</td>
                <td>
                  {t.portfoy}
                  {#if sale && sale.oduncAlindi}
                    <span class="badge-warn" title="Başka portföyden ödünç alındı">⚠ ödünç</span>
                  {/if}
                </td>
                <td class="note">{t.not || DASH}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="muted">İşlem kaydı bulunamadı.</p>
      {/if}
    </details>
  </div>
{/snippet}

{#if dataset && derived}
  {@const vm = buildView(dataset, derived)}
  {@const openFiltered = applyFilters(vm.openRows, fClass, fPortfoy, fHesap)}
  <section class="pozisyonlar">
    <SectionHeader title="Pozisyonlar" />

    <KpiBand items={vm.statItems} />

    <SectionHeader title="Açık pozisyonlar" note={`${openFiltered.length} kayıt`} />

    <div class="filters">
      <div class="flt">
        <label for="flt-class">Sınıf</label>
        <select id="flt-class" bind:value={fClass}>
          <option value="">(hepsi)</option>
          {#each vm.classOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
      <div class="flt">
        <label for="flt-portfoy">Portföy</label>
        <select id="flt-portfoy" bind:value={fPortfoy}>
          <option value="">(hepsi)</option>
          {#each vm.portfoyOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
      <div class="flt">
        <label for="flt-hesap">Hesap</label>
        <select id="flt-hesap" bind:value={fHesap}>
          <option value="">(hepsi)</option>
          {#each vm.hesapOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
    </div>

    <div data-testid="open-table">
      <DataTable
        columns={openColumns}
        rows={openFiltered}
        initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }}
        detail={rowTxns}
        rowKey={(r) => r.kod}
      />
    </div>

    <!-- H6 Tutma Süresi Dağılımı Paneli -->
    <div class="holding-panel" data-testid="holding-panel">
      <SectionHeader title="Tutma süresi dağılımı" note="satış işlemleri" />
      <div class="holding-summary">
        <div class="holding-kpi win">
          <span class="holding-badge win">Kazanan işlemler</span>
          <div class="holding-nums">
            <span>ortalama <strong>{Math.round(vm.holdingStats.avgWin)} gün</strong></span>
            <span class="hint inline">(medyan {Math.round(vm.holdingStats.medianWin)})</span>
            <span class="holding-count">· {vm.holdingStats.winCount} işlem</span>
          </div>
        </div>
        <div class="holding-kpi loss">
          <span class="holding-badge loss">Kaybeden işlemler</span>
          <div class="holding-nums">
            <span>ortalama <strong>{Math.round(vm.holdingStats.avgLoss)} gün</strong></span>
            <span class="hint inline">(medyan {Math.round(vm.holdingStats.medianLoss)})</span>
            <span class="holding-count">· {vm.holdingStats.lossCount} işlem</span>
          </div>
        </div>
      </div>

      <div class="holding-histogram">
        <div class="hist-legend">
          <span class="hist-legend-item"><span class="swatch win"></span> Kazanan</span>
          <span class="hist-legend-item"><span class="swatch loss"></span> Kaybeden</span>
        </div>
        <div class="hist-bars">
          {#each vm.holdingStats.buckets as b}
            <div class="hist-col">
              <div class="hist-bars-pair">
                <div class="hist-bar-wrap">
                  {#if b.winCount > 0}
                    <div class="hist-bar win" style:height="{Math.max((b.winCount / vm.holdingStats.maxBucketCount) * 80, 6)}px">
                      <span class="hist-bar-count">{b.winCount}</span>
                    </div>
                  {/if}
                </div>
                <div class="hist-bar-wrap">
                  {#if b.lossCount > 0}
                    <div class="hist-bar loss" style:height="{Math.max((b.lossCount / vm.holdingStats.maxBucketCount) * 80, 6)}px">
                      <span class="hist-bar-count">{b.lossCount}</span>
                    </div>
                  {/if}
                </div>
              </div>
              <span class="hist-label">{b.label} gün</span>
            </div>
          {/each}
        </div>
      </div>

      {#if vm.holdingStats.excludedCount > 0}
        <p class="holding-excluded hint">
          ℹ {vm.holdingStats.excludedCount} işlem tutma süresi hesaplanamadığı için hariç tutuldu.
        </p>
      {/if}

      {#if vm.holdingStats.comment}
        <div class="holding-comment" data-testid="holding-comment">
          💡 {vm.holdingStats.comment}
        </div>
      {/if}
    </div>

    <SectionHeader title="Kapalı pozisyonlar" />
    <div data-testid="closed-table">
      <DataTable
        columns={closedColumns}
        rows={vm.closedRows}
        initialSort={{ key: 'kod', dir: 'asc' }}
        detail={rowTxns}
        rowKey={(r) => r.kod}
      />
    </div>

    <aside class="notes" data-testid="pozisyonlar-notes">
      <p class="approx">
        Portföy / Hesap sütunu enstrümanın son işlemine göre gösterilir (yaklaşık).
      </p>
    </aside>
  </section>
{:else}
  <EmptyState title="Pozisyonlar" detail="Veri bekleniyor." />
{/if}

<style>
  .pozisyonlar {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1240px, 96vw);
    margin: 0 auto;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0.5rem 0 0.75rem;
  }
  .flt {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8125rem;
  }
  .flt label {
    color: var(--ink-soft);
    letter-spacing: 0.02em;
  }
  .flt select {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }
  .notes {
    margin-top: 1.25rem;
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .notes .approx {
    margin: 0;
  }

  .rowdetail {
    padding: 0.6rem 0.9rem 0.9rem;
  }
  .summary-strip {
    background: var(--surface-2, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    margin-bottom: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.875rem;
  }
  .strip-line1 {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .strip-line2 {
    color: var(--ink-soft);
    font-size: 0.8125rem;
  }
  .sales-block {
    margin: 0.75rem 0;
  }
  .sales-title {
    margin: 0 0 0.4rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge-kapandi {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    background: rgba(239, 68, 68, 0.15);
    color: var(--loss);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 4px;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .badge-warn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem;
    background: rgba(234, 179, 8, 0.15);
    color: var(--gold);
    border: 1px solid rgba(234, 179, 8, 0.35);
    border-radius: 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    margin-left: 0.35rem;
    vertical-align: middle;
  }
  .rd-sum {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    font-size: 0.8125rem;
    color: var(--ink-soft);
    letter-spacing: 0.02em;
    margin: 0.4rem 0 0.5rem;
  }
  .all-txns {
    margin-top: 0.75rem;
  }
  .all-txns-summary {
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink-soft);
    padding: 0.2rem 0;
    user-select: none;
  }
  .all-txns-summary:hover {
    color: var(--ink);
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
  .subtable .gain {
    color: var(--gain);
  }
  .subtable .loss {
    color: var(--loss);
  }
  .subtable .yon.al {
    color: var(--gain);
  }
  .subtable .yon.sat {
    color: var(--loss);
  }
  .subtable .note {
    color: var(--ink-soft);
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin: 0;
  }

  .holding-panel {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem 1.25rem 1.25rem;
    margin: 1.75rem 0 1.5rem;
  }
  .holding-summary {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin: 0.75rem 0 1rem;
  }
  @media (min-width: 640px) {
    .holding-summary {
      grid-template-columns: 1fr 1fr;
    }
  }
  .holding-kpi {
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .holding-badge {
    font-size: 0.8125rem;
    font-weight: 600;
    align-self: flex-start;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }
  .holding-badge.win {
    background: rgba(46, 160, 67, 0.15);
    color: #2ea043;
  }
  .holding-badge.loss {
    background: rgba(218, 54, 51, 0.15);
    color: #da3633;
  }
  .holding-nums {
    font-size: 0.875rem;
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .holding-nums strong {
    font-size: 1rem;
  }
  .holding-nums .hint.inline {
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .holding-count {
    font-size: 0.8125rem;
    color: var(--ink-soft);
  }
  .holding-histogram {
    margin: 1rem 0;
    padding: 1rem;
    background: var(--bg);
    border-radius: 6px;
  }
  .hist-legend {
    display: flex;
    gap: 1.25rem;
    font-size: 0.8125rem;
    margin-bottom: 0.75rem;
  }
  .hist-legend-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--ink-soft);
  }
  .swatch {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 2px;
  }
  .swatch.win {
    background: #2ea043;
  }
  .swatch.loss {
    background: #da3633;
  }
  .hist-bars {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
    align-items: flex-end;
    height: 120px;
    padding-top: 1rem;
  }
  .hist-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }
  .hist-bars-pair {
    display: flex;
    gap: 4px;
    align-items: flex-end;
    height: 90px;
    width: 100%;
    justify-content: center;
  }
  .hist-bar-wrap {
    flex: 1;
    max-width: 24px;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .hist-bar {
    width: 100%;
    border-radius: 3px 3px 0 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 2px;
    transition: height 0.2s ease;
  }
  .hist-bar.win {
    background: #2ea043;
  }
  .hist-bar.loss {
    background: #da3633;
  }
  .hist-bar-count {
    font-size: 0.8125rem;
    color: #fff;
    font-weight: 600;
  }
  .hist-label {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin-top: 0.5rem;
    white-space: nowrap;
  }
  .holding-excluded {
    font-size: 0.8125rem;
    color: var(--ink-soft);
    margin: 0.5rem 0 0;
  }
  .holding-comment {
    margin-top: 0.75rem;
    padding: 0.6rem 0.8rem;
    background: rgba(210, 153, 34, 0.1);
    border-left: 3px solid var(--gold);
    border-radius: 0 4px 4px 0;
    font-size: 0.875rem;
    color: var(--ink);
  }
  :global(.badge-level-cross) {
    display: inline-block;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-left: 0.35rem;
    vertical-align: middle;
  }
  :global(.badge-level-cross.loss) {
    background: rgba(239, 68, 68, 0.15);
    color: var(--loss);
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
  :global(.badge-level-cross.gain) {
    background: rgba(34, 197, 94, 0.15);
    color: var(--gain);
    border: 1px solid rgba(34, 197, 94, 0.35);
  }
</style>
