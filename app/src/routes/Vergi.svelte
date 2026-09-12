<script lang="ts">
  import type { Dataset } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { money } from '../lib/settings.svelte'
  import { dateShort, DASH } from '../lib/format'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'
  import { buildVergiOzeti, exportVergiCsv, getMevcutYillar } from '../lib/data/vergi'

  let { dataset, derived: bundle }: { dataset?: Dataset; derived?: DerivedBundle } = $props()

  const sales = $derived(bundle?.positions?.sales ?? [])
  const yillar = $derived(dataset ? getMevcutYillar(dataset, sales) : [2026])

  let seciliYil = $state(2026)

  const ozet = $derived(
    dataset && bundle ? buildVergiOzeti(dataset, sales, seciliYil) : null,
  )

  const sinifCols = [
    { key: 'sinifEtiket', label: 'Varlık Sınıfı', sortable: true },
    { key: 'satisSayisi', label: 'Satış Adedi', align: 'right' as const, sortable: true },
    { key: 'toplamMaliyetUsd', label: 'Toplam Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'toplamHasilatUsd', label: 'Toplam Hasılat', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'toplamKarUsd', label: 'Toplam Kâr', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'toplamZararUsd', label: 'Toplam Zarar', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'netKzUsd', label: 'Net K/Z', align: 'right' as const, sortable: true, fmt: (v: number) => money(v, { sign: true }) },
    { key: 'komisyonUsd', label: 'Komisyon', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
  ]

  const satisCols = [
    { key: 'tarih', label: 'Tarih', sortable: true, fmt: (v: string) => dateShort(v) },
    { key: 'kod', label: 'Kod', sortable: true },
    { key: 'ad', label: 'Ad', sortable: true },
    { key: 'sinifEtiket', label: 'Sınıf', sortable: true },
    { key: 'lot', label: 'Lot', align: 'right' as const, sortable: true, fmt: (v: number) => v.toLocaleString('tr-TR') },
    { key: 'maliyetUsd', label: 'Maliyet', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'hasilatUsd', label: 'Hasılat', align: 'right' as const, sortable: true, fmt: (v: number) => money(v) },
    { key: 'kzUsd', label: 'K/Z', align: 'right' as const, sortable: true, fmt: (v: number) => money(v, { sign: true }) },
    { key: 'tutmaGunu', label: 'Tutma Süresi', align: 'right' as const, sortable: true, fmt: (v: number | null) => (v != null ? `${v} gün` : DASH) },
  ]

  function indirCsv() {
    if (!ozet || ozet.satislar.length === 0) return
    const csvContent = exportVergiCsv(ozet.satislar)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vergi-ozeti-${seciliYil}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

{#if dataset && bundle && ozet}
  <section class="vergi">
    <!-- Kalıcı yasal sınır notu -->
    <div class="disclaimer-banner" data-testid="vergi-disclaimer">
      <p class="disclaimer-text">
        Bu sayfa bir vergi beyanı değil, defterden çıkarılmış bir özettir. Stopaj, istisna ve mahsup kuralları hesaplanmaz.
      </p>
    </div>

    <!-- Başlık ve Yıl Seçici Kontrolü -->
    <div class="vergi-toolbar">
      <div class="toolbar-left">
        <label for="vergi-yil-select" class="yil-label">Vergilendirme Yılı:</label>
        <select
          id="vergi-yil-select"
          class="yil-select"
          value={seciliYil}
          onchange={(e) => (seciliYil = Number((e.currentTarget as HTMLSelectElement).value))}
        >
          {#each yillar as y}
            <option value={y}>{y}</option>
          {/each}
        </select>
      </div>
      <div class="toolbar-right">
        {#if ozet.satislar.length > 0}
          <button class="csv-btn" onclick={indirCsv} data-testid="vergi-csv-btn">
            CSV İndir ({ozet.satislar.length} işlem)
          </button>
        {/if}
      </div>
    </div>

    <!-- Yıllık Özet Kartları -->
    <SectionHeader title={`${seciliYil} Yılı Özeti`} note={`${ozet.satisSayisi} satış işlemi`} />
    <dl class="mini">
      <div>
        <dt>Satış Sayısı <span class="scope">{seciliYil}</span></dt>
        <dd class="num strong">{ozet.satisSayisi}</dd>
      </div>
      <div>
        <dt>Toplam Hasılat <span class="scope">{seciliYil}</span></dt>
        <dd class="num">{money(ozet.toplamHasilatUsd)}</dd>
      </div>
      <div>
        <dt>Toplam Maliyet <span class="scope">{seciliYil}</span></dt>
        <dd class="num">{money(ozet.toplamMaliyetUsd)}</dd>
      </div>
      <div>
        <dt>Gerçekleşen Net K/Z <span class="scope">{seciliYil}</span></dt>
        <dd
          class="num strong"
          class:pos={ozet.gerceklesenKzUsd > 0}
          class:neg={ozet.gerceklesenKzUsd < 0}
        >
          {money(ozet.gerceklesenKzUsd, { sign: true })}
        </dd>
      </div>
      <div>
        <dt>Toplam Kâr <span class="scope">{seciliYil} kârlı işlemler</span></dt>
        <dd class="num pos">{money(ozet.toplamKarUsd, { sign: true })}</dd>
      </div>
      <div>
        <dt>Toplam Zarar <span class="scope">{seciliYil} zararlı işlemler</span></dt>
        <dd class="num neg">{money(ozet.toplamZararUsd)}</dd>
      </div>
      <div>
        <dt>Ödenen Komisyon <span class="scope">{seciliYil}</span></dt>
        <dd class="num">{money(ozet.komisyonUsd)}</dd>
      </div>
      <div>
        <dt>Alınan Temettü <span class="scope">{seciliYil}</span></dt>
        <dd class="num">{money(ozet.temettuUsd)}</dd>
      </div>
    </dl>

    {#if ozet.satislar.length === 0}
      <div class="empty-year" data-testid="empty-year-msg">
        <p>Bu yılda satış işlemi bulunmuyor.</p>
      </div>
    {:else}
      <!-- Varlık Sınıfı Kırılımı -->
      <SectionHeader
        title="Varlık Sınıfı Kırılımı"
        note="GVK mükerrer 80 / geçici 67 uyarınca sınıflar ayrı vergilendirilir"
      />
      <div class="table-container">
        <DataTable columns={sinifCols} rows={ozet.siniflar} initialSort={{ key: 'toplamHasilatUsd', dir: 'desc' }} />
      </div>

      <!-- Kapanan Satış İşlemleri Dökümü -->
      <SectionHeader title="Satış İşlemleri Dökümü" note={`${ozet.satislar.length} satır`} />
      <div class="table-container">
        <DataTable columns={satisCols} rows={ozet.satislar} initialSort={{ key: 'tarih', dir: 'desc' }} />
      </div>
    {/if}
  </section>
{:else}
  <EmptyState title="Vergi Raporu" detail="Veri bekleniyor." />
{/if}

<style>
  .vergi {
    padding: 1.25rem 1.25rem 2.5rem;
    max-width: min(1100px, 96vw);
    margin: 0 auto;
  }

  .disclaimer-banner {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-left: 4px solid var(--accent, #3b82f6);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.25rem;
  }

  .disclaimer-text {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--text-muted, #64748b);
  }

  .vergi-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .yil-label {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .yil-select {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 4px;
    background: var(--bg-card, #ffffff);
    color: inherit;
    cursor: pointer;
  }

  .csv-btn {
    padding: 0.375rem 0.875rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .csv-btn:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  .empty-year {
    padding: 2.5rem 1rem;
    text-align: center;
    color: var(--text-muted, #64748b);
    background: var(--bg-card, #ffffff);
    border: 1px dashed var(--border-color, #cbd5e1);
    border-radius: 6px;
    margin: 1.5rem 0;
  }

  .empty-year p {
    margin: 0;
    font-size: 0.9375rem;
  }

  .table-container {
    margin-bottom: 1.5rem;
  }

  dl.mini {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  dl.mini > div {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 0.625rem 0.75rem;
  }

  dl.mini dt {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
    margin-bottom: 0.25rem;
  }

  dl.mini dt .scope {
    font-size: 0.6875rem;
    opacity: 0.8;
    display: block;
  }

  dl.mini dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .pos {
    color: var(--pos, #16a34a);
  }

  .neg {
    color: var(--neg, #dc2626);
  }
</style>
