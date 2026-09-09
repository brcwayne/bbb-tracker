import { describe, expect, it } from 'vitest'
import { accountBalances, accountGroups, cardStatement, netWorthBand, txDelta } from './accounts'
import type { Debt, PersonalAccount, PersonalTx } from './types'

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

describe('cardStatement', () => {
  const kart = acc({ kod: 'GARANTI-DIJI', tur: 'KREDI_KARTI', hesapKesim: 15 })
  const kartSatiri = (o: Partial<PersonalTx>) =>
    tx({ hesap: 'GARANTI-DIJI', tur: 'GIDER', ...o })

  it('kesim gününe göre dönemi böler', () => {
    // TODAY = 2026-09-08 → ilk kesim 2026-09-15, önceki 2026-08-15
    const out = cardStatement([
      kartSatiri({ id: 'a', tarih: '2026-08-20', tutar: 1000 }), // bu dönem
      kartSatiri({ id: 'b', tarih: '2026-09-03', tutar: 800 }),  // bu dönem
      kartSatiri({ id: 'c', tarih: '2026-09-20', tutar: 900 }),  // gelecek dönem
      kartSatiri({ id: 'd', tarih: '2026-08-10', tutar: 500 }),  // geçmiş dönem
    ], kart, TODAY)
    expect(out.buAy).toBe(1800)
    expect(out.gelecekAy).toBe(900)
  })

  it('toplam borç negatif kalır ve geleceği saymaz', () => {
    const out = cardStatement([
      kartSatiri({ id: 'a', tarih: '2026-09-03', tutar: 1800 }),
      kartSatiri({ id: 'b', tarih: '2026-09-20', tutar: 900 }),
    ], kart, TODAY)
    expect(out.toplamBorc).toBe(-1800)
  })

  it('karta gelen ödeme dönem borcunu azaltır', () => {
    const out = cardStatement([
      kartSatiri({ id: 'a', tarih: '2026-09-03', tutar: 1800 }),
      tx({ id: 'b', tarih: '2026-09-05', tur: 'TRANSFER', tutar: 500, hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI' }),
    ], kart, TODAY)
    expect(out.buAy).toBe(1300)
  })

  it('kesim günü yoksa takvim ayına düşer', () => {
    const kesimsiz = acc({ kod: 'SAGLAM-KART', tur: 'KREDI_KARTI' })
    const out = cardStatement([
      tx({ id: 'a', hesap: 'SAGLAM-KART', tarih: '2026-09-03', tutar: 300 }),
      tx({ id: 'b', hesap: 'SAGLAM-KART', tarih: '2026-09-30', tutar: 200 }),
      tx({ id: 'c', hesap: 'SAGLAM-KART', tarih: '2026-10-02', tutar: 700 }),
      tx({ id: 'd', hesap: 'SAGLAM-KART', tarih: '2026-08-29', tutar: 400 }),
    ], kesimsiz, TODAY)
    expect(out.buAy).toBe(500)
    expect(out.gelecekAy).toBe(700)
  })

  it('kesim günü 1 ise dönem ayın başında kapanır', () => {
    const k1 = acc({ kod: 'K1', tur: 'KREDI_KARTI', hesapKesim: 1 })
    // TODAY = 2026-09-08 → bu ayın 1'i geçti, ilk kesim 2026-10-01, önceki 2026-09-01
    const out = cardStatement([
      tx({ id: 'a', hesap: 'K1', tarih: '2026-09-02', tutar: 300 }),
      tx({ id: 'b', hesap: 'K1', tarih: '2026-10-01', tutar: 400 }),
      tx({ id: 'c', hesap: 'K1', tarih: '2026-10-02', tutar: 500 }),
      tx({ id: 'd', hesap: 'K1', tarih: '2026-09-01', tutar: 900 }),
    ], k1, TODAY)
    expect(out.buAy).toBe(700)
    expect(out.gelecekAy).toBe(500)
  })

  it('kesim günü 31 ise kısa ayda ayın sonuna kırpılır', () => {
    const k31 = acc({ kod: 'K31', tur: 'KREDI_KARTI', hesapKesim: 31 })
    // 2026-11-08 → ilk kesim 2026-11-30 (Kasım 30 çeker), önceki 2026-10-31
    const out = cardStatement([
      tx({ id: 'a', hesap: 'K31', tarih: '2026-11-30', tutar: 100 }),
      tx({ id: 'b', hesap: 'K31', tarih: '2026-12-01', tutar: 200 }),
    ], k31, '2026-11-08')
    expect(out.buAy).toBe(100)
    expect(out.gelecekAy).toBe(200)
  })

  it('kesim günü 30 ise şubatta ayın sonuna kırpılır', () => {
    const k30 = acc({ kod: 'K30', tur: 'KREDI_KARTI', hesapKesim: 30 })
    // 2026-02-10 → ilk kesim 2026-02-28 (2026 artık yıl değil)
    const out = cardStatement([
      tx({ id: 'a', hesap: 'K30', tarih: '2026-02-28', tutar: 100 }),
      tx({ id: 'b', hesap: 'K30', tarih: '2026-03-01', tutar: 200 }),
    ], k30, '2026-02-10')
    expect(out.buAy).toBe(100)
    expect(out.gelecekAy).toBe(200)
  })

  it('bugün kesim gününün tam üstündeyse dönem bugün kapanır', () => {
    const out = cardStatement([
      tx({ id: 'a', hesap: 'GARANTI-DIJI', tarih: '2026-09-15', tutar: 100 }),
      tx({ id: 'b', hesap: 'GARANTI-DIJI', tarih: '2026-09-16', tutar: 200 }),
    ], kart, '2026-09-15')
    expect(out.buAy).toBe(100)
    expect(out.gelecekAy).toBe(200)
  })

  it('dönem alacaktaysa negatif döner', () => {
    const out = cardStatement([
      tx({ id: 'a', tarih: '2026-09-03', tur: 'TRANSFER', tutar: 500, hesap: 'GARANTI-BANKA', karsiHesap: 'GARANTI-DIJI' }),
    ], kart, TODAY)
    expect(out.buAy).toBe(-500)
  })
})

const debt = (o: Partial<Debt>): Debt => ({
  id: 'db_1', tarih: '2026-09-01', yon: 'VERDIM', kisi: 'BORA', tutar: 1000,
  paraBirimi: 'TRY', aciklama: '', hesap: 'NAKIT', durum: 'ACIK',
  kapatanKayitlar: [], kaynak: 'telegram', olusturulma: '2026-09-01T00:00:00Z', ...o,
})

describe('accountGroups', () => {
  const accounts = [
    acc({ kod: 'GARANTI-BANKA', ad: 'Garanti Bankası', tur: 'BANKA' }),
    acc({ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT' }),
    acc({ kod: 'GARANTI-DIJI', ad: 'Garanti Diji', tur: 'KREDI_KARTI', hesapKesim: 15 }),
    acc({ kod: 'ESKI', ad: 'Kapanmış', tur: 'BANKA', aktif: false }),
  ]

  it('grupları sabit sırada döner', () => {
    const g = accountGroups([], accounts, [], TODAY)
    expect(g.map((x) => x.tur)).toEqual(['NAKIT', 'BANKA', 'KREDI_KARTI'])
  })

  it('pasif hesabı varsayılan olarak gizler, istenince gösterir', () => {
    const gizli = accountGroups([], accounts, [], TODAY)
    expect(gizli.find((x) => x.tur === 'BANKA')!.satirlar.map((r) => r.kod)).toEqual(['GARANTI-BANKA'])
    const acik = accountGroups([], accounts, [], TODAY, { pasifDahil: true })
    expect(acik.find((x) => x.tur === 'BANKA')!.satirlar.map((r) => r.kod)).toEqual(['GARANTI-BANKA', 'ESKI'])
  })

  it('grup içinde Türkçe sıralar', () => {
    const tr = [
      acc({ kod: 'Z', ad: 'Ziraat', tur: 'BANKA' }),
      acc({ kod: 'I', ad: 'İş Bankası', tur: 'BANKA' }),
      acc({ kod: 'S', ad: 'Şeker', tur: 'BANKA' }),
    ]
    const g = accountGroups([], tr, [], TODAY)
    expect(g.find((x) => x.tur === 'BANKA')!.satirlar.map((r) => r.ad))
      .toEqual(['İş Bankası', 'Şeker', 'Ziraat'])
  })

  it('grup toplamını para birimi bazında verir', () => {
    const g = accountGroups([
      tx({ id: 'a', tur: 'GELIR', tutar: 1000, hesap: 'NAKIT', tarih: '2026-09-01' }),
    ], accounts, [], TODAY)
    expect(g.find((x) => x.tur === 'NAKIT')!.toplam).toEqual({ TRY: 1000 })
  })

  it('kart satırına dönem bilgisini iliştirir', () => {
    const g = accountGroups([
      tx({ id: 'a', hesap: 'GARANTI-DIJI', tutar: 1800, tarih: '2026-09-03' }),
    ], accounts, [], TODAY)
    const kart = g.find((x) => x.tur === 'KREDI_KARTI')!.satirlar[0]
    expect(kart.kart).toEqual({ buAy: 1800, gelecekAy: 0, toplamBorc: -1800 })
  })

  it('hesap satırı detay adresine bağlanır', () => {
    const g = accountGroups([], accounts, [], TODAY)
    expect(g.find((x) => x.tur === 'NAKIT')!.satirlar[0].href).toBe('#/h/hesap/NAKIT')
  })

  it('açık borçlardan Alacak/Verecek grubu üretir', () => {
    const g = accountGroups([], accounts, [
      debt({ id: 'd1', kisi: 'BORA', yon: 'VERDIM', tutar: 2000 }),
      debt({ id: 'd2', kisi: 'ALPER', yon: 'ALDIM', tutar: 500 }),
      debt({ id: 'd3', kisi: 'ZEK', yon: 'VERDIM', tutar: 900, durum: 'KAPALI' }),
    ], TODAY)
    const kisiler = g.find((x) => x.tur === 'KISI')!
    expect(kisiler.satirlar.map((r) => [r.kod, r.bakiye])).toEqual([['BORA', 2000], ['ALPER', -500]])
    expect(kisiler.satirlar[0].href).toBe('#/h/borclar/BORA')
    expect(kisiler.toplam).toEqual({ TRY: 1500 })
  })

  it('borç yoksa Alacak/Verecek grubunu hiç üretmez', () => {
    expect(accountGroups([], accounts, [], TODAY).some((x) => x.tur === 'KISI')).toBe(false)
  })
})

describe('netWorthBand', () => {
  it('pozitifleri varlık, negatifleri borç olarak ayırır ve toplar', () => {
    const accounts = [
      acc({ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT' }),
      acc({ kod: 'GARANTI-DIJI', ad: 'Diji', tur: 'KREDI_KARTI', hesapKesim: 15 }),
    ]
    const g = accountGroups([
      tx({ id: 'a', tur: 'GELIR', tutar: 1000, hesap: 'NAKIT', tarih: '2026-09-01' }),
      tx({ id: 'b', tur: 'GIDER', tutar: 300, hesap: 'GARANTI-DIJI', tarih: '2026-09-03' }),
    ], accounts, [], TODAY)
    expect(netWorthBand(g)).toEqual({ TRY: { varliklar: 1000, borclar: -300, toplam: 700 } })
  })

  it('para birimlerini ayrı satırlarda tutar', () => {
    const accounts = [
      acc({ kod: 'NAKIT', ad: 'Nakit', tur: 'NAKIT' }),
      acc({ kod: 'USD-HESAP', ad: 'Dolar', tur: 'BANKA', paraBirimi: 'USD' }),
    ]
    const g = accountGroups([
      tx({ id: 'a', tur: 'GELIR', tutar: 1000, hesap: 'NAKIT', tarih: '2026-09-01' }),
      tx({ id: 'b', tur: 'GELIR', tutar: 40, hesap: 'USD-HESAP', paraBirimi: 'USD', tarih: '2026-09-01' }),
    ], accounts, [], TODAY)
    expect(netWorthBand(g)).toEqual({
      TRY: { varliklar: 1000, borclar: 0, toplam: 1000 },
      USD: { varliklar: 40, borclar: 0, toplam: 40 },
    })
  })
})


