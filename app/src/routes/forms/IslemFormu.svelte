<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Transaction } from '../../lib/data/types'
  import type { DerivedBundle, AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, updateRecord } from '../../lib/data/store'
  import { derivePositions } from '../../lib/data/derive'
  import { money, settings } from '../../lib/settings.svelte'

  let {
    dataset,
    view,
    source,
    store,
    onSaved,
    editing,
  }: {
    dataset: Dataset
    view: DerivedBundle
    source: DataSource
    store: Writable<AppState>
    onSaved: () => void
    editing?: Transaction
  } = $props()

  function todayIso() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function instrumentOf(kod: string) {
    return dataset.instruments.find((i) => i.kod === kod)
  }

  // Each instrument is quoted in its own market currency (BIST/gold in TL, US listings in
  // USD) — the form asks for the price in that currency and converts to USD internally, so
  // the user never has to do the TL→USD conversion in their head.
  function initialPriceInput(): string {
    if (!editing) return ''
    if (instrumentOf(editing.enstruman)?.girisParaBirimi === 'USD') return String(editing.fiyat_usd)
    if (editing.fiyat_tl != null) return String(editing.fiyat_tl)
    return String(Math.round(editing.fiyat_usd * (editing.kur ?? settings.rate) * 100) / 100)
  }

  let yon = $state<'AL' | 'SAT'>(editing?.yon ?? 'AL')
  let enstruman = $state(editing?.enstruman ?? '')
  let hesap = $state(editing?.hesap ?? '')
  let portfoy = $state(editing?.portfoy ?? '')
  let lot = $state(editing ? String(editing.lot) : '')
  let fiyatInput = $state(initialPriceInput())
  let not_ = $state(editing?.not ?? '')
  let tarih = $state(editing?.tarih ?? todayIso())
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  const priceCurrency = $derived(instrumentOf(enstruman)?.girisParaBirimi === 'USD' ? 'USD' : 'TL')
  const fiyatUsd = $derived(
    priceCurrency === 'USD' ? Number(fiyatInput || 0) : Number(fiyatInput || 0) / settings.rate,
  )
  const netUsd = $derived(Number(lot || 0) * fiyatUsd)

  function review() {
    error = null
    if (!enstruman || !hesap || !portfoy || !lot || !fiyatInput) {
      error = 'Tüm alanları doldurun.'
      return
    }
    if (tarih > todayIso()) {
      error = 'Tarih gelecekte olamaz.'
      return
    }
    const lotNum = Number(lot)
    if (yon === 'SAT') {
      const openPositions = editing
        ? derivePositions(dataset.transactions.filter((t) => t.id !== editing!.id)).open
        : view.positions.open
      const open = openPositions.find((p) => p.kod === enstruman)?.lot ?? 0
      if (lotNum > open + 1e-9) {
        error = `Bu enstrümanda açık pozisyondan fazla satamazsınız (açık: ${open}).`
        return
      }
    }
    if (editing) {
      const draftPatch: Transaction = {
        ...editing,
        tarih,
        hesap,
        portfoy,
        enstruman,
        yon,
        lot: lotNum,
        girisParaBirimi: priceCurrency,
        fiyat_tl: priceCurrency === 'TL' ? Number(fiyatInput) : null,
        fiyat_usd: fiyatUsd,
        kur: priceCurrency === 'TL' ? settings.rate : null,
        brut_usd: netUsd,
        net_usd: netUsd,
        not: not_,
      }
      const prospective = dataset.transactions.map((t) => (t.id === editing!.id ? draftPatch : t))
      const baselineErrors = derivePositions(dataset.transactions).errors.length
      const prospectiveErrors = derivePositions(prospective).errors.length
      if (prospectiveErrors > baselineErrors) {
        error = 'Bu değişiklik daha sonraki bir satışı geçersiz kılar (yetersiz pozisyon oluşturur).'
        return
      }
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      if (editing) {
        const patch: Transaction = {
          ...editing,
          tarih,
          hesap,
          portfoy,
          enstruman,
          yon,
          lot: Number(lot),
          girisParaBirimi: priceCurrency,
          fiyat_tl: priceCurrency === 'TL' ? Number(fiyatInput) : null,
          fiyat_usd: fiyatUsd,
          kur: priceCurrency === 'TL' ? settings.rate : null,
          brut_usd: netUsd,
          net_usd: netUsd,
          not: not_,
        }
        await updateRecord<Transaction>(store, source, 'transactions', (t) => t.id === editing!.id, patch)
      } else {
        const rand = crypto.getRandomValues(new Uint8Array(8))
        const id = 't_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
        await appendRecord(store, source, 'transactions', {
          id,
          tarih,
          hesap,
          portfoy,
          enstruman,
          yon,
          lot: Number(lot),
          girisParaBirimi: priceCurrency,
          fiyat_tl: priceCurrency === 'TL' ? Number(fiyatInput) : null,
          fiyat_usd: fiyatUsd,
          kur: priceCurrency === 'TL' ? settings.rate : null,
          komisyon_usd: 0,
          brut_usd: netUsd,
          net_usd: netUsd,
          not: not_,
          kaynak: 'manual',
          olusturulma: new Date().toISOString(),
        })
      }
      onSaved()
      if (!editing) {
        yon = 'AL'
        enstruman = hesap = portfoy = lot = fiyatInput = not_ = ''
        tarih = todayIso()
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
      Fiyat ({priceCurrency})
      <input type="number" bind:value={fiyatInput} aria-label={`Fiyat (${priceCurrency})`} min="0" step="any" />
    </label>
    <label class="wide">
      Not
      <input type="text" bind:value={not_} aria-label="Not" />
    </label>
    <label>
      Tarih
      <input type="date" bind:value={tarih} aria-label="Tarih" max={todayIso()} />
    </label>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={review}>İncele</button>
{:else}
  <div class="summary">
    <p><strong>{yon}</strong> — {enstruman} · {lot} lot · {fiyatInput} {priceCurrency}/lot · toplam {money(netUsd)}</p>
    <p>{hesap} / {portfoy}</p>
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
