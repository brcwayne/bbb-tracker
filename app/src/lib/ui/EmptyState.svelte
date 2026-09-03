<script lang="ts">
  let { title, detail = undefined }: { title: string; detail?: string } = $props()
</script>

<div
  class="empty-state"
  style:text-align="center"
  style:padding="2rem 1rem"
  style:color="var(--ink-soft)"
  style:border="1px solid var(--hairline)"
  style:border-radius="4px"
  style:background="var(--surface)"
>
  <p class="empty-title" style:margin="0" style:color="var(--ink)">{title}</p>
  {#if detail}<p class="empty-detail" style:margin="0.25rem 0 0">{detail}</p>{/if}
</div>
