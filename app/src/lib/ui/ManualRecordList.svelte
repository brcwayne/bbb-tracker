<script lang="ts">
  let {
    title,
    rows,
    onEdit,
    onDelete,
  }: {
    title: string
    rows: { key: string; tarih: string; summary: string }[]
    onEdit: (key: string) => void
    onDelete: (row: { key: string; tarih: string; summary: string }) => void
  } = $props()
</script>

<div class="manual-list">
  <h3>{title}</h3>
  {#if rows.length === 0}
    <p class="empty">Manuel kayıt yok.</p>
  {:else}
    <ul>
      {#each rows as row (row.key)}
        <li>
          {#if row.tarih !== '—'}<span class="tarih">{row.tarih}</span>{/if}
          <span class="summary">{row.summary}</span>
          <span class="actions">
            <button onclick={() => onEdit(row.key)}>Düzenle</button>
            <button class="danger" onclick={() => onDelete(row)}>Sil</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .manual-list h3 {
    font-size: 0.95rem;
    margin: 0 0 0.5rem;
  }
  .empty {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--hairline);
    font-size: 0.85rem;
  }
  .tarih {
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .summary {
    flex: 1;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
  button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }
  button.danger {
    color: var(--loss);
    border-color: var(--loss);
  }
</style>
