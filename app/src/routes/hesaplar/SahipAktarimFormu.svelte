<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { newPersonalId } from '../../lib/data/ids'

  let {
    dataset,
    source,
    store,
    onSaved,
    onCancel,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  let gonderen = $state('')
  let alan = $state('')
  let tutarText = $state('')
  let tarihText = $state(new Date().toISOString().slice(0, 10))
  let paraBirimi = $state<'TRY' | 'USD'>('TRY')
  let aciklama = $state('')

  let error = $state<string | null>(null)
  let saving = $state(false)

  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))
  const nameOf = (kod: string) => people.find((p) => p.kod === kod)?.ad ?? kod

  function dogrula(): string | null {
    if (!gonderen || !alan) return 'Kimden ve kime seçilmeli.'
    if (gonderen === alan) return 'Kimden ve kime aynı kişi olamaz.'
    const t = Number(tutarText)
    if (!Number.isFinite(t) || t <= 0) return 'Tutar sıfırdan büyük olmalı.'
    return null
  }

  async function handleSubmit() {
    error = null
    const err = dogrula()
    if (err) {
      error = err
      return
    }
    if (!source || !store) return
    saving = true
    try {
      const satir: PersonalTx = {
        id: newPersonalId(),
        tarih: tarihText,
        tur: 'SAHIP_AKTARIM',
        tutar: Number(tutarText),
        paraBirimi,
        kategori: 'sahip-aktarim',
        aciklama: aciklama.trim() || `${nameOf(gonderen)} → ${nameOf(alan)}`,
        hesap: '',
        sahip: gonderen,
        karsiSahip: alan,
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: '',
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
      }
      await appendRecord<PersonalTx>(store, source, 'personal_tx', satir)
      onSaved?.()
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        try {
          await load(store, source)
        } catch {}
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
  {#if error}
    <div class="alert-error" role="alert">{error}</div>
  {/if}

  <form
    onsubmit={(e) => {
      e.preventDefault()
      handleSubmit()
    }}
  >
    <div class="row">
      <div class="field">
        <label for="sa-gonderen">Kimden</label>
        <select id="sa-gonderen" bind:value={gonderen}>
          <option value="">Seçiniz</option>
          {#each people as p (p.kod)}
            <option value={p.kod}>{p.ad}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="sa-alan">Kime</label>
        <select id="sa-alan" bind:value={alan}>
          <option value="">Seçiniz</option>
          {#each people as p (p.kod)}
            <option value={p.kod}>{p.ad}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="row">
      <div class="field flex-2">
        <label for="sa-tutar">Tutar</label>
        <input id="sa-tutar" type="number" step="0.01" placeholder="0.00" bind:value={tutarText} />
      </div>
      <div class="field flex-1">
        <label for="sa-para">Para birimi</label>
        <select id="sa-para" bind:value={paraBirimi}>
          <option value="TRY">₺ TRY</option>
          <option value="USD">$ USD</option>
        </select>
      </div>
      <div class="field flex-1">
        <label for="sa-tarih">Tarih</label>
        <input id="sa-tarih" type="date" bind:value={tarihText} />
      </div>
    </div>

    <div class="field">
      <label for="sa-aciklama">Açıklama (İsteğe bağlı)</label>
      <input
        id="sa-aciklama"
        type="text"
        placeholder={`${nameOf(gonderen) || 'Kimden'} → ${nameOf(alan) || 'Kime'}`}
        bind:value={aciklama}
      />
    </div>

    <div class="actions">
      {#if onCancel}
        <button type="button" class="btn-secondary" onclick={onCancel}>Vazgeç</button>
      {/if}
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Kaydediliyor...' : 'Kaydet'}
      </button>
    </div>
  </form>
</div>

<style>
  .form-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--ink);
  }
  .alert-error {
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 8rem;
  }
  .flex-1 {
    flex: 1;
  }
  .flex-2 {
    flex: 2;
  }
  label {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  input,
  select {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font-size: 0.9rem;
    box-sizing: border-box;
    width: 100%;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.5rem;
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
  .btn-secondary {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
</style>
