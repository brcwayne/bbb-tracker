<script lang="ts">
  let { text }: { text: string } = $props()
</script>

<span class="stamp num">{text}</span>

<style>
  .stamp {
    font-size: 0.75em;
    color: var(--ink-soft);
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }
</style>
