<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx, RecurringRule } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, appendRecords, updateRecord, deleteRecords, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { materialize } from '../../lib/data/recurring'
  import { newRecurringRuleId } from '../../lib/data/ids'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    source,
    store,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
  } = $props()

  function todayIso() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const isDrive = $derived(Boolean(source?.save))
  const rules = $derived<RecurringRule[]>(dataset?.recurringRules ?? [])
  const categories = $derived(dataset?.categories ?? [])
  const accounts = $derived((dataset?.personalAccounts ?? []).filter((a) => a.aktif !== false))
  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))
  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod

  let showAdd = $state(false)
  let tur = $state<'GIDER' | 'GELIR'>('GIDER')
  let aciklama = $state('')
  let tutar = $state('')
  let paraBirimi = $state<'TRY' | 'USD'>('TRY')
  let kategori = $state('')
  let hesap = $state('')
  let sahip = $state('')
  let gunOfMonth = $state('1')
  let baslangicTarihi = $state(todayIso())

  let saving = $state(false)
  let error = $state<string | null>(null)
  let actionError = $state<string | null>(null)

  async function addRule() {
    if (!store || !source || !dataset) return
    error = null
    const num = Number(tutar)
    const gun = Number(gunOfMonth)
    if (!tutar || isNaN(num) || num <= 0) {
      error = 'Geçerli bir tutar girilmeli.'
      return
    }
    if (!aciklama.trim()) {
      error = 'Açıklama girilmeli.'
      return
    }
    if (!gun || gun < 1 || gun > 31) {
      error = 'Ayın günü 1-31 arasında olmalı.'
      return
    }
    saving = true
    try {
      const rule: RecurringRule = {
        id: newRecurringRuleId(),
        tur,
        aciklama: aciklama.trim(),
        kategori,
        hesap,
        sahip,
        paraBirimi,
        tutar: num,
        gunOfMonth: gun,
        baslangicTarihi,
        bitisTarihi: null,
        aktif: true,
        olusturulma: new Date().toISOString(),
        kaynak: 'manual',
      }
      await appendRecord<RecurringRule>(store, source, 'recurring_rules', rule)
      const newRows = materialize([rule], dataset.personalTx ?? [], todayIso())
      await appendRecords(store, source, 'personal_tx', newRows)
      showAdd = false
      aciklama = ''
      tutar = ''
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
        error = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — tekrar dene.'
      } else {
        error = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving = false
    }
  }

  async function toggleAktif(rule: RecurringRule) {
    if (!store || !source) return
    actionError = null
    const duruyor = rule.aktif // durduruluyor mu (true → false geçişi)
    try {
      await updateRecord<RecurringRule>(
        store, source, 'recurring_rules',
        (r) => r.id === rule.id,
        { ...rule, aktif: !rule.aktif },
      )
      // D9: kural durdurulduğunda, henüz onaylanmamış ('planlandi') ileri
      // tarihli satırları da sil — devam ettirmede dokunma.
      if (duruyor) {
        await deleteRecords<PersonalTx>(
          store, source, 'personal_tx',
          (r) => r.tekrarKuralId === rule.id && r.durum === 'planlandi',
        )
      }
    } catch (e: any) {
      actionError = e instanceof Error ? e.message : String(e)
    }
  }
</script>

<div class="tekrarlar-container">
  {#if error}
    <div class="alert-error">{error}</div>
  {/if}
  {#if actionError}
    <div class="alert-error">{actionError}</div>
  {/if}

  <div class="header-row">
    <h2>Tekrarlayan İşlemler</h2>
    <button type="button" class="btn-primary" disabled={!isDrive} onclick={() => (showAdd = !showAdd)}>
      {showAdd ? 'Vazgeç' : '+ Yeni Ekle'}
    </button>
  </div>

  {#if showAdd}
    <form class="add-form" onsubmit={(e) => { e.preventDefault(); addRule(); }}>
      <div class="row">
        <div class="field">
          <label for="tk-tur">Tür</label>
          <select id="tk-tur" bind:value={tur}>
            <option value="GIDER">Gider</option>
            <option value="GELIR">Gelir</option>
          </select>
        </div>
        <div class="field flex-2">
          <label for="tk-aciklama">Açıklama</label>
          <input id="tk-aciklama" type="text" placeholder="Örn: Netflix" bind:value={aciklama} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="tk-tutar">Tutar</label>
          <input id="tk-tutar" type="number" step="0.01" bind:value={tutar} />
        </div>
        <div class="field">
          <label for="tk-para">Para Birimi</label>
          <select id="tk-para" bind:value={paraBirimi}>
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div class="field">
          <label for="tk-gun">Ayın Günü</label>
          <input id="tk-gun" type="number" min="1" max="31" bind:value={gunOfMonth} />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="tk-kategori">Kategori</label>
          <select id="tk-kategori" bind:value={kategori}>
            {#each categories.filter((c) => c.tur === tur) as c}
              <option value={c.kod}>{c.ad}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="tk-hesap">Hesap</label>
          <select id="tk-hesap" bind:value={hesap}>
            {#each accounts as a}
              <option value={a.kod}>{a.ad}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="tk-sahip">Sahip</label>
          <select id="tk-sahip" bind:value={sahip}>
            {#each people as p}
              <option value={p.kod}>{p.ad}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="tk-baslangic">Başlangıç Tarihi</label>
          <input id="tk-baslangic" type="date" bind:value={baslangicTarihi} />
        </div>
      </div>
      <div class="actions">
        <button type="submit" class="btn-primary" disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </form>
  {/if}

  {#if rules.length === 0}
    <EmptyState title="Henüz tekrarlayan işlem yok" detail="Maaş veya abonelik gibi her ay tekrar eden kayıtları buradan tanımlayın." />
  {:else}
    <ul class="rule-list">
      {#each rules as r (r.id)}
        <li class="rule-row" class:pasif={!r.aktif}>
          <div class="rule-main">
            <strong>{r.aciklama}</strong>
            <span class="rule-sub">{catName(r.kategori)} · her ayın {r.gunOfMonth}'i</span>
          </div>
          <div class="rule-amount num">
            {r.paraBirimi === 'USD' ? usd(r.tutar) : tryFmt(r.tutar)}
          </div>
          <button
            type="button"
            class="btn-icon"
            title={r.aktif ? 'Durdur' : 'Devam Ettir'}
            disabled={!isDrive}
            onclick={() => toggleAktif(r)}
          >
            {r.aktif ? '⏸' : '▶'}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tekrarlar-container {
    padding: 1rem 1.25rem;
    max-width: 700px;
    margin: 0 auto;
  }
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .add-form {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 120px;
  }
  .flex-2 {
    flex: 2;
  }
  .rule-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .rule-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.6rem 0.9rem;
  }
  .rule-row.pasif {
    opacity: 0.5;
  }
  .rule-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .rule-sub {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .rule-amount {
    font-weight: 600;
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
  .alert-error {
    background: rgba(224, 86, 96, 0.12);
    color: var(--loss);
    border: 1px solid var(--loss);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
  }

  .btn-primary {
    background: #238636;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-primary:hover:not(:disabled) {
    background: #2ea043;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-icon {
    background: transparent;
    border: 0;
    color: var(--ink-soft);
    padding: 0.2rem 0.35rem;
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .btn-icon:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--ink);
  }
  .btn-icon:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
