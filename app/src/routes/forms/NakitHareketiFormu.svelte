<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Cashflow } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord } from '../../lib/data/store'

  let {
    dataset,
    source,
    store,
    onSaved,
  }: {
    dataset: Dataset
    source: DataSource
    store: Writable<AppState>
    onSaved: () => void
  } = $props()

  let tur = $state<'YATIRMA' | 'CEKME' | 'TEMETTU' | 'TRANSFER'>('YATIRMA')
  let hesap = $state('')
  let hedefHesap = $state('')
  let enstruman = $state('')
  let tutarUsd = $state('')
  let aciklama = $state('')
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  function review() {
    error = null
    if (!hesap || !tutarUsd) {
      error = 'Tüm alanları doldurun.'
      return
    }
    if (tur === 'TEMETTU' && !enstruman) {
      error = 'Tüm alanları doldurun.'
      return
    }
    if (tur === 'TRANSFER') {
      if (!hedefHesap) {
        error = 'Hedef hesap seçilmeli.'
        return
      }
      if (hesap === hedefHesap) {
        error = 'Aynı hesaba transfer yapılamaz.'
        return
      }
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      const rand = crypto.getRandomValues(new Uint8Array(8))
      const id = 'c_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
      const record: Cashflow = {
        id,
        tarih: new Date().toISOString().slice(0, 10),
        hesap,
        portfoy: null,
        tur,
        enstruman: tur === 'TEMETTU' ? enstruman : null,
        tutar_tl: null,
        tutar_usd: Number(tutarUsd),
        kur: null,
        aciklama,
        kaynak: 'manual',
        ...(tur === 'TRANSFER' ? { hedefHesap } : {}),
      }
      await appendRecord(store, source, 'cashflows', record)
      onSaved()
      tur = 'YATIRMA'
      hesap = hedefHesap = enstruman = tutarUsd = aciklama = ''
      step = 'form'
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
      Tür
      <select bind:value={tur} aria-label="Tür">
        <option value="YATIRMA">YATIRMA</option>
        <option value="CEKME">ÇEKME</option>
        <option value="TEMETTU">TEMETTÜ</option>
        <option value="TRANSFER">TRANSFER</option>
      </select>
    </label>
    <label>
      Hesap
      <select bind:value={hesap} aria-label="Hesap">
        <option value="">—</option>
        {#each dataset.brokers as b}<option value={b.kod}>{b.ad}</option>{/each}
      </select>
    </label>
    {#if tur === 'TRANSFER'}
      <label>
        Hedef Hesap
        <select bind:value={hedefHesap} aria-label="Hedef Hesap">
          <option value="">—</option>
          {#each dataset.brokers as b}<option value={b.kod}>{b.ad}</option>{/each}
        </select>
      </label>
    {/if}
    {#if tur === 'TEMETTU'}
      <label>
        Enstrüman
        <select bind:value={enstruman} aria-label="Enstrüman">
          <option value="">—</option>
          {#each dataset.instruments as i}<option value={i.kod}>{i.kod}</option>{/each}
        </select>
      </label>
    {/if}
    <label>
      Tutar (USD)
      <input type="number" bind:value={tutarUsd} aria-label="Tutar (USD)" min="0" step="any" />
    </label>
    <label class="wide">
      Açıklama
      <input type="text" bind:value={aciklama} aria-label="Açıklama" />
    </label>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{tur}</strong> — {hesap}{tur === 'TRANSFER' ? ` → ${hedefHesap}` : ''} · ${Number(tutarUsd).toFixed(2)}</p>
    {#if tur === 'TEMETTU'}<p>{enstruman}</p>{/if}
    {#if aciklama}<p>{aciklama}</p>{/if}
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={() => (step = 'form')} disabled={saving}>Geri</button>
  <button onclick={confirmSave} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Onayla ve Kaydet'}</button>
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
  label.wide {
    grid-column: 1 / -1;
  }
  select,
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
