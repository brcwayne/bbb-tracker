import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { schedulePeriodicUpdateChecks, reloadOnControllerChange } from './pwaUpdate'

describe('schedulePeriodicUpdateChecks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls check on the given interval', () => {
    const check = vi.fn()
    const win = window
    schedulePeriodicUpdateChecks(check, { intervalMs: 1000, win })

    expect(check).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('calls check when the tab becomes visible again', () => {
    const check = vi.fn()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    schedulePeriodicUpdateChecks(check, { intervalMs: 60_000 })

    document.dispatchEvent(new Event('visibilitychange'))
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('does not call check when the tab is hidden', () => {
    const check = vi.fn()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    schedulePeriodicUpdateChecks(check, { intervalMs: 60_000 })

    document.dispatchEvent(new Event('visibilitychange'))
    expect(check).not.toHaveBeenCalled()
  })

  it('stop() clears the interval and removes the listener', () => {
    const check = vi.fn()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    const stop = schedulePeriodicUpdateChecks(check, { intervalMs: 1000 })

    stop()
    vi.advanceTimersByTime(5000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(check).not.toHaveBeenCalled()
  })
})

describe('reloadOnControllerChange', () => {
  it('reloads once a new service worker takes control', () => {
    const handlers: Record<string, () => void> = {}
    const container = {
      addEventListener: (type: string, handler: () => void) => {
        handlers[type] = handler
      },
    }
    const reload = vi.fn()
    reloadOnControllerChange(container, reload)

    handlers['controllerchange']()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('only reloads once even if controllerchange fires twice', () => {
    const handlers: Record<string, () => void> = {}
    const container = {
      addEventListener: (type: string, handler: () => void) => {
        handlers[type] = handler
      },
    }
    const reload = vi.fn()
    reloadOnControllerChange(container, reload)

    handlers['controllerchange']()
    handlers['controllerchange']()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
