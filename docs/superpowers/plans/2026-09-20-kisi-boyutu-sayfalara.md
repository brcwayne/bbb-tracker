# Kişi boyutunun sayfalara yayılması (2026-09-20)

Enis'in isteği: özet kişi/hesap kırılımı, Kişiler sayfasında kişiye tıklayınca
hareketleri, ve Taksitler / Tekrarlayanlar / Borçlar sayfalarında kişi etiketi.

**Enis'in kararları (sorulup alındı):**
- Özet: **hem kişi hem hesap**, üstte bir seçiciyle.
- Borçlar: **"kimin parası" ayrı bir alan olarak eklensin.**

---

## Veri gerçekleri (kodda doğrulandı, tahmin değil)

| Kayıt | Kişi alanı | Not |
|---|---|---|
| `PersonalTx` | `sahip` (+ `karsiSahip`) | var |
| `PaymentPlan` (Taksitler) | `sahip` | **veride var, ekranda yok** |
| `RecurringRule` (Tekrarlayanlar) | `sahip` | **veride var, ekranda yok** |
| `Debt` (Borçlar) | `kisi` = borçlu/alacaklı | "kimin parası" **hiç yok** |
| `PersonalAccount` | `sahip` | hesabın sahibi |

**Kritik kural — bakiyeye dokunma.** `add_debt` yalnızca `debts.json`'a yazar,
defter kaydı üretmez; `ownerLedger` de borçları hiç saymaz. Para hesaptan
düşmediği için kişiden de düşmez ve "kişi toplamı = hesap toplamı" kontrolü
tutar. Borç'a eklenecek `sahip` **yalnızca etikettir**: `owners.ts` /
`owners.py` DEĞİŞMEYECEK. Aksi halde tutarlılık uyarısı yanlış yanar.

---

## Görev 1 — Taksitler ve Tekrarlayanlar'da kişi (kolay)
**Dosyalar:** `app/src/routes/hesaplar/Taksitler.svelte`, `Tekrarlayanlar.svelte`
Veri zaten `sahip` taşıyor, sadece gösterilecek.
- Kişi adı (`people.json`'dan `ad`, kod değil) satırda görünsün.
- **Yalnızca gösterilen kayıtlarda birden fazla farklı `sahip` varsa** göster —
  `/defter`'de yerleşen kural budur; tek sahipli kurulumda gürültü olmaz.
- Önce başarısız test.

## Görev 2 — Kişiler sayfasında kişi detayı
**Dosyalar:** `app/src/routes/hesaplar/Kisiler.svelte`, `router.ts`, `App.svelte`,
yeni `app/src/routes/hesaplar/KisiDetay.svelte`
- Kişi kartı tıklanabilir olsun → `#/h/kisiler/<kod>`.
- Detay: o kişinin bütün para hareketleri (gider, gelir, düzeltme, kişiler arası
  aktarım — hem `sahip` hem `karsiSahip` tarafı), tarihe göre yeni→eski,
  yön işaretli (`-340` / `+5.000`), üstte o kişinin bakiyesi.
- Kişinin taksit planları ve tekrarlayan kuralları da ayrı birer bölüm olarak
  listelensin (veride `sahip` var).
- Boş durumda anlamlı bir mesaj.
- Rota `h-kisiler`'in parametreli hali olsun; `currentRoute()` zaten `param`
  destekliyor (`h-hesap` ve `h-borclar` örnek).

## Görev 3 — Özet sayfasına kişi/hesap seçicisi
**Dosyalar:** `app/src/routes/hesaplar/Ozet.svelte`, gerekiyorsa
`app/src/lib/data/personal.ts`
- Üstte iki durumlu bir seçici: **Kişi** / **Hesap**.
- Seçime göre mevcut grafikler (aylık seyir, kategori dağılımı, taksit yükü)
  o boyuta göre bölünsün.
- Tek kişi (veya tek hesap) varsa seçici gizlensin, bugünkü sade görünüm kalsın.
- Türetme `.svelte` içinde değil, `lib/data/` altında ve birim testli olsun —
  bu projenin kuralı.

## Görev 4 — Borçlar'a "kimin parası" (veri modeli değişikliği)
**Dosyalar:** `app/src/lib/data/types.ts`, `app/src/routes/hesaplar/Borclar.svelte`,
bot tarafı `bbb-telegram-bot/src/data/personal_repository.py::add_debt`,
`src/bot/handlers/debt_flow.py`
- `Debt`'e **isteğe bağlı** `sahip?: string` eklensin. Alanı olmayan eski
  kayıtlar bozulmasın; okunurken varsayılan sahip sayılsın.
- Borçlar sayfasında görünsün ve düzenlenebilsin (yalnızca 2+ sahip varken).
- Botta borç kaydederken sorulsun — ama **yalnızca birden fazla kişi varsa**;
  tek kişilik kurulumda akışa fazladan bir soru eklenmesin.
- `owners.ts` / `owners.py` **değişmeyecek** (yukarıdaki kritik kural).
- Bot ve web aynı alan adını kullanmalı: `sahip`.

---

## Her görev için kurallar
- **TDD:** önce başarısız test, çalıştırıp kırmızıyı gör, sonra kod.
- Web: `npm test` ve `npm run check` (0 hata) temiz. Bot: `pytest -q` sıfır başarısız.
- **Enis'in kurulumunda görünür değişiklik olmasın:** kişi boyutu her yerde
  "kayıtlarda 2+ farklı sahip var mı" ölçütüne bağlı.
- Türkçe metinler, mevcut üslup. Yeni bağımlılık yok.
- Her görev kendi commit'i; sonuna `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Push ve deploy YOK — denetimden sonra ben yapacağım.
- **İki ajan aynı repoda aynı anda commit atmasın** (2026-09-20'de git index'i
  bozuldu). Web ve bot ayrı repo olduğu için o ikisi paralel olabilir.
