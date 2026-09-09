<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalAccount, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountBalances } from '../../lib/data/accounts'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { newPersonalId } from '../../lib/data/ids'
  import { tryFmt, usd } from '../../lib/format'

  let {
    dataset,
    source,
    store,
    account,
    today = new Date().toISOString().slice(0, 10),
    onSaved = () => {},
    onCancel,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    account: PersonalAccount
    today?: string
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  const hesaplanan = $derived(
    accountBalances(dataset?.personalTx ?? [], [account], today).get(account.kod) ?? 0,
  )

  let gercekText = $state<string | number>('')
  let saving = $state(false)
  let error = $state<string | null>(null)

  const fmt = (v: number) => (account.paraBirimi === 'USD' ? usd(v) : tryFmt(v))
  const fark = $derived(
    gercekText === '' || gercekText === null || gercekText === undefined || !Number.isFinite(Number(gercekText))
      ? null
      : Math.round((Number(gercekText) - hesaplanan) * 100) / 100,
  )

  async function kaydet() {
    if (!source || !store) return
    if (fark === null) {
      error = 'Gerçek bakiyeyi gir.'
      return
    }
    if (fark === 0) {
      error = 'Fark yok — düzeltmeye gerek kalmadı.'
      return
    }
    saving = true
    error = null
    try {
      const satir: PersonalTx = {
        id: newPersonalId(),
        tarih: today,
        tur: 'DUZELTME',
        tutar: fark, // signed — this is the delta
        paraBirimi: account.paraBirimi as 'TRY' | 'USD',
        kategori: 'duzeltme',
        aciklama: 'Bakiye düzeltmesi',
        hesap: account.kod,
        sahip: account.sahip,
        taksitPlaniId: null,
        taksitNo: null,
        taksitToplam: null,
        not: `Hesaplanan ${fmt(hesaplanan)} → gerçek ${fmt(Number(gercekText))}`,
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
      }
      await appendRecord<PersonalTx>(store, source, 'personal_tx', satir)
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
    <h3>Bakiye Düzeltmesi</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel}>✕</button>
    {/if}
  </div>

  <p class="satir">
    Hesaplanan bakiye:
    <b class="num" data-testid="hesaplanan" data-value={hesaplanan}>{fmt(hesaplanan)}</b>
  </p>

  <div class="field">
    <label for="b-gercek">{account.ad} hesabında gerçekte ne var?</label>
    <input id="b-gercek" type="number" step="0.01" inputmode="decimal" bind:value={gercekText} />
  </div>

  {#if fark !== null && fark !== 0}
    <p class="ozet">
      {account.ad} <b class="num">{fmt(Math.abs(fark))}</b>
      {fark > 0 ? 'artırılacak' : 'azaltılacak'}.
    </p>
  {/if}

  {#if error}
    <div class="alert-error">{error}</div>
  {/if}

  <div class="actions">
    {#if onCancel}
      <button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>Vazgeç</button>
    {/if}
    <button type="button" class="btn-primary" onclick={kaydet} disabled={saving}>
      {saving ? 'Kaydediliyor…' : 'Kaydet'}
    </button>
  </div>
</div>

<style>
  .form-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--text, #e6edf3);
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border, #30363d);
    padding-bottom: 0.75rem;
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

  .satir {
    margin: 0;
    font-size: 0.95rem;
    color: var(--muted, #8b949e);
  }

  .satir .num {
    color: var(--text, #e6edf3);
    margin-left: 0.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  label {
    font-size: 0.85rem;
    color: var(--muted, #8b949e);
  }

  input {
    background: var(--surface-2, #21262d);
    border: 1px solid var(--border, #30363d);
    color: var(--text, #e6edf3);
    padding: 0.55rem 0.7rem;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }

  input:focus {
    border-color: #58a6ff;
  }

  .ozet {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text, #e6edf3);
    background: rgba(56, 139, 253, 0.1);
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    border-left: 3px solid #388bfd;
  }

  .alert-error {
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .btn-primary {
    background: #238636;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2ea043;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border, #30363d);
    color: var(--text, #e6edf3);
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.05);
  }
</style>
