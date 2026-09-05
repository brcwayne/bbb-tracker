<script lang="ts">
  import type { Dataset, Transaction, Cashflow, AssetTransfer, Broker } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import type { Writable } from 'svelte/store'
  import type { AppState } from '../lib/data/store'
  import { deleteRecord } from '../lib/data/store'
  import { derivePositions } from '../lib/data/derive'
  import { money } from '../lib/settings.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import ManualRecordList from '../lib/ui/ManualRecordList.svelte'
  import IslemFormu from './forms/IslemFormu.svelte'
  import NakitHareketiFormu from './forms/NakitHareketiFormu.svelte'
  import VarlikTransferiFormu from './forms/VarlikTransferiFormu.svelte'
  import KurumFormu from './forms/KurumFormu.svelte'

  let {
    dataset,
    view,
    source,
    store,
  }: { dataset?: Dataset; view?: DerivedBundle; source?: DataSource; store?: Writable<AppState> } = $props()

  type Kind = 'islem' | 'nakit' | 'transfer' | 'kurum'
  let kind = $state<Kind | null>(null)
  let manageKind = $state<Kind | null>(null)
  let editingRecord = $state<{ kind: Kind; record: Transaction | Cashflow | AssetTransfer | Broker } | null>(null)
  let deleteTarget = $state<{ kind: Kind; key: string; label: string } | null>(null)
  let deleteError = $state<string | null>(null)
  let deleting = $state(false)
  let successMessage = $state<string | null>(null)

  const labels: Record<Kind, string> = {
    islem: 'İşlem (Al/Sat)',
    nakit: 'Nakit Hareketi',
    transfer: 'Varlık Transferi',
    kurum: 'Kurum Ekle',
  }
  const manageLabels: Record<Kind, string> = {
    islem: 'İşlemlerim',
    nakit: 'Nakit Hareketlerim',
    transfer: 'Transferlerim',
    kurum: 'Kurumlarım',
  }

  function resetPanels() {
    kind = null
    manageKind = null
    editingRecord = null
    deleteTarget = null
    deleteError = null
    successMessage = null
  }

  function pick(k: Kind) {
    resetPanels()
    kind = k
  }

  function manage(k: Kind) {
    resetPanels()
    manageKind = k
  }

  function saved() {
    resetPanels()
    successMessage = 'Kayıt başarıyla eklendi.'
  }

  function editSaved() {
    resetPanels()
    successMessage = 'Kayıt güncellendi.'
  }

  const manualTxns = $derived((dataset?.transactions ?? []).filter((t) => t.kaynak === 'manual'))
  const manualFlows = $derived((dataset?.cashflows ?? []).filter((c) => c.kaynak === 'manual'))
  const manualTransfers = $derived((dataset?.assetTransfers ?? []).filter((a) => a.kaynak === 'manual'))
  const manualBrokers = $derived((dataset?.brokers ?? []).filter((b) => b.kaynak === 'manual'))

  const txnRows = $derived(
    manualTxns.map((t) => ({ key: t.id, tarih: t.tarih, summary: `${t.yon} ${t.enstruman} · ${t.lot} lot · ${money(t.net_usd)}` })),
  )
  const flowRows = $derived(
    manualFlows.map((c) => ({
      key: c.id,
      tarih: c.tarih,
      summary: `${c.tur} · ${c.hesap}${c.hedefHesap ? ' → ' + c.hedefHesap : ''} · ${money(c.tutar_usd)}`,
    })),
  )
  const transferRows = $derived(
    manualTransfers.map((a) => ({ key: a.id, tarih: a.tarih, summary: `${a.enstruman} · ${a.kaynakHesap} → ${a.hedefHesap}` })),
  )
  const brokerRows = $derived(
    manualBrokers.map((b) => ({ key: b.kod, tarih: '—', summary: `${b.kod} — ${b.ad} (${b.tur})` })),
  )

  function requestEdit(k: Kind, key: string) {
    const record =
      k === 'islem' ? manualTxns.find((t) => t.id === key)
      : k === 'nakit' ? manualFlows.find((c) => c.id === key)
      : k === 'transfer' ? manualTransfers.find((a) => a.id === key)
      : manualBrokers.find((b) => b.kod === key)
    if (!record) return
    deleteTarget = null
    successMessage = null
    editingRecord = { kind: k, record }
  }

  function requestDelete(k: Kind, row: { key: string; tarih: string; summary: string }) {
    editingRecord = null
    successMessage = null
    deleteError = null
    deleteTarget = { kind: k, key: row.key, label: row.summary }
  }

  async function confirmDelete() {
    if (!deleteTarget || !source || !store || !dataset) return
    deleting = true
    deleteError = null
    try {
      const { kind: k, key } = deleteTarget
      if (k === 'islem') {
        const prospective = dataset.transactions.filter((t) => t.id !== key)
        const baselineErrors = derivePositions(dataset.transactions).errors.length
        const prospectiveErrors = derivePositions(prospective).errors.length
        if (prospectiveErrors > baselineErrors) {
          deleteError = 'Bu kayıt silinirse daha sonraki bir satış geçersiz hale gelir.'
          deleting = false
          return
        }
        await deleteRecord<Transaction>(store, source, 'transactions', (t) => t.id === key)
      } else if (k === 'nakit') await deleteRecord<Cashflow>(store, source, 'cashflows', (c) => c.id === key)
      else if (k === 'transfer') await deleteRecord<AssetTransfer>(store, source, 'assetTransfers', (a) => a.id === key)
      else {
        const referenced =
          dataset.transactions.some((t) => t.hesap === key) ||
          dataset.cashflows.some((c) => c.hesap === key || c.hedefHesap === key) ||
          dataset.assetTransfers.some((a) => a.kaynakHesap === key || a.hedefHesap === key)
        if (referenced) {
          deleteError = 'Bu kurum işlem, nakit hareketi veya transfer kayıtlarında kullanılıyor — önce onları düzenleyin veya silin.'
          deleting = false
          return
        }
        await deleteRecord<Broker>(store, source, 'brokers', (b) => b.kod === key)
      }
      deleteTarget = null
      successMessage = 'Kayıt silindi.'
    } catch (e) {
      deleteError = e instanceof Error ? e.message : String(e)
    } finally {
      deleting = false
    }
  }
</script>

{#if dataset && view && source && store}
  <section class="ekle">
    <SectionHeader title="Kayıtlar" />
    {#if successMessage}<p class="success">{successMessage}</p>{/if}
    <div class="picker">
      {#each Object.entries(labels) as [k, label]}
        <button class:active={kind === k} onclick={() => pick(k as Kind)}>{label}</button>
      {/each}
    </div>
    <div class="picker manage-picker">
      {#each Object.entries(manageLabels) as [k, label]}
        <button class:active={manageKind === k} onclick={() => manage(k as Kind)}>{label}</button>
      {/each}
    </div>

    {#if editingRecord}
      {#key editingRecord.kind + ':' + ('id' in editingRecord.record ? editingRecord.record.id : editingRecord.record.kod)}
        <div class="form-area">
          {#if editingRecord.kind === 'islem'}
            <IslemFormu {dataset} {view} {source} {store} editing={editingRecord.record as Transaction} onSaved={editSaved} />
          {:else if editingRecord.kind === 'nakit'}
            <NakitHareketiFormu {dataset} {source} {store} editing={editingRecord.record as Cashflow} onSaved={editSaved} />
          {:else if editingRecord.kind === 'transfer'}
            <VarlikTransferiFormu {dataset} {view} {source} {store} editing={editingRecord.record as AssetTransfer} onSaved={editSaved} />
          {:else}
            <KurumFormu {dataset} {source} {store} editing={editingRecord.record as Broker} onSaved={editSaved} />
          {/if}
        </div>
      {/key}
      <button onclick={resetPanels}>Vazgeç</button>
    {:else if kind === 'islem'}
      <div class="form-area">
        <IslemFormu {dataset} {view} {source} {store} onSaved={saved} />
      </div>
    {:else if kind === 'nakit'}
      <div class="form-area">
        <NakitHareketiFormu {dataset} {source} {store} onSaved={saved} />
      </div>
    {:else if kind === 'transfer'}
      <div class="form-area">
        <VarlikTransferiFormu {dataset} {view} {source} {store} onSaved={saved} />
      </div>
    {:else if kind === 'kurum'}
      <div class="form-area">
        <KurumFormu {dataset} {source} {store} onSaved={saved} />
      </div>
    {:else if manageKind}
      <div class="form-area">
        {#if manageKind === 'islem'}
          <ManualRecordList title="İşlemlerim" rows={txnRows} onEdit={(key) => requestEdit('islem', key)} onDelete={(row) => requestDelete('islem', row)} />
        {:else if manageKind === 'nakit'}
          <ManualRecordList title="Nakit Hareketlerim" rows={flowRows} onEdit={(key) => requestEdit('nakit', key)} onDelete={(row) => requestDelete('nakit', row)} />
        {:else if manageKind === 'transfer'}
          <ManualRecordList title="Transferlerim" rows={transferRows} onEdit={(key) => requestEdit('transfer', key)} onDelete={(row) => requestDelete('transfer', row)} />
        {:else}
          <ManualRecordList title="Kurumlarım" rows={brokerRows} onEdit={(key) => requestEdit('kurum', key)} onDelete={(row) => requestDelete('kurum', row)} />
        {/if}
        {#if deleteTarget}
          <div class="confirm-delete">
            <p><strong>{deleteTarget.label}</strong> kalıcı olarak silinsin mi? Bu işlem geri alınamaz.</p>
            {#if deleteError}<p class="error">{deleteError}</p>{/if}
            <button onclick={() => (deleteTarget = null)} disabled={deleting}>Vazgeç</button>
            <button class="danger" onclick={confirmDelete} disabled={deleting}>{deleting ? 'Siliniyor…' : 'Evet, sil'}</button>
          </div>
        {/if}
      </div>
    {/if}
  </section>
{:else}
  <EmptyState title="Ekle" detail="Veri bekleniyor." />
{/if}

<style>
  .ekle {
    padding: 1.25rem 1.25rem 2rem;
    max-width: min(760px, 96vw);
    margin: 0 auto;
  }
  .success {
    color: var(--gain);
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0 0.75rem;
  }
  .manage-picker {
    margin-bottom: 1.25rem;
  }
  .picker button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }
  .picker button.active {
    border-color: var(--gold);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .form-area {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem;
  }
  .confirm-delete {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--hairline);
    font-size: 0.85rem;
  }
  .confirm-delete .error {
    color: var(--loss);
  }
  .confirm-delete button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
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
</style>
