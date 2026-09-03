<script lang="ts">
  let { title, note = undefined }: { title: string; note?: string } = $props()
</script>

<header class="section-header">
  <h2>{title}</h2>
  {#if note}<span class="note">{note}</span>{/if}
</header>

<style>
  .section-header {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin: 1.5rem 0 0.5rem;
  }
  .section-header h2 {
    margin: 0;
    font-size: 1.05em;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--ink);
  }
  .section-header .note {
    font-size: 0.8em;
    color: var(--ink-soft);
  }
</style>
