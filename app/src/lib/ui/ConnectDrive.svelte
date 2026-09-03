<script lang="ts">
  let {
    onConnected,
    connect,
    chooseFolder,
    hasFolder,
  }: {
    onConnected: () => void
    connect: () => Promise<void>
    chooseFolder: () => Promise<string>
    hasFolder?: () => boolean
  } = $props()

  let busy = $state(false)
  let error = $state<string | undefined>(undefined)

  async function go() {
    busy = true
    error = undefined
    try {
      await connect()
      // Only open the Picker when no folder is remembered — a return visitor
      // with a stored folder goes straight through.
      if (!hasFolder?.()) await chooseFolder()
      onConnected()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }
</script>

<div class="connect">
  <div class="card">
    <h1>Google Drive'a bağlan</h1>
    <p>BBB verileri Drive'daki <code>BBB/</code> klasöründen okunur. Bağlan ve klasörü seç.</p>
    <button type="button" class="btn" onclick={go} disabled={busy}>
      {busy ? 'Bağlanıyor…' : 'Google ile bağlan'}
    </button>
    {#if error}<p class="err">{error}</p>{/if}
  </div>
</div>

<style>
  .connect {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: var(--surface);
  }
  .card {
    max-width: 22rem;
    text-align: center;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: var(--ink);
  }
  p {
    margin: 0 0 1.25rem;
    color: var(--ink-soft);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  code {
    font-family: var(--font-num);
  }
  .btn {
    padding: 0.6rem 1.1rem;
    border: 1px solid var(--gold);
    border-radius: 4px;
    background: var(--gold);
    color: #1a1400;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .err {
    margin: 1rem 0 0;
    color: var(--loss);
    font-size: 0.85rem;
  }
</style>
