<script lang="ts">
  import type { Dataset, Transaction } from '../lib/data/types'
  import type { DerivedBundle, AppState } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import type { Writable } from 'svelte/store'
  import { deleteRecord } from '../lib/data/store'
  import { derivePositions } from '../lib/data/derive'
  import { lot, dateShort, DASH, usd, tryFmt } from '../lib/format'
  import { money } from '../lib/settings.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import IslemFormu from './forms/IslemFormu.svelte'

  let {
    dataset,
    view,
    source,
    store,
  }: { dataset?: Dataset; view?: DerivedBundle; source?: DataSource; store?: Writable<AppState> } = $props()

  let editing = $state<Transaction | null>(null)
  let deleteTarget = $state<Transaction | null>(null)
  let deleteError = $state<string | null>(null)
  let deleting = $state(false)
  let message = $state<string | null>(null)

  let fVarlik = $state('')
  let fKurum = $state('')
  let fPortfoy = $state('')

  const instName = (kod: string) => dataset?.instruments.find((i) => i.kod === kod)?.ad ?? kod
  const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
  const isImported = (t: Transaction | null) => !!t && t.kaynak !== 'manual'

  const varlikOptions = $derived(distinct((dataset?.transactions ?? []).map((t) => t.enstruman)))
  const kurumOptions = $derived(distinct((dataset?.transactions ?? []).map((t) => t.hesap)))
  const portfoyOptions = $derived(distinct((dataset?.transactions ?? []).map((t) => t.portfoy)))

  // Newest → oldest, by trade date then id for a stable order; then apply the filters.
  const rows = $derived(
    [...(dataset?.transactions ?? [])]
      .sort((a, b) =>
        a.tarih > b.tarih ? -1 : a.tarih < b.tarih ? 1 : a.id > b.id ? -1 : a.id < b.id ? 1 : 0,
      )
      .filter(
        (t) =>
          (!fVarlik || t.enstruman === fVarlik) &&
          (!fKurum || t.hesap === fKurum) &&
          (!fPortfoy || t.portfoy === fPortfoy),
      ),
  )

  const fiyatStr = (t: Transaction) =>
    t.girisParaBirimi !== 'USD' && t.fiyat_tl != null
      ? `₺${t.fiyat_tl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : money(t.fiyat_usd)

  // Net total (commission in): `net_usd` is already that day's-rate USD; the ₺
  // figure is reconstructed from it × the day's kur.
  const tutarUsdStr = (t: Transaction) => usd(t.net_usd)
  const tutarTlStr = (t: Transaction) => (t.kur != null ? tryFmt(t.net_usd * t.kur) : DASH)
  const kurStr = (t: Transaction) =>
    t.kur != null ? t.kur.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null

  function requestEdit(t: Transaction) {
    deleteTarget = null
    message = null
    if (editing?.id === t.id) {
      editing = null
    } else {
      editing = t
    }
  }
  function requestDelete(t: Transaction) {
    editing = null
    message = null
    deleteError = null
    if (deleteTarget?.id === t.id) {
      deleteTarget = null
    } else {
      deleteTarget = t
    }
  }
  function editSaved() {
    editing = null
    message = 'İşlem güncellendi.'
  }

  async function confirmDelete() {
    if (!deleteTarget || !source || !store || !dataset) return
    deleting = true
    deleteError = null
    try {
      const id = deleteTarget.id
      const prospective = dataset.transactions.filter((t) => t.id !== id)
      const baselineErrors = derivePositions(dataset.transactions).errors.length
      const prospectiveErrors = derivePositions(prospective).errors.length
      if (prospectiveErrors > baselineErrors) {
        deleteError = 'Bu kayıt silinirse daha sonraki bir satış geçersiz hale gelir.'
        deleting = false
        return
      }
      await deleteRecord<Transaction>(store, source, 'transactions', (t) => t.id === id, {
        allowImported: true,
      })
      deleteTarget = null
      message = 'İşlem silindi.'
    } catch (e) {
      deleteError = e instanceof Error ? e.message : String(e)
    } finally {
      deleting = false
    }
  }
</script>

{#if dataset && view}
  <section class="log">
    <SectionHeader title="Log" note={`${rows.length} işlem · yeni → eski`} />
    {#if message}<p class="ok">{message}</p>{/if}

    <div class="filters">
      <div class="flt">
        <label for="flt-varlik">Varlık</label>
        <select id="flt-varlik" bind:value={fVarlik}>
          <option value="">(hepsi)</option>
          {#each varlikOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
      <div class="flt">
        <label for="flt-kurum">Kurum</label>
        <select id="flt-kurum" bind:value={fKurum}>
          <option value="">(hepsi)</option>
          {#each kurumOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
      <div class="flt">
        <label for="flt-portfoy">Portföy</label>
        <select id="flt-portfoy" bind:value={fPortfoy}>
          <option value="">(hepsi)</option>
          {#each portfoyOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
    </div>

    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Yön</th>
            <th>Varlık</th>
            <th>Kurum</th>
            <th>Portföy</th>
            <th class="r">Adet</th>
            <th class="r">Fiyat</th>
            <th class="r">Tutar ₺</th>
            <th class="r">Tutar $</th>
            <th aria-label="işlemler"></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as t (t.id)}
            <tr class:editing={editing?.id === t.id} class:deleting={deleteTarget?.id === t.id}>
              <td class="nowrap">{dateShort(t.tarih)}</td>
              <td class:pos={t.yon === 'AL'} class:neg={t.yon === 'SAT'}>{t.yon}</td>
              <td>
                {instName(t.enstruman)}
                {#if instName(t.enstruman) !== t.enstruman}<span class="sub">{t.enstruman}</span>{/if}
              </td>
              <td>{t.hesap || DASH}</td>
              <td>{t.portfoy || DASH}</td>
              <td class="r num">{lot(t.lot)}</td>
              <td class="r num">{fiyatStr(t)}</td>
              <td class="r num">
                {tutarTlStr(t)}
                {#if kurStr(t)}<span class="kur">kur {kurStr(t)}</span>{/if}
              </td>
              <td class="r num">{tutarUsdStr(t)}</td>
              <td class="act">
                {#if t.kaynak !== 'manual'}
                  <span class="lock" title="Excel'den gelen kayıt — düzenlerken dikkat">🔒</span>
                {/if}
                <button
                  class="icon"
                  title={t.kaynak === 'manual' ? 'Düzenle' : 'Excel kaydını düzelt'}
                  aria-label="Düzenle"
                  onclick={() => requestEdit(t)}>✎</button>
                <button
                  class="icon danger"
                  title={t.kaynak === 'manual' ? 'Sil' : 'Excel kaydını sil'}
                  aria-label="Sil"
                  onclick={() => requestDelete(t)}>🗑</button>
              </td>
            </tr>
            {#if editing?.id === t.id}
              <tr class="inline-row inline-edit-row">
                <td colspan="10">
                  <div class="inline-edit-box">
                    <div class="inline-box-header">
                      <span class="inline-box-title">
                        İşlem Düzenleme: <strong>{instName(t.enstruman)} ({t.enstruman})</strong> · {dateShort(t.tarih)}
                      </span>
                      <button type="button" class="inline-close" aria-label="Kapat" onclick={() => (editing = null)}>✕</button>
                    </div>
                    {#if isImported(editing)}
                      <p class="warn">
                        Bu kayıt Excel'den geldi. Kaydedersen Excel'deki geçmiş veriden kalıcı olarak ayrışır —
                        yalnızca gerçek bir hatayı düzeltmek için kullan.
                      </p>
                    {/if}
                    {#key editing.id}
                      <div class="form-area">
                        <IslemFormu {dataset} {view} source={source!} store={store!} editing={editing} onSaved={editSaved} />
                      </div>
                    {/key}
                    <div class="inline-box-actions">
                      <button type="button" class="cancel" onclick={() => (editing = null)}>Vazgeç</button>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
            {#if deleteTarget?.id === t.id}
              <tr class="inline-row inline-delete-row">
                <td colspan="10">
                  <div class="confirm-delete">
                    <p>
                      <strong>{dateShort(deleteTarget.tarih)} · {deleteTarget.yon} {instName(deleteTarget.enstruman)} · {lot(deleteTarget.lot)} lot</strong>
                      kalıcı olarak silinsin mi? Bu işlem geri alınamaz.
                    </p>
                    {#if isImported(deleteTarget)}
                      <p class="warn">Bu kayıt Excel'den geldi — silersen Excel'deki geçmişten kalıcı olarak ayrışır.</p>
                    {/if}
                    {#if deleteError}<p class="error">{deleteError}</p>{/if}
                    <div class="inline-box-actions">
                      <button type="button" onclick={() => (deleteTarget = null)} disabled={deleting}>Vazgeç</button>
                      <button type="button" class="danger" onclick={confirmDelete} disabled={deleting}>{deleting ? 'Siliniyor…' : 'Evet, sil'}</button>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{:else}
  <EmptyState title="Log" detail="Veri bekleniyor." />
{/if}

<style>
  .log {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(1100px, 96vw);
    margin: 0 auto;
  }
  .ok {
    color: var(--gain);
    font-size: 0.85rem;
    margin: 0.25rem 0 0.75rem;
  }
  .warn {
    color: var(--loss);
    font-size: 0.82rem;
    margin: 0.25rem 0 0.5rem;
    line-height: 1.4;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0.5rem 0 1rem;
  }
  .flt {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85em;
  }
  .flt label {
    color: var(--ink-soft);
    letter-spacing: 0.02em;
  }
  .flt select {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }
  .form-area {
    margin-bottom: 0.5rem;
  }
  .cancel {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
  }
  .cancel:hover {
    border-color: var(--gold);
  }
  .confirm-delete {
    background: var(--surface);
    border: 1px solid var(--loss);
    border-left: 3px solid var(--loss);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin: 0.25rem 0 0.5rem;
    font-size: 0.85rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }
  .confirm-delete .error {
    color: var(--loss);
  }
  .confirm-delete button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    padding: 0.4rem 0.8rem;
    margin-right: 0.5rem;
    margin-top: 0.4rem;
    cursor: pointer;
  }
  .confirm-delete button.danger {
    color: var(--loss);
    border-color: var(--loss);
  }
  tbody tr.editing > td {
    background: var(--surface-2);
    border-bottom: none;
  }
  tbody tr.deleting > td {
    background: rgba(224, 115, 106, 0.08);
    border-bottom: none;
  }
  tbody tr.inline-row > td {
    padding: 0.25rem 0.75rem 1rem;
    white-space: normal;
    background: var(--surface-2);
    border-bottom: 1px solid var(--hairline);
  }
  .inline-edit-box {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-left: 3px solid var(--gold);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    margin: 0.25rem 0 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }
  .inline-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--hairline);
  }
  .inline-box-title {
    font-size: 0.88rem;
    color: var(--ink-soft);
  }
  .inline-box-title strong {
    color: var(--ink);
  }
  .inline-close {
    appearance: none;
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    line-height: 1;
  }
  .inline-close:hover {
    color: var(--ink);
    background: var(--surface-2);
  }
  .inline-box-actions {
    margin-top: 0.5rem;
    display: flex;
    gap: 0.5rem;
  }
  .tbl-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--ink);
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--hairline);
    text-align: left;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }
  thead th {
    color: var(--ink-soft);
    font-weight: 600;
    font-size: 0.82em;
    letter-spacing: 0.02em;
    border-bottom-color: var(--ink-soft);
  }
  th.r,
  td.r {
    text-align: right;
  }
  td.num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
    color: var(--ink-num);
  }
  /* Trace the row your cursor is on — a faint warm wash, not a bright band. */
  tbody tr:hover > td {
    background: var(--row-hover);
  }
  td.pos {
    color: var(--gain);
    font-weight: 600;
  }
  td.neg {
    color: var(--loss);
    font-weight: 600;
  }
  td .sub {
    color: var(--ink-soft);
    font-size: 0.82em;
    margin-left: 0.35rem;
  }
  td .kur {
    display: block;
    color: var(--ink-soft);
    font-size: 0.78em;
    font-weight: 400;
  }
  tbody tr.editing {
    background: var(--surface);
  }
  td.act {
    text-align: right;
    white-space: nowrap;
  }
  .icon {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    line-height: 1;
    padding: 0.25rem 0.45rem;
    margin-left: 0.3rem;
    cursor: pointer;
  }
  .icon.danger {
    border-color: var(--loss);
  }
  .lock {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
</style>
