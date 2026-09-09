<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalAccount } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountGroups, netWorthBand } from '../../lib/data/accounts'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import HesapFormu from './HesapFormu.svelte'

  let {
    dataset,
    source,
    store,
    today = new Date().toISOString().slice(0, 10),
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
  let duzenlenenHesap = $state<PersonalAccount | null>(null)

  const accounts = $derived(dataset?.personalAccounts ?? [])
  const groups = $derived(
    accountGroups(dataset?.personalTx ?? [], accounts, dataset?.debts ?? [], today, { pasifDahil }),
  )
  const band = $derived(netWorthBand(groups))
  const paralar = $derived(Object.keys(band).sort())

  const fmt = (v: number, para: string) => (para === 'USD' ? usd(v) : tryFmt(v))

  function duzenle(kod: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const a = accounts.find((x) => x.kod === kod)
    if (a) {
      duzenlenenHesap = a
    }
  }
</script>

<div class="page-container">
  <header class="hesaplar-head">
    <h2>Hesaplar</h2>
    <div class="head-actions">
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
        onclick={() => { yeniHesapAcik = true }}
      >+</button>
    </div>
  </header>

  {#if (yeniHesapAcik || duzenlenenHesap) && dataset}
    <div class="form-modal">
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

    {#each groups as g}
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
            {#if g.tur !== 'KISI' && duzenlemeModu}
              <button
                type="button"
                class="row-edit-btn"
                aria-label={`${r.ad} hesabını düzenle`}
                onclick={(e) => duzenle(r.kod, e)}
              >✎</button>
            {/if}
          </div>
        {/each}
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
</style>
