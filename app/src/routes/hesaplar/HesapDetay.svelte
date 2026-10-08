<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { accountBalances, cardStatement, monthMovements, type StatementPeriodInfo } from '../../lib/data/accounts'
  import { deleteRecord, load } from '../../lib/data/store'
  import { ConflictError } from '../../lib/data/drive'
  import { tryFmt, usd } from '../../lib/format'
  import AyTakvimi from '../../lib/ui/AyTakvimi.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'
  import HarcamaFormu from './HarcamaFormu.svelte'
  import TransferFormu from './TransferFormu.svelte'
  import BakiyeDuzeltme from './BakiyeDuzeltme.svelte'
  import HesapFormu from './HesapFormu.svelte'

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
  let transferTutar = $state<number | undefined>(undefined)
  let duzenlenenTransfer = $state<PersonalTx | null>(null)
  let duzeltmeAcik = $state(false)
  let hesapDuzenleAcik = $state(false)

  let gorunumModu = $state<'EKSTRE' | 'TAKVIM'>('EKSTRE')
  let seciliEkstreIndex = $state(0)
  let kopyalandi = $state(false)

  function acTransfer() {
    if (!account) return
    transferKaynak = account.kod
    transferHedef = undefined
    transferBasligi = 'Transfer'
    transferTutar = undefined
    duzenlenenTransfer = null
    transferAcik = true
  }

  function acKartOdemesi() {
    if (!account) return
    transferKaynak = undefined
    transferHedef = account.kod
    transferBasligi = 'Kart Ödemesi'
    transferTutar = kart?.odenecekEkstre?.kalan && kart.odenecekEkstre.kalan > 0
      ? kart.odenecekEkstre.kalan
      : (kart?.toplamBorc && kart.toplamBorc < 0 ? Math.abs(kart.toplamBorc) : undefined)
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

  const isKart = $derived(account?.tur === 'KREDI_KARTI')
  const activeStatement = $derived(kart?.ekstreler?.[seciliEkstreIndex])

  const gorunenKayitlar = $derived.by(() => {
    if (isKart && gorunumModu === 'EKSTRE') {
      return activeStatement?.kayitlar ?? []
    }
    if (!hareket) return []
    return seciliGun === null
      ? hareket.kayitlar
      : hareket.kayitlar.filter((r) => Number(r.tarih.slice(8, 10)) === seciliGun)
  })

  async function kopyalaEkstre(st: StatementPeriodInfo) {
    if (!account) return
    const lines: string[] = [
      `💳 ${account.ad} Ekstresi`,
      st.sonOdemeTarihi ? `Son Ödeme Tarihi: ${st.sonOdemeTarihi}` : '',
      `Dönem: ${st.baslangicTarihi} – ${st.kesimTarihi}`,
      '',
    ].filter(Boolean)

    if (Object.keys(st.sahipToplami).length > 0) {
      for (const [sahipKod, tutar] of Object.entries(st.sahipToplami)) {
        const kisiAd = dataset?.people?.find(p => p.kod === sahipKod)?.ad ?? sahipKod
        lines.push(`👤 ${kisiAd}: ${fmt(tutar)}`)
      }
      lines.push('')
    }

    lines.push('Harcamalar:')
    const giderler = st.kayitlar.filter(x => x.tur === 'GIDER')
    if (giderler.length === 0) {
      lines.push('Bu dönemde harcama bulunmuyor.')
    } else {
      for (const r of giderler) {
        const dt = `${r.tarih.slice(8, 10)}.${r.tarih.slice(5, 7)}`
        const kisi = r.sahip && r.sahip !== 'ENIS' ? ` (${dataset?.people?.find(p => p.kod === r.sahip)?.ad ?? r.sahip})` : ''
        lines.push(`• ${dt} ${r.aciklama || catName(r.kategori)}: ${fmt(r.tutar)}${kisi}`)
      }
    }

    lines.push('')
    lines.push(`Toplam Borç: ${fmt(st.toplam)}`)
    if (st.odenen > 0) {
      lines.push(`Ödenen: ${fmt(st.odenen)}`)
      lines.push(`Kalan: ${fmt(st.kalan)}`)
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      kopyalandi = true
      setTimeout(() => (kopyalandi = false), 2500)
    } catch {}
  }

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
        <h2>
          {#if account.simge}<span class="simge">{account.simge}</span>{/if}{account.ad}
          {#if isDrive}
            <button
              type="button"
              class="btn-icon head-edit"
              title="Hesap Ayarlarını Düzenle"
              aria-label="Hesap Ayarlarını Düzenle"
              onclick={() => (hesapDuzenleAcik = true)}
            >✎</button>
          {/if}
        </h2>
        <span class="tur">{account.tur === 'KREDI_KARTI' ? 'Kredi kartı' : account.tur === 'BANKA' ? 'Banka hesabı' : 'Nakit'}</span>
      </div>
      {#if kart}
        <div class="kart-figurler" data-testid="bakiye">
          {#if kart.odenecekEkstre}
            <span class="kolon">
              <em>Bu Ay (Ödenecek)</em>
              <span class="num loss">{fmt(kart.odenecekEkstre.kalan)}</span>
              {#if kart.odenecekEkstre.sonOdemeTarihi}
                <small class="due-tag">Son: {kart.odenecekEkstre.sonOdemeTarihi.slice(8, 10)}.{kart.odenecekEkstre.sonOdemeTarihi.slice(5, 7)}</small>
              {/if}
            </span>
            <span class="kolon">
              <em>Gelecek Ay (Dönem İçi)</em>
              <span class="num">{fmt(kart.donemIci?.toplam ?? kart.gelecekAy)}</span>
              {#if kart.donemIci?.sonOdemeTarihi}
                <small class="due-tag muted">Son: {kart.donemIci.sonOdemeTarihi.slice(8, 10)}.{kart.donemIci.sonOdemeTarihi.slice(5, 7)}</small>
              {/if}
            </span>
          {:else}
            <span class="kolon"><em>Bu Ay</em><span class="num loss">{fmt(kart.buAy)}</span></span>
            <span class="kolon"><em>Gelecek Ay</em><span class="num">{fmt(kart.gelecekAy)}</span></span>
          {/if}
          <span class="toplam num sub">{fmt(kart.toplamBorc)}</span>
        </div>
      {:else}
        <span class="bakiye num" data-testid="bakiye" class:loss={bakiye < 0}>{fmt(bakiye)}</span>
      {/if}
    </header>

    {#if hesapDuzenleAcik && dataset && account}
      <div class="form-modal">
        <HesapFormu
          {dataset}
          {source}
          {store}
          editing={account}
          onSaved={() => (hesapDuzenleAcik = false)}
          onCancel={() => (hesapDuzenleAcik = false)}
        />
      </div>
    {/if}

    {#if (harcamaAcik || duzenlenen) && dataset}
      <div class="form-modal">
        {#key duzenlenen?.id ?? formTarihi}
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
        {/key}
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
          varsayilanTutar={transferTutar}
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

    {#if isKart}
      <div class="gorunum-seg-row">
        <div class="seg" role="group" aria-label="Görünüm Seçimi">
          <button
            type="button"
            class:on={gorunumModu === 'EKSTRE'}
            onclick={() => (gorunumModu = 'EKSTRE')}
          >
            📋 Ekstre Dönemi
          </button>
          <button
            type="button"
            class:on={gorunumModu === 'TAKVIM'}
            onclick={() => (gorunumModu = 'TAKVIM')}
          >
            📅 Takvim Ayı
          </button>
        </div>
      </div>
    {/if}

    {#if isKart && gorunumModu === 'EKSTRE' && kart}
      <!-- Ekstre Dönemi Görünümü -->
      <div class="ekstre-secici" role="tablist">
        {#each kart.ekstreler as st, idx}
          <button
            type="button"
            role="tab"
            aria-selected={seciliEkstreIndex === idx}
            class="ekstre-tab"
            class:active={seciliEkstreIndex === idx}
            onclick={() => (seciliEkstreIndex = idx)}
          >
            <div class="tab-title">{st.etiket}</div>
            <div class="tab-sub">
              {st.baslangicTarihi.slice(8, 10)}.{st.baslangicTarihi.slice(5, 7)} – {st.kesimTarihi.slice(8, 10)}.{st.kesimTarihi.slice(5, 7)}
            </div>
            <div class="tab-amount num" class:loss={st.kalan > 0}>{fmt(st.kalan)}</div>
          </button>
        {/each}
      </div>

      {#if activeStatement}
        {@const st = activeStatement}
        <div class="ekstre-ozet-karti">
          <div class="ozet-ust">
            <div class="ozet-tarihler">
              <span class="ozet-etiket">{st.etiket}</span>
              <span class="tarih-araligi">{st.baslangicTarihi} – {st.kesimTarihi}</span>
              {#if st.sonOdemeTarihi}
                <span class="son-odeme-badge">Son Ödeme: <b>{st.sonOdemeTarihi}</b></span>
              {/if}
            </div>
            <button type="button" class="btn-copy" onclick={() => kopyalaEkstre(st)}>
              {kopyalandi ? '✓ Kopyalandı' : '📋 Özeti Kopyala'}
            </button>
          </div>

          {#if Object.keys(st.sahipToplami).length > 0}
            <div class="kisi-dagilimi">
              <span class="dagilim-baslik">Kişi Dağılımı:</span>
              <div class="kisi-etiketler">
                {#each Object.entries(st.sahipToplami) as [sahipKod, tutar]}
                  {@const kisiAd = dataset?.people?.find(p => p.kod === sahipKod)?.ad ?? sahipKod}
                  <span class="kisi-badge">
                    👤 <strong>{kisiAd}</strong>: <b class="num loss">{fmt(tutar)}</b>
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <div class="ekstre-rakamlar">
            <div class="rakam-kutu">
              <span>Harcama</span>
              <b class="num loss">{fmt(st.toplam)}</b>
            </div>
            {#if st.odenen > 0}
              <div class="rakam-kutu">
                <span>Ödenen</span>
                <b class="num gain">{fmt(st.odenen)}</b>
              </div>
            {/if}
            <div class="rakam-kutu kalan">
              <span>Kalan Borç</span>
              <b class="num loss">{fmt(st.kalan)}</b>
            </div>
          </div>
        </div>
      {/if}
    {:else if hareket}
      <AyTakvimi
        {yil}
        {ay}
        gunler={hareket.gunler}
        paraBirimi={account.paraBirimi}
        secili={seciliGun}
        bugun={today}
        onSelect={(g) => {
          seciliGun = g
          if (harcamaAcik && g) formTarihi = iso(g)
        }}
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
    {/if}

      {#if gorunenKayitlar.length === 0}
        <p class="bos">Bu {seciliGun === null ? 'ayda' : 'günde'} hareket yok.</p>
      {:else}
        <ul class="hareketler">
          {#each gorunenKayitlar as r (r.id)}
            {@const t = satirTutari(r)}
            <li class="hareket" class:planlandi={r.durum === 'planlandi'}>
              <span class="tarih num">{r.tarih.slice(8, 10)}.{r.tarih.slice(5, 7)}</span>
              <span class="ad">
                {satirBasligi(r)}
                {#if r.taksitNo != null && r.taksitToplam != null}
                  <span class="rozet">{r.taksitNo}/{r.taksitToplam}</span>
                {/if}
                {#if r.kaynak === 'telegram'}<span class="rozet kaynak">telegram</span>{/if}
                {#if r.paraBirimi !== account.paraBirimi}<span class="rozet" title="Farklı para birimi">≠</span>{/if}
                {#if r.durum === 'planlandi'}<span class="rozet planlandi">Planlandı</span>{/if}
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
  li.hareket.planlandi {
    opacity: 0.6;
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
  .rozet.planlandi {
    color: var(--gold);
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

  .head-edit {
    font-size: 0.9rem;
    margin-left: 0.5rem;
    opacity: 0.7;
    cursor: pointer;
    vertical-align: middle;
  }
  .head-edit:hover {
    opacity: 1;
  }

  .due-tag {
    display: block;
    font-size: 0.68rem;
    font-weight: 500;
    color: var(--loss);
    font-family: var(--font-num);
    margin-top: 0.1rem;
  }
  .due-tag.muted {
    color: var(--ink-soft);
  }

  .gorunum-seg-row {
    display: flex;
    justify-content: flex-start;
    margin: 0.25rem 0 0.5rem;
  }
  .seg {
    display: inline-flex;
    background: var(--surface-2);
    border-radius: 6px;
    padding: 2px;
    border: 1px solid var(--hairline);
  }
  .seg button {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 500;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .ekstre-secici {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .ekstre-tab {
    flex: 1;
    min-width: 140px;
    padding: 0.6rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .ekstre-tab:hover {
    border-color: var(--accent-defter);
  }
  .ekstre-tab.active {
    background: var(--surface-2);
    border-color: var(--accent-defter);
    box-shadow: 0 0 0 1px var(--accent-defter);
  }
  .tab-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink);
  }
  .tab-sub {
    font-size: 0.7rem;
    color: var(--ink-soft);
    margin-top: 0.15rem;
    font-family: var(--font-num);
  }
  .tab-amount {
    font-size: 0.95rem;
    font-weight: 600;
    margin-top: 0.35rem;
  }

  .ekstre-ozet-karti {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .ozet-ust {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .ozet-tarihler {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .ozet-etiket {
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--ink);
  }
  .tarih-araligi {
    font-size: 0.78rem;
    color: var(--ink-soft);
    font-family: var(--font-num);
  }
  .son-odeme-badge {
    font-size: 0.75rem;
    background: rgba(220, 53, 69, 0.1);
    color: var(--loss);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-family: var(--font-num);
  }
  .btn-copy {
    padding: 0.35rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 500;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-copy:hover {
    border-color: var(--accent-defter);
    background: var(--surface);
  }

  .kisi-dagilimi {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--surface-2);
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
  }
  .dagilim-baslik {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .kisi-etiketler {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .kisi-badge {
    font-size: 0.78rem;
    color: var(--ink);
    background: var(--surface);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--hairline);
  }

  .ekstre-rakamlar {
    display: flex;
    gap: 1.5rem;
    padding-top: 0.35rem;
    border-top: 1px dashed var(--hairline);
  }
  .rakam-kutu {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .rakam-kutu span {
    font-size: 0.72rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .rakam-kutu b {
    font-size: 0.95rem;
  }
</style>
