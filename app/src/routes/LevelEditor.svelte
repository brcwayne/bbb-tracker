<script lang="ts">
  import type { Instrument, Dataset } from '../lib/data/types'
  import { updateRecord, type AppState } from '../lib/data/store'
  import type { DataSource } from '../lib/data/source'
  import type { Writable } from 'svelte/store'

  let {
    kod,
    inst,
    source,
    store,
    dataset,
  }: {
    kod: string
    inst?: Instrument
    source?: DataSource
    store?: Writable<AppState>
    dataset?: Dataset
  } = $props()

  let birim = $derived(inst?.girisParaBirimi ?? 'TL')
  let editDestek = $state('')
  let editDirenc = $state('')
  let editHedef = $state('')

  $effect(() => {
    editDestek = inst?.seviyeler?.destek != null ? String(inst.seviyeler.destek) : ''
    editDirenc = inst?.seviyeler?.direnc != null ? String(inst.seviyeler.direnc) : ''
    editHedef = inst?.seviyeler?.hedef != null ? String(inst.seviyeler.hedef) : ''
  })

  let isSaving = $state(false)
  let saveMsg = $state<string | null>(null)
  let errorMsg = $state<string | null>(null)

  async function onSave() {
    if (!inst) return
    isSaving = true
    saveMsg = null
    errorMsg = null

    try {
      const parseNum = (v: unknown): number | undefined => {
        if (v == null) return undefined
        const s = String(v).trim()
        if (s === '') return undefined
        const n = Number(s)
        return Number.isNaN(n) ? undefined : n
      }

      const dNum = parseNum(editDestek)
      const rNum = parseNum(editDirenc)
      const hNum = parseNum(editHedef)

      const hasAny = dNum !== undefined || rNum !== undefined || hNum !== undefined
      const seviyeler = hasAny
        ? {
            destek: dNum,
            direnc: rNum,
            hedef: hNum,
            birim,
            guncelleme: new Date().toISOString(),
          }
        : null

      const updated: Instrument = {
        ...inst,
        seviyeler,
      }

      if (store && source) {
        await updateRecord<Instrument>(
          store,
          source,
          'instruments',
          (i) => i.kod === inst!.kod,
          updated,
          { allowImported: true },
        )
      } else if (source?.save && dataset) {
        const list = dataset.instruments.map((i) => (i.kod === inst!.kod ? updated : i))
        await source.save('instruments', list)
        inst.seviyeler = seviyeler
      } else {
        inst.seviyeler = seviyeler
      }

      saveMsg = 'Kaydedildi'
      setTimeout(() => {
        saveMsg = null
      }, 3000)
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Kaydedilemedi'
    } finally {
      isSaving = false
    }
  }
</script>

<div class="level-editor" data-testid="level-editor-{kod}">
  <div class="header">
    <strong>Seviyeler ({birim})</strong>
    {#if inst?.seviyeler?.guncelleme}
      <span class="updated-time">Son güncelleme: {inst.seviyeler.guncelleme.slice(0, 10)}</span>
    {/if}
  </div>
  <div class="inputs">
    <label>
      <span>Destek</span>
      <input
        type="number"
        step="any"
        placeholder="—"
        data-testid="input-destek"
        bind:value={editDestek}
      />
    </label>
    <label>
      <span>Direnç</span>
      <input
        type="number"
        step="any"
        placeholder="—"
        data-testid="input-direnc"
        bind:value={editDirenc}
      />
    </label>
    <label>
      <span>Hedef</span>
      <input
        type="number"
        step="any"
        placeholder="—"
        data-testid="input-hedef"
        bind:value={editHedef}
      />
    </label>
    <button
      class="save-btn"
      data-testid="btn-save-levels"
      onclick={onSave}
      disabled={isSaving}
    >
      {isSaving ? 'Kaydediliyor…' : 'Kaydet'}
    </button>
  </div>
  {#if saveMsg}
    <span class="msg success" data-testid="level-save-msg">{saveMsg}</span>
  {/if}
  {#if errorMsg}
    <span class="msg error">{errorMsg}</span>
  {/if}
</div>

<style>
  .level-editor {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    margin: 0.75rem 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
    font-size: 0.8125rem;
  }
  .updated-time {
    color: var(--ink-soft);
    font-size: 0.75rem;
  }
  .inputs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
  input {
    width: 6.5rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface-2, var(--bg));
    color: var(--ink);
    font: inherit;
    font-size: 0.8125rem;
  }
  .save-btn {
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface-2, var(--bg));
    color: var(--ink);
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    font-weight: 500;
  }
  .save-btn:hover:not(:disabled) {
    border-color: var(--gold);
  }
  .msg {
    display: inline-block;
    margin-top: 0.35rem;
    font-size: 0.75rem;
  }
  .msg.success {
    color: var(--gain);
  }
  .msg.error {
    color: var(--loss);
  }
</style>
