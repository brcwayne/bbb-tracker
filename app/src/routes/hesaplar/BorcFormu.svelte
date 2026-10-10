<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Debt, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { newDebtId, newPersonalId } from '../../lib/data/ids'

  let {
    dataset,
    source,
    store,
    defaultYon = 'VERDIM',
    defaultKisi = '',
    defaultParaBirimi = 'TRY',
    onSaved,
    onCancel,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    defaultYon?: 'VERDIM' | 'ALDIM'
    defaultKisi?: string
    defaultParaBirimi?: 'TRY' | 'USD' | 'EUR'
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let yon = $state<'VERDIM' | 'ALDIM'>(defaultYon)
  // svelte-ignore state_referenced_locally
  let kisi = $state(defaultKisi)
  let tutarText = $state('')
  // svelte-ignore state_referenced_locally
  let paraBirimi = $state<'TRY' | 'USD' | 'EUR'>(defaultParaBirimi)
  let tarihText = $state(new Date().toISOString().slice(0, 10))
  let isDuzeltme = $state(true)
  let hesap = $state('DUZELTME')
  let aciklama = $state('')
  let sahip = $state('')

  let error = $state<string | null>(null)
  let saving = $state(false)

  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))
  const debts = $derived(dataset?.debts ?? [])

  const contactList = $derived.by(() => {
    const set = new Set<string>()
    for (const p of people) {
      if (p.ad) set.add(p.ad)
    }
    for (const d of debts) {
      if (d.kisi) set.add(d.kisi)
    }
    return Array.from(set)
  })

  const accounts = $derived(
    (dataset?.personalAccounts ?? []).filter((a) => a.aktif !== false),
  )

  const showSahip = $derived(people.length >= 2)

  $effect(() => {
    if (!sahip && people.length > 0) {
      sahip = people[0].kod
    }
  })

  function dogrula(): string | null {
    if (!kisi.trim()) return 'Kişi adı girilmeli.'
    const t = Number(tutarText)
    if (!Number.isFinite(t) || t <= 0) return "Geçerli bir tutar girin (0'dan büyük olmalı)."
    if (!tarihText) return 'Tarih seçilmeli.'
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
      const trimmedKisi = kisi.trim()
      const effectiveHesap = isDuzeltme
        ? (hesap || 'DUZELTME')
        : (hesap === 'DUZELTME' ? 'NAKIT' : hesap || 'NAKIT')

      const yeniBorc: Debt = {
        id: newDebtId(),
        tarih: tarihText,
        yon,
        kisi: trimmedKisi,
        tutar: Math.round(Number(tutarText) * 100) / 100,
        paraBirimi,
        aciklama:
          aciklama.trim() ||
          (yon === 'VERDIM' ? `${trimmedKisi}'e borç` : `${trimmedKisi}'den borç`),
        hesap: effectiveHesap,
        durum: 'ACIK',
        kapatanKayitlar: [],
        kaynak: 'manual',
        olusturulma: new Date().toISOString(),
        ...(showSahip && sahip ? { sahip } : {}),
      }

      await appendRecord<Debt>(store, source, 'debts', yeniBorc)

      // Eğer kullanıcı canlı işlem seçmişse (düzeltme DEĞİLSE) ve geçerli bir hesap seçilmişse,
      // hesap bakiyesini de günceller (personal_tx kaydı üretir):
      if (!isDuzeltme && effectiveHesap !== 'DUZELTME') {
        const tx: PersonalTx = {
          id: newPersonalId(),
          tarih: tarihText,
          tur: yon === 'VERDIM' ? 'GIDER' : 'GELIR',
          tutar: Math.round(Number(tutarText) * 100) / 100,
          paraBirimi,
          kategori: 'borc',
          aciklama:
            aciklama.trim() ||
            (yon === 'VERDIM'
              ? `${trimmedKisi}'e borç verme`
              : `${trimmedKisi}'den borç alma`),
          hesap: effectiveHesap,
          sahip: showSahip && sahip ? sahip : (people[0]?.kod || 'ENIS'),
          taksitPlaniId: null,
          taksitNo: null,
          taksitToplam: null,
          not: `Borç kaydı: ${yeniBorc.id}`,
          kaynak: 'manual',
          olusturulma: new Date().toISOString(),
        }
        await appendRecord<PersonalTx>(store, source, 'personal_tx', tx)
      }

      onSaved?.()
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        try {
          await load(store, source)
        } catch {}
        error = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — lütfen tekrar deneyin.'
      } else {
        error = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving = false
    }
  }
</script>

<div class="form-card">
  <div class="form-header">
    <h3 class="form-title">Yeni Borç / Alacak Ekle</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel} aria-label="Kapat">✕</button>
    {/if}
  </div>

  {#if error}
    <div class="alert-error" role="alert">{error}</div>
  {/if}

  <form
    onsubmit={(e) => {
      e.preventDefault()
      handleSubmit()
    }}
  >
    <!-- Yön (Tür) Seçimi: Alacak vs Borç -->
    <div class="field">
      <span class="label-text">İşlem Türü</span>
      <div class="type-toggle" role="radiogroup" aria-label="İşlem Türü">
        <button
          type="button"
          class="btn-toggle alacak"
          class:active={yon === 'VERDIM'}
          role="radio"
          aria-checked={yon === 'VERDIM'}
          onclick={() => (yon = 'VERDIM')}
        >
          <span class="toggle-icon">🟢</span>
          <span class="toggle-text">
            <strong>Alacak</strong>
            <small>Borç Verdim (Alacağım var)</small>
          </span>
        </button>
        <button
          type="button"
          class="btn-toggle borc"
          class:active={yon === 'ALDIM'}
          role="radio"
          aria-checked={yon === 'ALDIM'}
          onclick={() => (yon = 'ALDIM')}
        >
          <span class="toggle-icon">🔴</span>
          <span class="toggle-text">
            <strong>Borç</strong>
            <small>Borç Aldım (Geri ödeyeceğim)</small>
          </span>
        </button>
      </div>
    </div>

    <!-- Kişi Seçimi / Girişi -->
    <div class="field">
      <label for="bf-kisi">Kişi</label>
      <input
        id="bf-kisi"
        type="text"
        list="bf-kisi-listesi"
        bind:value={kisi}
        placeholder="Kişi seçin veya adını yazın (örn: Bora)"
        autocomplete="off"
      />
      <datalist id="bf-kisi-listesi">
        {#each contactList as c}
          <option value={c}></option>
        {/each}
      </datalist>
    </div>

    <!-- Tutar ve Para Birimi (TRY / USD / EUR) -->
    <div class="field">
      <span class="label-text">Tutar ve Para Birimi</span>
      <div class="amount-row">
        <input
          id="bf-tutar"
          type="number"
          step="0.01"
          bind:value={tutarText}
          placeholder="0.00"
          class="amount-input"
          aria-label="Tutar"
        />
        <div class="currency-pills" role="radiogroup" aria-label="Para Birimi">
          <button
            type="button"
            class="pill-btn"
            class:active={paraBirimi === 'TRY'}
            role="radio"
            aria-checked={paraBirimi === 'TRY'}
            onclick={() => (paraBirimi = 'TRY')}
          >
            ₺ TRY
          </button>
          <button
            type="button"
            class="pill-btn"
            class:active={paraBirimi === 'USD'}
            role="radio"
            aria-checked={paraBirimi === 'USD'}
            onclick={() => (paraBirimi = 'USD')}
          >
            $ USD
          </button>
          <button
            type="button"
            class="pill-btn"
            class:active={paraBirimi === 'EUR'}
            role="radio"
            aria-checked={paraBirimi === 'EUR'}
            onclick={() => (paraBirimi = 'EUR')}
          >
            € EUR
          </button>
        </div>
      </div>
    </div>

    <!-- Kayıt Türü: Düzeltme (Geçmiş Borç) vs Canlı İşlem -->
    <div class="field duzeltme-field">
      <label class="checkbox-container" for="bf-duzeltme">
        <input
          id="bf-duzeltme"
          type="checkbox"
          bind:checked={isDuzeltme}
          onchange={() => {
            if (isDuzeltme) hesap = 'DUZELTME'
            else if (hesap === 'DUZELTME') hesap = 'NAKIT'
          }}
        />
        <span class="checkbox-label">
          <strong>Geçmiş Borç / Düzeltme Kaydı</strong>
          <small class="muted-note">
            {isDuzeltme
              ? '✓ Hesap bakiyesini etkilemez (Mevcut banka/nakit bakiyenizden para düşülmez).'
              : '⚡ Canlı İşlem: Seçilen hesap bakiyesinden ' +
                (yon === 'VERDIM' ? 'para düşülür.' : 'para eklenir.')}
          </small>
        </span>
      </label>
    </div>

    <div class="row">
      <!-- Hesap -->
      <div class="field flex-1">
        <label for="bf-hesap">Hesap</label>
        <select id="bf-hesap" bind:value={hesap}>
          <option value="DUZELTME">Geçmiş / Düzeltme (Bakiye Etkilemez)</option>
          <option value="NAKIT">Nakit (Elden)</option>
          {#each accounts as a}
            {#if a.kod !== 'NAKIT'}
              <option value={a.kod}>{a.ad} ({a.paraBirimi})</option>
            {/if}
          {/each}
        </select>
      </div>

      <!-- Tarih -->
      <div class="field flex-1">
        <label for="bf-tarih">Tarih</label>
        <input id="bf-tarih" type="date" bind:value={tarihText} />
      </div>
    </div>

    {#if showSahip}
      <div class="field">
        <label for="bf-sahip">Kimin Parası (Sahip)</label>
        <select id="bf-sahip" bind:value={sahip}>
          {#each people as p}
            <option value={p.kod}>{p.ad}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Açıklama -->
    <div class="field">
      <label for="bf-aciklama">Açıklama (Opsiyonel)</label>
      <input
        id="bf-aciklama"
        type="text"
        bind:value={aciklama}
        placeholder={yon === 'VERDIM' ? 'Örn: Elden borç verdim' : 'Örn: Elden borç aldım'}
      />
    </div>

    <!-- Butonlar -->
    <div class="actions">
      {#if onCancel}
        <button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>
          Vazgeç
        </button>
      {/if}
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </div>
  </form>
</div>

<style>
  .form-card {
    background: var(--surface-1, #161b22);
    border: 1px solid var(--border, #30363d);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    max-width: 520px;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.1rem;
  }

  .form-title {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text, #e6edf3);
    margin: 0;
  }

  .btn-ghost {
    background: transparent;
    border: none;
    color: var(--muted, #8b949e);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    line-height: 1;
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
    margin-bottom: 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .row {
    display: flex;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .flex-1 {
    flex: 1;
  }

  label,
  .label-text {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--muted, #8b949e);
  }

  input[type='text'],
  input[type='number'],
  input[type='date'],
  select {
    background: var(--surface-2, #21262d);
    border: 1px solid var(--border, #30363d);
    color: var(--text, #e6edf3);
    padding: 0.55rem 0.7rem;
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

  /* Segmented Type Toggle (Alacak vs Borç) */
  .type-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .btn-toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--border, #30363d);
    background: var(--surface-2, #21262d);
    color: var(--muted, #8b949e);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .btn-toggle:hover {
    border-color: #484f58;
    background: rgba(255, 255, 255, 0.04);
  }

  .toggle-icon {
    font-size: 1.1rem;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
  }

  .toggle-text strong {
    font-size: 0.9rem;
    color: var(--text, #e6edf3);
  }

  .toggle-text small {
    font-size: 0.72rem;
    color: var(--muted, #8b949e);
  }

  .btn-toggle.alacak.active {
    border-color: #3fb950;
    background: rgba(46, 160, 67, 0.15);
  }

  .btn-toggle.alacak.active .toggle-text strong {
    color: #3fb950;
  }

  .btn-toggle.borc.active {
    border-color: #f85149;
    background: rgba(248, 81, 73, 0.15);
  }

  .btn-toggle.borc.active .toggle-text strong {
    color: #f85149;
  }

  /* Tutar & Para Birimi Satırı */
  .amount-row {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .amount-input {
    flex: 1;
    font-weight: 600;
    font-size: 1rem !important;
  }

  .currency-pills {
    display: flex;
    border: 1px solid var(--border, #30363d);
    border-radius: 6px;
    background: var(--surface-2, #21262d);
    overflow: hidden;
  }

  .pill-btn {
    border: none;
    background: transparent;
    color: var(--muted, #8b949e);
    padding: 0.45rem 0.65rem;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pill-btn:hover {
    color: var(--text, #e6edf3);
    background: rgba(255, 255, 255, 0.05);
  }

  .pill-btn.active {
    background: #388bfd;
    color: #ffffff;
    font-weight: 600;
  }

  /* Aksiyon butonları */
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
    padding: 0.55rem 1.15rem;
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
    padding: 0.55rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
  }

  .duzeltme-field {
    background: rgba(56, 139, 253, 0.08);
    border: 1px solid rgba(56, 139, 253, 0.25);
    border-radius: 8px;
    padding: 0.75rem 0.9rem;
  }

  .checkbox-container {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    cursor: pointer;
  }

  .checkbox-container input[type='checkbox'] {
    width: auto;
    margin-top: 0.2rem;
    cursor: pointer;
    accent-color: #388bfd;
  }

  .checkbox-label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .checkbox-label strong {
    font-size: 0.88rem;
    color: var(--text, #e6edf3);
  }

  .muted-note {
    font-size: 0.78rem;
    color: #58a6ff;
    line-height: 1.35;
  }

  @media (max-width: 480px) {
    .type-toggle {
      grid-template-columns: 1fr;
    }

    .row {
      flex-direction: column;
    }
  }
</style>
