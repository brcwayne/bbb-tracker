import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import HesapDegistir from './HesapDegistir.svelte'

describe('HesapDegistir', () => {
  it('Drive kaynağında bir değiştirme düğmesi gösterir', () => {
    const { getByRole } = render(HesapDegistir, { drive: { forgetFolder() {}, connect: async () => {}, chooseFolder: async () => 'f' }, onSwitched: () => {} })
    expect(getByRole('button', { name: /hesap|klasör/i })).toBeTruthy()
  })

  it('tıklayınca klasörü unutur, hesabı sorar ve yeni klasörü seçtirir', async () => {
    const sira: string[] = []
    const drive = {
      forgetFolder: () => sira.push('forget'),
      connect: async () => { sira.push('connect') },
      chooseFolder: async () => { sira.push('choose'); return 'f2' },
    }
    const onSwitched = vi.fn()
    const { getByRole } = render(HesapDegistir, { drive, onSwitched })
    await fireEvent.click(getByRole('button', { name: /hesap|klasör/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(sira).toEqual(['forget', 'connect', 'choose'])
    expect(onSwitched).toHaveBeenCalled()
  })

  it('vazgeçilirse hata göstermez ve veri yeniden yüklenmez', async () => {
    const drive = {
      forgetFolder: () => {},
      connect: async () => {},
      chooseFolder: async () => { throw new Error('iptal') },
    }
    const onSwitched = vi.fn()
    const { getByRole, container } = render(HesapDegistir, { drive, onSwitched })
    await fireEvent.click(getByRole('button', { name: /hesap|klasör/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(onSwitched).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/iptal/)
  })
})
