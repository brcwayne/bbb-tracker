<script lang="ts">
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import { tryFmt, usd } from '../../lib/format'
  import DataTable from '../../lib/ui/DataTable.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    today?: string
  } = $props()

  let fKategori = $state('')
  let fSahip = $state('')
  let fHesap = $state('')
  let qArama = $state('')

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
        if (a.tarih !== b.tarih) return b.tarih.localeCompare(a.tarih)
        return b.id.localeCompare(a.id)
      })
  })

  const columns = [
    {
      key: 'tarih',
      label: 'Tarih',
      sortable: true,
      html: true,
      fmt: (val: string, row: PersonalTx) => {
        const isFuture = row.tarih > today
        return `${row.tarih}${isFuture ? ' <span class="future-marker" title="Gelecek taksit">Gelecek</span>' : ''}`
      },
    },
    {
      key: 'kategori',
      label: 'Kategori',
      sortable: true,
      fmt: (val: string) => catName(val),
    },
    {
      key: 'aciklama',
      label: 'Açıklama',
      sortable: true,
    },
    {
      key: 'tutar',
      label: 'Tutar',
      align: 'right' as const,
      sortable: true,
      tone: 'sign' as const,
      fmt: (val: number, row: PersonalTx) => {
        const str = row.paraBirimi === 'USD' ? usd(val) : tryFmt(val)
        return row.tur === 'GELIR' ? `+${str}` : str
      },
    },
    {
      key: 'taksit',
      label: 'Taksit',
      align: 'right' as const,
      fmt: (_val: any, row: PersonalTx) => {
        if (!row.taksitPlaniId || row.taksitNo == null || row.taksitToplam == null) return '—'
        return `${row.taksitNo}/${row.taksitToplam}`
      },
    },
    {
      key: 'hesap',
      label: 'Hesap',
      sortable: true,
    },
    {
      key: 'sahip',
      label: 'Sahip',
      sortable: true,
    },
  ]
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

      <div class="row-count num">
        {filteredRows.length} kayıt
      </div>
    </div>

    {#if filteredRows.length === 0}
      <div class="no-results">
        <p>Seçilen filtrelere uygun harcama kaydı bulunamadı.</p>
      </div>
    {:else}
      <div class="table-container">
        <DataTable {columns} rows={filteredRows} rowKey={(r) => r.id} />
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
    margin-left: auto;
    align-self: center;
  }
  .table-container {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    overflow: hidden;
  }
  .no-results {
    padding: 2rem;
    text-align: center;
    color: var(--ink-soft);
  }
  :global(.future-marker) {
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
