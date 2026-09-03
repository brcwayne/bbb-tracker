<script lang="ts">
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  let { dataset = undefined, derived = undefined }: { dataset?: any; derived?: any } = $props()
</script>

<SectionHeader title="Pozisyonlar" />
