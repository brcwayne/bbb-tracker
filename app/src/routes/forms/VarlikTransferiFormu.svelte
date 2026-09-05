<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, AssetTransfer } from '../../lib/data/types'
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

  let enstruman = $state('')
  let kaynakHesap = $state('')
  let hedefHesap = $state('')
  let kaynakPortfoy = $state('')
  let hedefPortfoy = $state('')
  let lot = $state('')
  let aciklama = $state('')
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  function review() {
    error = null
    if (!enstruman || !kaynakHesap || !hedefHesap || !lot) {
      error = 'Tüm alanları doldurun.'
      return
    }
    const openLot = view.positions.open.find((p) => p.kod === enstruman)?.lot ?? 0
    if (Number(lot) > openLot + 1e-9) {
      error = `Bu enstrümanda açık pozisyondan (${openLot}) fazla transfer edemezsiniz.`
      return
    }
    if (kaynakHesap === hedefHesap && kaynakPortfoy === hedefPortfoy) {
      error = 'Kaynak ve hedef aynı — transfer yapılacak bir şey yok.'
      return
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      const rand = crypto.getRandomValues(new Uint8Array(8))
      const id = 'at_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
      const record: AssetTransfer = {
        id,
        tarih: new Date().toISOString().slice(0, 10),
        enstruman,
        lot: Number(lot),
        kaynakHesap,
        hedefHesap,
        kaynakPortfoy: kaynakPortfoy || null,
        hedefPortfoy: hedefPortfoy || null,
        aciklama,
        kaynak: 'manual',
      }
      await appendRecord(store, source, 'assetTransfers', record)
      onSaved()
      enstruman = kaynakHesap = hedefHesap = kaynakPortfoy = hedefPortfoy = lot = aciklama = ''
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
      Enstrüman
      <select bind:value={enstruman} aria-label="Enstrüman">
        <option value="">—</option>
        {#each dataset.instruments as i}<option value={i.kod}>{i.kod}</option>{/each}
      </select>
    </label>
    <label>
      Kaynak Hesap
      <select bind:value={kaynakHesap} aria-label="Kaynak Hesap">
        <option value="">—</option>
        {#each dataset.brokers as b}<option value={b.kod}>{b.ad}</option>{/each}
      </select>
    </label>
    <label>
      Hedef Hesap
      <select bind:value={hedefHesap} aria-label="Hedef Hesap">
        <option value="">—</option>
        {#each dataset.brokers as b}<option value={b.kod}>{b.ad}</option>{/each}
      </select>
    </label>
    <label>
      Kaynak Portföy
      <select bind:value={kaynakPortfoy} aria-label="Kaynak Portföy">
        <option value="">—</option>
        {#each dataset.portfolios as p}<option value={p.kod}>{p.ad}</option>{/each}
      </select>
    </label>
    <label>
      Hedef Portföy
      <select bind:value={hedefPortfoy} aria-label="Hedef Portföy">
        <option value="">—</option>
        {#each dataset.portfolios as p}<option value={p.kod}>{p.ad}</option>{/each}
      </select>
    </label>
    <label>
      Lot
      <input type="number" bind:value={lot} aria-label="Lot" min="0" step="any" />
    </label>
    <label class="wide">
      Açıklama
      <input type="text" bind:value={aciklama} aria-label="Açıklama" />
    </label>
  </div>
  <p class="muted">
    Not: Transfer, bu enstrümandaki mevcut tüm pozisyonu taşır — girdiğiniz lot sayısı yalnızca
    bilgi amaçlıdır.
  </p>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{enstruman}</strong> — {lot} lot</p>
    <p>{kaynakHesap} / {kaynakPortfoy || '—'} → {hedefHesap} / {hedefPortfoy || '—'}</p>
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
  .muted {
    color: var(--ink-soft);
    font-size: 0.8rem;
    margin: 0.6rem 0 0;
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
