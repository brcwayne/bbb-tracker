<script lang="ts">
  let { title, note = undefined }: { title: string; note?: string } = $props()
</script>

<header class="section-header">
  <span class="tick" aria-hidden="true"></span>
  <h2>{title}</h2>
  {#if note}<span class="note">{note}</span>{/if}
</header>

<style>
  .section-header {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    margin: 1.9rem 0 0.6rem;
  }
  .section-header .tick {
    align-self: center;
    width: 0.7rem;
    height: 2px;
    background: var(--gold);
    flex: none;
  }
  .section-header h2 {
    margin: 0;
    font-size: 1.02em;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .section-header .note {
    font-size: 0.8em;
    color: var(--ink-soft);
    text-transform: none;
    letter-spacing: 0;
  }
</style>
