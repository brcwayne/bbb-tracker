<script module lang="ts">
  export function slugifyPerson(text: string): string {
    return text
      .trim()
      .toLocaleUpperCase('tr-TR')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
</script>

<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Person } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'

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
    onSaved: (person: Person) => void
    onCancel?: () => void
  } = $props()

  let ad = $state('')
  let haneUyesi = $state(true)
  let customKod = $state('')
  let manualKod = $state(false)
  let error = $state<string | null>(null)
  let saving = $state(false)

  const existingPeople = $derived(dataset?.people ?? [])

  const generatedKod = $derived.by(() => {
    if (manualKod && customKod.trim()) return customKod.trim().toUpperCase()
    const base = slugifyPerson(ad) || 'KISI'
    let candidate = base
    let count = 2
    while (existingPeople.some((p) => p.kod === candidate)) {
      candidate = `${base}-${count++}`
    }
    return candidate
  })

  async function handleSubmit() {
    error = null
    const trimmedAd = ad.trim()
    if (!trimmedAd) {
      error = 'Kişi adı girilmelidir.'
      return
    }

    const kod = generatedKod
    if (existingPeople.some((p) => p.kod === kod)) {
      error = `"${kod}" kodlu bir kişi zaten mevcut.`
      return
    }

    if (!store || !source) {
      error = 'Kaydetmek için veri bağlantısı gereklidir.'
      return
    }

    saving = true
    try {
      const newPerson: Person = {
        kod,
        ad: trimmedAd,
        haneUyesi,
        aktif: true,
        kaynak: 'manual',
      }
      await appendRecord<Person>(store, source, 'people', newPerson)
      onSaved(newPerson)
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
        error = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — lütfen tekrar deneyin.'
      } else {
        error = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving = false
    }
  }
</script>

<div class="kisi-formu-container">
  <div class="form-header">
    <h3>Yeni Kişi Ekle</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel} aria-label="Kapat">✕</button>
    {/if}
  </div>

  {#if error}
    <div class="alert-error" role="alert">{error}</div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <div class="field">
      <label for="per-ad">Kişi Adı / İsim</label>
      <input
        id="per-ad"
        type="text"
        placeholder="Örn: Enis, Ceren, Mehmet..."
        bind:value={ad}
        required
      />
    </div>

    <div class="field checkbox-field">
      <label class="checkbox-label" for="per-hane">
        <input
          id="per-hane"
          type="checkbox"
          bind:checked={haneUyesi}
        />
        <span>Hane üyesi (aynı hanede yaşayan aile bireyi)</span>
      </label>
    </div>

    <div class="field">
      <div class="kod-header">
        <label for="per-kod">Sistem Kodu</label>
        <button
          type="button"
          class="btn-text-link"
          onclick={() => {
            manualKod = !manualKod
            if (manualKod && !customKod) customKod = generatedKod
          }}
        >
          {manualKod ? 'Otomatik kod kullan' : 'Kodu kendim belirleyeceğim'}
        </button>
      </div>
      {#if manualKod}
        <input
          id="per-kod"
          type="text"
          placeholder="Örn: AHMET"
          bind:value={customKod}
        />
      {:else}
        <div class="kod-preview">
          <code>{generatedKod}</code>
          <small class="hint">Ad değiştikçe otomatik üretilir</small>
        </div>
      {/if}
    </div>

    <div class="actions">
      {#if onCancel}
        <button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>
          Vazgeç
        </button>
      {/if}
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Kaydediliyor…' : 'Kişiyi Kaydet'}
      </button>
    </div>
  </form>
</div>

<style>
  .kisi-formu-container {
    background: var(--surface);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    color: var(--ink);
  }
  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .form-header h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }
  .btn-ghost {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .btn-ghost:hover {
    background: var(--row-hover);
    color: var(--ink);
  }
  .alert-error {
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .checkbox-field {
    flex-direction: row;
    align-items: center;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--ink);
    cursor: pointer;
  }
  .kod-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-text-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent-defter, #c9a86a);
    font-size: 0.78rem;
    cursor: pointer;
    text-decoration: underline;
  }
  .btn-text-link:hover {
    opacity: 0.8;
  }
  label {
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  input[type='text'] {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font-size: 0.9rem;
    box-sizing: border-box;
    width: 100%;
  }
  input[type='text']:focus {
    outline: none;
    border-color: var(--accent-defter, #c9a86a);
  }
  .kod-preview {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 0.65rem;
    background: var(--surface-2);
    border: 1px dashed var(--hairline);
    border-radius: 6px;
  }
  .kod-preview code {
    font-family: var(--font-mono, monospace);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--accent-defter, #c9a86a);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  .btn-primary {
    background: var(--accent-defter, #c9a86a);
    color: #121212;
    border: none;
    padding: 0.5rem 1.1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-primary:disabled {
    opacity: 0.5;
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
  .btn-secondary:hover:not(:disabled) {
    background: var(--row-hover);
  }
</style>
