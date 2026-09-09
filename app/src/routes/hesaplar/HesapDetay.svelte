<script lang="ts">
  import type { Dataset } from '../../lib/data/types'
  let { dataset, param }: { dataset?: Dataset | null; param?: string } = $props()
</script>

<p class="stub">Hesap detayı: {param} — Görev 9</p>

<style>
  .stub { padding: 2rem 1.25rem; color: var(--ink-soft); }
</style>
