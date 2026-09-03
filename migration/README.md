# BBB Migration

Excel geçmişini `../data/` altına doğrulanmış JSON'a çevirir.

## Kurulum
```bash
cd migration && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Çalıştırma döngüsü
1. `.venv/bin/python -m bbb_migration --xlsm "../BigBlackBook_2026v15 kopyası.xlsm"`
2. `../data/reconciliation-report.md` oku.
3. Rapordaki "Sınıflandırılmamış enstrümanlar" → `overrides/instruments.json`'a
   `sinif` (`BIST|ALTIN|FON_PARA|FON_HISSE|USA`), `fiyatSembolu`, `fiyatKaynagi`,
   gerekiyorsa `girisParaBirimi` ve altın için `altinKatsayi` gir.
4. "Kuru bulunamayan tarihler" → `overrides/fxrates_seed.json`'a TCMB Döviz Alış değeri.
5. "Dönüşüm / pozisyon hataları" ve "Pozisyon uyuşmazlıkları" → Enis ile satır satır incele
   (Excel'de kaynak satırı aç, gerçek değeri doğrula, gerekirse `overrides/` veya
   fixture-dışı düzeltme notu).
   **Kural:** `data/reconciliation-report.md` içinde `Pozisyon hataları` satırı varken
   gerçekleşmiş K/Z ölçülemeyen bir miktarda eksik kalır — kaynak satır düzeltilmeli.
6. Rapor `✅` verene kadar 1–5'i tekrarla.
7. Temizlenince: `fxrates_cache.json` ve `data/` P1'de Drive'a yüklenecek.

## Bu veri setinde kabul edilen açık kalem (2026-09-03)

Trade Log **satır 104** (`QNB / TRMET / BUY / 1500 lot`) tarih ve fiyat içermiyor.
Enis bu alımı reconstruct etmemeyi seçti (ismi değişmiş eski bir hisse, kayıt yok).
Sonuç: o QNB TRMET alım-satım turu (≈ 4.700 USD satış hasılatı) **gerçekleşmiş K/Z'ye
sıfır katkı** yapıyor; rapor kalıcı olarak 4 TRMET uyarısı gösteriyor ve `ok=false`
dönüyor. Bu **beklenen** durum — mevcut TRMET pozisyonu (863 lot, M.Delta) etkilenmiyor,
mutabakatta sorunsuz. P1 bu veri setini kullanabilir; `ok=false` bir kalite işareti,
engel değil.

## Bilinen gürültü (yalnızca görüntü, hesaba girmez)

Aşağıdaki 6 satırda workbook'un TL fiyat sütunu `fiyat_usd × kur` ile %2'den fazla
uyuşmuyor. Hiçbir hesaplamayı beslemez ama bayat hücre olabilir — Enis göz atsın:
THYAO 2026-03-03, EREGL 2026-02-18, AKBNK 2026-03-04, BRLSM 2026-02-13,
TURSG 2026-02-13, KCAER 2026-05-11.

## Notlar
- TCMB günlük XML'i ~2600 iş günü için ilk çalıştırmada indirilir; `fxrates_cache.json`
  sonraki çalıştırmaları hızlandırır (commit'lenir).
- `data/` git-ignore'dur; ham finansal veri depoya girmez.
