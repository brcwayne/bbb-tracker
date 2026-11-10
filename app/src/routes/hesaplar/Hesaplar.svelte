<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalAccount } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountGroups, netWorthBand } from '../../lib/data/accounts'
  import type { AccountRow } from '../../lib/data/accounts'
  import { fmtCurrency, todayLocalIso } from '../../lib/format'
  import { settings } from '../../lib/settings.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import HesapFormu from './HesapFormu.svelte'
  import TransferFormu from './TransferFormu.svelte'

  let {
    dataset,
    source,
    store,
    today = todayLocalIso(),
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    today?: string
  } = $props()

  const isDrive = $derived(Boolean(source?.save))

  let pasifDahil = $state(false)
  let duzenlemeModu = $state(false)
  let yeniHesapAcik = $state(false)
  let transferAcik = $state(false)
  let duzenlenenHesap = $state<PersonalAccount | null>(null)
  let qHesap = $state('')
  let activeGroupFilter = $state<string>('ALL')

  const isV2 = $derived(Boolean((settings as any)?.uiMode === 'v2'))

  const accounts = $derived(dataset?.personalAccounts ?? [])
  const groups = $derived(
    accountGroups(dataset?.personalTx ?? [], accounts, today, { pasifDahil }),
  )

  const visibleGroups = $derived.by(() => {
    if (!isV2) return groups
    let res = groups
    if (activeGroupFilter !== 'ALL') {
      res = res.filter((g) => g.tur === activeGroupFilter)
    }
    if (qHesap.trim()) {
      const q = qHesap.trim().toLowerCase()
      res = res
        .map((g) => {
          const matchingRows = g.satirlar.filter(
            (r) =>
              r.ad.toLowerCase().includes(q) ||
              r.kod.toLowerCase().includes(q) ||
              (r.banka && r.banka.toLowerCase().includes(q)),
          )
          return {
            ...g,
            satirlar: matchingRows,
          }
        })
        .filter((g) => g.satirlar.length > 0)
    }
    return res
  })
  const band = $derived(netWorthBand(groups))
  const paralar = $derived(Object.keys(band).sort())

  const fmt = (v: number, para: string) => fmtCurrency(v, para)

  interface BankCluster {
    banka: string
    satirlar: AccountRow[]
    toplam: Record<string, number>
  }

  function organizeBankRows(satirlar: AccountRow[]): { clusters: BankCluster[]; standalone: AccountRow[] } {
    const map = new Map<string, AccountRow[]>()
    const standalone: AccountRow[] = []

    for (const r of satirlar) {
      if (r.banka && r.banka.trim()) {
        const b = r.banka.trim()
        const list = map.get(b) ?? []
        list.push(r)
        map.set(b, list)
      } else {
        standalone.push(r)
      }
    }

    const clusters: BankCluster[] = []
    for (const [banka, rows] of map.entries()) {
      const toplam: Record<string, number> = {}
      for (const r of rows) {
        toplam[r.paraBirimi] = Math.round(((toplam[r.paraBirimi] ?? 0) + r.bakiye) * 100) / 100
      }
      clusters.push({ banka, satirlar: rows, toplam })
    }
    clusters.sort((a, b) => a.banka.localeCompare(b.banka, 'tr'))
    return { clusters, standalone }
  }

  function duzenle(kod: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const a = accounts.find((x) => x.kod === kod)
    if (a) {
      duzenlenenHesap = a
    }
  }
</script>

<div class="page-container" class:v2-mode={(settings as any)?.uiMode === 'v2'}>
  <header class="hesaplar-head">
    <h2>Hesaplar</h2>
    <div class="head-actions">
      <button
        type="button"
        class="head-btn"
        class:active={transferAcik}
        aria-label="Transfer yap"
        title="Hesaplar Arası Transfer"
        disabled={!isDrive}
        onclick={() => { transferAcik = !transferAcik; yeniHesapAcik = false; duzenlenenHesap = null }}
      >⇄</button>
      <button
        type="button"
        class="head-btn"
        class:active={duzenlemeModu}
        aria-label="Hesapları düzenle"
        disabled={!isDrive}
        onclick={() => (duzenlemeModu = !duzenlemeModu)}
      >✎</button>
      <button
        type="button"
        class="head-btn add"
        aria-label="Hesap ekle"
        disabled={!isDrive}
        onclick={() => { yeniHesapAcik = true; transferAcik = false; duzenlenenHesap = null }}
      >+</button>
    </div>
  </header>

  {#if transferAcik && dataset}
    <div class="form-modal">
      <TransferFormu
        {dataset}
        {source}
        {store}
        onSaved={() => { transferAcik = false }}
        onCancel={() => { transferAcik = false }}
      />
    </div>
  {/if}

  {#if (yeniHesapAcik || duzenlenenHesap) && dataset}
    <div class="form-modal">
      {#key duzenlenenHesap?.kod ?? 'new'}
        <HesapFormu
          {dataset}
          {source}
          {store}
          editing={duzenlenenHesap ?? undefined}
          onSaved={() => {
            yeniHesapAcik = false
            duzenlenenHesap = null
          }}
          onCancel={() => {
            yeniHesapAcik = false
            duzenlenenHesap = null
          }}
        />
      {/key}
    </div>
  {/if}

  {#if accounts.length === 0}
    <div class="empty-container">
      <EmptyState
        title="Henüz hesap yok"
        detail="Nakit, banka ve kredi kartlarını ekleyince bakiyeler burada toplanır."
      />
    </div>
  {:else}
    <section class="band" data-testid="net-worth">
      <div class="band-head">
        <span>Varlıklar</span><span>Borçlar</span><span>Toplam</span>
      </div>
      {#each paralar as para}
        <div class="band-row num" data-currency={para}>
          <span class="gain">{fmt(band[para].varliklar, para)}</span>
          <span class="loss">{fmt(band[para].borclar, para)}</span>
          <span>{fmt(band[para].toplam, para)}</span>
        </div>
      {/each}
    </section>

    {#if (settings as any)?.uiMode === 'v2'}
      <div class="v2-net-worth-enhancement">
        {#each paralar as para}
          {@const v = band[para].varliklar}
          {@const b = Math.abs(band[para].borclar)}
          {@const totalVol = v + b}
          {@const vPct = totalVol > 0 ? Math.round((v / totalVol) * 100) : 100}
          {@const bPct = 100 - vPct}
          <div class="v2-ratio-bar-box">
            <div class="v2-ratio-labels">
              <span class="v2-ratio-title">Varlık & Borç Oran Dengesi ({para})</span>
              <div class="v2-ratio-stats">
                <span class="v2-ratio-stat gain">%{vPct} Varlık</span>
                {#if b > 0}
                  <span class="v2-ratio-sep">·</span>
                  <span class="v2-ratio-stat loss">%{bPct} Borç</span>
                {/if}
              </div>
            </div>
            <div class="v2-progress-track">
              <div class="v2-track-asset" style:width="{vPct}%"></div>
              {#if b > 0}
                <div class="v2-track-debt" style:width="{bPct}%"></div>
              {/if}
            </div>
          </div>
        {/each}

        <div class="v2-hesap-toolbar">
          <div class="v2-search-wrapper">
            <span class="v2-search-icon">🔍</span>
            <input
              type="search"
              class="v2-search-input"
              placeholder="Hesap veya banka ara..."
              bind:value={qHesap}
            />
            {#if qHesap}
              <button
                type="button"
                class="v2-clear-btn"
                onclick={() => (qHesap = '')}
                aria-label="Aramayı temizle"
              >✕</button>
            {/if}
          </div>

          <div class="v2-group-pills">
            <button
              type="button"
              class="v2-filter-pill"
              class:active={activeGroupFilter === 'ALL'}
              onclick={() => (activeGroupFilter = 'ALL')}
            >
              Tümü
            </button>
            <button
              type="button"
              class="v2-filter-pill"
              class:active={activeGroupFilter === 'BANKA'}
              onclick={() => (activeGroupFilter = activeGroupFilter === 'BANKA' ? 'ALL' : 'BANKA')}
            >
              Vadesiz & Banka
            </button>
            <button
              type="button"
              class="v2-filter-pill"
              class:active={activeGroupFilter === 'KREDI_KARTI'}
              onclick={() => (activeGroupFilter = activeGroupFilter === 'KREDI_KARTI' ? 'ALL' : 'KREDI_KARTI')}
            >
              Kredi Kartı
            </button>
            <button
              type="button"
              class="v2-filter-pill"
              class:active={activeGroupFilter === 'NAKIT'}
              onclick={() => (activeGroupFilter = activeGroupFilter === 'NAKIT' ? 'ALL' : 'NAKIT')}
            >
              Nakit
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#each visibleGroups as g}
      <section class="group" data-group={g.tur}>
        <header class="group-head">
          <h3>{g.baslik}</h3>
          {#if g.tur === 'KREDI_KARTI'}
            <span class="col-caption">Bu Ay</span>
            <span class="col-caption">Gelecek Ay</span>
          {:else}
            <span class="group-total num">
              {#each Object.entries(g.toplam) as [para, v], i}{i > 0 ? ' · ' : ''}{fmt(v, para)}{/each}
            </span>
          {/if}
        </header>

        {#if g.tur === 'BANKA'}
          {@const { clusters, standalone } = organizeBankRows(g.satirlar)}
          {#each clusters as cluster (cluster.banka)}
            <div class="bank-group">
              <div class="bank-group-head">
                <div class="bank-name">
                  <span class="bank-icon">🏦</span>
                  <strong>{cluster.banka}</strong>
                </div>
                <div class="bank-total num">
                  {#each Object.entries(cluster.toplam) as [para, v], i}
                    {i > 0 ? ' · ' : ''}
                    <span class:loss={v < 0} class:gain={v > 0}>{fmt(v, para)}</span>
                  {/each}
                </div>
              </div>
              <div class="bank-subrows">
                {#each cluster.satirlar as r (r.kod)}
                  <div class="row-wrapper sub-row">
                    <a class="row" class:pasif={r.pasif} href={r.href}>
                      <span class="row-name">
                        {#if r.simge}<span class="simge">{r.simge}</span>{/if}{r.ad}
                        <span class="currency-tag">{r.paraBirimi}</span>
                      </span>
                      <span class="num" class:loss={r.bakiye < 0} class:gain={r.bakiye > 0}>
                        {fmt(r.bakiye, r.paraBirimi)}
                      </span>
                    </a>
                    {#if duzenlemeModu}
                      <button
                        type="button"
                        class="row-edit-btn"
                        aria-label={`${r.ad} hesabını düzenle`}
                        onclick={(e) => duzenle(r.kod, e)}
                      >✎</button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
          {#each standalone as r (r.kod)}
            <div class="row-wrapper">
              <a class="row" class:pasif={r.pasif} href={r.href}>
                <span class="row-name">
                  {#if r.simge}<span class="simge">{r.simge}</span>{/if}{r.ad}
                </span>
                <span class="num" class:loss={r.bakiye < 0} class:gain={r.bakiye > 0}>
                  {fmt(r.bakiye, r.paraBirimi)}
                </span>
              </a>
              {#if duzenlemeModu}
                <button
                  type="button"
                  class="row-edit-btn"
                  aria-label={`${r.ad} hesabını düzenle`}
                  onclick={(e) => duzenle(r.kod, e)}
                >✎</button>
              {/if}
            </div>
          {/each}
        {:else}
          {#each g.satirlar as r (r.kod)}
            <div class="row-wrapper">
              <a class="row" class:pasif={r.pasif} href={r.href}>
                <span class="row-name">
                  {#if r.simge}<span class="simge">{r.simge}</span>{/if}{r.ad}
                </span>
                {#if r.kart}
                  <span class="row-figures">
                    <span class="num" class:loss={r.kart.buAy > 0} class:gain={r.kart.buAy < 0}>
                      {fmt(r.kart.buAy, r.paraBirimi)}
                    </span>
                    <span class="num sub">{fmt(r.kart.toplamBorc, r.paraBirimi)}</span>
                  </span>
                  <span class="num" class:loss={r.kart.gelecekAy > 0}>
                    {fmt(r.kart.gelecekAy, r.paraBirimi)}
                  </span>
                {:else}
                  <span class="num" class:loss={r.bakiye < 0} class:gain={r.bakiye > 0}>
                    {fmt(r.bakiye, r.paraBirimi)}
                  </span>
                {/if}
              </a>
              {#if duzenlemeModu}
                <button
                  type="button"
                  class="row-edit-btn"
                  aria-label={`${r.ad} hesabını düzenle`}
                  onclick={(e) => duzenle(r.kod, e)}
                >✎</button>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    {/each}

    <label class="pasif-toggle">
      <input type="checkbox" bind:checked={pasifDahil} />
      Pasif hesapları göster
    </label>
  {/if}
</div>

<style>
  .empty-container {
    padding: 2rem 1.25rem;
  }
  .page-container {
    padding: 1.25rem;
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .hesaplar-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .hesaplar-head h2 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
  }
  .head-actions {
    display: flex;
    gap: 0.5rem;
  }
  .head-btn {
    width: 2.2rem;
    height: 2.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--ink);
    border-radius: 6px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .head-btn:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent-defter);
  }
  .head-btn.active {
    background: var(--accent-defter, #2ea043);
    color: #fff;
    border-color: transparent;
  }
  .head-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .form-modal {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.25rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  /* Net worth band */
  .band {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.9rem 1.25rem;
  }
  .band-head {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    text-align: right;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--hairline);
  }
  .band-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    text-align: right;
    font-family: var(--font-num);
    font-size: 1rem;
    font-weight: 600;
    padding-top: 0.55rem;
    align-items: baseline;
  }
  .gain {
    color: var(--gain);
  }
  .loss {
    color: var(--loss);
  }

  /* Account groups */
  .group {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    overflow: hidden;
  }
  .group-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--hairline);
    gap: 0.75rem;
  }
  .group[data-group='KREDI_KARTI'] .group-head {
    grid-template-columns: 1fr 115px 115px;
  }
  .group-head h3 {
    margin: 0;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .col-caption {
    text-align: right;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
    font-weight: 500;
  }
  .group-total {
    font-family: var(--font-num);
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
    text-align: right;
  }

  /* Account rows */
  .row-wrapper {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--hairline);
  }
  .row-wrapper:last-child {
    border-bottom: 0;
  }
  .row-wrapper .row {
    flex: 1;
    border-bottom: 0;
  }
  .row-edit-btn {
    background: transparent;
    border: none;
    border-left: 1px solid var(--hairline);
    color: var(--ink-soft);
    padding: 0 1rem;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .row-edit-btn:hover {
    color: var(--ink);
    background: var(--surface-2);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    min-height: 48px;
    padding: 0.7rem 1rem;
    color: inherit;
    text-decoration: none;
    transition: background 0.15s ease;
    gap: 0.75rem;
  }
  .row:hover {
    background: var(--row-hover);
  }
  .row.pasif {
    opacity: 0.55;
  }
  .group[data-group='KREDI_KARTI'] .row {
    grid-template-columns: 1fr 115px 115px;
  }

  .row-name {
    font-weight: 500;
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .simge {
    margin-right: 0.5rem;
    font-size: 1.05rem;
    line-height: 1;
  }
  .row-figures {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--ink-soft);
    margin-top: 0.15rem;
    font-weight: 400;
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
    text-align: right;
    font-size: 0.95rem;
    font-weight: 600;
  }

  /* Passive toggle */
  .pasif-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.84rem;
    color: var(--ink-soft);
    cursor: pointer;
    user-select: none;
    align-self: flex-start;
    margin-top: 0.25rem;
  }
  .pasif-toggle input[type='checkbox'] {
    cursor: pointer;
    accent-color: var(--accent-defter);
  }

  /* Bank groups & hierarchical sub-rows */
  .bank-group {
    border-bottom: 1px solid var(--hairline);
    background: var(--surface-2, rgba(255, 255, 255, 0.02));
  }
  .bank-group:last-child {
    border-bottom: 0;
  }
  .bank-group-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 1rem;
    background: rgba(125, 125, 125, 0.06);
    border-bottom: 1px solid var(--hairline);
    font-size: 0.9rem;
  }
  .bank-name {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
  }
  .bank-total {
    font-size: 0.88rem;
    font-weight: 600;
  }
  .bank-subrows {
    display: flex;
    flex-direction: column;
  }
  .row-wrapper.sub-row {
    padding-left: 0.75rem;
    background: transparent;
  }
  .currency-tag {
    font-size: 0.72rem;
    background: var(--hairline);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    margin-left: 0.45rem;
    color: var(--ink-soft);
    font-weight: 600;
  }

  /* =========================================================================
     V2 KOMUTA MERKEZİ (OBSİDYEN & KEHRİBAR) STİLLERİ
     ========================================================================= */
  .v2-net-worth-enhancement {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: -0.25rem;
  }
  .v2-ratio-bar-box {
    background: var(--surface, #12141a);
    border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 0.9rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }
  .v2-ratio-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.88rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .v2-ratio-title {
    color: var(--ink-soft);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .v2-ratio-stats {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-family: var(--font-num);
    font-weight: 700;
  }
  .v2-ratio-stat.gain {
    color: var(--gain, #10b981);
  }
  .v2-ratio-stat.loss {
    color: var(--loss, #ef4444);
  }
  .v2-ratio-sep {
    color: var(--ink-soft);
    opacity: 0.5;
  }
  .v2-progress-track {
    width: 100%;
    height: 10px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 9999px;
    overflow: hidden;
    display: flex;
  }
  .v2-track-asset {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #059669);
    transition: width 0.35s ease;
  }
  .v2-track-debt {
    height: 100%;
    background: linear-gradient(90deg, #ef4444, #dc2626);
    transition: width 0.35s ease;
  }

  .v2-hesap-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    background: var(--surface, #12141a);
    border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    padding: 1rem 1.25rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }
  .v2-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }
  .v2-search-icon {
    position: absolute;
    left: 0.8rem;
    font-size: 0.95rem;
    opacity: 0.6;
    pointer-events: none;
  }
  .v2-search-input {
    width: 100%;
    padding: 0.6rem 2.2rem 0.6rem 2.4rem;
    background: var(--surface-2, #181b22);
    border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    color: var(--ink);
    font-size: 0.95rem;
    outline: none;
    transition: all 0.18s ease;
  }
  .v2-search-input:focus {
    border-color: var(--gold, #f59e0b);
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.3);
    background: var(--surface);
  }
  .v2-clear-btn {
    position: absolute;
    right: 0.75rem;
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.88rem;
    padding: 0.2rem 0.4rem;
  }
  .v2-clear-btn:hover {
    color: var(--ink);
  }
  .v2-group-pills {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
  .v2-filter-pill {
    appearance: none;
    background: var(--surface-2, #181b22);
    border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    color: var(--ink-soft);
    padding: 0.4rem 0.9rem;
    border-radius: 9999px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .v2-filter-pill:hover {
    color: var(--ink);
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.08);
  }
  .v2-filter-pill.active {
    background: var(--gold, #f59e0b);
    color: #0b0d11;
    border-color: var(--gold, #f59e0b);
    font-weight: 700;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
  }

  /* .page-container.v2-mode specific overrides */
  .page-container.v2-mode {
    max-width: 880px;
    gap: 1.5rem;
    padding: 1.5rem;
  }
  .page-container.v2-mode .band {
    border-radius: 16px;
    padding: 1.25rem 1.5rem;
    background: var(--surface);
    border: 1px solid rgba(245, 158, 11, 0.25);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  }
  .page-container.v2-mode .band-head {
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding-bottom: 0.6rem;
  }
  .page-container.v2-mode .band-row {
    font-size: 1.25rem;
    padding-top: 0.65rem;
  }
  .page-container.v2-mode .group {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .page-container.v2-mode .group:hover {
    border-color: rgba(245, 158, 11, 0.3);
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.36);
  }
  .page-container.v2-mode .group-head {
    padding: 0.95rem 1.35rem;
  }
  .page-container.v2-mode .group-head h3 {
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    font-weight: 700;
  }
  .page-container.v2-mode .group-total {
    font-size: 1.05rem;
  }
  .page-container.v2-mode .bank-group-head {
    padding: 0.85rem 1.35rem;
    font-size: 1.02rem;
  }
  .page-container.v2-mode .bank-name {
    font-size: 1.08rem;
    font-weight: 700;
  }
  .page-container.v2-mode .bank-total {
    font-size: 1.05rem;
  }
  .page-container.v2-mode .row {
    min-height: 60px;
    font-size: 1.05rem;
    padding: 0.85rem 1.35rem;
  }
  .page-container.v2-mode .row-name {
    font-size: 1.05rem;
    font-weight: 600;
  }
  .page-container.v2-mode .num {
    font-size: 1.15rem;
  }
  .page-container.v2-mode .sub {
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }
  .page-container.v2-mode .currency-tag {
    font-size: 0.82rem;
    padding: 0.15rem 0.5rem;
  }
</style>
