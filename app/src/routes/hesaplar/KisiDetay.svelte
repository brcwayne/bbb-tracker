<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PaymentPlan, PersonalTx, RecurringRule } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { ownerLedger, SAHIPSIZ } from '../../lib/data/owners'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    source,
    store,
    param,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    param?: string
    today?: string
  } = $props()

  const kod = $derived(param ?? '')
  const people = $derived(dataset?.people ?? [])
  const person = $derived(people.find((p) => p.kod === kod))
  const personName = $derived(
    kod === SAHIPSIZ ? 'Sahipsiz' : (person?.ad ?? kod)
  )

  const accounts = $derived(dataset?.personalAccounts ?? [])
  const personalAccountKods = $derived(new Set(accounts.map((a) => a.kod)))
  const accName = (k?: string) => accounts.find((a) => a.kod === k)?.ad ?? k ?? ''

  const categories = $derived(dataset?.categories ?? [])
  const catName = (k?: string) => categories.find((c) => c.kod === k)?.ad ?? k ?? ''

  const ledger = $derived(
    ownerLedger(dataset?.personalTx ?? [], accounts, people, today),
  )
  const balances = $derived(ledger.owners[kod] ?? {})

  const fmt = (n: number, cur = 'TRY') => (cur === 'USD' ? usd(n) : tryFmt(n))

  const allRows = $derived(dataset?.personalTx ?? [])
  const personRows = $derived(
    allRows
      .filter((r) => {
        if (r.durum === 'planlandi') return false
        if (r.tarih > today) return false
        if (kod === SAHIPSIZ) {
          return (!r.sahip || r.sahip === SAHIPSIZ) && r.tur !== 'SAHIP_AKTARIM'
        }
        return r.sahip === kod || (r.tur === 'SAHIP_AKTARIM' && r.karsiSahip === kod)
      })
      .sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.olusturulma || '').localeCompare(a.olusturulma || ''))
  )

  const personPlans = $derived<PaymentPlan[]>(
    (dataset?.paymentPlans ?? []).filter((p) => p.sahip === kod)
  )

  const personRules = $derived<RecurringRule[]>(
    (dataset?.recurringRules ?? []).filter((r) => r.sahip === kod)
  )

  function rowEffect(r: PersonalTx): { isaret: number; metin: string; label: string; sub: string } {
    if (r.tur === 'SAHIP_AKTARIM') {
      if (r.sahip === kod) {
        const alan = (people.find((p) => p.kod === r.karsiSahip)?.ad ?? r.karsiSahip) || 'Diğeri'
        return {
          isaret: -1,
          metin: `−${fmt(r.tutar, r.paraBirimi)}`,
          label: r.aciklama || `Aktarım → ${alan}`,
          sub: `Kişiler Arası Aktarım · ${alan}'e verildi`,
        }
      } else {
        const veren = (people.find((p) => p.kod === r.sahip)?.ad ?? r.sahip) || 'Diğeri'
        return {
          isaret: 1,
          metin: `+${fmt(r.tutar, r.paraBirimi)}`,
          label: r.aciklama || `Aktarım ← ${veren}`,
          sub: `Kişiler Arası Aktarım · ${veren}'den geldi`,
        }
      }
    }

    const sub = [catName(r.kategori), accName(r.hesap)].filter(Boolean).join(' · ')

    if (r.tur === 'GELIR' || r.tur === 'DUZELTME') {
      const isaret = r.tutar >= 0 ? 1 : -1
      return {
        isaret,
        metin: `${isaret > 0 ? '+' : '−'}${fmt(Math.abs(r.tutar), r.paraBirimi)}`,
        label: r.aciklama || catName(r.kategori),
        sub,
      }
    }

    if (r.tur === 'GIDER') {
      return {
        isaret: -1,
        metin: `−${fmt(r.tutar, r.paraBirimi)}`,
        label: r.aciklama || catName(r.kategori),
        sub,
      }
    }

    if (r.tur === 'TRANSFER') {
      const src = personalAccountKods.has(r.hesap)
      const dst = !!r.karsiHesap && personalAccountKods.has(r.karsiHesap)
      const transferSub = `Transfer · ${accName(r.hesap)} → ${accName(r.karsiHesap)}`
      if (src && !dst) {
        return {
          isaret: -1,
          metin: `−${fmt(r.tutar, r.paraBirimi)}`,
          label: r.aciklama || 'Transfer (Dışarı)',
          sub: transferSub,
        }
      }
      if (dst && !src) {
        return {
          isaret: 1,
          metin: `+${fmt(r.tutar, r.paraBirimi)}`,
          label: r.aciklama || 'Transfer (İçeri)',
          sub: transferSub,
        }
      }
      return {
        isaret: 0,
        metin: fmt(r.tutar, r.paraBirimi),
        label: r.aciklama || 'Hesaplar Arası Transfer',
        sub: transferSub,
      }
    }

    return {
      isaret: 0,
      metin: fmt(r.tutar, r.paraBirimi),
      label: r.aciklama,
      sub,
    }
  }
</script>

<div class="kisi-detay-container">
  <div class="top-nav">
    <a href="#/h/kisiler" class="back-link">← Kişiler</a>
  </div>

  <div class="header-card">
    <div class="header-main">
      <h2 class="person-title">{personName}</h2>
      <span class="person-code">{kod}</span>
    </div>
    <div class="bakiye-box">
      <span class="bakiye-label">Toplam Varlık</span>
      <div class="bakiye-figures">
        {#each Object.entries(balances) as [cur, val] (cur)}
          <span class="bakiye-val num" class:gain={val > 0} class:loss={val < 0}>
            {fmt(val, cur)}
          </span>
        {:else}
          <span class="bakiye-val num muted">0 ₺</span>
        {/each}
      </div>
    </div>
  </div>

  <!-- Para Hareketleri Bölümü -->
  <section class="section-card">
    <h3 class="section-title">Para Hareketleri ({personRows.length})</h3>
    {#if personRows.length === 0}
      <EmptyState
        title="Henüz işlem yok"
        detail="Bu kişiye ait herhangi bir gelir, gider veya transfer kaydı bulunmuyor."
      />
    {:else}
      <ul class="tx-list">
        {#each personRows as r (r.id)}
          {@const eff = rowEffect(r)}
          <li class="tx-row">
            <span class="tx-date num">{r.tarih.slice(8, 10)}.{r.tarih.slice(5, 7)}.{r.tarih.slice(0, 4)}</span>
            <div class="tx-info">
              <strong class="tx-label">{eff.label}</strong>
              <span class="tx-sub">{eff.sub}</span>
            </div>
            <span
              class="tx-amount num"
              class:gain={eff.isaret > 0}
              class:loss={eff.isaret < 0}
            >
              {eff.metin}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Taksit Planları Bölümü -->
  {#if personPlans.length > 0}
    <section class="section-card">
      <h3 class="section-title">Taksit Planları ({personPlans.length})</h3>
      <ul class="simple-list">
        {#each personPlans as p (p.id)}
          <li class="simple-row">
            <div class="simple-info">
              <strong>{p.aciklama}</strong>
              <span class="simple-sub">{catName(p.kategori)} · {p.hesap} · {p.taksitSayisi} Taksit</span>
            </div>
            <div class="simple-amount num">
              <span>{fmt(p.toplamTutar, p.paraBirimi)}</span>
              <small class="muted">({fmt(p.taksitTutari, p.paraBirimi)} / ay)</small>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- Tekrarlayan İşlemler Bölümü -->
  {#if personRules.length > 0}
    <section class="section-card">
      <h3 class="section-title">Tekrarlayan İşlemler ({personRules.length})</h3>
      <ul class="simple-list">
        {#each personRules as rule (rule.id)}
          <li class="simple-row" class:pasif={!rule.aktif}>
            <div class="simple-info">
              <strong>{rule.aciklama}</strong>
              <span class="simple-sub">{catName(rule.kategori)} · Her ayın {rule.gunOfMonth}'i</span>
            </div>
            <span class="simple-amount num">
              {rule.paraBirimi === 'USD' ? usd(rule.tutar) : tryFmt(rule.tutar)}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .kisi-detay-container {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 900px;
    margin: 0 auto;
  }
  .top-nav {
    display: flex;
    align-items: center;
  }
  .back-link {
    color: var(--ink-soft);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.15s ease;
  }
  .back-link:hover {
    color: var(--ink);
  }
  .header-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .person-title {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--ink);
  }
  .person-code {
    font-size: 0.78rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bakiye-box {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
  }
  .bakiye-label {
    font-size: 0.75rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .bakiye-figures {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }
  .bakiye-val {
    font-size: 1.3rem;
    font-weight: 700;
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
  .tx-list, .simple-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .tx-row, .simple-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.65rem 0.9rem;
  }
  .simple-row.pasif {
    opacity: 0.5;
  }
  .tx-date {
    font-size: 0.82rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .tx-info, .simple-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .tx-label {
    font-size: 0.9rem;
    color: var(--ink);
  }
  .tx-sub, .simple-sub {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .tx-amount, .simple-amount {
    font-size: 0.95rem;
    font-weight: 600;
    white-space: nowrap;
    text-align: right;
  }
  .simple-amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
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
  .muted {
    color: var(--ink-soft);
  }
</style>
