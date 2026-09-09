<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalAccount } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, updateRecord, deleteRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'

  let {
    dataset,
    source,
    store,
    editing,
    onSaved = () => {},
    onCancel,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    editing?: PersonalAccount
    onSaved?: () => void
    onCancel?: () => void
  } = $props()

  function slug(ad: string): string {
    const tr: Record<string, string> = {
      ç: 'C',
      Ç: 'C',
      ğ: 'G',
      Ğ: 'G',
      ı: 'I',
      I: 'I',
      İ: 'I',
      i: 'I',
      ö: 'O',
      Ö: 'O',
      ş: 'S',
      Ş: 'S',
      ü: 'U',
      Ü: 'U',
    }
    return ad
      .replace(/[çÇğĞıIİiöÖşŞüÜ]/g, (c) => tr[c] ?? c)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const takmaListe = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

  let ad = $state(editing?.ad ?? '')
  let tur = $state<'NAKIT' | 'BANKA' | 'KREDI_KARTI'>(editing?.tur ?? 'BANKA')
  let paraBirimi = $state<'TRY' | 'USD'>((editing?.paraBirimi as 'TRY' | 'USD') ?? 'TRY')
  let sahip = $state(editing?.sahip ?? 'ENIS')
  let simge = $state(editing?.simge ?? '')
  let takma = $state(editing?.takmaAdlar ? editing.takmaAdlar.join(', ') : '')
  let kesim = $state(editing?.hesapKesim !== undefined ? String(editing.hesapKesim) : '')
  let sonOdemeText = $state(editing?.sonOdeme !== undefined ? String(editing.sonOdeme) : '')
  let aktif = $state(editing?.aktif !== false)

  let saving = $state(false)
  let error = $state<string | null>(null)
  let silOnayi = $state(false)
  let pasiflestirTeklifi = $state(false)

  const people = $derived((dataset?.people ?? []).filter((p) => p.aktif !== false))

  const hareketSayisi = $derived(
    !editing
      ? 0
      : (dataset?.personalTx ?? []).filter(
          (r) => r.hesap === editing.kod || r.karsiHesap === editing.kod,
        ).length,
  )

  async function kaydet() {
    if (!ad.trim()) {
      error = 'Ad girilmeli.'
      return
    }
    if (!source || !store) return
    saving = true
    error = null
    try {
      if (editing) {
        // THE PRESERVATION RULE (spec §3.2): spread the original first so any
        // field this app does not know about — takmaAdlar today, whatever the
        // bot adds tomorrow — survives the round-trip.
        const patch = {
          ...editing,
          ad: ad.trim(),
          tur,
          paraBirimi,
          sahip,
          simge: simge.trim() || undefined,
          takmaAdlar: takmaListe(takma),
          hesapKesim: kesim === '' ? undefined : Number(kesim),
          sonOdeme: sonOdemeText === '' ? undefined : Number(sonOdemeText),
          aktif,
        }
        await updateRecord(
          store,
          source,
          'personal_accounts',
          (r: any) => r.kod === editing.kod,
          patch,
          { allowImported: true },
        )
      } else {
        const kod = slug(ad)
        if (!kod) {
          error = 'Geçerli bir ad girilmeli.'
          return
        }
        const accounts = dataset?.personalAccounts ?? []
        if (accounts.some((a) => a.kod === kod)) {
          error = 'Bu adla bir hesap zaten var.'
          return
        }
        await appendRecord(store, source, 'personal_accounts', {
          kod,
          ad: ad.trim(),
          tur,
          paraBirimi,
          sahip,
          aktif: true,
          takmaAdlar: takmaListe(takma),
          ...(simge.trim() ? { simge: simge.trim() } : {}),
          ...(kesim === '' ? {} : { hesapKesim: Number(kesim) }),
          ...(sonOdemeText === '' ? {} : { sonOdeme: Number(sonOdemeText) }),
        })
      }
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

  async function sil() {
    if (hareketSayisi > 0) {
      error = `Bu hesabın ${hareketSayisi} hareketi var — silmek yerine pasifleştirebilirsin.`
      pasiflestirTeklifi = true
      return
    }
    silOnayi = true
  }

  async function gercektenSil() {
    if (!editing || !source || !store) return
    saving = true
    error = null
    try {
      await deleteRecord(
        store,
        source,
        'personal_accounts',
        (r: any) => r.kod === editing.kod,
        { allowImported: true },
      )
      onSaved()
    } catch (e: any) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function pasiflestir() {
    if (!editing || !source || !store) return
    saving = true
    error = null
    try {
      const patch = {
        ...editing,
        aktif: false,
      }
      await updateRecord(
        store,
        source,
        'personal_accounts',
        (r: any) => r.kod === editing.kod,
        patch,
        { allowImported: true },
      )
      onSaved()
    } catch (e: any) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<div class="form-container">
  <div class="form-header">
    <h3>{editing ? 'Hesabı Düzenle' : 'Yeni Hesap Ekle'}</h3>
    {#if onCancel}
      <button type="button" class="btn-ghost" onclick={onCancel}>✕</button>
    {/if}
  </div>

  {#if error}
    <div class="alert-error">{error}</div>
  {/if}

  {#if silOnayi}
    <div class="confirm-box">
      <p><strong>{editing?.ad}</strong> hesabı tamamen silinecek. Emin misin?</p>
      <div class="actions">
        <button type="button" class="btn-secondary" onclick={() => (silOnayi = false)} disabled={saving}>
          Vazgeç
        </button>
        <button type="button" class="btn-danger" onclick={gercektenSil} disabled={saving}>
          {saving ? 'Siliniyor…' : 'Evet, Sil'}
        </button>
      </div>
    </div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); kaydet(); }}>
      <div class="row">
        <div class="field flex-2">
          <label for="h-ad">Hesap Adı</label>
          <input id="h-ad" aria-label="Hesap Adı" type="text" placeholder="örn. Garanti Maaş" bind:value={ad} />
        </div>

        <div class="field flex-1">
          <label for="h-kod">Kod</label>
          <input
            id="h-kod"
            aria-label="Kod"
            type="text"
            disabled={Boolean(editing)}
            value={editing ? editing.kod : slug(ad)}
          />
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label for="h-tur">Tür</label>
          <select id="h-tur" aria-label="Tür" bind:value={tur}>
            <option value="NAKIT">Nakit</option>
            <option value="BANKA">Banka Hesabı</option>
            <option value="KREDI_KARTI">Kredi Kartı</option>
          </select>
        </div>

        <div class="field">
          <label for="h-para">Para Birimi</label>
          <select id="h-para" aria-label="Para Birimi" bind:value={paraBirimi}>
            <option value="TRY">TRY (TL)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>

        <div class="field">
          <label for="h-sahip">Sahip</label>
          <select id="h-sahip" aria-label="Sahip" bind:value={sahip}>
            {#if people.length > 0}
              {#each people as p}
                <option value={p.kod}>{p.ad}</option>
              {/each}
            {:else}
              <option value="ENIS">Enis</option>
            {/if}
          </select>
        </div>
      </div>

      <div class="row">
        <div class="field flex-1">
          <label for="h-simge">Simge (Emoji veya kısaltma)</label>
          <input id="h-simge" aria-label="Simge" type="text" placeholder="örn. 🏦, 💳, 💵" bind:value={simge} />
        </div>
      </div>

      {#if tur === 'KREDI_KARTI'}
        <div class="row">
          <div class="field">
            <label for="h-kesim">Hesap Kesim Günü (1-31)</label>
            <input id="h-kesim" aria-label="Hesap Kesim Günü" type="number" min="1" max="31" bind:value={kesim} />
          </div>

          <div class="field">
            <label for="h-sonodeme">Son Ödeme Günü (1-31)</label>
            <input id="h-sonodeme" aria-label="Son Ödeme Günü" type="number" min="1" max="31" bind:value={sonOdemeText} />
          </div>
        </div>
      {/if}

      <div class="row">
        <div class="field">
          <label for="h-takma">Telegram'da bu hesabı çağırdığın isimler</label>
          <input
            id="h-takma"
            aria-label="Telegram'da bu hesabı çağırdığın isimler"
            type="text"
            placeholder="Virgülle ayır: diji, garanti diji, dijital"
            bind:value={takma}
          />
          <small class="helper-text">Virgülle ayır: diji, garanti diji, dijital</small>
        </div>
      </div>

      {#if editing}
        <div class="row checkbox-row">
          <label class="checkbox-label" for="h-aktif">
            <input id="h-aktif" type="checkbox" bind:checked={aktif} />
            <span>Hesap aktif</span>
          </label>
        </div>
      {/if}

      <div class="actions-bar">
        {#if editing}
          <div class="danger-actions">
            {#if pasiflestirTeklifi}
              <button type="button" class="btn-warning" onclick={pasiflestir} disabled={saving}>
                Pasifleştir
              </button>
            {:else}
              <button type="button" class="btn-danger-ghost" onclick={sil} disabled={saving}>
                Sil
              </button>
            {/if}
          </div>
        {/if}

        <div class="actions">
          {#if onCancel}
            <button type="button" class="btn-secondary" onclick={onCancel} disabled={saving}>Vazgeç</button>
          {/if}
          <button type="submit" class="btn-primary" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </form>
  {/if}
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

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .helper-text {
    font-size: 0.75rem;
    color: var(--muted, #8b949e);
  }

  .checkbox-row {
    align-items: center;
    padding-top: 0.25rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text, #e6edf3);
  }

  .checkbox-label input {
    width: auto;
  }

  .actions-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    margin-left: auto;
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

  .btn-danger {
    background: #da3633;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-danger:hover {
    background: #b62324;
  }

  .btn-danger-ghost {
    background: transparent;
    border: 1px solid rgba(248, 81, 73, 0.4);
    color: #f85149;
    padding: 0.5rem 0.85rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-danger-ghost:hover {
    background: rgba(248, 81, 73, 0.15);
  }

  .btn-warning {
    background: #d29922;
    color: #ffffff;
    border: none;
    padding: 0.5rem 0.85rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-warning:hover {
    background: #bb8009;
  }

  .confirm-box {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
    padding: 1rem;
    border-radius: 6px;
  }

  .confirm-box p {
    margin: 0;
  }
</style>
