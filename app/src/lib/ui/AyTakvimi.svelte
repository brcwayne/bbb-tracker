<script lang="ts">
  import type { DayBucket } from '../data/accounts'
  import { tryFmt, usd } from '../format'

  let {
    yil,
    ay,
    gunler,
    paraBirimi,
    secili = null,
    bugun = new Date().toISOString().slice(0, 10),
    onSelect,
    onAdd,
    onAyDegis,
  }: {
    yil: number
    ay: number
    gunler: Map<number, DayBucket>
    paraBirimi: string
    secili?: number | null
    bugun?: string
    onSelect?: (gun: number | null) => void
    onAdd?: (gun: number) => void
    onAyDegis?: (yil: number, ay: number) => void
  } = $props()

  const GUN_BASLIK = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
  const AY_ADI = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ]

  /** getUTCDay() is 0=Sunday; the Turkish week starts Monday, so shift by one. */
  const oncekiBosluk = $derived((new Date(Date.UTC(yil, ay - 1, 1)).getUTCDay() + 6) % 7)
  const gunSayisi = $derived(new Date(Date.UTC(yil, ay, 0)).getUTCDate())
  const hucreler = $derived(
    Array.from({ length: oncekiBosluk }, () => null as number | null)
      .concat(Array.from({ length: gunSayisi }, (_, i) => i + 1)),
  )

  const bugunGun = $derived(
    bugun.startsWith(`${yil}-${String(ay).padStart(2, '0')}`) ? Number(bugun.slice(8, 10)) : -1,
  )

  /** 1.234,56 → "1,2B" — a full figure never fits a calendar cell. */
  function kisa(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M'
    if (v >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + 'B'
    return String(Math.round(v))
  }

  const tam = (v: number) => (paraBirimi === 'USD' ? usd(v) : tryFmt(v))

  function etiket(gun: number): string {
    const b = gunler.get(gun)
    const tarih = `${gun} ${AY_ADI[ay - 1]} ${yil}`
    if (!b) return `${tarih}, hareket yok`
    const parcalar: string[] = []
    if (b.giris > 0) parcalar.push(`giriş ${tam(b.giris)}`)
    if (b.cikis > 0) parcalar.push(`çıkış ${tam(b.cikis)}`)
    return `${tarih}, ${parcalar.join(', ')}`
  }

  function sec(gun: number) {
    onSelect?.(secili === gun ? null : gun)
  }

  function ayKaydir(delta: number) {
    const i = yil * 12 + (ay - 1) + delta
    onAyDegis?.(Math.floor(i / 12), (i % 12) + 1)
  }

  // Long-press (spec §6.3): cancelled by movement so scrolling never fires it,
  // and the click that follows is suppressed.
  let basmaZamani: ReturnType<typeof setTimeout> | null = null
  let uzunBasildi = $state(false)
  let baslangic = { x: 0, y: 0 }

  function basla(e: PointerEvent, gun: number) {
    uzunBasildi = false
    baslangic = { x: e.clientX, y: e.clientY }
    basmaZamani = setTimeout(() => {
      uzunBasildi = true
      onAdd?.(gun)
    }, 600)
  }
  function kimilda(e: PointerEvent) {
    if (!basmaZamani) return
    if (Math.abs(e.clientX - baslangic.x) > 8 || Math.abs(e.clientY - baslangic.y) > 8) iptal()
  }
  function iptal() {
    if (basmaZamani) clearTimeout(basmaZamani)
    basmaZamani = null
  }
  function tikla(gun: number) {
    iptal()
    if (uzunBasildi) {
      uzunBasildi = false
      return
    }
    sec(gun)
  }
</script>

<div class="takvim">
  <div class="ay-bar">
    <button type="button" aria-label="Önceki ay" class="ay-nav" onclick={() => ayKaydir(-1)}>‹</button>
    <button
      type="button"
      class="ay-adi"
      onclick={() => {
        const n = new Date()
        onAyDegis?.(n.getFullYear(), n.getMonth() + 1)
      }}
    >
      {AY_ADI[ay - 1]} {yil}
    </button>
    <button type="button" aria-label="Sonraki ay" class="ay-nav" onclick={() => ayKaydir(1)}>›</button>
  </div>

  <div class="grid">
    {#each GUN_BASLIK as g}
      <div class="weekday" data-weekday>{g}</div>
    {/each}

    {#each hucreler as gun}
      {#if gun === null}
        <div class="hucre disari" data-outside></div>
      {:else}
        {@const b = gunler.get(gun)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="hucre-sarma"
          data-day={gun}
          data-today={gun === bugunGun ? 'true' : null}
          aria-label={etiket(gun)}
          onclick={() => tikla(gun)}
        >
          <button
            type="button"
            class="hucre"
            data-today={gun === bugunGun ? 'true' : null}
            class:secili={gun === secili}
            class:bugun-ring={gun === bugunGun}
            aria-label={etiket(gun)}
            aria-pressed={gun === secili}
            onpointerdown={(e) => basla(e, gun)}
            onpointermove={kimilda}
            onpointerup={iptal}
            onpointercancel={iptal}
            onpointerleave={iptal}
            oncontextmenu={(e) => e.preventDefault()}
            onclick={(e) => {
              e.stopPropagation()
              tikla(gun)
            }}
          >
            <span class="gun-no">{gun}</span>
            {#if b && b.giris > 0}<span class="tutar in" data-in>{kisa(b.giris)}</span>{/if}
            {#if b && b.cikis > 0}<span class="tutar out" data-out>{kisa(b.cikis)}</span>{/if}
          </button>
          {#if gun === secili}
            <button
              type="button"
              class="ekle"
              data-add
              aria-label={`${gun} ${AY_ADI[ay - 1]} için hareket ekle`}
              onclick={(e) => {
                e.stopPropagation()
                onAdd?.(gun)
              }}
            >+</button>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .takvim {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 0.85rem 1rem 1rem;
  }

  .ay-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .ay-nav {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--ink);
    border-radius: 6px;
    width: 32px;
    height: 32px;
    font-size: 1.2rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .ay-nav:hover {
    background: var(--surface-2);
  }
  .ay-adi {
    background: transparent;
    border: 0;
    color: var(--ink);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.35rem 0.65rem;
    border-radius: 6px;
    transition: background 0.15s ease;
  }
  .ay-adi:hover {
    background: var(--surface-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
  }

  .weekday {
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.3rem 0 0.5rem;
  }

  .hucre-sarma {
    position: relative;
    width: 100%;
    min-height: 44px;
    display: flex;
  }

  .hucre {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 44px;
    padding: 0.25rem 0.1rem;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }
  .hucre:hover:not(.disari) {
    background: var(--row-hover);
  }
  .hucre.bugun-ring {
    border-color: var(--accent-defter);
  }
  .hucre.secili {
    background: var(--surface-2);
    border-color: var(--accent-defter);
    box-shadow: 0 0 0 1px var(--accent-defter);
  }

  .hucre.disari {
    background: transparent;
    border: 0;
    cursor: default;
    pointer-events: none;
  }

  .gun-no {
    font-size: 0.76rem;
    font-family: var(--font-num);
    font-weight: 500;
    line-height: 1;
    margin-bottom: 2px;
  }

  .tutar {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
    font-size: 0.64rem;
    font-weight: 600;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .tutar.in {
    color: var(--gain);
  }
  .tutar.out {
    color: var(--loss);
  }

  .ekle {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-defter);
    color: #fff;
    border: 0;
    font-size: 0.75rem;
    font-weight: bold;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
  .ekle:hover {
    filter: brightness(1.15);
  }
</style>
