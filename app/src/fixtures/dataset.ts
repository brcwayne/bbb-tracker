import type { Dataset } from '../lib/data/types'

export const fixture: Dataset = {
  transactions: [
    { id: 't_a', tarih: '2020-01-06', hesap: 'MIDAS', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'AL', lot: 100, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 1.0, kur: 5.94, komisyon_usd: 0, brut_usd: 100, net_usd: 100, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_b', tarih: '2020-06-10', hesap: 'MIDAS', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'AL', lot: 100, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 2.0, kur: 6.9, komisyon_usd: 0, brut_usd: 200, net_usd: 200, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_c', tarih: '2021-03-15', hesap: 'MIDAS', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'SAT', lot: 50, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 5.0, kur: 7.4, komisyon_usd: 0, brut_usd: 250, net_usd: 250, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_d', tarih: '2019-07-01', hesap: 'KASA', portfoy: 'ENIS', enstruman: 'XAU', yon: 'AL', lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 50, kur: 5.8, komisyon_usd: 0, brut_usd: 500, net_usd: 500, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_e', tarih: '2024-01-01', hesap: 'KASA', portfoy: 'ENIS', enstruman: 'XAU', yon: 'SAT', lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 80, kur: 30, komisyon_usd: 0, brut_usd: 800, net_usd: 800, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_f', tarih: '2023-11-20', hesap: 'GARAN', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL', lot: 25, girisParaBirimi: 'TL', fiyat_tl: 1200, fiyat_usd: 40, kur: 30, komisyon_usd: 1.5, brut_usd: 1000, net_usd: 1001.5, not: '', kaynak: 'migration', olusturulma: null },
  ],
  cashflows: [
    { id: 'c_a', tarih: '2019-01-02', hesap: 'TOPLU', portfoy: null, tur: 'YATIRMA', enstruman: null, tutar_tl: null, tutar_usd: 5000, kur: null, aciklama: 'ilk', kaynak: 'migration' },
    { id: 'c_b', tarih: '2023-04-10', hesap: 'TOPLU', portfoy: null, tur: 'TEMETTU', enstruman: 'THYAO', tutar_tl: 100, tutar_usd: 4, kur: 25, aciklama: 'Cash', kaynak: 'migration' },
  ],
  snapshots: [
    { tarih: '2021-03-31', toplamOzkaynak_usd: 5175, baslangicSermayesi_usd: 5000, netMevduatCekim_usd: 0, cekim_usd: 0, nakitTemettu_usd: 0, nakit_usd: null, gerceklesmemisKZ_usd: null, netKZ_usd: 175, vergiKomisyon_usd: 0, kaynak: 'excel-monthly-report' },
    { tarih: '2024-01-31', toplamOzkaynak_usd: 5475, baslangicSermayesi_usd: 5175, netMevduatCekim_usd: 0, cekim_usd: 0, nakitTemettu_usd: 4, nakit_usd: null, gerceklesmemisKZ_usd: null, netKZ_usd: 300, vergiKomisyon_usd: 1.5, kaynak: 'excel-monthly-report' },
  ],
  instruments: [
    { kod: 'ASTOR', ad: 'ASTOR', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'ASTOR.IS', seviyeler: null },
    { kod: 'XAU', ad: 'XAU', sinif: 'ALTIN', girisParaBirimi: 'TL', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'XAUUSD', seviyeler: { destek: 60, direnc: 90, hedef: 110, birim: 'USD' } },
    { kod: 'THYAO', ad: 'THYAO', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'THYAO.IS', seviyeler: null },
  ],
  brokers: [
    { kod: 'MIDAS', ad: 'Midas', tur: 'BROKER', sahip: 'Enis', aktif: true },
    { kod: 'KASA', ad: 'Kasa (fiziki)', tur: 'FIZIKI', sahip: 'Enis', aktif: true },
    { kod: 'GARAN', ad: 'Garanti Yatırım', tur: 'BROKER', sahip: 'Enis', aktif: true },
  ],
  portfolios: [
    { kod: 'ENIS', ad: 'Enis (kendi seçimlerim)', aktif: true },
    { kod: 'ALFA', ad: 'Alfa (Yatırım101)', aktif: true },
  ],
  meta: { semaVersiyonu: 1, olusturulma: '2026-09-03T16:24:37', kaynak: 'test.xlsm', nakitHesapBazli: { TOPLU: 5004, MIDAS: -50, KASA: 300, GARAN: -1001.5 }, p0Sinirlari: [] },
  fxrates: { '2020-01-06': 5.94, '2024-01-01': 30 },
}
