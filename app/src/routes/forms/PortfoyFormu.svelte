<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Portfolio } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, updateRecord } from '../../lib/data/store'

  let {
    dataset,
    source,
    store,
    onSaved,
    editing,
  }: {
    dataset: Dataset
    source: DataSource
    store: Writable<AppState>
    onSaved: () => void
    editing?: Portfolio
  } = $props()

  let kod = $state(editing?.kod ?? '')
  let ad = $state(editing?.ad ?? '')
  let aktif = $state(editing?.aktif !== false)
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  function review() {
    error = null
    const cleanKod = kod.trim().toUpperCase()
    const cleanAd = ad.trim() || cleanKod
    if (!cleanKod) {
      error = 'Portföy kodu zorunludur.'
      return
    }
    if (!editing && dataset.portfolios.some((p) => p.kod.toUpperCase() === cleanKod)) {
      error = 'Bu portföy kodu zaten kullanılıyor.'
      return
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      const cleanKod = kod.trim().toUpperCase()
      const cleanAd = ad.trim() || cleanKod
      if (editing) {
        const patch: Portfolio = { ...editing, kod: editing.kod, ad: cleanAd, aktif }
        await updateRecord<Portfolio>(store, source, 'portfolios', (p) => p.kod === editing!.kod, patch, { allowImported: true })
      } else {
        const record: Portfolio = { kod: cleanKod, ad: cleanAd, aktif, kaynak: 'manual' }
        await appendRecord(store, source, 'portfolios', record)
      }
      onSaved()
      if (!editing) {
        kod = ad = ''
        aktif = true
        step = 'form'
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

{#if step === 'form'}
  <div class="grid">
    <label>
      Portföy Kodu (Örn: FON, ALFA, TEMETTU)
      <input type="text" bind:value={kod} aria-label="Portföy Kodu" readonly={!!editing} placeholder="KOD" />
    </label>
    <label>
      Portföy Adı / Açıklama
      <input type="text" bind:value={ad} aria-label="Portföy Adı" placeholder="Portföy adı" />
    </label>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={aktif} aria-label="Aktif" />
      <span>Aktif Portföy</span>
    </label>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{kod.trim().toUpperCase()}</strong> — {ad.trim() || kod.trim().toUpperCase()}</p>
    <p>{aktif ? 'Aktif' : 'Pasif'}</p>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={() => (step = 'form')} disabled={saving}>Geri</button>
  <button onclick={confirmSave} disabled={saving}>
    {saving ? 'Kaydediliyor…' : editing ? 'Onayla ve Güncelle' : 'Onayla ve Kaydet'}
  </button>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 0.82rem;
    color: var(--ink-soft);
    gap: 0.25rem;
  }
  .checkbox-label {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.25rem;
    cursor: pointer;
  }
  input[type='text'] {
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.4rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  input[readonly] {
    opacity: 0.6;
    cursor: not-allowed;
  }
  button {
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.45rem 0.9rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    margin-right: 0.5rem;
  }
  button:hover:not(:disabled) {
    border-color: var(--ink-soft);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .summary {
    background: var(--surface);
    border: 1px solid var(--hairline);
    padding: 0.6rem 0.8rem;
    border-radius: 4px;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }
  .summary p {
    margin: 0.2rem 0;
  }
  .error {
    color: var(--loss, #ef4444);
    font-size: 0.82rem;
    margin: 0.4rem 0;
  }
</style>
