<script lang="ts">
  import type { Dataset } from '../../lib/data/types'
  import { accountGroups, netWorthBand } from '../../lib/data/accounts'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    today?: string
  } = $props()

  let pasifDahil = $state(false)

  const accounts = $derived(dataset?.personalAccounts ?? [])
  const groups = $derived(
    accountGroups(dataset?.personalTx ?? [], accounts, dataset?.debts ?? [], today, { pasifDahil }),
  )
  const band = $derived(netWorthBand(groups))
  const paralar = $derived(Object.keys(band).sort())

  const fmt = (v: number, para: string) => (para === 'USD' ? usd(v) : tryFmt(v))
</script>

{#if accounts.length === 0}
  <div class="empty-container">
    <EmptyState
      title="Henüz hesap yok"
      detail="Nakit, banka ve kredi kartlarını ekleyince bakiyeler burada toplanır."
    />
  </div>
{:else}
  <div class="page-container">
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
        {/each}
      </section>
    {/each}

    <label class="pasif-toggle">
      <input type="checkbox" bind:checked={pasifDahil} />
      Pasif hesapları göster
    </label>
  </div>
{/if}

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
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    min-height: 48px;
    padding: 0.7rem 1rem;
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid var(--hairline);
    transition: background 0.15s ease;
    gap: 0.75rem;
  }
  .row:last-child {
    border-bottom: 0;
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
