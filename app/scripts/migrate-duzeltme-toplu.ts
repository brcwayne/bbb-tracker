/**
 * migrate-duzeltme-toplu.ts
 *
 * Tek seferlik göç betiği (Dalga 4, Görev I6).
 * data/cashflows.json içindeki kurum DUZELTME satırlarını tarar;
 * henüz otomatik TOPLU mahsup satırı ('otomatik-mahsup') bulunmayan
 * düzeltmeler için açık TOPLU mahsup satırı oluşturur.
 *
 * Çalıştırma:
 *   npx tsx scripts/migrate-duzeltme-toplu.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import type { Cashflow, Dataset } from '../src/lib/data/types'
import { cashBalanceByHesap, turetilmisNakit } from '../src/lib/data/cashBalances'
import { kimlikKontrol } from '../src/lib/data/kimlik'
import { derivePositions } from '../src/lib/data/derive'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../data')
const cashflowsPath = resolve(dataDir, 'cashflows.json')
const transactionsPath = resolve(dataDir, 'transactions.json')
const snapshotsPath = resolve(dataDir, 'snapshots.json')
const metaPath = resolve(dataDir, 'meta.json')

const cashflows: Cashflow[] = JSON.parse(readFileSync(cashflowsPath, 'utf8'))
const transactions = JSON.parse(readFileSync(transactionsPath, 'utf8'))
const snapshots = JSON.parse(readFileSync(snapshotsPath, 'utf8'))
const meta = JSON.parse(readFileSync(metaPath, 'utf8'))

const ds: Dataset = {
  transactions,
  cashflows,
  snapshots,
  meta,
  brokers: [],
  accounts: [],
  personalTransactions: [],
  categories: [],
  creditCards: [],
}

console.log('--- DUZELTME TOPLU Mahsup Göç Betiği ---')
console.log(`Mevcut nakit akışı sayısı: ${cashflows.length}`)

let addedCount = 0
const newCashflows = [...cashflows]

for (const cf of cashflows) {
  if (cf.tur === 'DUZELTME' && cf.hesap !== 'TOPLU' && cf.kaynak !== 'otomatik-mahsup') {
    // Bu satır için zaten bir mahsup var mı?
    const hasOffset = cashflows.some(
      (other) =>
        other.tur === 'DUZELTME' &&
        other.hesap === 'TOPLU' &&
        other.kaynak === 'otomatik-mahsup' &&
        other.tarih === cf.tarih &&
        Math.abs(other.tutar_usd - (-cf.tutar_usd)) < 0.01,
    )
    if (!hasOffset) {
      const offsetRow: Cashflow = {
        id: `c_${randomBytes(8).toString('hex')}`,
        tarih: cf.tarih,
        hesap: 'TOPLU',
        portfoy: null,
        tur: 'DUZELTME',
        enstruman: null,
        tutar_tl: cf.tutar_tl != null ? -cf.tutar_tl : null,
        tutar_usd: -cf.tutar_usd,
        kur: cf.kur,
        aciklama: `${cf.hesap} düzeltmesi mahsubu`,
        kaynak: 'otomatik-mahsup',
      }
      newCashflows.push(offsetRow)
      addedCount++
      console.log(`+ TOPLU mahsup satırı eklendi: ${cf.hesap} (${cf.tutar_usd} USD) -> TOPLU (${offsetRow.tutar_usd} USD)`)
    }
  }
}

if (addedCount > 0) {
  writeFileSync(cashflowsPath, JSON.stringify(newCashflows, null, 2) + '\n', 'utf8')
  console.log(`data/cashflows.json güncellendi: ${addedCount} yeni mahsup satırı eklendi.`)
} else {
  console.log('Göç gerektiren kurum düzeltmesi bulunamadı (mevcut düzeltme sayısı: 0).')
}

// Sağlama kontrolleri
ds.cashflows = newCashflows
const balances = cashBalanceByHesap(ds)
const totalCash = Object.values(balances).reduce((a, b) => a + b, 0)
const roundedCash = Math.round(totalCash * 100) / 100
const derivedCash = turetilmisNakit(ds)

const pos = derivePositions(ds.transactions)
const kimlik = kimlikKontrol(ds, pos.sales, pos.open, roundedCash)

console.log('\n--- Sonuç Kontrolleri ---')
console.log(`Toplam Gösterilen Nakit: $${roundedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} (Beklenen: $18,795.01)`)
console.log(`Türetilmiş Nakit:        $${derivedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} (Defter toplam: $33,784.39)`)
console.log(`Kimlik Farkı:            $${kimlik.fark.toFixed(2)} (< $1 çapa: ${Math.abs(kimlik.fark) < 1.0 ? 'SAĞLANDI' : 'HATA'})`)

if (Math.abs(roundedCash - 18795.01) > 0.05) {
  console.error('HATA: Toplam nakit $18,795.01 çapasından saptı!')
  process.exit(1)
}

if (Math.abs(kimlik.fark) >= 1) {
  console.error('HATA: Kimlik farkı $1 sınırını aştı!')
  process.exit(1)
}

console.log('\nGöç doğrulaması başarıyla tamamlandı.')
