/** Mints a personal-ledger row id. The `px_` prefix and 12 hex digits match
 *  the Telegram bot's `derive_entry_id`, so a file written by both stays
 *  coherent. */
export function newPersonalId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(6))
  return 'px_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Mints an investment cashflow id: `c_` + 16 hex, matching the Telegram
 *  bot's investment-bridge convention so a row written by either stays
 *  coherent. */
export function newCashflowId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(8))
  return 'c_' + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')
}
