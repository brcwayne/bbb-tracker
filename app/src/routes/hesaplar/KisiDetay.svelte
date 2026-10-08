<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PaymentPlan, PersonalTx, RecurringRule, Person } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { updateRecord, deleteRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { cardStatement } from '../../lib/data/accounts'
  import { ownerLedger, SAHIPSIZ } from '../../lib/data/owners'
  import { fmtCurrency, tryFmt, usd } from '../../lib/format'
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

  const isDrive = $derived(Boolean(source?.save))
  let duzenlemeAcik = $state(false)
  let yeniAd = $state('')
  let editError = $state<string | null>(null)
  let editSaving = $state(false)

  let silmeAcik = $state(false)
  let deleteError = $state<string | null>(null)
  let deleteSaving = $state(false)

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

  const cardDebts = $derived.by(() => {
    if (!kod || kod === SAHIPSIZ) return []
    const list: {
      kartKod: string
      kartAd: string
      paraBirimi: string
      tip: 'ODENECEK' | 'DONEM_ICI'
      etiket: string
      tutar: number
      sonOdeme?: string
      kesim?: string
    }[] = []
    const creditCards = accounts.filter((a) => a.tur === 'KREDI_KARTI')

    for (const card of creditCards) {
      const stmt = cardStatement(dataset?.personalTx ?? [], card, today)

      // Ödenecek Ekstre
      if (stmt.odenecekEkstre) {
        const tutar = stmt.odenecekEkstre.sahipToplami[kod] ?? 0
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
        const tutar = stmt.donemIci.sahipToplami[kod] ?? 0
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
  })

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

  const hasAccounts = $derived((dataset?.personalAccounts ?? []).some((a) => a.sahip === kod))
  const hasBrokers = $derived((dataset?.brokers ?? []).some((b) => b.sahip === kod))
  const hasDebts = $derived((dataset?.debts ?? []).some((d) => d.sahip === kod))
  const relatedCount = $derived(
    personRows.length +
    personPlans.length +
    personRules.length +
    (hasAccounts ? 1 : 0) +
    (hasBrokers ? 1 : 0) +
    (hasDebts ? 1 : 0)
  )

  function startEdit() {
    duzenlemeAcik = true
    yeniAd = person?.ad ?? ''
    editError = null
  }

  async function saveName() {
    const ad = yeniAd.trim()
    if (!ad) {
      editError = 'Bir isim yaz.'
      return
    }
    if (!source || !store || !person) return
    editSaving = true
    editError = null
    try {
      await updateRecord<Person>(
        store,
        source,
        'people',
        (p) => p.kod === kod,
        { ...person, ad },
        { allowImported: true },
      )
      duzenlemeAcik = false
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        try {
          await load(store, source)
        } catch {}
        editError = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — tekrar dener misin?'
      } else {
        editError = e instanceof Error ? e.message : String(e)
      }
    } finally {
      editSaving = false
    }
  }

  async function pasifeAl(aktif: boolean) {
    if (!source || !store || !person) return
    deleteSaving = true
    deleteError = null
    try {
      await updateRecord<Person>(
        store,
        source,
        'people',
        (p) => p.kod === kod,
        { ...person, aktif },
        { allowImported: true },
      )
      silmeAcik = false
    } catch (e: any) {
      deleteError = e instanceof Error ? e.message : String(e)
    } finally {
      deleteSaving = false
    }
  }

  async function gercektenSil() {
    if (!source || !store || !person) return
    if (relatedCount > 0) return
    deleteSaving = true
    deleteError = null
    try {
      await deleteRecord<Person>(
        store,
        source,
        'people',
        (p) => p.kod === kod,
        { allowImported: true },
      )
      window.location.hash = '#/h/kisiler'
    } catch (e: any) {
      deleteError = e instanceof Error ? e.message : String(e)
    } finally {
      deleteSaving = false
    }
  }

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
      {#if duzenlemeAcik}
        <form
          class="edit-name-form"
          onsubmit={(e) => {
            e.preventDefault()
            saveName()
          }}
        >
          <input
            bind:value={yeniAd}
            aria-label="Kişi Adı"
            placeholder="İsim"
            disabled={editSaving}
          />
          <button type="submit" class="btn-primary-sm" disabled={editSaving || !yeniAd.trim()}>
            Kaydet
          </button>
          <button
            type="button"
            class="btn-subtle"
            disabled={editSaving}
            onclick={() => (duzenlemeAcik = false)}
          >
            Vazgeç
          </button>
        </form>
        {#if editError}<div class="error-msg">{editError}</div>{/if}
      {:else}
        <div class="title-row">
          <h2 class="person-title">{personName}</h2>
          {#if person?.aktif === false}
            <span class="badge-pasif">Pasif</span>
          {/if}
          {#if isDrive && kod !== SAHIPSIZ}
            <button
              type="button"
              class="btn-subtle"
              onclick={startEdit}
            >
              Düzenle
            </button>
          {/if}
        </div>
        <span class="person-code">{kod}</span>
      {/if}
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

  {#if isDrive && kod !== SAHIPSIZ && person}
    <div class="person-actions-card">
      {#if !silmeAcik}
        <button
          type="button"
          class="btn-danger-ghost"
          onclick={() => { silmeAcik = true; deleteError = null }}
        >
          Kişiyi Sil
        </button>
      {:else}
        <div class="delete-confirm-box" role="alert">
          {#if relatedCount > 0}
            <p class="delete-warning">
              Bu kişiye ait {relatedCount} ilişkili kayıt (işlem / hesap / taksit) bulunuyor.
              Veri tutarlılığı için bu kayıtlar silinmeden kişi <strong>silinemez</strong>.
            </p>
            <div class="delete-btn-row">
              {#if person.aktif !== false}
                <button
                  type="button"
                  class="btn-warning-sm"
                  disabled={deleteSaving}
                  onclick={() => pasifeAl(false)}
                >
                  Pasife Al
                </button>
              {:else}
                <button
                  type="button"
                  class="btn-primary-sm"
                  disabled={deleteSaving}
                  onclick={() => pasifeAl(true)}
                >
                  Aktifleştir
                </button>
              {/if}
              <button
                type="button"
                class="btn-subtle"
                disabled={deleteSaving}
                onclick={() => (silmeAcik = false)}
              >
                Kapat
              </button>
            </div>
          {:else}
            <p class="delete-warning">
              "{personName}" kişisini kalıcı olarak <strong>silmek istediğinden emin misin?</strong>
            </p>
            <div class="delete-btn-row">
              <button
                type="button"
                class="btn-danger-sm"
                disabled={deleteSaving}
                onclick={gercektenSil}
              >
                Evet, Sil
              </button>
              <button
                type="button"
                class="btn-subtle"
                disabled={deleteSaving}
                onclick={() => (silmeAcik = false)}
              >
                Vazgeç
              </button>
            </div>
          {/if}
          {#if deleteError}<div class="error-msg">{deleteError}</div>{/if}
        </div>
      {/if}
    </div>
  {/if}

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
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .badge-pasif {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--ink-soft);
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
  }
  .btn-subtle {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-subtle:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--ink-soft);
  }
  .edit-name-form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .edit-name-form input {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.4rem 0.65rem;
    border-radius: 6px;
    font-size: 0.95rem;
    box-sizing: border-box;
    min-width: 160px;
  }
  .btn-primary-sm {
    background: #238636;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-primary-sm:hover:not(:disabled) {
    background: #2ea043;
  }
  .person-actions-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.9rem 1.25rem;
  }
  .btn-danger-ghost {
    background: transparent;
    color: var(--loss);
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-danger-ghost:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    border-color: var(--loss);
  }
  .delete-confirm-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .delete-warning {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink);
    line-height: 1.4;
  }
  .delete-btn-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .btn-danger-sm {
    background: var(--loss);
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-danger-sm:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-warning-sm {
    background: #d97706;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-warning-sm:hover:not(:disabled) {
    background: #b45309;
  }
  .error-msg {
    font-size: 0.8rem;
    color: var(--loss);
    margin-top: 0.25rem;
  }

  .card-debt-alerts {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.85rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .alerts-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .debt-pills {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .debt-pill {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
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
    font-size: 0.85rem;
  }
  .pill-type {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .pill-amount {
    font-size: 0.95rem;
    font-weight: 600;
  }
</style>
