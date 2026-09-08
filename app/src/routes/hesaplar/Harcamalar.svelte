<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { deleteRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import HarcamaFormu from './HarcamaFormu.svelte'

  let {
    dataset,
    source,
    store,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    today?: string
  } = $props()

  let fKategori = $state('')
  let fSahip = $state('')
  let fHesap = $state('')
  let qArama = $state('')

  let showAdd = $state(false)
  let editing = $state<PersonalTx | null>(null)
  let deleteTarget = $state<PersonalTx | null>(null)
  let deleting = $state(false)
  let deleteError = $state<string | null>(null)

  const isDrive = $derived(Boolean(source?.save))

  type SortCol = 'tarih' | 'kategori' | 'aciklama' | 'tutar' | 'taksit' | 'hesap' | 'sahip'
  let sortCol = $state<SortCol>('tarih')
  let sortDir = $state<'asc' | 'desc'>('desc')

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      sortCol = col
      sortDir = col === 'tarih' || col === 'tutar' ? 'desc' : 'asc'
    }
  }

  const allRows = $derived<PersonalTx[]>(
    dataset?.personal_tx !== undefined ? dataset.personal_tx : dataset?.personalTx ?? [],
  )
  const categories = $derived(dataset?.categories ?? [])
  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod

  const distinctKategori = $derived([...new Set(allRows.map((r) => r.kategori))].sort())
  const distinctSahip = $derived([...new Set(allRows.map((r) => r.sahip))].sort())
  const distinctHesap = $derived([...new Set(allRows.map((r) => r.hesap))].sort())

  const filteredRows = $derived.by(() => {
    return allRows
      .filter((r) => {
        if (fKategori && r.kategori !== fKategori) return false
        if (fSahip && r.sahip !== fSahip) return false
        if (fHesap && r.hesap !== fHesap) return false
        if (qArama.trim()) {
          const q = qArama.toLowerCase().trim()
          const inDesc = r.aciklama.toLowerCase().includes(q)
          const inNote = r.not?.toLowerCase().includes(q)
          if (!inDesc && !inNote) return false
        }
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortCol === 'tarih') {
          cmp = a.tarih.localeCompare(b.tarih)
        } else if (sortCol === 'kategori') {
          cmp = catName(a.kategori).localeCompare(catName(b.kategori))
        } else if (sortCol === 'aciklama') {
          cmp = a.aciklama.localeCompare(b.aciklama)
        } else if (sortCol === 'tutar') {
          cmp = a.tutar - b.tutar
        } else if (sortCol === 'taksit') {
          const tA = a.taksitNo ?? 0
          const tB = b.taksitNo ?? 0
          cmp = tA - tB
        } else if (sortCol === 'hesap') {
          cmp = a.hesap.localeCompare(b.hesap)
        } else if (sortCol === 'sahip') {
          cmp = a.sahip.localeCompare(b.sahip)
        }
        if (cmp === 0) {
          cmp = b.id.localeCompare(a.id)
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
  })

  function onFormSaved() {
    showAdd = false
    editing = null
  }

  async function confirmDelete() {
    if (!deleteTarget || !source || !store) return
    deleting = true
    deleteError = null
    try {
      await deleteRecord<PersonalTx>(store, source, 'personal_tx', (r) => r.id === deleteTarget!.id, {
        allowKaynak: ['telegram', 'manual'],
      })
      deleteTarget = null
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
        deleteError = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?'
      } else {
        deleteError = e instanceof Error ? e.message : String(e)
      }
    } finally {
      deleting = false
    }
  }
</script>

{#if allRows.length === 0}
  <div class="empty-container">
    <EmptyState
      title="Henüz kayıt yok"
      detail="Telegram botundan harcama girdikçe burası dolacak. Örnek: markette 340 lira"
    />
  </div>
{:else}
  <div class="page-container">
    <!-- Üst Eylem Çubuğu -->
    <div class="top-bar">
      <div class="left-actions">
        <button
          type="button"
          class="btn-add"
          disabled={!isDrive}
          title={!isDrive ? 'Düzenleme için Drive bağlantısı gerekiyor' : ''}
          onclick={() => { showAdd = true; editing = null; }}
        >
          + Harcama Ekle
        </button>
        {#if !isDrive}
          <span class="drive-notice">Düzenleme için Drive bağlantısı gerekiyor</span>
        {/if}
      </div>

      <div class="row-count num">
        {filteredRows.length} kayıt
      </div>
    </div>

    <!-- Ekleme / Düzenleme Formu -->
    {#if (showAdd || editing) && dataset}
      <div class="form-modal">
        <HarcamaFormu
          {dataset}
          {source}
          {store}
          editing={editing ?? undefined}
          onSaved={onFormSaved}
          onCancel={() => { showAdd = false; editing = null; }}
        />
      </div>
    {/if}

    <!-- Silme Onayı -->
    {#if deleteTarget}
      <div class="confirm-delete">
        <p>
          <strong>{deleteTarget.tarih} · {deleteTarget.aciklama} ({deleteTarget.paraBirimi === 'USD' ? usd(deleteTarget.tutar) : tryFmt(deleteTarget.tutar)} {deleteTarget.paraBirimi})</strong>
          kaydı silinsin mi?
        </p>
        {#if deleteError}
          <p class="error">{deleteError}</p>
        {/if}
        <div class="confirm-actions">
          <button type="button" class="btn-secondary" onclick={() => (deleteTarget = null)} disabled={deleting}>
            Vazgeç
          </button>
          <button type="button" class="btn-danger" onclick={confirmDelete} disabled={deleting}>
            {deleting ? 'Siliniyor…' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Filtreler -->
    <div class="filters">
      <div class="filter-item">
        <label for="f-kategori">Kategori</label>
        <select id="f-kategori" aria-label="Kategori" bind:value={fKategori}>
          <option value="">(Tümü)</option>
          {#each distinctKategori as k}
            <option value={k}>{catName(k)}</option>
          {/each}
        </select>
      </div>

      <div class="filter-item">
        <label for="f-sahip">Sahip</label>
        <select id="f-sahip" aria-label="Sahip" bind:value={fSahip}>
          <option value="">(Tümü)</option>
          {#each distinctSahip as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>

      <div class="filter-item">
        <label for="f-hesap">Hesap</label>
        <select id="f-hesap" aria-label="Hesap" bind:value={fHesap}>
          <option value="">(Tümü)</option>
          {#each distinctHesap as h}
            <option value={h}>{h}</option>
          {/each}
        </select>
      </div>

      <div class="filter-item search-item">
        <label for="q-arama">Arama</label>
        <input
          id="q-arama"
          type="search"
          placeholder="Açıklamada ara…"
          aria-label="Ara"
          bind:value={qArama}
        />
      </div>
    </div>

    <!-- Harcamalar Tablosu -->
    {#if filteredRows.length === 0}
      <div class="no-results">
        <p>Seçilen filtrelere uygun harcama kaydı bulunamadı.</p>
      </div>
    {:else}
      <div class="table-container">
        <div class="dt-wrap">
          <table>
            <thead>
              <tr>
                <th class="sortable" onclick={() => toggleSort('tarih')}>
                  Tarih {sortCol === 'tarih' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="sortable" onclick={() => toggleSort('kategori')}>
                  Kategori {sortCol === 'kategori' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="sortable" onclick={() => toggleSort('aciklama')}>
                  Açıklama {sortCol === 'aciklama' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="sortable r" onclick={() => toggleSort('tutar')}>
                  Tutar {sortCol === 'tutar' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="sortable r" onclick={() => toggleSort('taksit')}>
                  Taksit {sortCol === 'taksit' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="sortable" onclick={() => toggleSort('hesap')}>
                  Hesap {sortCol === 'hesap' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="sortable" onclick={() => toggleSort('sahip')}>
                  Sahip {sortCol === 'sahip' ? (sortDir === 'asc' ? '▴' : '▾') : ''}
                </th>
                <th class="center" aria-label="İşlemler">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredRows as r (r.id)}
                {@const isFuture = r.tarih > today}
                <tr class:editing-row={editing?.id === r.id}>
                  <td data-col="tarih" class="nowrap">
                    {r.tarih}
                    {#if isFuture}
                      <span class="future-marker" title="Gelecek taksit">Gelecek</span>
                    {/if}
                  </td>
                  <td data-col="kategori">{catName(r.kategori)}</td>
                  <td data-col="aciklama">{r.aciklama}</td>
                  <td data-col="tutar" class="num r" class:pos={r.tur === 'GELIR'}>
                    {r.tur === 'GELIR' ? '+' : ''}{r.paraBirimi === 'USD' ? usd(r.tutar) : tryFmt(r.tutar)} {r.paraBirimi}
                  </td>
                  <td data-col="taksit" class="r">
                    {#if r.taksitPlaniId && r.taksitNo != null && r.taksitToplam != null}
                      {r.taksitNo}/{r.taksitToplam}
                    {:else}
                      —
                    {/if}
                  </td>
                  <td data-col="hesap">{r.hesap}</td>
                  <td data-col="sahip">{r.sahip}</td>
                  <td data-col="islemler" class="center act">
                    <button
                      type="button"
                      class="btn-icon"
                      title="Düzenle"
                      aria-label="Düzenle"
                      disabled={!isDrive}
                      onclick={() => { editing = r; showAdd = false; }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      class="btn-icon danger"
                      title="Sil"
                      aria-label="Sil"
                      disabled={!isDrive}
                      onclick={() => { deleteTarget = r; }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .empty-container {
    padding: 3rem 1rem;
  }
  .page-container {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .left-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .btn-add {
    background: var(--accent-defter, #c9a86a);
    color: #121212;
    border: none;
    border-radius: 4px;
    padding: 0.45rem 0.95rem;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .drive-notice {
    font-size: 0.8rem;
    color: var(--ink-soft);
    font-style: italic;
  }
  .form-modal {
    margin-bottom: 0.5rem;
  }
  .confirm-delete {
    background: rgba(224, 86, 96, 0.12);
    border: 1px solid var(--loss);
    border-radius: 6px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .confirm-delete p {
    margin: 0;
    color: var(--ink);
    font-size: 0.9rem;
  }
  .confirm-actions {
    display: flex;
    gap: 0.6rem;
  }
  .btn-secondary {
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn-danger {
    background: var(--loss);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .error {
    color: var(--loss);
    font-size: 0.82rem;
  }
  .filters {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
    background: var(--surface);
    padding: 0.85rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--hairline);
  }
  .filter-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .filter-item label {
    font-size: 0.75rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .filter-item select,
  .filter-item input {
    background: var(--surface-2);
    color: var(--ink);
    border: 1px solid var(--hairline);
    padding: 0.35rem 0.6rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .filter-item select:focus,
  .filter-item input:focus {
    outline: 2px solid var(--accent-defter);
    outline-offset: 1px;
  }
  .search-item {
    flex-grow: 1;
    min-width: 160px;
  }
  .row-count {
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .table-container {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    overflow: hidden;
  }
  .dt-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--ink);
  }
  th,
  td {
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid var(--hairline);
    text-align: left;
    font-size: 0.86rem;
  }
  th {
    background: var(--surface-2);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--ink-soft);
    user-select: none;
  }
  th.sortable {
    cursor: pointer;
  }
  th.sortable:hover {
    color: var(--ink);
  }
  th.r,
  td.r {
    text-align: right;
  }
  th.center,
  td.center {
    text-align: center;
  }
  tr.editing-row {
    background: rgba(201, 168, 106, 0.08);
  }
  .nowrap {
    white-space: nowrap;
  }
  .pos {
    color: var(--gain, #38a169);
  }
  .act {
    white-space: nowrap;
  }
  .btn-icon {
    background: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    color: var(--ink-soft);
    padding: 0.2rem 0.45rem;
    font-size: 0.85rem;
    cursor: pointer;
    margin: 0 0.15rem;
  }
  .btn-icon:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--ink);
  }
  .btn-icon.danger:hover:not(:disabled) {
    background: rgba(224, 86, 96, 0.15);
    color: var(--loss);
    border-color: var(--loss);
  }
  .btn-icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .no-results {
    padding: 2rem;
    text-align: center;
    color: var(--ink-soft);
  }
  .future-marker {
    display: inline-block;
    font-size: 0.68rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: rgba(201, 168, 106, 0.15);
    color: var(--gold);
    border: 1px solid rgba(201, 168, 106, 0.3);
    margin-left: 0.4rem;
    vertical-align: middle;
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
</style>
