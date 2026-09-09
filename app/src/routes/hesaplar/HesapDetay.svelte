<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountBalances, cardStatement, monthMovements } from '../../lib/data/accounts'
  import { deleteRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { tryFmt, usd } from '../../lib/format'
  import AyTakvimi from '../../lib/ui/AyTakvimi.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import HarcamaFormu from './HarcamaFormu.svelte'
  import TransferFormu from './TransferFormu.svelte'
  import BakiyeDuzeltme from './BakiyeDuzeltme.svelte'

  let {
    dataset,
    source,
    store,
    param,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    param?: string
    today?: string
  } = $props()

  const isDrive = $derived(Boolean(source?.save))

  const rows = $derived(dataset?.personalTx ?? [])
  const accounts = $derived(dataset?.personalAccounts ?? [])
  const account = $derived(accounts.find((a) => a.kod === param))
  const categories = $derived(dataset?.categories ?? [])
  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod
  const accName = (kod?: string) => accounts.find((a) => a.kod === kod)?.ad ?? kod ?? ''

  let yil = $state(Number(today.slice(0, 4)))
  let ay = $state(Number(today.slice(5, 7)))
  let seciliGun = $state<number | null>(null)

  let formTarihi = $state<string | null>(null)
  let harcamaAcik = $state(false)
  let duzenlenen = $state<PersonalTx | null>(null)
  let silinecek = $state<PersonalTx | null>(null)
  let deleting = $state(false)
  let deleteError = $state<string | null>(null)

  let transferAcik = $state(false)
  let transferKaynak = $state<string | undefined>(undefined)
  let transferHedef = $state<string | undefined>(undefined)
  let transferBasligi = $state('Transfer')
  let duzenlenenTransfer = $state<PersonalTx | null>(null)
  let duzeltmeAcik = $state(false)

  function acTransfer() {
    if (!account) return
    transferKaynak = account.kod
    transferHedef = undefined
    transferBasligi = 'Transfer'
    duzenlenenTransfer = null
    transferAcik = true
  }

  function acKartOdemesi() {
    if (!account) return
    transferKaynak = undefined
    transferHedef = account.kod
    transferBasligi = 'Kart Ödemesi'
    duzenlenenTransfer = null
    transferAcik = true
  }

  const bakiye = $derived(
    account ? (accountBalances(rows, [account], today).get(account.kod) ?? 0) : 0,
  )
  const kart = $derived(
    account?.tur === 'KREDI_KARTI' ? cardStatement(rows, account, today) : null,
  )
  const hareket = $derived(
    account ? monthMovements(rows, account, yil, ay) : null,
  )
  const gorunenKayitlar = $derived(
    !hareket
      ? []
      : seciliGun === null
        ? hareket.kayitlar
        : hareket.kayitlar.filter((r) => Number(r.tarih.slice(8, 10)) === seciliGun),
  )

  const AY_ADI = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ]

  const fmt = (v: number, para = account?.paraBirimi ?? 'TRY') =>
    para === 'USD' ? usd(v) : tryFmt(v)

  /** What this row did to THIS account — the same sign rule the balance uses. */
  function satirTutari(r: PersonalTx): { isaret: number; metin: string } {
    if (r.paraBirimi !== account?.paraBirimi) {
      return { isaret: 0, metin: `${r.paraBirimi === 'USD' ? usd(r.tutar) : tryFmt(r.tutar)} ${r.paraBirimi}` }
    }
    if (r.tur === 'TRANSFER') {
      const giden = r.hesap === account.kod
      return { isaret: giden ? -1 : 1, metin: `${giden ? '−' : '+'} ${fmt(r.tutar)}` }
    }
    if (r.tur === 'DUZELTME') {
      return { isaret: Math.sign(r.tutar), metin: `${r.tutar < 0 ? '−' : '+'} ${fmt(Math.abs(r.tutar))}` }
    }
    const gelir = r.tur === 'GELIR'
    return { isaret: gelir ? 1 : -1, metin: `${gelir ? '+' : '−'} ${fmt(r.tutar)}` }
  }

  function satirBasligi(r: PersonalTx): string {
    if (r.tur === 'TRANSFER') {
      return r.hesap === account?.kod
        ? `⇄ ${accName(account?.kod)} → ${accName(r.karsiHesap)}`
        : `⇄ ${accName(r.hesap)} → ${accName(account?.kod)}`
    }
    if (r.tur === 'DUZELTME') return '⚖ Bakiye düzeltmesi'
    return `${catName(r.kategori)}${r.aciklama ? ` · ${r.aciklama}` : ''}`
  }

  const iso = (gun: number) =>
    `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`

  function ekle(gun?: number) {
    formTarihi = gun ? iso(gun) : today
    duzenlenen = null
    harcamaAcik = true
  }

  async function confirmDelete() {
    if (!silinecek || !source || !store) return
    deleting = true
    deleteError = null
    try {
      await deleteRecord<PersonalTx>(store, source, 'personal_tx', (r) => r.id === silinecek!.id, {
        allowKaynak: ['telegram', 'manual'],
      })
      silinecek = null
    } catch (e: any) {
      if (e instanceof ConflictError || e?.name === 'ConflictError') {
        if (store && source) {
          try {
            await load(store, source)
          } catch {}
        }
        deleteError = 'Bu dosya başka bir yerden değişti, sayfa yenilendi — düzenlemeyi tekrar yapar mısın?'
      } else {
        deleteError = e instanceof Error ? e.message : String(e)
      }
    } finally {
      deleting = false
    }
  }
</script>

{#if !account}
  <div class="empty-container">
    <EmptyState title="Hesap bulunamadı" detail="Bu hesap silinmiş olabilir." />
    <a class="geri-link" href="#/h/hesaplar">← Hesaplar</a>
  </div>
{:else}
  <div class="page-container">
    <header class="hesap-head">
      <a class="geri" href="#/h/hesaplar" aria-label="Hesaplar listesine dön">‹</a>
      <div class="baslik">
        <h2>{#if account.simge}<span class="simge">{account.simge}</span>{/if}{account.ad}</h2>
        <span class="tur">{account.tur === 'KREDI_KARTI' ? 'Kredi kartı' : account.tur === 'BANKA' ? 'Banka hesabı' : 'Nakit'}</span>
      </div>
      {#if kart}
        <div class="kart-figurler" data-testid="bakiye">
          <span class="kolon"><em>Bu Ay</em><span class="num loss">{fmt(kart.buAy)}</span></span>
          <span class="kolon"><em>Gelecek Ay</em><span class="num">{fmt(kart.gelecekAy)}</span></span>
          <span class="toplam num sub">{fmt(kart.toplamBorc)}</span>
        </div>
      {:else}
        <span class="bakiye num" data-testid="bakiye" class:loss={bakiye < 0}>{fmt(bakiye)}</span>
      {/if}
    </header>

    {#if (harcamaAcik || duzenlenen) && dataset}
      <div class="form-modal">
        <HarcamaFormu
          {dataset}
          {source}
          {store}
          editing={duzenlenen ?? undefined}
          hesap={account.kod}
          tarih={formTarihi ?? today}
          hesapKilitli
          onSaved={() => { harcamaAcik = false; duzenlenen = null }}
          onCancel={() => { harcamaAcik = false; duzenlenen = null }}
        />
      </div>
    {/if}

    {#if (transferAcik || duzenlenenTransfer) && dataset}
      <div class="form-modal">
        <TransferFormu
          {dataset}
          {source}
          {store}
          editing={duzenlenenTransfer ?? undefined}
          kaynakHesap={transferKaynak}
          hedefHesap={transferHedef}
          baslik={transferBasligi}
          tarih={seciliGun ? iso(seciliGun) : today}
          onSaved={() => { transferAcik = false; duzenlenenTransfer = null }}
          onCancel={() => { transferAcik = false; duzenlenenTransfer = null }}
        />
      </div>
    {/if}

    {#if duzeltmeAcik && dataset && account}
      <div class="form-modal">
        <BakiyeDuzeltme
          {dataset}
          {source}
          {store}
          {account}
          {today}
          onSaved={() => (duzeltmeAcik = false)}
          onCancel={() => (duzeltmeAcik = false)}
        />
      </div>
    {/if}

    {#if silinecek}
      <div class="confirm-delete">
        <p>
          <strong>{silinecek.tarih} · {satirBasligi(silinecek)} ({satirTutari(silinecek).metin})</strong>
          kaydı silinsin mi?
        </p>
        {#if deleteError}
          <p class="error">{deleteError}</p>
        {/if}
        <div class="confirm-actions">
          <button type="button" class="btn-secondary" onclick={() => (silinecek = null)} disabled={deleting}>
            Vazgeç
          </button>
          <button type="button" class="btn-danger" onclick={confirmDelete} disabled={deleting}>
            {deleting ? 'Siliniyor…' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    {/if}

    {#if hareket}
      <AyTakvimi
        {yil}
        {ay}
        gunler={hareket.gunler}
        paraBirimi={account.paraBirimi}
        secili={seciliGun}
        bugun={today}
        onSelect={(g) => (seciliGun = g)}
        onAdd={(g) => isDrive && ekle(g)}
        onAyDegis={(y, m) => { yil = y; ay = m; seciliGun = null }}
      />

      <div class="ay-toplam" data-testid="ay-toplam">
        <span>Giriş <b class="num gain">{fmt(hareket.giris)}</b></span>
        <span>Çıkış <b class="num loss">{fmt(hareket.cikis)}</b></span>
        <span>Net <b class="num">{fmt(hareket.net)}</b></span>
      </div>

      {#if hareket.yabanciParaAdedi > 0}
        <p class="dipnot">
          Bu hesabın para biriminden farklı {hareket.yabanciParaAdedi} kayıt toplamlara katılmadı.
        </p>
      {/if}

      {#if seciliGun !== null}
        <button type="button" class="gun-rozeti" data-testid="gun-rozeti" onclick={() => (seciliGun = null)}>
          {seciliGun} {AY_ADI[ay - 1]} · {gorunenKayitlar.length} kayıt ✕
        </button>
      {/if}

      {#if gorunenKayitlar.length === 0}
        <p class="bos">Bu {seciliGun === null ? 'ayda' : 'günde'} hareket yok.</p>
      {:else}
        <ul class="hareketler">
          {#each gorunenKayitlar as r (r.id)}
            {@const t = satirTutari(r)}
            <li class="hareket">
              <span class="tarih num">{r.tarih.slice(8, 10)}.{r.tarih.slice(5, 7)}</span>
              <span class="ad">
                {satirBasligi(r)}
                {#if r.taksitNo != null && r.taksitToplam != null}
                  <span class="rozet">{r.taksitNo}/{r.taksitToplam}</span>
                {/if}
                {#if r.kaynak === 'telegram'}<span class="rozet kaynak">telegram</span>{/if}
                {#if r.paraBirimi !== account.paraBirimi}<span class="rozet" title="Farklı para birimi">≠</span>{/if}
              </span>
              <span class="tutar num" class:gain={t.isaret > 0} class:loss={t.isaret < 0}>{t.metin}</span>
              <div class="hareket-islemler">
                {#if r.tur === 'TRANSFER'}
                  <button
                    type="button"
                    class="btn-icon"
                    title="Düzenle"
                    aria-label="Düzenle"
                    disabled={!isDrive}
                    onclick={() => {
                      duzenlenenTransfer = r
                      transferBasligi = 'Transferi Düzenle'
                      transferAcik = true
                    }}
                  >✎</button>
                {:else if r.tur !== 'DUZELTME'}
                  <button
                    type="button"
                    class="btn-icon"
                    title="Düzenle"
                    aria-label="Düzenle"
                    disabled={!isDrive}
                    onclick={() => { duzenlenen = r; formTarihi = r.tarih; harcamaAcik = true; }}
                  >✎</button>
                {/if}
                <button
                  type="button"
                  class="btn-icon danger"
                  title="Sil"
                  aria-label="Sil"
                  disabled={!isDrive}
                  onclick={() => { silinecek = r; }}
                >🗑</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    <div class="eylemler">
      <button type="button" data-action="harcama" disabled={!isDrive} onclick={() => ekle()}>+ Gider/Gelir</button>
      <button type="button" data-action="transfer" disabled={!isDrive} onclick={acTransfer}>⇄ Transfer</button>
      {#if account.tur === 'KREDI_KARTI'}
        <button type="button" data-action="odeme" disabled={!isDrive} onclick={acKartOdemesi}>💳 Kart ödemesi</button>
      {/if}
      <button type="button" data-action="duzeltme" disabled={!isDrive} onclick={() => (duzeltmeAcik = true)}>⚖ Bakiye düzelt</button>
    </div>
    {#if !isDrive}
      <span class="drive-notice">Düzenleme için Drive bağlantısı gerekiyor</span>
    {/if}
  </div>
{/if}

<style>
  .empty-container {
    padding: 2rem 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .geri-link {
    color: var(--accent-defter);
    text-decoration: none;
    font-weight: 500;
  }
  .page-container {
    padding: 1.25rem;
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .hesap-head {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .geri {
    color: var(--ink-soft);
    text-decoration: none;
    font-size: 1.6rem;
    line-height: 1;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    transition: background 0.15s ease;
  }
  .geri:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
  .baslik {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .baslik h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .simge {
    font-size: 1.1rem;
  }
  .tur {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .bakiye {
    margin-left: auto;
    font-size: 1.25rem;
    font-weight: 600;
    font-family: var(--font-num);
  }

  .kart-figurler {
    margin-left: auto;
    display: grid;
    grid-template-columns: 100px 100px;
    gap: 0.5rem;
    text-align: right;
  }
  .kolon {
    display: flex;
    flex-direction: column;
  }
  .kolon em {
    font-style: normal;
    font-size: 0.7rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .toplam {
    grid-column: 1 / span 2;
    font-size: 0.75rem;
    color: var(--ink-soft);
    margin-top: 0.15rem;
  }

  /* Form modal */
  .form-modal {
    margin-bottom: 0.5rem;
  }

  /* Delete confirmation */
  .confirm-delete {
    background: var(--surface);
    border: 1px solid var(--loss);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .confirm-delete p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .confirm-delete .error {
    color: var(--loss);
    font-size: 0.82rem;
    margin: 0;
  }
  .confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .btn-secondary {
    padding: 0.4rem 0.85rem;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    color: var(--ink);
    font-size: 0.82rem;
    cursor: pointer;
  }
  .btn-danger {
    padding: 0.4rem 0.85rem;
    background: var(--loss);
    border: 1px solid var(--loss);
    border-radius: 6px;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-secondary:disabled, .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Month summary */
  .ay-toplam {
    display: flex;
    justify-content: space-around;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .ay-toplam b {
    color: var(--ink);
    margin-left: 0.35rem;
    font-family: var(--font-num);
  }

  .dipnot {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-soft);
    font-style: italic;
  }

  .gun-rozeti {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--surface);
    border: 1px solid var(--accent-defter);
    color: var(--accent-defter);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    align-self: flex-start;
  }

  .bos {
    margin: 0;
    padding: 1.5rem 0;
    text-align: center;
    color: var(--ink-soft);
    font-size: 0.88rem;
  }

  .hareketler {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    overflow: hidden;
  }
  .hareket {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--hairline);
  }
  .hareket:last-child {
    border-bottom: 0;
  }
  .tarih {
    font-size: 0.8rem;
    color: var(--ink-soft);
    font-family: var(--font-num);
    width: 38px;
    flex-shrink: 0;
  }
  .ad {
    flex: 1;
    font-size: 0.88rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .rozet {
    font-size: 0.7rem;
    color: var(--ink-soft);
    background: var(--surface-2);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  .rozet.kaynak {
    color: var(--accent-defter);
  }
  .tutar {
    font-family: var(--font-num);
    font-size: 0.92rem;
    font-weight: 600;
    text-align: right;
  }

  .hareket-islemler {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.5rem;
  }
  .btn-icon {
    background: transparent;
    border: 0;
    color: var(--ink-soft);
    padding: 0.2rem 0.35rem;
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .btn-icon:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--ink);
  }
  .btn-icon.danger:hover:not(:disabled) {
    color: var(--loss);
  }
  .btn-icon:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .gain {
    color: var(--gain);
  }
  .loss {
    color: var(--loss);
  }

  /* Actions */
  .eylemler {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .eylemler button {
    flex: 1;
    min-width: 130px;
    padding: 0.65rem 0.85rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    color: var(--ink);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .eylemler button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent-defter);
  }
  .eylemler button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .drive-notice {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
</style>
