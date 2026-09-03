<script lang="ts">
  let { title, detail = undefined }: { title: string; detail?: string } = $props()
</script>

<div class="empty-state">
  <p class="empty-title">{title}</p>
  {#if detail}<p class="empty-detail">{detail}</p>{/if}
</div>

<style>
  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink-soft);
  }
  .empty-title {
    margin: 0;
    font-weight: 600;
    color: var(--ink);
  }
  .empty-detail {
    margin: 0.25rem 0 0;
    font-size: 0.85em;
  }
</style>
