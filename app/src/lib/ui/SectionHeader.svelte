<script lang="ts">
  let { title, note = undefined }: { title: string; note?: string } = $props()
</script>

<header class="section-header">
  <h2>{title}</h2>
  {#if note}<span class="note">{note}</span>{/if}
</header>
