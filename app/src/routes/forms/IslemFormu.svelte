<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset } from '../../lib/data/types'
  import type { DerivedBundle, AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord } from '../../lib/data/store'

  let {
    dataset,
    view,
    source,
    store,
    onSaved,
  }: {
    dataset: Dataset
    view: DerivedBundle
    source: DataSource
    store: Writable<AppState>
    onSaved: () => void
  } = $props()

  let yon = $state<'AL' | 'SAT'>('AL')
  let enstruman = $state('')
  let hesap = $state('')
  let portfoy = $state('')
  let lot = $state('')
  let fiyatUsd = $state('')
  let not_ = $state('')
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  const netUsd = $derived(Number(lot || 0) * Number(fiyatUsd || 0))

  function review() {
    error = null
    if (!enstruman || !hesap || !portfoy || !lot || !fiyatUsd) {
      error = 'Tüm alanları doldurun.'
      return
    }
    const lotNum = Number(lot)
    if (yon === 'SAT') {
      const open = view.positions.open.find((p) => p.kod === enstruman)?.lot ?? 0
      if (lotNum > open + 1e-9) {
        error = `Bu enstrümanda açık pozisyondan fazla satamazsınız (açık: ${open}).`
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
      const id = 't_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
      await appendRecord(store, source, 'transactions', {
        id,
        tarih: new Date().toISOString().slice(0, 10),
        hesap,
        portfoy,
        enstruman,
        yon,
        lot: Number(lot),
        girisParaBirimi: 'USD',
        fiyat_tl: null,
        fiyat_usd: Number(fiyatUsd),
        kur: null,
        komisyon_usd: 0,
        brut_usd: netUsd,
        net_usd: netUsd,
        not: not_,
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
      })
      onSaved()
      yon = 'AL'
      enstruman = hesap = portfoy = lot = fiyatUsd = not_ = ''
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
      Yön
      <select bind:value={yon} aria-label="Yön">
        <option value="AL">AL</option>
        <option value="SAT">SAT</option>
      </select>
    </label>
    <label>
      Enstrüman
      <select bind:value={enstruman} aria-label="Enstrüman">
        <option value="">—</option>
        {#each dataset.instruments as i}<option value={i.kod}>{i.kod}</option>{/each}
      </select>
    </label>
    <label>
      Hesap
      <select bind:value={hesap} aria-label="Hesap">
        <option value="">—</option>
        {#each dataset.brokers as b}<option value={b.kod}>{b.ad}</option>{/each}
      </select>
    </label>
    <label>
      Portföy
      <select bind:value={portfoy} aria-label="Portföy">
        <option value="">—</option>
        {#each dataset.portfolios as p}<option value={p.kod}>{p.ad}</option>{/each}
      </select>
    </label>
    <label>
      Lot
      <input type="number" bind:value={lot} aria-label="Lot" min="0" step="any" />
    </label>
    <label>
      Fiyat (USD)
      <input type="number" bind:value={fiyatUsd} aria-label="Fiyat (USD)" min="0" step="any" />
    </label>
    <label class="wide">
      Not
      <input type="text" bind:value={not_} aria-label="Not" />
    </label>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{yon}</strong> — {enstruman} · {lot} lot · {fiyatUsd} USD/lot · toplam ${netUsd.toFixed(2)}</p>
    <p>{hesap} / {portfoy}</p>
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
