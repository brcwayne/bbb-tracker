<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Category } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'

  let {
    dataset,
    source,
    store,
    varsayilanTur = 'GIDER',
    onSaved,
    onCancel,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    varsayilanTur?: 'GIDER' | 'GELIR'
    onSaved: (cat: Category) => void
    onCancel?: () => void
  } = $props()

  let ad = $state('')
  // svelte-ignore state_referenced_locally
  let tur = $state<'GIDER' | 'GELIR'>(varsayilanTur)
  let customKod = $state('')
  let manualKod = $state(false)
  let error = $state<string | null>(null)
  let saving = $state(false)

  const existingCategories = $derived(dataset?.categories ?? [])

  export function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const generatedKod = $derived.by(() => {
    if (manualKod && customKod.trim()) return customKod.trim()
    const base = slugify(ad) || 'kategori'
    let candidate = base
    let count = 2
    while (existingCategories.some((c) => c.kod === candidate)) {
      candidate = `${base}-${count++}`
    }
    return candidate
  })

  async function handleSubmit() {
    error = null
    const trimmedAd = ad.trim()
    if (!trimmedAd) {
      error = 'Kategori adı girilmelidir.'
      return
    }

    const kod = generatedKod
    if (existingCategories.some((c) => c.kod === kod)) {
      error = `"${kod}" kodlu bir kategori zaten mevcut.`
      return
    }

    saving = true
    try {
      const newCat: Category = {
        kod,
        ad: trimmedAd,
        tur,
        aktif: true,
      }
      await appendRecord<Category>(store, source, 'categories', newCat)
      onSaved(newCat)
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

<div class="kategori-formu-container">
  <div class="form-header">
    <h3>Yeni Kategori Ekle</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel}>✕</button>
    {/if}
  </div>

  {#if error}
    <div class="alert-error">{error}</div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <div class="row">
      <div class="field flex-2">
        <label for="kf-ad">Kategori Adı</label>
        <input
          id="kf-ad"
          type="text"
          placeholder="Örn: Eğlence, Kırtasiye, Spor..."
          bind:value={ad}
          required
        />
      </div>

      <div class="field flex-1">
        <label for="kf-tur">Tür</label>
        <select id="kf-tur" bind:value={tur}>
          <option value="GIDER">Gider</option>
          <option value="GELIR">Gelir</option>
        </select>
      </div>
    </div>

    <div class="field">
      <div class="label-with-hint">
        <label for="kf-kod">Kategori Kodu (Slug)</label>
        <span class="hint">Otomatik üretilir</span>
      </div>
      <input
        id="kf-kod"
        type="text"
        placeholder={generatedKod}
        value={manualKod ? customKod : generatedKod}
        oninput={(e) => {
          manualKod = true
          customKod = (e.target as HTMLInputElement).value
        }}
      />
    </div>

    <div class="actions">
      {#if onCancel}
        <button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>Vazgeç</button>
      {/if}
      <button type="submit" class="btn-primary" disabled={saving || !ad.trim()}>
        {saving ? 'Kaydediliyor...' : 'Kategori Ekle'}
      </button>
    </div>
  </form>
</div>

<style>
  .kategori-formu-container {
    background: var(--surface, #161b22);
    border: 1px solid var(--hairline, #30363d);
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 440px;
    width: 100%;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .form-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .btn-ghost {
    background: transparent;
    border: none;
    color: var(--muted, #8b949e);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .btn-ghost:hover {
    color: var(--text, #e6edf3);
    background: rgba(255, 255, 255, 0.05);
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
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
  }

  .flex-1 { flex: 1; }
  .flex-2 { flex: 2; }

  label {
    font-size: 0.8rem;
    color: var(--muted, #8b949e);
  }

  .label-with-hint {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--muted, #8b949e);
  }

  input, select {
    background: var(--bg, #0d1117);
    border: 1px solid var(--hairline, #30363d);
    color: var(--text, #e6edf3);
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font-size: 0.9rem;
    box-sizing: border-box;
    width: 100%;
  }

  input:focus, select:focus {
    outline: none;
    border-color: var(--primary, #58a6ff);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .btn-primary {
    background: var(--primary, #1f6feb);
    color: #fff;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-primary:hover:not(:disabled) {
    background: #388bfd;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--hairline, #30363d);
    color: var(--text, #e6edf3);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
  }
</style>
