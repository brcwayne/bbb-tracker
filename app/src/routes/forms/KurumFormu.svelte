<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Broker } from '../../lib/data/types'
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
    editing?: Broker
  } = $props()

  let kod = $state(editing?.kod ?? '')
  let ad = $state(editing?.ad ?? '')
  let tur = $state(editing?.tur ?? '')
  let sahip = $state(editing?.sahip ?? '')
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  function review() {
    error = null
    if (!kod.trim() || !ad.trim() || !tur.trim() || !sahip.trim()) {
      error = 'Tüm alanları doldurun.'
      return
    }
    if (!editing && dataset.brokers.some((b) => b.kod === kod.trim())) {
      error = 'Bu kod zaten kullanılıyor.'
      return
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      if (editing) {
        const patch: Broker = { ...editing, kod: editing.kod, ad: ad.trim(), tur: tur.trim(), sahip: sahip.trim() }
        await updateRecord<Broker>(store, source, 'brokers', (b) => b.kod === editing!.kod, patch)
      } else {
        const record: Broker = { kod: kod.trim(), ad: ad.trim(), tur: tur.trim(), sahip: sahip.trim(), aktif: true, kaynak: 'manual' }
        await appendRecord(store, source, 'brokers', record)
      }
      onSaved()
      if (!editing) {
        kod = ad = tur = sahip = ''
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
      Kod
      <input type="text" bind:value={kod} aria-label="Kod" readonly={!!editing} />
    </label>
    <label>
      Ad
      <input type="text" bind:value={ad} aria-label="Ad" />
    </label>
    <label>
      Tür
      <input type="text" bind:value={tur} aria-label="Tür" />
    </label>
    <label>
      Sahip
      <input type="text" bind:value={sahip} aria-label="Sahip" />
    </label>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{kod}</strong> — {ad}</p>
    <p>{tur} · {sahip}</p>
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
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  input {
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    padding: 0.4rem 0.5rem;
  }
  .error {
    color: var(--loss);
    font-size: 0.85rem;
  }
  button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    padding: 0.5rem 1rem;
    margin-top: 0.75rem;
    margin-right: 0.5rem;
    cursor: pointer;
  }
  .summary {
    margin-bottom: 0.75rem;
  }
</style>
