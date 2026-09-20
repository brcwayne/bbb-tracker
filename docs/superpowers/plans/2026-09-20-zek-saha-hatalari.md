# Zek kurulumu — ilk saha hataları (2026-09-20)

Enis'in `@Zeksenator_bot` üzerinde ilk denemesinde bildirdiği 7 madde. Her biri
koda inilerek doğrulandı; aşağıdaki "kök neden" satırları tahmin değil, ölçüm.

**Repo:** `bbb-telegram-bot` (özel). Web tarafı bu turda değişmiyor.
**Ölçüt:** her görev sonunda tüm paket yeşil (başlangıç: **702 test**), Enis'in
kurulumunda davranış değişmez ve bu testle kanıtlanır.

---

## Bulgular

| # | Bildirim | Kök neden (doğrulandı) | Nerede |
|---|---|---|---|
| 1 | Zek'in ID'si eklensin | **Zaten yapılmış** — `ALLOWED_USER_IDS` içinde iki kimlik (Enis + Zek) | VM `.env` |
| 2 | "Son İşlemler" düğmesi hata veriyor | `"İ".lower()` → `i̇` (i + birleşik nokta), koddaki düz `i` ile eşleşmiyor | `src/bot/main.py` hızlı düğme eşleşmesi |
| 3 | "Son İşlemi Geri Al" hata veriyor | Aynı kök neden | aynı yer |
| 4 | Yardım metninde Enis'in adı geçiyor | Örnekler sabit yazılmış: `qnb den enis ...` | `src/bot/handlers/query_flow.py:32-34,40` |
| 5 | Annenin kaydı "benim" gibi görünüyor | **Veri doğru** (`sahip: ANNE`); liste satırı sahibi hiç yazmıyor | `personal_flow.py::handle_son_harcamalar` |
| 6 | Gelir, harcama listesinde ayırt edilemiyor | Satırda yön (gelir/gider) işareti yok | aynı fonksiyon |
| 7 | `geri al` kişisel kaydı geri almıyor | `PersonalRepository.undo_last_entry()` **var ama hiçbir komuta bağlı değil**; `geri al` yalnız ticaret tarafını deniyor | `edit_flow.py::handle_undo_command`, `main.py` |
| 8 | Harcama özeti kişi bazlı olmalı | `month_summary` hiç `sahip` kırılımı üretmiyor | `personal_repository.py::month_summary`, `personal_flow.py::handle_harcama_ozet` |

Madde 2-3'ün kanıtı:

```python
'📜 Son İşlemler'.lower() == '📜 son işlemler'   # False
'📊 Portföyüm'.lower()   == '📊 portföyüm'      # True  (İ yok, bu yüzden çalışıyor)
```

---

## Görev A — hızlı düğmeler + yardım metni
**Dosyalar:** `src/bot/main.py`, `src/bot/handlers/query_flow.py`
**Kapsam:** madde 2, 3, 4

1. **Önce testi yaz** (`tests/test_quick_buttons.py`): `make_main_reply_keyboard()`
   içindeki **her** düğme metninin yönlendirmede eşleştiğini doğrula. Test
   düğmeleri elle listelemesin, klavyeden okusun — yarın yeni düğme eklenirse
   test onu da kapsasın.
2. Eşleşmeyi `normalize_turkish_str` (`src/nlp/aliases.py`) üzerinden yap;
   karşılaştırılan sabitler de aynı fonksiyondan geçsin. `text.lower()` ile
   karşılaştırma bırakılmasın.
3. Yardım metnindeki örnekleri kişiden bağımsız hale getir: `enis`/`qnb` yerine
   `config.DEFAULT_PORTFOLIO` / `DEFAULT_BROKER` kullan; bu kurulumda tanımlı
   kurum/portföy yoksa örneği o alan olmadan yaz (ör. `10 lot aselsan 220 den aldım`).
   Yardım metninde hiçbir kişi adı sabit yazılı kalmasın — bir testle sabitle.

## Görev B — defter listesi ve kişi bazlı özet
**Dosyalar:** `src/bot/handlers/personal_flow.py`, `src/data/personal_repository.py`
**Kapsam:** madde 5, 6, 8

1. **`/defter` satırına sahip bilgisi** (madde 5): yalnızca **iki veya daha fazla
   aktif kişi varken** göster — tek kişilik kurulumda (Enis'in bugünkü hâli
   değil, ama genel olarak) gereksiz gürültü olmasın. Kişi adı `people.json`'dan
   çözülsün, kod değil ad yazılsın.
2. **Yön işareti** (madde 6): gelir ile gideri ilk bakışta ayırt ettir
   (ör. gider `−340 ₺`, gelir `+5.000 ₺`). Transfer ve düzeltme satırlarının
   bugünkü görünümü bozulmasın.
3. **Kişi bazlı harcama özeti** (madde 8): `month_summary`'ye kişi kırılımı ekle
   (mevcut anahtarlar **aynen korunsun**, yenisi eklensin — başka çağıranlar var).
   `/harcama_ozet` çıktısı her kişi için ayrı gider/gelir göstersin; tek kişi
   varsa bugünkü sade görünüm korunsun.
4. Her madde için önce başarısız test yaz.

## Görev C — kişisel kaydı geri alma (madde 7) — bunu ben yapacağım
`geri al`, son işlemin hangi defterde olduğuna göre doğru tarafa gitmeli.
`main.py`'ye dokunduğu için Görev A bittikten **sonra** yapılacak.

---

## Her görev için kurallar

- **TDD:** önce başarısız test, sonra kod. Testsiz düzeltme kabul edilmez.
- **Enis'in kurulumu değişmez.** Yeni davranışlar ya kişi sayısına ya da
  yapılandırmaya bağlı olsun; `.venv/bin/python -m pytest -q` sonunda **702 +
  yeni testler**, sıfır başarısız.
- Kullanıcıya görünen bütün metinler Türkçe ve mevcut üslupla aynı.
- Yeni bağımlılık yok.
- Her görev kendi commit'i olsun, mesaj Türkçe, sonuna:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Push etme, VM'e deploy etme.** Denetim sonrası onu ben yapacağım.
- Emin olmadığın bir şeyi tahmin etme; dosyayı okuyup doğrula.
