<script lang="ts">
  type Col = {
    key: string
    label: string
    align?: 'left' | 'right'
    sortable?: boolean
    fmt?: (v: any, row: any) => string
  }
  type Sort = { key: string; dir: 'asc' | 'desc' }
  let {
    columns = [],
    rows = [],
    initialSort = undefined,
    onRowClick = undefined,
  }: {
    columns?: Col[]
    rows?: any[]
    initialSort?: Sort
    onRowClick?: (row: any) => void
  } = $props()

  let userSort = $state<Sort | null>(null)
  const sort = $derived<Sort | null>(userSort ?? initialSort ?? null)

  const sorted = $derived.by(() => {
    if (!sort) return rows
    const { key, dir } = sort
    return [...rows].sort((a, b) => {
      const x = a[key]
      const y = b[key]
      const c = x < y ? -1 : x > y ? 1 : 0
      return dir === 'asc' ? c : -c
    })
  })

  function toggle(col: Col) {
    if (!col.sortable) return
    userSort =
      sort?.key === col.key
        ? { key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: 'asc' }
  }
</script>

<table>
  <thead>
    <tr>
      {#each columns as col}
        <th
          style:text-align={col.align ?? 'left'}
          class:sortable={col.sortable}
          role={col.sortable ? 'button' : undefined}
          tabindex={col.sortable ? 0 : undefined}
          aria-sort={sort?.key === col.key
            ? sort.dir === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'}
          onclick={() => toggle(col)}
          onkeydown={(e) => {
            if (col.sortable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              toggle(col)
            }
          }}>{col.label}</th
        >
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each sorted as row}
      <tr onclick={() => onRowClick?.(row)} class:clickable={!!onRowClick}>
        {#each columns as col}
          <td style:text-align={col.align ?? 'left'} class:num={col.align === 'right'}>
            {col.fmt ? col.fmt(row[col.key], row) : row[col.key]}
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--ink);
  }
  th,
  td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--hairline);
    text-align: left;
  }
  thead th {
    color: var(--ink-soft);
    font-weight: 600;
    font-size: 0.85em;
    letter-spacing: 0.02em;
    border-bottom-color: var(--ink-soft);
  }
  th.sortable {
    cursor: pointer;
    user-select: none;
  }
  th.sortable:hover {
    color: var(--ink);
  }
  td.num {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }
  tbody tr.clickable {
    cursor: pointer;
  }
  tbody tr.clickable:hover {
    background: var(--surface);
  }
</style>
