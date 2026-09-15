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

describe('Tekrarlayanlar', () => {
  it('mevcut kuralları listeler', () => {
    const { getByText } = render(Tekrarlayanlar, { dataset })
    expect(getByText('Netflix')).toBeInTheDocument()
  })

  it('kural durdurulunca aktif=false olarak güncellenir', async () => {
    const store = writable<AppState>({ status: 'ready', dataset, derived: {} as any, sourceText: '' } as any)
    let savedData: unknown
    const source: any = { id: 'drive', load: () => Promise.resolve(dataset), save: async (_n: string, d: unknown) => { savedData = d } }
    const { getByTitle } = render(Tekrarlayanlar, { dataset, source, store })
    await fireEvent.click(getByTitle('Durdur'))
    expect((savedData as any[])[0].aktif).toBe(false)
  })
})
