<script lang="ts">
  import type { WarningItem } from '../data/uyarilar'

  let { warnings = [] }: { warnings?: WarningItem[] } = $props()

  const STORAGE_KEY = 'bbb-warnings-expanded'

  let expanded = $state(
    (() => {
      try {
        const val = localStorage.getItem(STORAGE_KEY)
        return val !== null ? val === 'true' : true
      } catch {
        return true
      }
    })(),
  )

  function toggle() {
    expanded = !expanded
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded))
    } catch {
      /* ignore */
    }
  }

  const PAGE_LABELS: Record<string, string> = {
    panorama: "Panorama'ya git",
    pozisyonlar: "Pozisyonlar'a git",
    portfoyler: "Portföyler'e git",
    kurumlar: "Kurumlar'a git",
    aylik: "Aylık Rapor'a git",
    banka: "Banka'ya git",
    temettu: "Temettü'ye git",
  }

  const hasHata = $derived(warnings.some((w) => w.seviye === 'hata'))
</script>

{#if warnings.length > 0}
  <aside class="uyari-seridi" class:has-hata={hasHata} data-testid="uyari-seridi">
    <div class="header" role="button" tabindex="0" onclick={toggle} onkeydown={(e) => e.key === 'Enter' && toggle()}>
      <div class="summary">
        <span class="icon">{hasHata ? '⛔' : '⚠'}</span>
        <strong class="count">{warnings.length} uyarı</strong>
      </div>
      <button
        type="button"
        class="toggle-btn"
        data-testid="uyari-toggle"
        aria-expanded={expanded}
        onclick={(e) => {
          e.stopPropagation()
          toggle()
        }}
      >
        {expanded ? 'gizle ▴' : 'göster ▾'}
      </button>
    </div>

    {#if expanded}
      <ul class="list">
        {#each warnings as item (item.id)}
          <li class="item item-{item.seviye}">
            <span class="bullet">•</span>
            <span class="message">{item.mesaj}</span>
            <span class="action">
              {#if item.sayfa}
                <a href={`#/${item.sayfa}`} class="link">
                  → {PAGE_LABELS[item.sayfa] ?? `${item.sayfa}'ya git`}
                </a>
              {:else}
                <span class="no-link">→ —</span>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .uyari-seridi {
    background: rgba(229, 154, 56, 0.08);
    border-bottom: 1px solid rgba(229, 154, 56, 0.25);
    color: var(--ink);
    font-size: 0.8125rem;
    padding: 0.5rem 1.25rem;
    transition: background 0.15s ease;
  }
  .uyari-seridi.has-hata {
    background: rgba(224, 115, 106, 0.08);
    border-bottom-color: rgba(224, 115, 106, 0.25);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
    gap: 0.75rem;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .icon {
    font-size: 0.95rem;
    line-height: 1;
  }
  .count {
    font-weight: 600;
    color: var(--warn, #e59a38);
    letter-spacing: 0.01em;
  }
  .has-hata .count {
    color: var(--loss, #e0736a);
  }
  .toggle-btn {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
  }
  .toggle-btn:hover {
    color: var(--ink);
    background: var(--row-hover);
  }
  .list {
    margin: 0.5rem 0 0.25rem;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .item {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.15rem 0;
    line-height: 1.4;
  }
  .bullet {
    color: var(--ink-soft);
    font-size: 0.9rem;
    flex-shrink: 0;
  }
  .item-hata .bullet {
    color: var(--loss, #e0736a);
  }
  .item-uyari .bullet {
    color: var(--warn, #e59a38);
  }
  .message {
    flex: 1;
    min-width: 0;
  }
  .action {
    flex-shrink: 0;
    margin-left: 0.75rem;
  }
  .link {
    color: var(--ink-soft);
    text-decoration: none;
    font-weight: 500;
    white-space: nowrap;
    transition: color 0.15s ease;
  }
  .link:hover {
    color: var(--ink);
    text-decoration: underline;
  }
  .no-link {
    color: var(--ink-soft);
    opacity: 0.6;
    white-space: nowrap;
  }
</style>
