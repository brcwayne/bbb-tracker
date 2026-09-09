<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, updateRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { tryFmt, usd } from '../../lib/format'
  import { newPersonalId } from '../../lib/data/ids'

  function todayIso() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  let {
    dataset,
    source,
    store,
    onSaved,
    onCancel,
    editing,
    hesap: hesapOn,
    tarih: tarihOn,
    hesapKilitli = false,
  }: {
    dataset: Dataset
    source?: DataSource
    store?: Writable<AppState>
    onSaved: () => void
    onCancel?: () => void
    editing?: PersonalTx
    hesap?: string
    tarih?: string
    hesapKilitli?: boolean
  } = $props()

  let tur = $state<'GIDER' | 'GELIR'>(editing?.tur === 'GELIR' ? 'GELIR' : 'GIDER')
  let tarih = $state(editing?.tarih ?? tarihOn ?? todayIso())
  let tutar = $state(editing ? String(editing.tutar) : '')
  let paraBirimi = $state<'TRY' | 'USD'>(editing?.paraBirimi ?? 'TRY')
  let kategori = $state(editing?.kategori ?? '')
  let hesap = $state(editing?.hesap ?? hesapOn ?? '')
  let sahip = $state(editing?.sahip ?? '')
  let aciklama = $state(editing?.aciklama ?? '')
  let notText = $state(editing?.not ?? '')

  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  const isInstalment = $derived(Boolean(editing?.taksitPlaniId))

  const allCategories = $derived(dataset?.categories ?? [])
  const filteredCategories = $derived(allCategories.filter((c) => c.tur === tur && c.aktif !== false))

  const accounts = $derived(
    (dataset?.personalAccounts ?? dataset?.personalAccounts ?? []).filter((a) => a.aktif !== false),
  )
  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))

  // Set default category, account, owner if not set
  $effect(() => {
    if (!kategori && filteredCategories.length > 0) {
      kategori = filteredCategories[0].kod
    } else if (kategori && !filteredCategories.some((c) => c.kod === kategori) && filteredCategories.length > 0) {
      kategori = filteredCategories[0].kod
    }
  })

  $effect(() => {
    if (!hesap && accounts.length > 0) {
      hesap = accounts[0].kod
    }
  })

  $effect(() => {
    if (!sahip && people.length > 0) {
      sahip = people[0].kod
    }
  })

  function review() {
    error = null
    const num = Number(tutar)
    if (!tutar || isNaN(num) || num <= 0) {
      error = 'Geçerli bir tutar girilmeli.'
      return
    }
    if (!aciklama.trim()) {
      error = 'Açıklama girilmeli.'
      return
    }
    if (!tarih) {
      error = 'Tarih girilmeli.'
      return
    }
    if (!kategori) {
      error = 'Kategori seçilmeli.'
      return
    }
    if (!hesap) {
      error = 'Hesap seçilmeli.'
      return
    }
    if (!sahip) {
      error = 'Sahip seçilmeli.'
      return
    }
    step = 'confirm'
  }

  async function confirmSave() {
    if (!source || !store) return
    saving = true
    error = null
    try {
      if (editing) {
        const patch: PersonalTx = {
          ...editing,
          tarih,
          tur,
          tutar: Number(tutar),
          paraBirimi,
          kategori,
          aciklama: aciklama.trim(),
          hesap,
          sahip,
          not: notText.trim(),
        }
        await updateRecord<PersonalTx>(store, source, 'personal_tx', (r) => r.id === editing!.id, patch, {
          allowKaynak: ['telegram', 'manual'],
        })
      } else {
        const newRecord: PersonalTx = {
          id: newPersonalId(),
          tarih,
          tur,
          tutar: Number(tutar),
          paraBirimi,
          kategori,
          aciklama: aciklama.trim(),
          hesap,
          sahip,
          taksitPlaniId: null,
          taksitNo: null,
          taksitToplam: null,
          not: notText.trim(),
          kaynak: 'manual',
          olusturulma: new Date().toISOString(),
        }
        await appendRecord<PersonalTx>(store, source, 'personal_tx', newRecord)
      }
      onSaved()
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
        error = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?'
      } else {
        error = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving = false
    }
  }
</script>

<div class="form-container">
  <div class="form-header">
    <h3>{editing ? 'Harcama Kaydını Düzenle' : 'Yeni Harcama Ekle'}</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel}>✕</button>
    {/if}
  </div>

  {#if error}
    <div class="alert-error">{error}</div>
  {/if}

  {#if step === 'form'}
    <form onsubmit={(e) => { e.preventDefault(); review(); }}>
      <div class="row">
        <div class="field">
          <label for="hf-tur">Tür</label>
          <select id="hf-tur" aria-label="Tür" bind:value={tur}>
            <option value="GIDER">Gider</option>
            <option value="GELIR">Gelir</option>
          </select>
        </div>

        <div class="field">
          <label for="hf-tarih">Tarih</label>
          <input id="hf-tarih" aria-label="Tarih" type="date" bind:value={tarih} />
        </div>
      </div>

      <div class="row">
        <div class="field flex-2">
          <label for="hf-tutar">Tutar</label>
          <input
            id="hf-tutar"
            aria-label="Tutar"
            type="number"
            step="0.01"
            placeholder="0.00"
            bind:value={tutar}
          />
        </div>

        <div class="field flex-1">
          <label for="hf-para-birimi">Para Birimi</label>
          <select id="hf-para-birimi" aria-label="Para Birimi" bind:value={paraBirimi}>
            <option value="TRY">TRY (TL)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
      </div>

      <div class="row">
        <div class="field flex-1">
          <label for="hf-kategori">Kategori</label>
          <select id="hf-kategori" aria-label="Kategori" bind:value={kategori}>
            {#each filteredCategories as c}
              <option value={c.kod}>{c.ad}</option>
            {/each}
          </select>
        </div>

        <div class="field flex-1">
          <label for="hf-hesap">Hesap</label>
          <select id="hf-hesap" aria-label="Hesap" bind:value={hesap} disabled={hesapKilitli && !editing}>
            {#each accounts as a}
              <option value={a.kod}>{a.ad} ({a.kod})</option>
            {/each}
          </select>
        </div>

        <div class="field flex-1">
          <label for="hf-sahip">Sahip</label>
          <select id="hf-sahip" aria-label="Sahip" bind:value={sahip}>
            {#each people as p}
              <option value={p.kod}>{p.ad}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="field">
        <label for="hf-aciklama">Açıklama</label>
        <input
          id="hf-aciklama"
          aria-label="Açıklama"
          type="text"
          placeholder="Örn: Market alışverişi"
          bind:value={aciklama}
        />
      </div>

      <div class="field">
        <label for="hf-not">Not (İsteğe bağlı)</label>
        <input
          id="hf-not"
          aria-label="Not"
          type="text"
          placeholder="İsteğe bağlı not..."
          bind:value={notText}
        />
      </div>

      {#if isInstalment}
        <div class="plan-box">
          <span class="badge">Taksitli Plan</span>
          <span>Taksit: <strong>{editing?.taksitNo}/{editing?.taksitToplam}</strong> (Plan bağı değiştirilemez)</span>
        </div>
      {/if}

      <div class="actions">
        {#if onCancel}
          <button type="button" class="btn-secondary" onclick={onCancel}>Vazgeç</button>
        {/if}
        <button type="submit" class="btn-primary">İncele</button>
      </div>
    </form>
  {:else}
    <div class="confirm-box">
      <p class="confirm-title">Lütfen bilgileri onaylayın:</p>
      <dl class="summary-list">
        <dt>Tür:</dt>
        <dd>{tur === 'GELIR' ? 'Gelir' : 'Gider'}</dd>
        <dt>Tarih:</dt>
        <dd>{tarih}</dd>
        <dt>Tutar:</dt>
        <dd class="num font-bold">
          {paraBirimi === 'USD' ? usd(Number(tutar)) : tryFmt(Number(tutar))} {paraBirimi}
        </dd>
        <dt>Kategori:</dt>
        <dd>{allCategories.find((c) => c.kod === kategori)?.ad ?? kategori}</dd>
        <dt>Açıklama:</dt>
        <dd>{aciklama}</dd>
        <dt>Hesap / Sahip:</dt>
        <dd>{hesap} · {sahip}</dd>
        {#if isInstalment}
          <dt>Taksit:</dt>
          <dd>{editing?.taksitNo}/{editing?.taksitToplam}</dd>
        {/if}
      </dl>

      <div class="actions">
        <button type="button" class="btn-secondary" onclick={() => (step = 'form')} disabled={saving}>
          Geri Dön
        </button>
        <button
          type="button"
          class="btn-primary"
          onclick={confirmSave}
          disabled={saving}
        >
          {saving ? 'Kaydediliyor…' : editing ? 'Onayla ve Güncelle' : 'Onayla ve Kaydet'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .form-container {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--hairline);
    padding-bottom: 0.5rem;
  }
  .form-header h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--ink);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
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
    min-width: 140px;
  }
  .flex-1 {
    flex: 1;
  }
  .flex-2 {
    flex: 2;
  }
  label {
    font-size: 0.75rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  input,
  select {
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--hairline);
    padding: 0.45rem 0.65rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  input:focus,
  select:focus {
    outline: 2px solid var(--accent-defter);
    outline-offset: 1px;
  }
  .plan-box {
    background: rgba(201, 168, 106, 0.1);
    border: 1px dashed rgba(201, 168, 106, 0.4);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    color: var(--ink);
  }
  .badge {
    background: var(--gold);
    color: #121212;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .alert-error {
    background: rgba(224, 86, 96, 0.15);
    border: 1px solid var(--loss);
    color: var(--loss);
    padding: 0.6rem 0.85rem;
    border-radius: 4px;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.65rem;
    margin-top: 0.5rem;
  }
  .btn-primary {
    background: var(--accent-defter, #c9a86a);
    color: #121212;
    border: none;
    border-radius: 4px;
    padding: 0.45rem 1rem;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-secondary {
    background: var(--surface-2);
    color: var(--ink-soft);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: 0.45rem 0.85rem;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .btn-ghost {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .confirm-box {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .confirm-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
    margin: 0;
  }
  .summary-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 1rem;
    background: var(--surface-2);
    padding: 0.85rem 1rem;
    border-radius: 6px;
    font-size: 0.88rem;
  }
  .summary-list dt {
    color: var(--ink-soft);
  }
  .summary-list dd {
    margin: 0;
    color: var(--ink);
  }
  .font-bold {
    font-weight: 600;
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
</style>
