<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx, Cashflow } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, updateRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { newPersonalId, newCashflowId } from '../../lib/data/ids'
  import { settings } from '../../lib/settings.svelte'

  let {
    dataset,
    source,
    store,
    editing,
    kaynakHesap,
    hedefHesap,
    tarih,
    baslik = 'Transfer',
    onSaved,
    onCancel,
  }: {
    dataset: Dataset
    source?: DataSource
    store?: Writable<AppState>
    editing?: PersonalTx
    kaynakHesap?: string
    hedefHesap?: string
    tarih?: string
    baslik?: string
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  let kaynak = $state(editing?.hesap ?? kaynakHesap ?? '')
  let hedef = $state(editing?.karsiHesap ?? hedefHesap ?? '')
  let tutarText = $state(editing ? String(editing.tutar) : '')
  let tarihText = $state(editing?.tarih ?? tarih ?? new Date().toISOString().slice(0, 10))
  let aciklama = $state(editing?.aciklama ?? '')

  let error = $state<string | null>(null)
  let saving = $state(false)

  const accounts = $derived(
    (dataset?.personalAccounts ?? []).filter((a) => a.aktif !== false),
  )
  const nakitAccounts = $derived(
    accounts.filter((a) => a.tur === 'NAKIT'),
  )
  const bankaAccounts = $derived(
    accounts.filter((a) => a.tur === 'BANKA'),
  )
  const kartAccounts = $derived(
    accounts.filter((a) => a.tur === 'KREDI_KARTI'),
  )
  const otherAccounts = $derived(
    accounts.filter((a) => a.tur !== 'NAKIT' && a.tur !== 'BANKA' && a.tur !== 'KREDI_KARTI'),
  )
  const brokers = $derived(
    (dataset?.brokers ?? []).filter((b) => b.aktif !== false),
  )

  function isBroker(kod: string): boolean {
    return brokers.some((b) => b.kod === kod)
  }

  function accName(kod: string): string {
    const acc = accounts.find((a) => a.kod === kod)
    if (acc) return acc.ad
    const brk = brokers.find((b) => b.kod === kod)
    if (brk) return brk.ad
    return kod
  }

  function dogrula(): string | null {
    if (!kaynak || !hedef) return 'Kaynak ve hedef hesap seçilmeli.'
    if (kaynak === hedef) return 'Kaynak ve hedef aynı hesap olamaz.'
    const t = Number(tutarText)
    if (!Number.isFinite(t) || t <= 0) return 'Tutar sıfırdan büyük olmalı.'

    const kIsBroker = isBroker(kaynak)
    const hIsBroker = isBroker(hedef)
    if (kIsBroker && hIsBroker) {
      return 'Yatırım kurumları arası nakit transferi için Yatırım > Nakit Hareketi formunu kullanın.'
    }

    if (!kIsBroker && !hIsBroker) {
      const k = accounts.find((a) => a.kod === kaynak)
      const h = accounts.find((a) => a.kod === hedef)
      if (k && h && k.paraBirimi !== h.paraBirimi)
        return 'İki hesabın para birimi farklı — bu transfer tek satırla yazılamaz.'
    }
    return null
  }

  async function handleSubmit() {
    error = null
    const err = dogrula()
    if (err) {
      error = err
      return
    }
    if (!source || !store) return
    saving = true
    try {
      if (editing) {
        const patch: PersonalTx = {
          ...editing,
          tarih: tarihText,
          tutar: Number(tutarText),
          hesap: kaynak,
          karsiHesap: hedef,
          aciklama: aciklama.trim() || `${accName(kaynak)} → ${accName(hedef)}`,
        }
        await updateRecord<PersonalTx>(store, source, 'personal_tx', (r) => r.id === editing!.id, patch, {
          allowKaynak: ['telegram', 'manual'],
        })
      } else {
        const kIsBroker = isBroker(kaynak)
        const hIsBroker = isBroker(hedef)
        const owner =
          (!kIsBroker ? accounts.find((a) => a.kod === kaynak)?.sahip : null) ??
          (!hIsBroker ? accounts.find((a) => a.kod === hedef)?.sahip : null) ??
          'ENIS'
        const currency =
          (!kIsBroker ? accounts.find((a) => a.kod === kaynak)?.paraBirimi : null) ??
          (!hIsBroker ? accounts.find((a) => a.kod === hedef)?.paraBirimi : null) ??
          'TRY'

        const satir: PersonalTx = {
          id: newPersonalId(),
          tarih: tarihText,
          tur: 'TRANSFER',
          tutar: Number(tutarText),
          paraBirimi: currency as 'TRY' | 'USD' | 'EUR',
          kategori: 'transfer',
          aciklama: aciklama.trim() || `${accName(kaynak)} → ${accName(hedef)}`,
          hesap: kaynak,
          karsiHesap: hedef,
          sahip: owner,
          taksitPlaniId: null,
          taksitNo: null,
          taksitToplam: null,
          not: '',
          kaynak: 'manual',
          olusturulma: new Date().toISOString(),
        }
        await appendRecord<PersonalTx>(store, source, 'personal_tx', satir)

        // Köprü transfer: Harcama hesabı <-> Yatırım kurumu
        if (!kIsBroker && hIsBroker) {
          // Sermaye girişi (YATIRMA)
          const tutarVal = Number(tutarText)
          const rate = settings.rate && settings.rate > 0 ? settings.rate : 1
          const cf: Cashflow = {
            id: newCashflowId(),
            tarih: tarihText,
            hesap: hedef,
            portfoy: null,
            tur: 'YATIRMA',
            enstruman: null,
            tutar_tl: currency === 'TRY' ? tutarVal : null,
            kur: currency === 'TRY' ? rate : null,
            tutar_usd: currency === 'USD' ? tutarVal : Number((tutarVal / rate).toFixed(2)),
            aciklama: aciklama.trim() || `${accName(kaynak)} → ${accName(hedef)}`,
            kaynak: 'manual',
          }
          await appendRecord<Cashflow>(store, source, 'cashflows', cf)
        } else if (kIsBroker && !hIsBroker) {
          // Sermaye çıkışı (ÇEKME)
          const tutarVal = Number(tutarText)
          const rate = settings.rate && settings.rate > 0 ? settings.rate : 1
          const cf: Cashflow = {
            id: newCashflowId(),
            tarih: tarihText,
            hesap: kaynak,
            portfoy: null,
            tur: 'CEKME',
            enstruman: null,
            tutar_tl: currency === 'TRY' ? tutarVal : null,
            kur: currency === 'TRY' ? rate : null,
            tutar_usd: currency === 'USD' ? tutarVal : Number((tutarVal / rate).toFixed(2)),
            aciklama: aciklama.trim() || `${accName(kaynak)} → ${accName(hedef)}`,
            kaynak: 'manual',
          }
          await appendRecord<Cashflow>(store, source, 'cashflows', cf)
        }
      }
      onSaved?.()
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
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
    <h3>{baslik}</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel}>✕</button>
    {/if}
  </div>

  {#if error}
    <div class="alert-error">{error}</div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <div class="row">
      <div class="field">
        <label for="t-kaynak">Kaynak Hesap</label>
        <select id="t-kaynak" aria-label="Kaynak Hesap" bind:value={kaynak}>
          <option value="">Seçiniz</option>
          {#if nakitAccounts.length > 0}
            <optgroup label="── 💵 Nakit Hesapları ──">
              {#each nakitAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if bankaAccounts.length > 0}
            <optgroup label="── 🏦 Banka Hesapları ──">
              {#each bankaAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.banka ? `[${a.banka}] ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if kartAccounts.length > 0}
            <optgroup label="── 💳 Kredi Kartları ──">
              {#each kartAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if otherAccounts.length > 0}
            <optgroup label="── Diğer Hesaplar ──">
              {#each otherAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if brokers.length > 0}
            <optgroup label="── 📈 Yatırım Hesapları (Aracı Kurumlar) ──">
              {#each brokers as b}
                <option value={b.kod}>📈 {b.ad}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </div>

      <div class="field">
        <label for="t-hedef">Hedef Hesap</label>
        <select id="t-hedef" aria-label="Hedef Hesap" bind:value={hedef}>
          <option value="">Seçiniz</option>
          {#if nakitAccounts.length > 0}
            <optgroup label="── 💵 Nakit Hesapları ──">
              {#each nakitAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if bankaAccounts.length > 0}
            <optgroup label="── 🏦 Banka Hesapları ──">
              {#each bankaAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.banka ? `[${a.banka}] ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if kartAccounts.length > 0}
            <optgroup label="── 💳 Kredi Kartları ──">
              {#each kartAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if otherAccounts.length > 0}
            <optgroup label="── Diğer Hesaplar ──">
              {#each otherAccounts as a}
                <option value={a.kod}>{a.simge ? `${a.simge} ` : ''}{a.ad} ({a.paraBirimi})</option>
              {/each}
            </optgroup>
          {/if}
          {#if brokers.length > 0}
            <optgroup label="── 📈 Yatırım Hesapları (Aracı Kurumlar) ──">
              {#each brokers as b}
                <option value={b.kod}>📈 {b.ad}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </div>
    </div>

    {#if isBroker(kaynak) || isBroker(hedef)}
      <div class="alert-info">
        📈 <strong>Köprü Transfer:</strong>
        {#if isBroker(hedef)}
          <span><strong>{accName(hedef)}</strong> yatırım hesabınıza otomatik <em>sermaye girişi (YATIRMA)</em> kaydı eklenecektir.</span>
        {:else}
          <span><strong>{accName(kaynak)}</strong> yatırım hesabınızdan otomatik <em>sermaye çıkışı (ÇEKME)</em> kaydı eklenecektir.</span>
        {/if}
      </div>
    {/if}

    <div class="row">
      <div class="field flex-2">
        <label for="t-tutar">Tutar</label>
        <input
          id="t-tutar"
          aria-label="Tutar"
          type="number"
          step="0.01"
          placeholder="0.00"
          bind:value={tutarText}
        />
      </div>

      <div class="field flex-1">
        <label for="t-tarih">Tarih</label>
        <input id="t-tarih" aria-label="Tarih" type="date" bind:value={tarihText} />
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label for="t-aciklama">Açıklama (İsteğe bağlı)</label>
        <input
          id="t-aciklama"
          aria-label="Açıklama"
          type="text"
          placeholder={`${accName(kaynak) || 'Kaynak'} → ${accName(hedef) || 'Hedef'}`}
          bind:value={aciklama}
        />
      </div>
    </div>

    <div class="actions">
      {#if onCancel}
        <button type="button" class="btn-secondary" onclick={onCancel}>Vazgeç</button>
      {/if}
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Kaydediliyor...' : 'Kaydet'}
      </button>
    </div>
  </form>
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

  .alert-error {
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .alert-info {
    background: rgba(56, 139, 253, 0.12);
    border: 1px solid rgba(56, 139, 253, 0.35);
    color: #58a6ff;
    padding: 0.65rem 0.85rem;
    border-radius: 6px;
    font-size: 0.85rem;
    line-height: 1.4;
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

  .flex-1 {
    flex: 1;
  }

  .flex-2 {
    flex: 2;
  }

  label {
    font-size: 0.8rem;
    color: var(--muted, #8b949e);
  }

  input,
  select {
    background: var(--surface-2, #21262d);
    border: 1px solid var(--border, #30363d);
    color: var(--text, #e6edf3);
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font-size: 0.9rem;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }

  input:focus,
  select:focus {
    border-color: #58a6ff;
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
