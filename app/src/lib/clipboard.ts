/**
 * Copies text to the system clipboard using the Async Clipboard API with a
 * synchronous `execCommand('copy')` fallback when clipboard permissions or
 * secure context are unavailable.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy execCommand fallback inside user gesture if allowed.
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false
  }

  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
