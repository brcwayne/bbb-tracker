<script lang="ts">
  import type { Dataset, Debt } from '../../lib/data/types'
  import { debtBalances } from '../../lib/data/personal'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let { dataset }: { dataset?: Dataset | null } = $props()

  const allDebts = $derived<Debt[]>(dataset?.debts ?? [])
  const people = $derived(dataset?.people ?? [])
  const personName = (kod: string) => people.find((p) => p.kod === kod)?.ad ?? kod

  const balances = $derived(debtBalances(allDebts))
  const fmtAmount = (n: number, curr: string) => (curr === 'USD' ? usd(n) : tryFmt(n))
</script>

{#if balances.length === 0}
  <div class="empty-container">
    <EmptyState
      title="Henüz açık borç yok"
      detail="Telegram botundan borç veya alacak girdikçe bakiyeler burada listelenecek."
    />
  </div>
{:else}
  <div class="page-container">
    <section class="section-card">
      <h3 class="section-title">Borç ve Alacak Bakiyeleri ({balances.length})</h3>
      <div class="balances-grid">
        {#each balances as b}
          {@const isAlacakNet = b.net > 0}
          {@const isBorcNet = b.net < 0}
          <div class="balance-card">
            <div class="card-top">
              <span class="person-name">{personName(b.kisi)}</span>
              <span class="currency-tag">{b.para}</span>
            </div>

            <div class="figures-row">
              <div class="figure-item">
                <span class="fig-label">Alacak</span>
                <span class="fig-val num alacak gain">{fmtAmount(b.alacak, b.para)}</span>
              </div>
              <div class="figure-item">
                <span class="fig-label">Borç</span>
                <span class="fig-val num borc loss">{fmtAmount(b.borc, b.para)}</span>
              </div>
              <div class="figure-item net-item">
                <span class="fig-label">Net Durum</span>
                <span
                  class="fig-val num net"
                  class:gain={isAlacakNet}
                  class:loss={isBorcNet}
                >
                  {isAlacakNet ? '+' : ''}{fmtAmount(b.net, b.para)}
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .empty-container {
    padding: 3rem 1rem;
  }
  .page-container {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  .section-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.1rem 1.25rem;
  }
  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: var(--ink-soft);
  }
  .balances-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
  .balance-card {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .person-name {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--ink);
  }
  .currency-tag {
    font-size: 0.75rem;
    background: var(--surface);
    color: var(--ink-soft);
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    border: 1px solid var(--hairline);
  }
  .figures-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .figure-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .fig-label {
    font-size: 0.72rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .fig-val {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .gain {
    color: var(--gain);
  }
  .loss {
    color: var(--loss);
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
</style>
