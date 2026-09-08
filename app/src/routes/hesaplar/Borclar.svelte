<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Debt } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { updateRecord, deleteRecord } from '../../lib/data/store'
  import { debtBalances } from '../../lib/data/personal'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    source,
    store,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
  } = $props()

  const isDrive = $derived(Boolean(source?.save))
  const allDebts = $derived<Debt[]>(dataset?.debts ?? [])
  const people = $derived(dataset?.people ?? [])
  const personName = (kod: string) => people.find((p) => p.kod === kod)?.ad ?? kod

  const balances = $derived(debtBalances(allDebts))
  const openDebts = $derived(allDebts.filter((d) => d.durum === 'ACIK'))
  const fmtAmount = (n: number, curr: string) => (curr === 'USD' ? usd(n) : tryFmt(n))

  let editingDebt = $state<Debt | null>(null)
  let editAmount = $state('')
  let editAciklama = $state('')
  let editSaving = $state(false)
  let editError = $state<string | null>(null)

  let deletingDebt = $state<Debt | null>(null)
  let deleting = $state(false)
  let deleteError = $state<string | null>(null)

  let closingId = $state<string | null>(null)
  let closeError = $state<string | null>(null)

  async function closeDebt(debt: Debt) {
    if (!store || !source) return
    closingId = debt.id
    closeError = null
    try {
      await updateRecord<Debt>(
        store,
        source,
        'debts',
        (d) => d.id === debt.id,
        { ...debt, durum: 'KAPALI' },
        { allowKaynak: ['telegram', 'manual'] },
      )
    } catch (err: any) {
      closeError = err?.message || 'Borç kapatılırken hata oluştu'
    } finally {
      closingId = null
    }
  }

  function startEdit(debt: Debt) {
    editingDebt = debt
    editAmount = String(debt.tutar)
    editAciklama = debt.aciklama
    editError = null
  }

  async function saveEdit() {
    if (!editingDebt || !store || !source) return
    const num = Number(editAmount)
    if (isNaN(num) || num <= 0) {
      editError = 'Geçerli bir tutar girin'
      return
    }
    editSaving = true
    editError = null
    try {
      await updateRecord<Debt>(
        store,
        source,
        'debts',
        (d) => d.id === editingDebt!.id,
        {
          ...editingDebt,
          tutar: num,
          aciklama: editAciklama.trim(),
        },
        { allowKaynak: ['telegram', 'manual'] },
      )
      editingDebt = null
    } catch (err: any) {
      editError = err?.message || 'Borç güncellenirken hata oluştu'
    } finally {
      editSaving = false
    }
  }

  async function confirmDelete() {
    if (!deletingDebt || !store || !source) return
    deleting = true
    deleteError = null
    try {
      await deleteRecord<Debt>(
        store,
        source,
        'debts',
        (d) => d.id === deletingDebt!.id,
        { allowKaynak: ['telegram', 'manual'] },
      )
      deletingDebt = null
    } catch (err: any) {
      deleteError = err?.message || 'Borç silinirken hata oluştu'
    } finally {
      deleting = false
    }
  }
</script>

{#if balances.length === 0 && openDebts.length === 0}
  <div class="empty-container">
    <EmptyState
      title="Henüz açık borç yok"
      detail="Telegram botundan borç veya alacak girdikçe bakiyeler burada listelenecek."
    />
  </div>
{:else}
  <div class="page-container">
    {#if !isDrive}
      <div class="offline-note">
        <span>Düzenleme için Drive bağlantısı gerekiyor (yerel kaynakta sadece okuma yapılır).</span>
      </div>
    {/if}

    {#if closeError}
      <div class="error-banner">{closeError}</div>
    {/if}

    <!-- Borç ve Alacak Bakiyeleri -->
    {#if balances.length > 0}
      <section class="section-card">
        <h3 class="section-title">Borç ve Alacak Bakiyeleri ({balances.length})</h3>
        <div class="balances-grid">
          {#each balances as b}
            {@const isAlacakNet = b.net > 0}
            {@const isBorcNet = b.net < 0}
            <div class="balance-card">
              <div class="card-top">
                <span class="person-name">{personName(b.kisi)}</span>
                <span class="currency-tag">{b.para}</span>
              </div>

              <div class="figures-row">
                <div class="figure-item">
                  <span class="fig-label">Alacak</span>
                  <span class="fig-val num alacak gain">{fmtAmount(b.alacak, b.para)}</span>
                </div>
                <div class="figure-item">
                  <span class="fig-label">Borç</span>
                  <span class="fig-val num borc loss">{fmtAmount(b.borc, b.para)}</span>
                </div>
                <div class="figure-item net-item">
                  <span class="fig-label">Net Durum</span>
                  <span
                    class="fig-val num net"
                    class:gain={isAlacakNet}
                    class:loss={isBorcNet}
                  >
                    {isAlacakNet ? '+' : ''}{fmtAmount(b.net, b.para)}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Açık Borç ve Alacak Kayıtları -->
    <section class="section-card">
      <h3 class="section-title">Açık Kayıtlar ({openDebts.length})</h3>
      {#if openDebts.length === 0}
        <p class="empty-hint">Açık kayıt bulunmuyor.</p>
      {:else}
        <div class="table-wrap">
          <table class="debts-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kişi</th>
                <th>Tür</th>
                <th>Tutar</th>
                <th>Açıklama</th>
                <th>Hesap</th>
                <th class="actions-th">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {#each openDebts as d}
                {@const isAlacak = d.yon === 'VERDIM'}
                <tr data-debt-row data-debt-id={d.id}>
                  <td class="num muted">{d.tarih}</td>
                  <td><strong>{personName(d.kisi)}</strong></td>
                  <td>
                    <span class="badge" class:gain={isAlacak} class:loss={!isAlacak}>
                      {isAlacak ? 'Alacak' : 'Borç'}
                    </span>
                  </td>
                  <td class="num" class:gain={isAlacak} class:loss={!isAlacak}>
                    {fmtAmount(d.tutar, d.paraBirimi)}
                  </td>
                  <td>{d.aciklama}</td>
                  <td class="muted">{d.hesap}</td>
                  <td class="actions-cell">
                    <button
                      type="button"
                      class="btn-action"
                      disabled={!isDrive || closingId === d.id}
                      title={!isDrive ? 'Düzenleme için Drive bağlantısı gerekiyor' : 'Borcu Kapat'}
                      onclick={() => closeDebt(d)}
                    >
                      {closingId === d.id ? '…' : 'Kapat'}
                    </button>
                    <button
                      type="button"
                      class="btn-action"
                      disabled={!isDrive}
                      title={!isDrive ? 'Düzenleme için Drive bağlantısı gerekiyor' : 'Düzenle'}
                      onclick={() => startEdit(d)}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      class="btn-action btn-del"
                      disabled={!isDrive}
                      title={!isDrive ? 'Düzenleme için Drive bağlantısı gerekiyor' : 'Sil'}
                      onclick={() => { deletingDebt = d; deleteError = null }}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
{/if}

<!-- Düzenleme Modalı -->
{#if editingDebt}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
    <div class="modal-card">
      <h4 id="edit-modal-title" class="modal-title">Borç / Alacak Düzenle</h4>
      <div class="form-body">
        <div class="field">
          <label for="edit-tutar">Tutar ({editingDebt.paraBirimi})</label>
          <input
            id="edit-tutar"
            type="number"
            step="0.01"
            min="0.01"
            bind:value={editAmount}
            required
          />
        </div>
        <div class="field">
          <label for="edit-aciklama">Açıklama</label>
          <input
            id="edit-aciklama"
            type="text"
            bind:value={editAciklama}
          />
        </div>
        {#if editError}
          <p class="error-msg">{editError}</p>
        {/if}
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-vazgec"
          disabled={editSaving}
          onclick={() => { editingDebt = null; editError = null }}
        >
          Vazgeç
        </button>
        <button
          type="button"
          class="btn-save"
          disabled={editSaving}
          onclick={saveEdit}
        >
          {editSaving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Silme Onay Modalı -->
{#if deletingDebt}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-card">
      <h4 class="modal-title">Kaydı Sil</h4>
      <p class="confirm-msg">
        <strong>{personName(deletingDebt.kisi)}</strong> kişisine ait {fmtAmount(deletingDebt.tutar, deletingDebt.paraBirimi)} tutarındaki kayıt silinecek. Onaylıyor musunuz?
      </p>
      {#if deleteError}
        <p class="error-msg">{deleteError}</p>
      {/if}
      <div class="modal-actions">
        <button
          type="button"
          class="btn-vazgec"
          disabled={deleting}
          onclick={() => { deletingDebt = null; deleteError = null }}
        >
          Vazgeç
        </button>
        <button
          type="button"
          class="btn-confirm-delete"
          disabled={deleting}
          onclick={confirmDelete}
        >
          {deleting ? 'Siliniyor…' : 'Evet, Sil'}
        </button>
      </div>
    </div>
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
    gap: 1.25rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  .offline-note {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--loss);
    color: var(--loss);
    padding: 0.6rem 0.85rem;
    border-radius: 6px;
    font-size: 0.82rem;
  }
  .section-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.1rem 1.25rem;
  }
  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: var(--ink-soft);
  }
  .empty-hint {
    font-size: 0.85rem;
    color: var(--ink-soft);
    margin: 0;
  }
  .balances-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
  .balance-card {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .person-name {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--ink);
  }
  .currency-tag {
    font-size: 0.75rem;
    background: var(--surface);
    color: var(--ink-soft);
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    border: 1px solid var(--hairline);
  }
  .figures-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .figure-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .fig-label {
    font-size: 0.72rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .fig-val {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .gain {
    color: var(--gain);
  }
  .loss {
    color: var(--loss);
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--ink-soft);
    font-size: 0.82rem;
  }
  .table-wrap {
    overflow-x: auto;
  }
  .debts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .debts-table th {
    text-align: left;
    padding: 0.5rem 0.6rem;
    color: var(--ink-soft);
    border-bottom: 1px solid var(--hairline);
    font-weight: 500;
    font-size: 0.78rem;
  }
  .debts-table td {
    padding: 0.6rem;
    border-bottom: 1px solid var(--hairline);
    color: var(--ink);
  }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--surface-2);
  }
  .actions-th {
    text-align: right;
  }
  .actions-cell {
    text-align: right;
    white-space: nowrap;
  }
  .btn-action {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.25rem 0.55rem;
    border-radius: 4px;
    font-size: 0.78rem;
    cursor: pointer;
    margin-left: 0.25rem;
    transition: all 0.15s ease;
  }
  .btn-action:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--accent-defter);
  }
  .btn-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-del:hover:not(:disabled) {
    border-color: var(--loss);
    color: var(--loss);
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }
  .modal-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.25rem;
    max-width: 420px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
  }
  .form-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .field label {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .field input {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    border-radius: 4px;
    padding: 0.45rem 0.6rem;
    font-size: 0.9rem;
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent-defter);
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .btn-vazgec {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.4rem 0.8rem;
    border-radius: 5px;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .btn-save {
    background: var(--accent-defter);
    border: 1px solid var(--accent-defter);
    color: #fff;
    padding: 0.4rem 0.85rem;
    border-radius: 5px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-confirm-delete {
    background: var(--loss);
    border: 1px solid var(--loss);
    color: #fff;
    padding: 0.4rem 0.85rem;
    border-radius: 5px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-vazgec:disabled,
  .btn-save:disabled,
  .btn-confirm-delete:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .confirm-msg {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.4;
    color: var(--ink);
  }
  .error-msg {
    margin: 0;
    font-size: 0.8rem;
    color: var(--loss);
  }
</style>

