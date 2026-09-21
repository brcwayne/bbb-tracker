import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { writable, get } from 'svelte/store'
import Tekrarlayanlar from './Tekrarlayanlar.svelte'
import { fixture } from '../../fixtures/dataset'
import type { AppState } from '../../lib/data/store'

const dataset = {
  ...fixture,
  recurringRules: [
    { id: 'rr_1', tur: 'GIDER' as const, aciklama: 'Netflix', kategori: 'market', hesap: 'NAKIT', sahip: 'ENIS', paraBirimi: 'TRY' as const, tutar: 229.9, gunOfMonth: 5, baslangicTarihi: '2026-01-01', bitisTarihi: null, aktif: true, olusturulma: '', kaynak: 'manual' as const },
  ],
}

// rr_1'in henüz onaylanmamış (durum: 'planlandi') ileri tarihli bir satırını da
// içeren varyant — D9: durdurma bu satırı silmeli.
const datasetWithPlanned = {
  ...dataset,
  personalTx: [
    ...(fixture.personalTx ?? []),
    {
      id: 'px_rr1', tarih: '2026-10-05', tur: 'GIDER' as const, tutar: 229.9, paraBirimi: 'TRY' as const,
      kategori: 'market', aciklama: 'Netflix', hesap: 'NAKIT', sahip: 'ENIS',
      taksitPlaniId: null, taksitNo: null, taksitToplam: null, not: '',
      kaynak: 'manual' as const, olusturulma: '', tekrarKuralId: 'rr_1', durum: 'planlandi' as const,
    },
  ],
}

describe('Tekrarlayanlar', () => {
  it('mevcut kuralları listeler', () => {
    const { getByText } = render(Tekrarlayanlar, { dataset })
    expect(getByText('Netflix')).toBeInTheDocument()
  })

  it('kural durdurulunca aktif=false olarak güncellenir', async () => {
    const store = writable<AppState>({ status: 'ready', dataset, derived: {} as any, sourceText: '' } as any)
    // toggleAktif durdururken hem 'recurring_rules'a hem 'personal_tx'e yazar
    // (D9) — dosya bazlı yakala, sonuncusu değil.
    const saved: Record<string, any[]> = {}
    const source: any = {
      id: 'drive',
      load: () => Promise.resolve(dataset),
      save: async (file: string, d: unknown) => { saved[file] = d as any[] },
    }
    const { getByTitle } = render(Tekrarlayanlar, { dataset, source, store })
    await fireEvent.click(getByTitle('Durdur'))
    expect(saved['recurring_rules'][0].aktif).toBe(false)
  })

  it('kural durdurulunca planlandı personal_tx satırları da silinir (D9)', async () => {
    const store = writable<AppState>(
      { status: 'ready', dataset: datasetWithPlanned, derived: {} as any, sourceText: '' } as any,
    )
    const saved: Record<string, any[]> = {}
    const source: any = {
      id: 'drive',
      load: () => Promise.resolve(datasetWithPlanned),
      save: async (file: string, d: unknown) => { saved[file] = d as any[] },
    }
    const { getByTitle } = render(Tekrarlayanlar, { dataset: datasetWithPlanned, source, store })
    await fireEvent.click(getByTitle('Durdur'))

    expect(saved['recurring_rules'][0].aktif).toBe(false)
    expect(saved['personal_tx'].some((r) => r.id === 'px_rr1')).toBe(false)
    // Kuralla ilgisiz diğer satırlar dokunulmadan kalır.
    expect(saved['personal_tx'].some((r) => r.id === 'px_1')).toBe(true)
  })

  it('kural devam ettirilince personal_tx silinmez', async () => {
    const durdurulmusDataset = {
      ...datasetWithPlanned,
      recurringRules: [{ ...datasetWithPlanned.recurringRules[0], aktif: false }],
    }
    const store = writable<AppState>(
      { status: 'ready', dataset: durdurulmusDataset, derived: {} as any, sourceText: '' } as any,
    )
    const saveCalls: string[] = []
    const source: any = {
      id: 'drive',
      load: () => Promise.resolve(durdurulmusDataset),
      save: async (file: string) => { saveCalls.push(file) },
    }
    const { getByTitle } = render(Tekrarlayanlar, { dataset: durdurulmusDataset, source, store })
    await fireEvent.click(getByTitle('Devam Ettir'))

    expect(saveCalls).toEqual(['recurring_rules'])
  })

  describe('kişi boyutu (Görev 1)', () => {
    it('tek sahip varken kural satırında kişi adı gösterilmez', () => {
      const { container } = render(Tekrarlayanlar, { dataset })
      const sub = container.querySelector('.rule-sub')
      expect(sub?.textContent).not.toContain('Enis')
      expect(sub?.textContent).not.toContain('ENIS')
    })

    it('birden fazla sahip varken kural satırında kişi adı (ad, kod değil) gösterilir', () => {
      const twoOwnersDataset = {
        ...dataset,
        people: [
          { kod: 'ENIS', ad: 'Enis', haneUyesi: true, aktif: true },
          { kod: 'ZEK', ad: 'Zek', haneUyesi: false, aktif: true },
        ],
        recurringRules: [
          dataset.recurringRules[0],
          {
            id: 'rr_2',
            tur: 'GIDER' as const,
            aciklama: 'Spotify',
            kategori: 'market',
            hesap: 'NAKIT',
            sahip: 'ZEK',
            paraBirimi: 'TRY' as const,
            tutar: 59.9,
            gunOfMonth: 10,
            baslangicTarihi: '2026-01-01',
            bitisTarihi: null,
            aktif: true,
            olusturulma: '',
            kaynak: 'manual' as const,
          },
        ],
      }
      const { container } = render(Tekrarlayanlar, { dataset: twoOwnersDataset })
      const subs = Array.from(container.querySelectorAll('.rule-sub')).map((el) => el.textContent)
      expect(subs.some((s) => s?.includes('Enis'))).toBe(true)
      expect(subs.some((s) => s?.includes('Zek'))).toBe(true)
      expect(subs.some((s) => s?.includes('ZEK'))).toBe(false)
    })
  })
})
