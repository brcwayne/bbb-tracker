<script lang="ts">
  type Item = { label: string; value: string; tone?: 'gain' | 'loss' | 'neutral' }
  let { items = [] }: { items?: Item[] } = $props()
</script>

<dl class="kpi-band">
  {#each items as item}
    <div class="kpi" data-tone={item.tone ?? 'neutral'}>
      <dt>{item.label}</dt>
      <dd class="num">{item.value}</dd>
    </div>
  {/each}
</dl>
