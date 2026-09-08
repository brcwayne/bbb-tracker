<script lang="ts">
  import type { Writable } from 'svelte/store'
  import type { Dataset, PaymentPlan, PersonalTx } from '../../lib/data/types'
  import type { AppState } from '../../lib/data/store'
  import type { DataSource } from '../../lib/data/source'
  import { deleteRecord } from '../../lib/data/store'
  import { activePlans, instalmentSchedule } from '../../lib/data/personal'
  import { tryFmt, usd, monthLabel } from '../../lib/format'
  import BarChart from '../../lib/charts/BarChart.svelte'
  import EmptyState from '../../lib/ui/EmptyState.svelte'

  let {
    dataset,
    source,
    store,
    today = new Date().toISOString().slice(0, 10),
  }: {
    dataset?: Dataset | null
    source?: DataSource
    store?: Writable<AppState>
    today?: string
  } = $props()

  const isDrive = $derived(Boolean(source?.save))

  let cancellingPlan = $state<PaymentPlan | null>(null)
  let cancelling = $state(false)
  let cancelError = $state<string | null>(null)

  const plans = $derived<PaymentPlan[]>(
    dataset?.payment_plans !== undefined ? dataset.payment_plans : dataset?.paymentPlans ?? [],
  )
  const rows = $derived<PersonalTx[]>(
    dataset?.personal_tx !== undefined ? dataset.personal_tx : dataset?.personalTx ?? [],
  )
  const categories = $derived(dataset?.categories ?? [])
  const catName = (kod: string) => categories.find((c) => c.kod === kod)?.ad ?? kod

  const active = $derived(activePlans(plans, rows, today))
  const schedule = $derived(instalmentSchedule(rows, today, 12))

  const scheduleBars = $derived(
    schedule
      .filter((s) => s.para === 'TRY')
      .map((s) => ({
        label: monthLabel(s.ay + '-01'),
        value: s.toplam,
      })),
  )
  const hasSchedule = $derived(scheduleBars.some((b) => b.value > 0))

  const fmtAmount = (n: number, curr: string) => (curr === 'USD' ? usd(n) : tryFmt(n))

  function getFutureRows(planId: string): PersonalTx[] {
    return rows.filter((r) => r.taksitPlaniId === planId && r.tarih > today)
  }

  async function confirmCancel() {
    if (!cancellingPlan || !store || !source) return
    cancelling = true
    cancelError = null
    const targetPlan = cancellingPlan
    try {
      const futureRows = getFutureRows(targetPlan.id)
      if (futureRows.length > 0) {
        await deleteRecord<PersonalTx>(
          store,
          source,
          'personal_tx',
          (r) => r.taksitPlaniId === targetPlan.id && r.tarih > today,
          { allowKaynak: ['telegram', 'manual'] },
        )
      }
      await deleteRecord<PaymentPlan>(
        store,
        source,
        'payment_plans',
        (p) => p.id === targetPlan.id,
        { allowKaynak: ['telegram', 'manual'] },
      )
      cancellingPlan = null
    } catch (err: any) {
      cancelError = err?.message || 'Plan iptal edilirken bir hata oluştu'
    } finally {
      cancelling = false
    }
  }
</script>

{#if active.length === 0}
  <div class="empty-container">
    <EmptyState
      title="Henüz aktif plan yok"
      detail="Telegram botundan taksitli harcama girdikçe planlar burada listelenecek."
    />
  </div>
{:else}
  <div class="page-container">
    {#if !isDrive}
      <div class="offline-note">
        <span>Düzenleme için Drive bağlantısı gerekiyor (yerel kaynakta sadece okuma yapılır).</span>
      </div>
    {/if}

    <!-- 12 Aylık Taksit Yükü Grafiği -->
    {#if hasSchedule}
      <section class="chart-card" data-chart="taksit-yuk">
        <h3 class="section-title">Önümüzdeki 12 Ayın Taksit Yükü (₺)</h3>
        <BarChart bars={scheduleBars} fmt={(v) => tryFmt(v, { whole: true })} />
      </section>
    {/if}

    <!-- Aktif Taksit Planları -->
    <section class="plans-section">
      <h3 class="section-title">Aktif Planlar ({active.length})</h3>
      <div class="plans-grid">
        {#each active as item}
          {@const p = item.plan}
          {@const paidPercent = Math.min(100, Math.round((item.odenen / (p.toplamTutar || 1)) * 100))}
          {@const futureCount = getFutureRows(p.id).length}
          <div class="plan-card">
            <div class="plan-header">
              <div class="plan-titles">
                <h4 class="plan-name">{p.aciklama}</h4>
                <span class="plan-meta">{catName(p.kategori)} · {p.hesap} · {p.sahip}</span>
              </div>
              <span class="progress-badge num">{item.ilerleme}</span>
            </div>

            <!-- İlerleme Çubuğu -->
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style:width="{paidPercent}%"></div>
            </div>

            <!-- Tutar Detayları -->
            <div class="figures-row">
              <div class="figure-item">
                <span class="fig-label">Toplam</span>
                <span class="fig-val num">{fmtAmount(p.toplamTutar, p.paraBirimi)}</span>
              </div>
              <div class="figure-item">
                <span class="fig-label">Ödenen</span>
                <span class="fig-val num gain">{fmtAmount(item.odenen, p.paraBirimi)}</span>
              </div>
              <div class="figure-item">
                <span class="fig-label">Kalan</span>
                <span class="fig-val num loss">{fmtAmount(item.kalan, p.paraBirimi)}</span>
              </div>
              <div class="figure-item">
                <span class="fig-label">Aylık</span>
                <span class="fig-val num">{fmtAmount(p.taksitTutari, p.paraBirimi)}</span>
              </div>
            </div>

            <!-- Plan İptal / Onay Bölümü -->
            {#if cancellingPlan?.id === p.id}
              <div class="confirm-box" role="alert">
                <p class="confirm-msg">
                  <strong>{p.aciklama}</strong> planı iptal edilecek. {futureCount} gelecek taksit silinecek, geçmiş taksitler korunacak. Onaylıyor musunuz?
                </p>
                {#if cancelError}
                  <p class="error-msg">{cancelError}</p>
                {/if}
                <div class="confirm-actions">
                  <button
                    type="button"
                    class="btn-vazgec"
                    disabled={cancelling}
                    onclick={() => { cancellingPlan = null; cancelError = null }}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    class="btn-confirm-delete"
                    disabled={cancelling}
                    onclick={confirmCancel}
                  >
                    {cancelling ? 'İptal ediliyor…' : 'Evet, İptal Et'}
                  </button>
                </div>
              </div>
            {:else}
              <div class="plan-card-footer">
                <button
                  type="button"
                  class="btn-cancel-plan"
                  disabled={!isDrive}
                  title={!isDrive ? 'Düzenleme için Drive bağlantısı gerekiyor' : 'Planı iptal et'}
                  onclick={() => { cancellingPlan = p; cancelError = null }}
                >
                  Planı İptal Et
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
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
  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--ink-soft);
  }
  .chart-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }
  .plan-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 1rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .plan-titles {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .plan-name {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    color: var(--ink);
  }
  .plan-meta {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .progress-badge {
    font-size: 0.82rem;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--accent-defter);
    border: 1px solid var(--hairline);
    padding: 0.2rem 0.55rem;
    border-radius: 12px;
  }
  .progress-track {
    height: 6px;
    background: var(--surface-2);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent-defter);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .figures-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--hairline);
  }
  .figure-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .fig-label {
    font-size: 0.7rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .fig-val {
    font-size: 0.9rem;
    font-weight: 600;
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
  .offline-note {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .plan-card-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.4rem;
    border-top: 1px dashed var(--hairline);
  }
  .btn-cancel-plan {
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--ink-soft);
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-cancel-plan:hover:not(:disabled) {
    border-color: var(--loss);
    color: var(--loss);
    background: rgba(239, 68, 68, 0.08);
  }
  .btn-cancel-plan:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .confirm-box {
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 6px;
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .confirm-msg {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--ink);
  }
  .confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .btn-vazgec {
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--ink);
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-vazgec:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .btn-confirm-delete {
    background: var(--loss);
    border: 1px solid var(--loss);
    color: #fff;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-confirm-delete:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn-vazgec:disabled,
  .btn-confirm-delete:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .error-msg {
    margin: 0;
    font-size: 0.8rem;
    color: var(--loss);
  }
</style>
