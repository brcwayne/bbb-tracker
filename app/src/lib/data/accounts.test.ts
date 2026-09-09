import { describe, expect, it } from 'vitest'
import { accountBalances, txDelta } from './accounts'
import type { PersonalAccount, PersonalTx } from './types'

const tx = (o: Partial<PersonalTx>): PersonalTx => ({
  id: 'px_1', tarih: '2026-09-02', tur: 'GIDER', tutar: 100, paraBirimi: 'TRY',
  kategori: 'market', aciklama: '', hesap: 'NAKIT', sahip: 'ENIS',
  taksitPlaniId: null, taksitNo: null, taksitToplam: null,
  not: '', kaynak: 'telegram', olusturulma: '2026-09-02T00:00:00Z', ...o,
})

const acc = (o: Partial<PersonalAccount>): PersonalAccount => ({
  kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT', paraBirimi: 'TRY',
  sahip: 'ENIS', aktif: true, ...o,
})

const TODAY = '2026-09-08'

describe('txDelta — tek işaret kuralı', () => {
  it('gider eksiltir, gelir artırır', () => {
    expect(txDelta(tx({ tur: 'GIDER', tutar: 100 }), 'NAKIT', 'TRY')).toBe(-100)
    expect(txDelta(tx({ tur: 'GELIR', tutar: 100 }), 'NAKIT', 'TRY')).toBe(100)
  })

  it('transfer gönderenden düşer, alana ekler', () => {
    const t = tx({ tur: 'TRANSFER', tutar: 500, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' })
    expect(txDelta(t, 'NAKIT', 'TRY')).toBe(-500)
    expect(txDelta(t, 'GARANTI-BANKA', 'TRY')).toBe(500)
  })

  it('ilgisiz hesap için sıfır döner', () => {
    const t = tx({ tur: 'TRANSFER', tutar: 500, hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' })
    expect(txDelta(t, 'SAGLAM-KART', 'TRY')).toBe(0)
  })

  it('düzeltme işaretli toplanır', () => {
    expect(txDelta(tx({ tur: 'DUZELTME', tutar: -250 }), 'NAKIT', 'TRY')).toBe(-250)
    expect(txDelta(tx({ tur: 'DUZELTME', tutar: 250 }), 'NAKIT', 'TRY')).toBe(250)
  })

  it('farklı para birimindeki satır katkı vermez', () => {
    expect(txDelta(tx({ paraBirimi: 'USD', tutar: 45 }), 'NAKIT', 'TRY')).toBe(0)
  })

  it('hesabın kendine transferi netleşir', () => {
    const t = tx({ tur: 'TRANSFER', tutar: 500, hesap: 'NAKIT', karsiHesap: 'NAKIT' })
    expect(txDelta(t, 'NAKIT', 'TRY')).toBe(0)
  })
})

describe('accountBalances', () => {
  it('boş defterde her hesap sıfır', () => {
    const out = accountBalances([], [acc({}), acc({ kod: 'GARANTI-BANKA' })], TODAY)
    expect(out.get('NAKIT')).toBe(0)
    expect(out.get('GARANTI-BANKA')).toBe(0)
  })

  it('gelir, gider ve transferi birlikte toplar', () => {
    const out = accountBalances([
      tx({ id: 'a', tur: 'GELIR', tutar: 75000, tarih: '2026-09-01' }),
      tx({ id: 'b', tur: 'GIDER', tutar: 620, tarih: '2026-09-02' }),
      tx({ id: 'c', tur: 'TRANSFER', tutar: 5000, tarih: '2026-09-03', hesap: 'NAKIT', karsiHesap: 'GARANTI-BANKA' }),
    ], [acc({}), acc({ kod: 'GARANTI-BANKA' })], TODAY)
    expect(out.get('NAKIT')).toBe(69380)
    expect(out.get('GARANTI-BANKA')).toBe(5000)
  })

  it('kredi kartı harcamayla eksiye iner, ödemeyle sıfıra yaklaşır', () => {
    const kart = acc({ kod: 'GARANTI-DIJI', tur: 'KREDI_KARTI' })
    const out = accountBalances([
      tx({ id: 'a', tur: 'GIDER', tutar: 1800, hesap: 'GARANTI-DIJI', tarih: '2026-09-03' }),
      tx({ id: 'b', tur: 'TRANSFER', tutar: 500, hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI', tarih: '2026-09-08' }),
    ], [kart], TODAY)
    expect(out.get('GARANTI-DIJI')).toBe(-1300)
  })

  it('gelecek tarihli satırı bakiyeye katmaz (H9)', () => {
    const out = accountBalances([
      tx({ id: 'a', tur: 'GIDER', tutar: 100, tarih: '2026-09-02' }),
      tx({ id: 'b', tur: 'GIDER', tutar: 2000, tarih: '2026-10-07' }),
    ], [acc({})], TODAY)
    expect(out.get('NAKIT')).toBe(-100)
  })

  it('kuruş yuvarlamasını iki basamakta tutar', () => {
    const out = accountBalances([
      tx({ id: 'a', tur: 'GIDER', tutar: 0.1 }),
      tx({ id: 'b', tur: 'GIDER', tutar: 0.2 }),
    ], [acc({})], TODAY)
    expect(out.get('NAKIT')).toBe(-0.3)
  })
})
