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
6. Rapor `✅` verene kadar 1–5'i tekrarla.
7. Temizlenince: `fxrates_cache.json` ve `data/` P1'de Drive'a yüklenecek.

## Notlar
- TCMB günlük XML'i ~2600 iş günü için ilk çalıştırmada indirilir; `fxrates_cache.json`
  sonraki çalıştırmaları hızlandırır (commit'lenir).
- `data/` git-ignore'dur; ham finansal veri depoya girmez.
