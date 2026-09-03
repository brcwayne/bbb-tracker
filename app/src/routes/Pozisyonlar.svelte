<script lang="ts">
  import type { Dataset, Instrument, Transaction } from '../lib/data/types'
  import type { DerivedBundle } from '../lib/data/store'
  import { usd, pct, DASH } from '../lib/format'
  import KpiBand from '../lib/ui/KpiBand.svelte'
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
  import DataTable from '../lib/ui/DataTable.svelte'
  import EmptyState from '../lib/ui/EmptyState.svelte'

  // RULING P1-3 annotation form; props optional, guarded in the template.
  // RULING P1-10: the prop name `derived` collides with the `$derived` rune, so
  // the view model is assembled by a plain function under the `{#if}` guard.
  let { dataset, derived }: { dataset?: Dataset; derived?: DerivedBundle } = $props()

  // Filter state (RULING P1-9: scoped page styles below). Empty string = "(hepsi)".
  let fClass = $state('')
  let fPortfoy = $state('')
  let fHesap = $state('')

  const distinct = (xs: string[]) => [...new Set(xs)]

  function latestTxByKod(txns: Transaction[]): Map<string, Transaction> {
    const m = new Map<string, Transaction>()
    for (const t of txns) {
      const prev = m.get(t.enstruman)
      if (
        !prev ||
        t.tarih > prev.tarih ||
        (t.tarih === prev.tarih && t.id > prev.id)
      )
        m.set(t.enstruman, t)
    }
    return m
  }

  function seviyeStr(inst: Instrument | undefined): string {
    const s = inst?.seviyeler
    if (!s) return DASH
    const parts: string[] = []
    if (s.destek != null) parts.push(`D ${s.destek}`)
    if (s.direnc != null) parts.push(`R ${s.direnc}`)
    if (s.hedef != null) parts.push(`H ${s.hedef}`)
    return parts.length ? parts.join(' / ') : DASH
  }

  function buildView(ds: Dataset, d: DerivedBundle) {
    const instByKod = new Map(ds.instruments.map((i) => [i.kod, i]))
    const latestTx = latestTxByKod(ds.transactions)

    // Defensive: derivePositions can leave a phantom zero-lot entry.
    const openRaw = d.positions.open.filter((p) => p.lot > 1e-9)
    const totalCost = openRaw.reduce((s, p) => s + p.toplamMaliyetUsd, 0) || 1

    const openRows = openRaw.map((p) => {
      const inst = instByKod.get(p.kod)
      const tx = latestTx.get(p.kod)
      return {
        kod: p.kod,
        sinif: inst?.sinif ?? DASH,
        portfoy: tx?.portfoy ?? DASH,
        hesap: tx?.hesap ?? DASH,
        lot: p.lot,
        ortMaliyetUsd: p.ortMaliyetUsd,
        toplamMaliyetUsd: p.toplamMaliyetUsd,
        pay: p.toplamMaliyetUsd / totalCost,
        guncelFiyat: DASH,
        gerceklesmemisKz: DASH,
        seviye: seviyeStr(inst),
      }
    })

    const closedRows = d.positions.closed.map((c) => ({
      kod: c.kod,
      // Sold-lot cost basis, not the full-buy notional (F2): avg cost of the
      // lots actually sold, so a winning partial exit doesn't read as a loss.
      alisOrt: c.satisLot ? c.satisMaliyetUsd / c.satisLot : null,
      alisTutarUsd: c.satisMaliyetUsd,
      satisOrt: c.satisLot ? c.satisTutarUsd / c.satisLot : null,
      satisTutarUsd: c.satisTutarUsd,
      gerceklesmisKzUsd: c.gerceklesmisKzUsd,
      pctVal: c.satisMaliyetUsd === 0 ? null : c.gerceklesmisKzUsd / c.satisMaliyetUsd,
    }))

    const s = d.stats
    return {
      statItems: [
        { label: 'Win:Loss', value: `${s.win}:${s.loss}` },
        { label: 'Kazanma Oranı', value: pct(s.kazanmaOrani) },
        { label: 'Ort. Kazanç %', value: pct(s.ortKazancPct) },
        { label: 'Ort. Kayıp %', value: pct(s.ortKayipPct) },
        { label: 'En Büyük Kazanç', value: usd(s.enBuyukKazanc) },
        { label: 'En Büyük Kayıp', value: usd(s.enBuyukKayip) },
        {
          label: 'Risk/Ödül',
          value: s.riskOdul == null ? DASH : s.riskOdul.toFixed(2),
        },
      ],
      openRows,
      closedRows,
      classOptions: distinct(ds.instruments.map((i) => i.sinif)),
      portfoyOptions: distinct(ds.transactions.map((t) => t.portfoy)),
      hesapOptions: distinct(ds.transactions.map((t) => t.hesap)),
    }
  }

  const num = (v: number | null) => usd(v as number)

  type OpenRow = ReturnType<typeof buildView>['openRows'][number]
  function applyFilters(
    rows: OpenRow[],
    cls: string,
    prt: string,
    hsp: string,
  ): OpenRow[] {
    return rows.filter(
      (r) =>
        (cls === '' || r.sinif === cls) &&
        (prt === '' || r.portfoy === prt) &&
        (hsp === '' || r.hesap === hsp),
    )
  }

  const openColumns = [
    { key: 'kod', label: 'Hisse', sortable: true },
    { key: 'sinif', label: 'Sınıf', sortable: true },
    { key: 'portfoy', label: 'Portföy', sortable: true },
    { key: 'lot', label: 'Lot', align: 'right' as const, sortable: true },
    {
      key: 'ortMaliyetUsd',
      label: 'Ort. Maliyet',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    {
      key: 'toplamMaliyetUsd',
      label: 'Toplam Maliyet',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    {
      key: 'pay',
      label: 'Pay %',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number) => pct(v),
    },
    { key: 'guncelFiyat', label: 'Güncel Fiyat', align: 'right' as const },
    { key: 'gerceklesmemisKz', label: 'Gerçekleşmemiş K/Z', align: 'right' as const },
    { key: 'seviye', label: 'Seviye' },
  ]

  const closedColumns = [
    { key: 'kod', label: 'Hisse', sortable: true },
    { key: 'alisOrt', label: 'Alış Ort.', align: 'right' as const, sortable: true, fmt: num },
    {
      key: 'alisTutarUsd',
      label: 'Alış Tutarı',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    { key: 'satisOrt', label: 'Satış Ort.', align: 'right' as const, sortable: true, fmt: num },
    {
      key: 'satisTutarUsd',
      label: 'Satış Tutarı',
      align: 'right' as const,
      sortable: true,
      fmt: num,
    },
    {
      key: 'gerceklesmisKzUsd',
      label: 'Gerçekleşmiş K/Z',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number) => usd(v, { sign: true }),
    },
    {
      key: 'pctVal',
      label: '%',
      align: 'right' as const,
      sortable: true,
      fmt: (v: number | null) => (v == null ? DASH : pct(v)),
    },
  ]
</script>

{#if dataset && derived}
  {@const vm = buildView(dataset, derived)}
  {@const openFiltered = applyFilters(vm.openRows, fClass, fPortfoy, fHesap)}
  <section class="pozisyonlar">
    <SectionHeader title="Pozisyonlar" />

    <KpiBand items={vm.statItems} />

    <SectionHeader title="Açık pozisyonlar" note={`${openFiltered.length} kayıt`} />

    <div class="filters">
      <div class="flt">
        <label for="flt-class">Sınıf</label>
        <select id="flt-class" bind:value={fClass}>
          <option value="">(hepsi)</option>
          {#each vm.classOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
      <div class="flt">
        <label for="flt-portfoy">Portföy</label>
        <select id="flt-portfoy" bind:value={fPortfoy}>
          <option value="">(hepsi)</option>
          {#each vm.portfoyOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
      <div class="flt">
        <label for="flt-hesap">Hesap</label>
        <select id="flt-hesap" bind:value={fHesap}>
          <option value="">(hepsi)</option>
          {#each vm.hesapOptions as o}<option value={o}>{o}</option>{/each}
        </select>
      </div>
    </div>

    <div data-testid="open-table">
      <DataTable
        columns={openColumns}
        rows={openFiltered}
        initialSort={{ key: 'toplamMaliyetUsd', dir: 'desc' }}
      />
    </div>

    <SectionHeader title="Kapalı pozisyonlar" />
    <div data-testid="closed-table">
      <DataTable
        columns={closedColumns}
        rows={vm.closedRows}
        initialSort={{ key: 'kod', dir: 'asc' }}
      />
    </div>

    <aside class="notes" data-testid="pozisyonlar-notes">
      {#if derived.positions.errors.length}
        <h3>Uyarılar</h3>
        <ul>
          {#each derived.positions.errors as e}<li>{e}</li>{/each}
        </ul>
      {/if}
      <p class="approx">
        Portföy / Hesap sütunu enstrümanın son işlemine göre gösterilir (yaklaşık).
      </p>
    </aside>
  </section>
{:else}
  <EmptyState title="Pozisyonlar" detail="Veri bekleniyor." />
{/if}

<style>
  .pozisyonlar {
    padding: 1.25rem;
    max-width: 960px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0.5rem 0 0.75rem;
  }
  .flt {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85em;
  }
  .flt label {
    color: var(--ink-soft);
    letter-spacing: 0.02em;
  }
  .flt select {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--hairline);
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }
  .notes {
    margin-top: 1.25rem;
    font-size: 0.85em;
    color: var(--ink-soft);
  }
  .notes h3 {
    margin: 0 0 0.35rem;
    font-size: 0.9em;
    letter-spacing: 0.02em;
    color: var(--loss);
  }
  .notes ul {
    margin: 0 0 0.75rem;
    padding-left: 1.1rem;
  }
  .notes .approx {
    margin: 0;
  }
</style>
