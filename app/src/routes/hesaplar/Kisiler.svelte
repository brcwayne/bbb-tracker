<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, Person } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { appendRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { ownerLedger, SAHIPSIZ } from '../../lib/data/owners'
  import { tryFmt, usd } from '../../lib/format'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import SahipAktarimFormu from './SahipAktarimFormu.svelte'

  let {
    dataset,
    source,
    store,
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
  } = $props()

  const isDrive = $derived(Boolean(source?.save))
  const today = new Date().toISOString().slice(0, 10)
  const people = $derived(dataset?.people ?? [])
  const ledger = $derived(
    ownerLedger(dataset?.personalTx ?? [], dataset?.personalAccounts ?? [], people, today),
  )
  const fmt = (n: number, cur: string) => (cur === 'USD' ? usd(n) : tryFmt(n))
  const nameOf = (kod: string) =>
    kod === SAHIPSIZ ? 'Sahipsiz' : (people.find((p) => p.kod === kod)?.ad ?? kod)
  const ownerKods = $derived(
    Object.keys(ledger.owners).filter(
      (k) => k !== SAHIPSIZ || Object.values(ledger.owners[k]).some((v) => v !== 0),
    ),
  )
  const gaps = $derived(Object.entries(ledger.gap).filter(([, v]) => v !== 0))

  let aktarimAcik = $state(false)
  let yeniAd = $state('')
  let kisiHata = $state<string | null>(null)
  let kisiKaydediyor = $state(false)

  /** "Ayşe Hanım" -> "AYSE-HANIM": an ASCII, upper-case code, the same shape as ENIS / ANNE. */
  function slug(ad: string): string {
    return ad
      .trim()
      .toLocaleUpperCase('tr')
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async function kisiEkle() {
    kisiHata = null
    const ad = yeniAd.trim()
    const kod = slug(ad)
    if (!ad || !kod) {
      kisiHata = 'Bir isim yaz.'
      return
    }
    if (people.some((p) => p.kod === kod)) {
      kisiHata = 'Bu kişi zaten var.'
      return
    }
    if (!source || !store) return
    kisiKaydediyor = true
    try {
      const p: Person = { kod, ad, haneUyesi: false, aktif: true }
      await appendRecord<Person>(store, source, 'people', p)
      yeniAd = ''
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        try {
          await load(store, source)
        } catch {}
        kisiHata = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — tekrar dener misin?'
      } else {
        kisiHata = e instanceof Error ? e.message : String(e)
      }
    } finally {
      kisiKaydediyor = false
    }
  }
</script>

{#if people.length === 0}
  <div class="empty-container">
    <EmptyState title="Henüz kişi tanımlı değil." detail="Kişi eklenince bakiyeler burada görünür." />
  </div>
{:else}
  <div class="page-container">
    {#if !isDrive}
      <div class="offline-note">Düzenleme için Drive bağlantısı gerekiyor.</div>
    {/if}

    <section class="section-card">
      <h3 class="section-title">Kişi Bakiyeleri</h3>
      <div class="balances-grid">
        {#each ownerKods as kod (kod)}
          <div class="balance-card" data-testid="owner-card">
            <span class="person-name">{nameOf(kod)}</span>
            <div class="amounts">
              {#each Object.entries(ledger.owners[kod]) as [cur, v] (cur)}
                <span class="fig-val num" class:loss={v < 0} class:gain={v > 0}>{fmt(v, cur)}</span>
              {:else}
                <span class="fig-val num muted">0</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      {#if gaps.length}
        <div class="error-banner" role="alert">
          Fark: {gaps.map(([c, v]) => fmt(v, c)).join(' · ')} — kişi toplamı hesaplarla tutmuyor,
          bir kayıt eksik ya da hesabı silinmiş olabilir.
        </div>
      {:else}
        <p class="empty-hint">Kişi toplamı hesaplarla tutuyor.</p>
      {/if}
    </section>

    <section class="section-card">
      <h3 class="section-title">Kişiler arası aktarım</h3>
      <p class="empty-hint hint-gap">
        Hesaplardaki para değişmez, sadece kimin olduğu değişir.
      </p>
      {#if aktarimAcik && isDrive}
        <SahipAktarimFormu
          {dataset}
          {source}
          {store}
          onSaved={() => (aktarimAcik = false)}
          onCancel={() => (aktarimAcik = false)}
        />
      {:else}
        <button type="button" class="btn-primary" disabled={!isDrive} onclick={() => (aktarimAcik = true)}>
          + Aktarım ekle
        </button>
      {/if}
    </section>

    <section class="section-card">
      <h3 class="section-title">Kişi ekle</h3>
      {#if kisiHata}<div class="error-banner" role="status">{kisiHata}</div>{/if}
      <form
        class="add-person"
        onsubmit={(e) => {
          e.preventDefault()
          kisiEkle()
        }}
      >
        <label for="yeni-kisi">İsim</label>
        <div class="add-row">
          <input id="yeni-kisi" bind:value={yeniAd} disabled={!isDrive || kisiKaydediyor} />
          <button type="submit" class="btn-primary" disabled={!isDrive || kisiKaydediyor}>Ekle</button>
        </div>
      </form>
    </section>
  </div>
{/if}

<style>
  .empty-container {
    padding: 3rem 1rem;
  }
  .page-container {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  .offline-note {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .error-banner {
    margin-top: 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--loss);
    color: var(--loss);
    padding: 0.6rem 0.85rem;
    border-radius: 6px;
    font-size: 0.82rem;
  }
  .section-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1.1rem 1.25rem;
  }
  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: var(--ink-soft);
  }
  .empty-hint {
    font-size: 0.85rem;
    color: var(--ink-soft);
    margin: 1rem 0 0;
  }
  .hint-gap {
    margin: 0 0 0.9rem;
  }
  .balances-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
  .balance-card {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .person-name {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--ink);
  }
  .amounts {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .fig-val {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--ink);
  }
  .gain {
    color: var(--gain);
  }
  .loss {
    color: var(--loss);
  }
  .num {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--ink-soft);
  }
  .add-person {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  label {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .add-row {
    display: flex;
    gap: 0.6rem;
  }
  input {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    font-size: 0.9rem;
    box-sizing: border-box;
  }
  .btn-primary {
    background: #238636;
    color: #ffffff;
    border: 1px solid rgba(240, 246, 252, 0.1);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-primary:hover:not(:disabled) {
    background: #2ea043;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
