import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import BorcFormu from './BorcFormu.svelte'
import { fixture } from '../../fixtures/dataset'
import { createAppStore, load } from '../../lib/data/store'
import { get } from 'svelte/store'
import type { Debt } from '../../lib/data/types'

async function setup() {
  const store = createAppStore()
  await load(store, { id: 'local', load: () => Promise.resolve(fixture) })
  const state = get(store)
  return { state, store }
}

describe('BorcFormu', () => {
  it('zorunlu alanları doğrular (kişi ve tutar)', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(fixture), save: async () => {} }
    const { getByRole, getByText } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    const submitBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(submitBtn)

    expect(getByText(/Kişi adı girilmeli/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('tutar geçersiz veya 0 ise uyarı verir', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(fixture), save: async () => {} }
    const { getByRole, getByLabelText, getByText } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.input(getByLabelText(/Kişi/i), { target: { value: 'Bora' } })
    await fireEvent.input(getByLabelText(/Tutar/i), { target: { value: '0' } })

    const submitBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(submitBtn)

    expect(getByText(/Geçerli bir tutar girin/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Alacak kaydını USD olarak ekler', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    let savedDebts: Debt[] = []
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
      },
    }
    const { getByRole, getByLabelText, getByText } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    // Kişi
    await fireEvent.input(getByLabelText(/Kişi/i), { target: { value: 'Ahmet' } })

    // Tutar
    await fireEvent.input(getByLabelText(/Tutar/i), { target: { value: '250' } })

    // Para birimi: USD
    await fireEvent.click(getByText(/\$ USD/i))

    // Açıklama
    await fireEvent.input(getByLabelText(/Açıklama/i), { target: { value: 'Seyahat borcu' } })

    const submitBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(submitBtn)

    expect(onSaved).toHaveBeenCalled()
    expect(savedDebts.length).toBeGreaterThan(0)
    const added = savedDebts.find((d) => d.kisi === 'Ahmet' && d.tutar === 250)
    expect(added).toBeDefined()
    expect(added?.yon).toBe('VERDIM')
    expect(added?.paraBirimi).toBe('USD')
    expect(added?.aciklama).toBe('Seyahat borcu')
    expect(added?.durum).toBe('ACIK')
    expect(added?.kaynak).toBe('manual')
    expect(added?.id).toMatch(/^db_[0-9a-f]{12}$/)
  })

  it('Borç kaydını EUR olarak ekler', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    let savedDebts: Debt[] = []
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
      },
    }
    const { getByRole, getByLabelText, getByText } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    // Yön: Borç (ALDIM)
    await fireEvent.click(getByRole('radio', { name: /Borç Borç Aldım/i }))

    // Kişi
    await fireEvent.input(getByLabelText(/Kişi/i), { target: { value: 'Mehmet' } })

    // Tutar
    await fireEvent.input(getByLabelText(/Tutar/i), { target: { value: '120.5' } })

    // Para birimi: EUR
    await fireEvent.click(getByText(/€ EUR/i))

    const submitBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(submitBtn)

    expect(onSaved).toHaveBeenCalled()
    const added = savedDebts.find((d) => d.kisi === 'Mehmet')
    expect(added).toBeDefined()
    expect(added?.yon).toBe('ALDIM')
    expect(added?.paraBirimi).toBe('EUR')
    expect(added?.tutar).toBe(120.5)
    expect(added?.durum).toBe('ACIK')
  })

  it('Vazgeç butonuna basıldığında onCancel çağrılır', async () => {
    const { state, store } = await setup()
    const onCancel = vi.fn()
    const source = { id: 'drive' as const, load: () => Promise.resolve(fixture), save: async () => {} }
    const { getByRole } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onCancel },
    })

    await fireEvent.click(getByRole('button', { name: /Vazgeç/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('varsayılan olarak Geçmiş Borç / Düzeltme olarak kaydeder ve hesap bakiyesini etkilemez (personal_tx yazmaz)', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    let savedPersonalTx: unknown[] = []
    let savedDebts: Debt[] = []
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
        if (name === 'personal_tx') savedPersonalTx = data as unknown[]
      },
    }
    const { getByRole, getByLabelText } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    await fireEvent.input(getByLabelText(/Kişi/i), { target: { value: 'Bora' } })
    await fireEvent.input(getByLabelText(/Tutar/i), { target: { value: '1000' } })

    const submitBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(submitBtn)

    expect(onSaved).toHaveBeenCalled()
    expect(savedDebts.length).toBeGreaterThan(0)
    // personal_tx'e hiçbir kayıt atılmamalıdır (hesap bakiyesi azalmaz)
    expect(savedPersonalTx.length).toBe(0)
    const added = savedDebts.find((d) => d.kisi === 'Bora')
    expect(added?.hesap).toBe('DUZELTME')
  })

  it('Canlı işlem seçildiğinde seçilen hesaba personal_tx kaydı da atar', async () => {
    const { state, store } = await setup()
    const onSaved = vi.fn()
    let savedPersonalTx: any[] = []
    let savedDebts: Debt[] = []
    const source = {
      id: 'drive' as const,
      load: () => Promise.resolve(fixture),
      save: async (name: string, data: unknown) => {
        if (name === 'debts') savedDebts = data as Debt[]
        if (name === 'personal_tx') savedPersonalTx = data as any[]
      },
    }
    const { getByRole, getByLabelText, container } = render(BorcFormu, {
      props: { dataset: state.dataset!, source, store, onSaved },
    })

    // Düzeltme kutucuğunun işaretini kaldır (Canlı işlem olsun)
    const duzeltmeCheck = container.querySelector('#bf-duzeltme') as HTMLInputElement
    await fireEvent.click(duzeltmeCheck)

    await fireEvent.input(getByLabelText(/Kişi/i), { target: { value: 'Kemal' } })
    await fireEvent.input(getByLabelText(/Tutar/i), { target: { value: '500' } })
    await fireEvent.change(getByLabelText(/^Hesap$/i), { target: { value: 'GARANTI-BANKA' } })

    const submitBtn = getByRole('button', { name: /Kaydet/i })
    await fireEvent.click(submitBtn)

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(savedDebts.length).toBeGreaterThan(0)
    expect(savedPersonalTx.length).toBeGreaterThan(0)
    const tx = savedPersonalTx.find((t) => t.kategori === 'borc' && t.hesap === 'GARANTI-BANKA' && t.tutar === 500)
    expect(tx).toBeDefined()
    expect(tx?.tur).toBe('GIDER') // Borç verdiğimiz için hesaptan çıkış
  })
})
