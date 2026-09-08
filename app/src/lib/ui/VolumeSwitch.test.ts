import { render, screen } from '@testing-library/svelte'
import { expect, it } from 'vitest'
import VolumeSwitch from './VolumeSwitch.svelte'

it('yatırımdayken hesaplara götürür', () => {
  render(VolumeSwitch, { volume: 'yatirim' })
  const a = screen.getByRole('link')
  expect(a).toHaveAttribute('href', '#/h/ozet')
  expect(a.textContent).toContain('Hesaplar')
})

it('hesaplardayken yatırıma götürür', () => {
  render(VolumeSwitch, { volume: 'hesaplar' })
  const a = screen.getByRole('link')
  expect(a).toHaveAttribute('href', '#/')
  expect(a.textContent).toContain('Yatırım')
})

it('gittiği yeri sesli okuyuculara da söyler', () => {
  render(VolumeSwitch, { volume: 'yatirim' })
  expect(screen.getByRole('link')).toHaveAccessibleName(/Hesaplar defterine geç/i)
})
