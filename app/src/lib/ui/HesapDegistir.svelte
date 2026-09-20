<script lang="ts">
  /**
   * Aynı tarayıcıda birden fazla Google hesabı olabilir. Seçilen klasör
   * kalıcı hatırlandığı ve değiştirmenin hiçbir yolu olmadığı için, bir kez
   * bağlanan kullanıcı başka bir hesabın verisine hiç geçemiyordu.
   */
  let {
    drive,
    onSwitched,
  }: {
    drive: {
      forgetFolder: () => void
      connect: () => Promise<void>
      chooseFolder: () => Promise<string>
    }
    onSwitched: () => void
  } = $props()

  let busy = $state(false)

  async function degistir() {
    busy = true
    try {
      drive.forgetFolder()
      await drive.connect()
      await drive.chooseFolder()
      onSwitched()
    } catch {
      // Kullanıcı hesap seçiminden ya da klasör penceresinden vazgeçti:
      // sessizce eski görünümde kal, hata gösterme.
    } finally {
      busy = false
    }
  }
</script>

<button
  type="button"
  class="switch"
  onclick={degistir}
  disabled={busy}
  title="Başka bir Google hesabına veya klasöre geç"
>
  {busy ? '…' : 'Hesap / klasör'}
</button>

<style>
  .switch {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink-soft);
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .switch:hover:not(:disabled) {
    color: var(--ink);
  }
  .switch:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
