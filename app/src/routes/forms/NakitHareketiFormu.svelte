<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Cashflow } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, updateRecord } from '../../lib/data/store'
  import { money, settings } from '../../lib/settings.svelte'

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
    editing?: Cashflow
  } = $props()

  function todayIso() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // This form never offers DUZELTME (that's KurumNakitDuzelt's job — a
  // computed delta, not a freely typed amount), but `editing` is a full
  // Cashflow, so the local state type has to admit it too.
  let tur = $state<Cashflow['tur']>(editing?.tur ?? 'YATIRMA')
  let hesap = $state(editing?.hesap ?? '')
  let hedefHesap = $state(editing?.hedefHesap ?? '')
  let enstruman = $state(editing?.enstruman ?? '')
  let paraBirimi = $state<'USD' | 'TL'>(editing?.tutar_tl != null ? 'TL' : 'USD')
  let tutarInput = $state(
    editing ? String(editing.tutar_tl != null ? editing.tutar_tl : editing.tutar_usd) : '',
  )

  const isEditingCrossXfer =
    editing?.tur === 'TRANSFER' &&
    (editing.hedefTutarTl != null || editing.hedefTutarUsd != null)

  let farkliHedefParaBirimi = $state(Boolean(isEditingCrossXfer))
  let hedefParaBirimi = $state<'USD' | 'TL'>(
    editing?.hedefTutarTl != null
      ? 'TL'
      : editing?.hedefTutarUsd != null
        ? 'USD'
        : paraBirimi === 'TL'
          ? 'USD'
          : 'TL',
  )
  let kurInput = $state(
    editing?.kur != null
      ? String(editing.kur)
      : String(settings.rate),
  )
  let hedefTutarInput = $state(
    editing?.hedefTutarTl != null
      ? String(editing.hedefTutarTl)
      : editing?.hedefTutarUsd != null
        ? String(editing.hedefTutarUsd)
        : '',
  )

  let aciklama = $state(editing?.aciklama ?? '')
  let tarih = $state(editing?.tarih ?? todayIso())
  let step = $state<'form' | 'confirm'>('form')
  let error = $state<string | null>(null)
  let saving = $state(false)

  const tutarUsd = $derived(
    paraBirimi === 'USD' ? Number(tutarInput || 0) : Number(tutarInput || 0) / settings.rate,
  )

  function calcHedefTutarFromKur() {
    const srcAmt = Number(tutarInput || 0)
    const k = Number(kurInput || 0)
    if (srcAmt > 0 && k > 0) {
      if (paraBirimi === 'USD' && hedefParaBirimi === 'TL') {
        hedefTutarInput = String(Number((srcAmt * k).toFixed(4)))
      } else if (paraBirimi === 'TL' && hedefParaBirimi === 'USD') {
        hedefTutarInput = String(Number((srcAmt / k).toFixed(4)))
      }
    }
  }

  function calcKurFromHedefTutar() {
    const srcAmt = Number(tutarInput || 0)
    const dstAmt = Number(hedefTutarInput || 0)
    if (srcAmt > 0 && dstAmt > 0) {
      if (paraBirimi === 'USD' && hedefParaBirimi === 'TL') {
        kurInput = String(Number((dstAmt / srcAmt).toFixed(4)))
      } else if (paraBirimi === 'TL' && hedefParaBirimi === 'USD') {
        kurInput = String(Number((srcAmt / dstAmt).toFixed(4)))
      }
    }
  }

  function onTutarInput() {
    if (tur === 'TRANSFER' && farkliHedefParaBirimi) {
      if (hedefParaBirimi === paraBirimi) {
        hedefTutarInput = tutarInput
      } else {
        calcHedefTutarFromKur()
      }
    }
  }

  function onKurInput() {
    calcHedefTutarFromKur()
  }

  function onHedefTutarInput() {
    calcKurFromHedefTutar()
  }

  function onToggleFarkliHedef() {
    if (farkliHedefParaBirimi) {
      if (!editing && (hedefParaBirimi === paraBirimi || !hedefParaBirimi)) {
        hedefParaBirimi = paraBirimi === 'TL' ? 'USD' : 'TL'
      }
      if (!kurInput || Number(kurInput) <= 0) {
        kurInput = String(settings.rate)
      }
      if (hedefParaBirimi === paraBirimi) {
        hedefTutarInput = tutarInput
      } else {
        calcHedefTutarFromKur()
      }
    }
  }

  function onHedefParaBirimiChange() {
    if (hedefParaBirimi === paraBirimi) {
      hedefTutarInput = tutarInput
    } else {
      if (!kurInput || Number(kurInput) <= 0) {
        kurInput = String(settings.rate)
      }
      calcHedefTutarFromKur()
    }
  }

  function onParaBirimiChange() {
    if (tur === 'TRANSFER' && farkliHedefParaBirimi) {
      if (!editing && hedefParaBirimi === paraBirimi) {
        hedefParaBirimi = paraBirimi === 'TL' ? 'USD' : 'TL'
      }
      if (hedefParaBirimi === paraBirimi) {
        hedefTutarInput = tutarInput
      } else {
        calcHedefTutarFromKur()
      }
    }
  }

  function review() {
    error = null
    if (!hesap || !tutarInput) {
      error = 'Tüm alanları doldurun.'
      return
    }
    if (tarih > todayIso()) {
      error = 'Tarih gelecekte olamaz.'
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
      if (farkliHedefParaBirimi && hedefParaBirimi !== paraBirimi) {
        const k = Number(kurInput)
        const ht = Number(hedefTutarInput)
        if (!k || k <= 0 || !ht || ht <= 0) {
          error = 'Hedef tutar ve kur girilmeli.'
          return
        }
      }
    }
    step = 'confirm'
  }

  async function confirmSave() {
    saving = true
    error = null
    try {
      const isCrossXfer =
        tur === 'TRANSFER' && farkliHedefParaBirimi && hedefParaBirimi !== paraBirimi
      const kVal = Number(kurInput)
      const htVal = Number(hedefTutarInput)

      const base: Cashflow = {
        id: editing?.id ?? '',
        tarih,
        hesap,
        portfoy: null,
        tur,
        enstruman: tur === 'TEMETTU' ? enstruman : null,
        tutar_tl: paraBirimi === 'TL' ? Number(tutarInput) : null,
        tutar_usd: isCrossXfer
          ? (paraBirimi === 'USD' ? Number(tutarInput) : Number(tutarInput) / kVal)
          : tutarUsd,
        kur: isCrossXfer
          ? kVal
          : (paraBirimi === 'TL' ? settings.rate : null),
        aciklama,
        kaynak: 'manual',
        ...(tur === 'TRANSFER'
          ? {
              hedefHesap,
              ...(isCrossXfer
                ? {
                    hedefTutarTl: hedefParaBirimi === 'TL' ? htVal : null,
                    hedefTutarUsd: hedefParaBirimi === 'TL' ? htVal / kVal : htVal,
                  }
                : {}),
            }
          : {}),
      }
      if (editing) {
        await updateRecord<Cashflow>(store, source, 'cashflows', (c) => c.id === editing!.id, { ...base, id: editing.id })
      } else {
        const rand = crypto.getRandomValues(new Uint8Array(8))
        const id = 'c_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
        await appendRecord(store, source, 'cashflows', { ...base, id })
      }
      onSaved()
      if (!editing) {
        tur = 'YATIRMA'
        hesap = hedefHesap = enstruman = tutarInput = aciklama = ''
        paraBirimi = 'USD'
        farkliHedefParaBirimi = false
        hedefParaBirimi = 'TL'
        kurInput = String(settings.rate)
        hedefTutarInput = ''
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
      Para Birimi
      <select bind:value={paraBirimi} onchange={onParaBirimiChange} aria-label="Para Birimi">
        <option value="USD">USD</option>
        <option value="TL">TL</option>
      </select>
    </label>
    <label>
      Tutar ({paraBirimi})
      <input
        type="number"
        bind:value={tutarInput}
        oninput={onTutarInput}
        aria-label={`Tutar (${paraBirimi})`}
        min="0"
        step="any"
      />
    </label>
    {#if tur === 'TRANSFER'}
      <label class="toggle-label wide">
        <input
          type="checkbox"
          bind:checked={farkliHedefParaBirimi}
          onchange={onToggleFarkliHedef}
          aria-label="Hedef para birimi farklı"
        />
        Hedef para birimi farklı
      </label>
      {#if farkliHedefParaBirimi}
        <label>
          Hedef Para Birimi
          <select
            bind:value={hedefParaBirimi}
            onchange={onHedefParaBirimiChange}
            aria-label="Hedef Para Birimi"
          >
            <option value="TL">TL</option>
            <option value="USD">USD</option>
          </select>
        </label>
        {#if hedefParaBirimi !== paraBirimi}
          <label>
            Kur
            <input
              type="number"
              bind:value={kurInput}
              oninput={onKurInput}
              aria-label="Kur"
              min="0"
              step="any"
            />
          </label>
        {/if}
        <label>
          Hedef Tutar ({hedefParaBirimi})
          <input
            type="number"
            bind:value={hedefTutarInput}
            oninput={onHedefTutarInput}
            disabled={hedefParaBirimi === paraBirimi}
            aria-label={`Hedef Tutar (${hedefParaBirimi})`}
            min="0"
            step="any"
          />
        </label>
      {/if}
    {/if}
    <label class="wide">
      Açıklama
      <input type="text" bind:value={aciklama} aria-label="Açıklama" />
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
    <p>
      <strong>{tur}</strong> — {hesap}{tur === 'TRANSFER' ? ` → ${hedefHesap}` : ''} ·
      {#if tur === 'TRANSFER' && farkliHedefParaBirimi && hedefParaBirimi !== paraBirimi}
        {tutarInput} {paraBirimi} → {hedefTutarInput} {hedefParaBirimi}
      {:else if paraBirimi === 'TL'}
        {tutarInput} TL (≈ {money(tutarUsd)})
      {:else}
        {money(tutarUsd)}
      {/if}
    </p>
    {#if tur === 'TEMETTU'}<p>{enstruman}</p>{/if}
    {#if aciklama}<p>{aciklama}</p>{/if}
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
  .toggle-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--ink);
    cursor: pointer;
  }
  .toggle-label input[type="checkbox"] {
    width: auto;
    margin: 0;
    cursor: pointer;
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
