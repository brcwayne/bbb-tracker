<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Cashflow } from '../lib/data/types'
  import type { AppState } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import { appendRecords, load } from '../lib/data/store'
  import { ConflictError } from '../lib/data/drive'
  import { newCashflowId } from '../lib/data/ids'
  import { money, settings } from '../lib/settings.svelte'
  import { tryFmt, usd } from '../lib/format'

  let {
    source,
    store,
    hesap,
    hesapAdi,
    hesaplananTl = 0,
    hesaplananUsd = 0,
    today = new Date().toISOString().slice(0, 10),
    onSaved = () => {},
    onCancel,
  }: {
    source?: DataSource
    store?: Writable<AppState>
    hesap: string
    hesapAdi: string
    hesaplananTl?: number
    hesaplananUsd?: number
    today?: string
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let tlText = $state<string | number>(hesaplananTl !== 0 ? hesaplananTl : '')
  // svelte-ignore state_referenced_locally
  let usdText = $state<string | number>(hesaplananUsd !== 0 ? hesaplananUsd : '')
  let saving = $state(false)
  let error = $state<string | null>(null)

  const tl = $derived(tlText === '' ? 0 : Number(tlText))
  const usdDirect = $derived(usdText === '' ? 0 : Number(usdText))
  const hasInput = $derived(tlText !== '' || usdText !== '')
  const rateOk = $derived(Number.isFinite(settings.rate) && settings.rate > 0)

  const farkTl = $derived(
    Number.isFinite(tl) ? Math.round((tl - hesaplananTl) * 100) / 100 : 0,
  )
  const farkUsd = $derived(
    Number.isFinite(usdDirect) ? Math.round((usdDirect - hesaplananUsd) * 100) / 100 : 0,
  )
  const hasChange = $derived(hasInput && (farkTl !== 0 || farkUsd !== 0))

  const gercekUsd = $derived(
    hasInput && rateOk && Number.isFinite(tl) && Number.isFinite(usdDirect)
      ? tl / settings.rate + usdDirect
      : null,
  )

  async function kaydet() {
    if (!source || !store) return
    if (!hasInput || gercekUsd == null) {
      error = 'Gerçek nakit tutarını (TL ve/veya USD) gir.'
      return
    }
    if (!hasChange) {
      error = 'Fark yok — düzeltmeye gerek kalmadı.'
      return
    }
    saving = true
    error = null
    try {
      const recordsToAppend: Cashflow[] = []
      if (farkTl !== 0) {
        recordsToAppend.push({
          id: newCashflowId(),
          tarih: today,
          hesap,
          portfoy: null,
          tur: 'DUZELTME',
          enstruman: null,
          tutar_tl: farkTl,
          tutar_usd: Math.round((farkTl / settings.rate) * 100) / 100,
          kur: settings.rate,
          aciklama: `TL nakit düzeltmesi (${tryFmt(hesaplananTl)} → ${tryFmt(tl)})`,
          kaynak: 'manual',
        })
      }
      if (farkUsd !== 0) {
        recordsToAppend.push({
          id: newCashflowId(),
          tarih: today,
          hesap,
          portfoy: null,
          tur: 'DUZELTME',
          enstruman: null,
          tutar_tl: null,
          tutar_usd: farkUsd,
          kur: settings.rate,
          aciklama: `USD nakit düzeltmesi (${usd(hesaplananUsd)} → ${usd(usdDirect)})`,
          kaynak: 'manual',
        })
      }
      await appendRecords<Cashflow>(store, source, 'cashflows', recordsToAppend)
      onSaved()
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
  <div class="form-header">
    <h3>{hesapAdi} — Nakit Düzeltmesi</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel} aria-label="Kapat">✕</button>
    {/if}
  </div>

  <p class="satir">
    Hesaplanan nakit:
    {#if Math.abs(hesaplananTl) >= 0.005 && Math.abs(hesaplananUsd) >= 0.005}
      <b class="num" data-testid="hesaplanan" data-value={hesaplananUsd}>{tryFmt(hesaplananTl)} · {usd(hesaplananUsd)}</b>
    {:else if Math.abs(hesaplananTl) >= 0.005}
      <b class="num" data-testid="hesaplanan" data-value={hesaplananUsd}>{tryFmt(hesaplananTl)}</b>
    {:else}
      <b class="num" data-testid="hesaplanan" data-value={hesaplananUsd}>{usd(hesaplananUsd)}</b>
    {/if}
  </p>

  <p class="hint">{hesapAdi}'da gerçekte ne kadar nakit var? İkisini birden girebilirsin (ör. hem TL hem USD nakit).</p>

  <div class="fields">
    <label>
      TL nakit
      <input type="number" step="0.01" inputmode="decimal" bind:value={tlText} placeholder="0" />
    </label>
    <label>
      USD nakit
      <input type="number" step="0.01" inputmode="decimal" bind:value={usdText} placeholder="0" />
    </label>
  </div>

  {#if !rateOk}
    <div class="alert-error">Kur bilgisi yok — düzeltme hesaplanamıyor.</div>
  {:else if hasInput && hasChange && gercekUsd !== null}
    <p class="ozet">
      Gerçek toplam: <b class="num">{money(gercekUsd)}</b>
      {#if farkTl !== 0 && farkUsd !== 0}
        — TL nakit <b class="num">{tryFmt(Math.abs(farkTl))}</b> {farkTl > 0 ? 'artırılacak' : 'azaltılacak'},
        USD nakit <b class="num">{usd(Math.abs(farkUsd))}</b> {farkUsd > 0 ? 'artırılacak' : 'azaltılacak'}.
      {:else if farkTl !== 0}
        — TL nakit <b class="num">{tryFmt(Math.abs(farkTl))}</b> {farkTl > 0 ? 'artırılacak' : 'azaltılacak'}.
      {:else if farkUsd !== 0}
        — USD nakit <b class="num">{usd(Math.abs(farkUsd))}</b> {farkUsd > 0 ? 'artırılacak' : 'azaltılacak'}.
      {/if}
    </p>
  {:else if hasInput && !hasChange}
    <p class="ozet">
      Fark yok — girilen tutarlar mevcut bakiye ile aynı.
    </p>
  {/if}

  {#if error}
    <div class="alert-error">{error}</div>
  {/if}

  <div class="actions">
    {#if onCancel}
      <button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>Vazgeç</button>
    {/if}
    <button type="button" class="btn-primary" onclick={kaydet} disabled={saving || !rateOk || !hasChange}>
      {saving ? 'Kaydediliyor…' : 'Kaydet'}
    </button>
  </div>
</div>

<style>
  .form-container {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem 1.1rem 1.1rem;
  }
  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--hairline);
    padding-bottom: 0.6rem;
  }
  .form-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
  }
  .btn-ghost {
    background: transparent;
    border: none;
    color: var(--ink-soft);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .btn-ghost:hover {
    color: var(--ink);
  }
  .satir {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .satir .num {
    color: var(--ink);
    margin-left: 0.25rem;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.7rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  input {
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font: inherit;
    font-size: 0.95rem;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }
  input:focus {
    border-color: var(--gold);
  }
  .ozet {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink);
    background: color-mix(in srgb, var(--gold) 12%, transparent);
    padding: 0.55rem 0.75rem;
    border-radius: 6px;
    border-left: 3px solid var(--gold);
  }
  .alert-error {
    background: color-mix(in srgb, var(--loss) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--loss) 40%, transparent);
    color: var(--loss);
    padding: 0.55rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }
  .btn-primary {
    background: var(--gold);
    color: #1a1400;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn-secondary:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
</style>
