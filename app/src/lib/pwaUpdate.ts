/**
 * Keeps the installed PWA from running a stale build indefinitely.
 *
 * The generated service worker updates its own precache in the background
 * (`registerType: 'autoUpdate'` → `skipWaiting()` + `clientsClaim()` in
 * `sw.js`), but a tab/PWA that's already open keeps running the JS it
 * already loaded until the page reloads. On a phone the app is rarely fully
 * closed, so without this it can silently run weeks-old code across many
 * deploys (this is what hid the recurring-transactions feature entirely —
 * no error, the new tab/nav item just never appeared). This polls for a new
 * service worker — on an interval and whenever the tab regains focus, since
 * "reopening after being backgrounded" is the case that matters most on
 * mobile — and reloads once a new one takes control.
 */

export function schedulePeriodicUpdateChecks(
  check: () => void,
  { intervalMs = 10 * 60 * 1000, win = window }: { intervalMs?: number; win?: Window } = {},
): () => void {
  const timer = win.setInterval(check, intervalMs)
  const onVisible = () => {
    if (win.document.visibilityState === 'visible') check()
  }
  win.document.addEventListener('visibilitychange', onVisible)
  return () => {
    win.clearInterval(timer)
    win.document.removeEventListener('visibilitychange', onVisible)
  }
}

interface ControllerChangeTarget {
  addEventListener(type: 'controllerchange', listener: () => void): void
}

export function reloadOnControllerChange(container: ControllerChangeTarget, reload: () => void): void {
  let reloaded = false
  container.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    reload()
  })
}

export async function initPwaUpdates(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      schedulePeriodicUpdateChecks(() => void registration.update())
    },
  })
  reloadOnControllerChange(navigator.serviceWorker, () => window.location.reload())
}
