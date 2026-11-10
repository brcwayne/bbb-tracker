<script lang="ts">
  import type { Dataset } from '../data/types'
  import type { DerivedBundle } from '../data/store'
  import type { DataSource } from '../data/source'
  import type { Writable } from 'svelte/store'
  import type { AppState } from '../data/store'
  import type { Volume } from '../../router'
  import { settings } from '../settings.svelte'
  import IslemFormu from '../../routes/forms/IslemFormu.svelte'
  import NakitHareketiFormu from '../../routes/forms/NakitHareketiFormu.svelte'
  import VarlikTransferiFormu from '../../routes/forms/VarlikTransferiFormu.svelte'
  import HarcamaFormu from '../../routes/hesaplar/HarcamaFormu.svelte'

  let {
    dataset,
    view,
    source,
    store,
    volume = 'yatirim',
  }: {
    dataset?: Dataset
    view?: DerivedBundle
    source?: DataSource
    store?: Writable<AppState>
    volume?: Volume
  } = $props()

  type DrawerTab = 'islem' | 'nakit' | 'transfer' | 'harcama'
  let activeTab = $state<DrawerTab>('islem')
  let feedbackMessage = $state<string | null>(null)
  let timer: any = null

  $effect(() => {
    if (settings.quickDrawerOpen) {
      activeTab = volume === 'hesaplar' ? 'harcama' : 'islem'
    }
  })

  function handleSaved(msg = 'Kayıt başarıyla kaydedildi.') {
    feedbackMessage = msg
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      feedbackMessage = null
      settings.quickDrawerOpen = false
    }, 1000)
  }

  function closeDrawer() {
    settings.quickDrawerOpen = false
    feedbackMessage = null
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && settings.quickDrawerOpen) {
      closeDrawer()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if settings.quickDrawerOpen}
  <div
    class="drawer-backdrop"
    onclick={closeDrawer}
    role="presentation"
    aria-hidden="true"
  ></div>

  <div
    class="drawer-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Hızlı Kayıt Çekmecesi"
    data-testid="quick-action-drawer"
  >
    <header class="drawer-header">
      <div class="drawer-title-group">
        <h2 class="drawer-title">⚡ Hızlı Kayıt Ekle</h2>
        <span class="v2-tag">Obsidyen V2</span>
      </div>
      <button
        type="button"
        class="close-btn"
        onclick={closeDrawer}
        aria-label="Çekmeceyi kapat"
        title="Kapat (Esc)"
      >
        ✕
      </button>
    </header>

    {#if !source?.save}
      <div class="local-info-banner" data-testid="drawer-local-info">
        <div class="banner-head">
          <span class="banner-icon" aria-hidden="true">💡</span>
          <strong>Bilgi: Salt Okunur / Yerel Mod</strong>
        </div>
        <p>
          Canlı kayıt eklemek için sağ üstten veri kaynağını <strong>Google Drive</strong> olarak seçin.
        </p>
        <p class="banner-link">
          Şu an formları inceleyebilir veya <a href="#/ekle" onclick={closeDrawer}>detaylı Ekle sayfasına</a> geçebilirsiniz.
        </p>
      </div>
    {/if}

    <div class="drawer-tabs" role="tablist" aria-label="Hızlı İşlem Türü">
      <button
        type="button"
        role="tab"
        class:active={activeTab === 'islem'}
        aria-selected={activeTab === 'islem'}
        onclick={() => (activeTab = 'islem')}
      >
        📈 Hisse/Fon Al-Sat
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeTab === 'nakit'}
        aria-selected={activeTab === 'nakit'}
        onclick={() => (activeTab = 'nakit')}
      >
        💵 Nakit Hareketi
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeTab === 'transfer'}
        aria-selected={activeTab === 'transfer'}
        onclick={() => (activeTab = 'transfer')}
      >
        ⇄ Varlık Transferi
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeTab === 'harcama'}
        aria-selected={activeTab === 'harcama'}
        onclick={() => (activeTab = 'harcama')}
      >
        💳 Harcama / Gelir
      </button>
    </div>

    {#if feedbackMessage}
      <div class="feedback-banner" role="status" aria-live="polite">
        ✓ {feedbackMessage}
      </div>
    {/if}

    {#if dataset && source && store}
      <div class="drawer-form-body">
        {#if activeTab === 'islem' && view}
          <IslemFormu
            {dataset}
            {view}
            {source}
            {store}
            onSaved={() => handleSaved('İşlem başarıyla eklendi.')}
          />
        {:else if activeTab === 'nakit'}
          <NakitHareketiFormu
            {dataset}
            {source}
            {store}
            onSaved={() => handleSaved('Nakit hareketi başarıyla eklendi.')}
          />
        {:else if activeTab === 'transfer' && view}
          <VarlikTransferiFormu
            {dataset}
            {view}
            {source}
            {store}
            onSaved={() => handleSaved('Varlık transferi başarıyla eklendi.')}
          />
        {:else if activeTab === 'harcama'}
          <HarcamaFormu
            {dataset}
            {source}
            {store}
            onSaved={() => handleSaved('Harcama / gelir kaydı başarıyla eklendi.')}
            onCancel={closeDrawer}
          />
        {:else}
          <p class="drawer-empty">Veri görünümü hazırlanıyor…</p>
        {/if}
      </div>
    {:else}
      <p class="drawer-empty">Kayıt ekleyebilmek için veri kaynağı ve mağaza hazır olmalıdır…</p>
    {/if}
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 998;
    animation: fadeIn 0.18s ease;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .drawer-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(560px, 94vw);
    background: var(--surface);
    border-left: 1px solid var(--hairline);
    box-shadow: -12px 0 40px rgba(0, 0, 0, 0.6);
    z-index: 999;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 1.5rem 1.75rem 4rem;
    animation: slideIn 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--hairline);
    margin-bottom: 1.25rem;
  }
  .drawer-title-group {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .drawer-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .v2-tag {
    font-size: 0.72rem;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    background: rgba(232, 192, 122, 0.15);
    color: var(--gold);
    border: 1px solid rgba(232, 192, 122, 0.35);
    font-weight: 600;
  }

  .close-btn {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink-soft);
    width: 2.2rem;
    height: 2.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .close-btn:hover {
    color: var(--ink);
    border-color: var(--ink);
    background: var(--surface-hover);
  }

  .local-info-banner {
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.35);
    border-radius: 10px;
    padding: 0.85rem 1rem;
    margin-bottom: 1.25rem;
    font-size: 0.88rem;
    color: var(--warn);
    line-height: 1.5;
  }
  .banner-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }
  .banner-icon {
    font-size: 1rem;
  }
  .local-info-banner p {
    margin: 0 0 0.25rem;
  }
  .banner-link {
    margin-top: 0.4rem;
  }
  .banner-link a {
    color: var(--gold);
    text-decoration: underline;
    font-weight: 600;
  }

  .drawer-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 1.25rem;
  }
  .drawer-tabs button {
    appearance: none;
    border: 1px solid var(--hairline);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .drawer-tabs button:hover {
    color: var(--ink);
    border-color: var(--ink-soft);
  }
  .drawer-tabs button.active {
    background: rgba(232, 192, 122, 0.18);
    border-color: var(--gold);
    color: var(--gold);
    font-weight: 600;
    box-shadow: 0 0 8px rgba(232, 192, 122, 0.2);
  }

  .feedback-banner {
    background: rgba(52, 211, 153, 0.16);
    border: 1px solid var(--gain);
    color: var(--gain);
    padding: 0.75rem 1rem;
    border-radius: 10px;
    font-size: 0.92rem;
    font-weight: 600;
    margin-bottom: 1.25rem;
    animation: fadeIn 0.2s ease;
  }

  .drawer-form-body {
    flex: 1;
  }

  .drawer-empty {
    color: var(--ink-soft);
    font-size: 0.95rem;
    padding: 2rem 0;
    text-align: center;
  }
</style>
