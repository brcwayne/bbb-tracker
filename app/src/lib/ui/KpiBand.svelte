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

<style>
  .kpi-band {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin: 0;
    padding: 0.75rem 0;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .kpi dt {
    font-size: 0.8em;
    color: var(--ink-soft);
    letter-spacing: 0.02em;
  }
  .kpi dd {
    margin: 0;
    font-size: 1.25em;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
    color: var(--ink);
  }
  .kpi[data-tone='gain'] dd {
    color: var(--gain);
  }
  .kpi[data-tone='loss'] dd {
    color: var(--loss);
  }
</style>
