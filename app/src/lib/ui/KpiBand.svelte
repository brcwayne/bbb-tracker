<script lang="ts">
  import Ticker from './Ticker.svelte'

  type Item = {
    label: string
    value: string
    /** When set with `fmt`, the value counts up on load / change. */
    num?: number
    fmt?: (n: number) => string
    tone?: 'gain' | 'loss' | 'neutral'
  }
  let { items = [] }: { items?: Item[] } = $props()
</script>

<dl class="kpi-band">
  {#each items as item, i}
    <div class="kpi" class:lead={i === 0} data-tone={item.tone ?? 'neutral'}>
      <dt>{item.label}</dt>
      <dd class="num">
        {#if item.num != null && item.fmt}
          <Ticker value={item.num} fmt={item.fmt} />
        {:else}
          {item.value}
        {/if}
      </dd>
    </div>
  {/each}
</dl>

<style>
  .kpi-band {
    display: flex;
    flex-wrap: wrap;
    gap: 0 2rem;
    margin: 0;
    padding: 1rem 0;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-right: 2rem;
    border-right: 1px solid var(--hairline);
  }
  .kpi:last-child {
    border-right: 0;
    padding-right: 0;
  }
  .kpi dt {
    font-size: 0.75em;
    color: var(--ink-soft);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .kpi dd {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
    color: var(--ink);
  }
  .kpi.lead dd {
    font-size: 1.7em;
  }
  .kpi[data-tone='gain'] dd {
    color: var(--gain);
  }
  .kpi[data-tone='loss'] dd {
    color: var(--loss);
  }
</style>
