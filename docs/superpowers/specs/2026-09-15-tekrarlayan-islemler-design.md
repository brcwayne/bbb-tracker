# Tekrarlayan İşlemler (Kişisel Defter) — Design

**Date:** 2026-09-15
**Scope:** Maaş / abonelik gibi her ay aynı günde tekrar eden Kişisel Defter kayıtlarını tek seferde tanımlayıp, uygulamanın önceden (soluk turuncu) göstermesi ve gün geldiğinde bot'un Telegram'dan onay alarak deftere işlemesi. İki repo etkileniyor: `app/` (BBB PWA) ve `bbb-telegram-bot/` (ayrı git repo).

---

## 0. Neden şimdi bu şekilde

Kişisel Defter'e kayıt iki yoldan girebiliyor: Telegram bot'a doğaç mesaj ("markette 340 lira") veya uygulamadaki `HarcamaFormu.svelte`'den manuel giriş — ikisi de aynı `personal_tx.json`'a yazıyor ve zaten üç-yönlü birleştirme (`2026-09-08-bbb-kisisel-defter-faz2-design.md`) ile eşzamanlılığı çözülmüş durumda. Tekrarlayan işlem, mevcut hiçbir kavrama (taksit planı sabit sayıda taksit ile biter, süresiz değil) tam oturmuyor; bu yüzden yeni bir varlık (`RecurringRule`) ve `PersonalTx`'e iki opsiyonel alan gerekiyor — mevcut 189 kayda dokunmadan.

Kullanıcının netleştirdiği davranış üç parçalı: (1) kural kurulunca gelecek aylar için **önizleme** satırları görünsün, (2) gün gelince bot Telegram'dan **sorup** onaylayınca satır "gerçekleşmiş" sayılsın, (3) bir kaydı elle değiştirince bu **bundan sonraki tekrarlara da** yayılabilsin (Google Takvim'in "bu ve sonraki etkinlikler" düzenleme mantığı).

---

## 1. Kararlar

| # | Karar | Gerekçe |
|---|---|---|
| D1 | Kural CRUD'u **sadece uygulamadan** yapılır (`Tekrarlayanlar` sekmesi); bot `recurring_rules.json`'a hiç yazmaz, sadece okur. | `HarcamaFormu.svelte` zaten `store.ts` üzerinden Drive/local'a doğrudan yazabiliyor — bot'a ihtiyaç yok, tek yazar = daha basit eşzamanlılık. |
| D2 | Önizleme satırları **gerçek `PersonalTx` satırlarıdır**, `durum: 'planlandi'` bayrağıyla işaretlenir; ayrı bir tablo/dosya değil. | Harcamalar listesi, kategori/ay toplamları gibi mevcut her şey aynı diziyi okuyor; yeni bir paralel veri yapısı yerine tek alan eklemek entegrasyonu bedavaya getiriyor. |
| D3 | Materialization (kural → gelecek satırlar) **hem TS'de hem Python'da** ayrı ayrı, küçük, saf fonksiyonlar olarak yazılır — paylaşılan paket yok. | Fonksiyon ~30 satır tarih matematiği; iki dil arasında paylaşım altyapısı kurmak, iki kez yazıp iki tarafta test etmekten daha pahalı (YAGNI). |
| D4 | Ufuk **12 ay**, her materialization çağrısında (kural kaydında VEYA bot'un günlük taramasında) eksik aylar tamamlanır — idempotent (aynı kural+tarih için ikinci satır açılmaz). | Kullanıcı "ay toplamlarından emin olmak" istiyor; 12 ay pratikte yeterli ve bot günlük çalıştığı için ufuk kendiliğinden kayar. |
| D5 | Gün geldiğinde onay **Telegram inline buton** (Evet/Hayır) ile alınır; `notify.send_telegram`'a `reply_markup` desteği eklenir, yeni bir `CallbackQueryHandler` (`recur:yes:<id>` / `recur:no:<id>`) ana bot sürecine eklenir. | Mevcut `personal_flow.py`/`transfer_flow.py` zaten inline buton + callback deseni kullanıyor; metin cevabı beklemek (evet/hayır yazma) yeni bir NLP dalı gerektirirdi. |
| D6 | "Hayır" cevabı o **tek** ayın satırını tamamen siler; kural ve sonraki aylar etkilenmez. Tutar sorma akışı yok (kullanıcı "sabit tutar, değişirse elle düzenlerim" dedi). | Kapsamı MVP'de tutmak; değişken tutar isteseydi her ay bot'a cevap yazmak gerekirdi — kullanıcı bunu istemedi. |
| D7 | Bir **planlı** satırı `HarcamaFormu`'dan düzenlerken tutar/kategori/hesap değişirse, form "sadece bu kayıt" / "bundan sonraki tüm tekrarlar" seçimi sorar. İkincisi kuralı + `tarih >=` bu satır olan tüm planlı satırları günceller; geçmiş/gerçekleşmiş satırlara dokunmaz. | Kullanıcının verdiği örnek (abonelik zammı) birebir bu. |
| D8 | `recurring_rules.json`, bot'un `once.py`'sindeki `SEEDED_FILES`/`DIRECT_WRITE_FILES` listesine eklenir (aynı stage+merge boru hattı). | Tek yazar app olsa da, bot'un güncel kuralları okuyabilmesi için Drive→VM senkron yoluna girmesi gerekiyor; bu liste zaten tam da bunun için var. |
| D9 | Kural durdurulunca (`aktif=false`) veya silinince, o kurala ait **planlı** (henüz onaylanmamış) satırlar silinir; gerçekleşmiş geçmiş satırlar dokunulmadan kalır. | Durdurulan bir aboneliğin "hayali" gelecek ayları defter toplamlarını yanıltmasın; geçmiş gerçek harcamayı silmek yanlış olur. |

---

## 2. Veri modeli

### 2.1 Yeni dosya — `data/recurring_rules.json`

```ts
export interface RecurringRule {
  id: string                    // "rr_" + 12 hex, personal_tx id üretimiyle aynı kalıp
  tur: 'GIDER' | 'GELIR'
  aciklama: string
  kategori: string
  hesap: string
  sahip: string
  paraBirimi: 'TRY' | 'USD'
  tutar: number
  gunOfMonth: number            // 1-31; ayın gerçek gün sayısından fazlaysa o ayın son gününe sabitlenir
  baslangicTarihi: string       // ISO tarih — ilk oluşum bundan önce olamaz
  bitisTarihi: string | null    // null = süresiz
  aktif: boolean
  olusturulma: string
  kaynak: 'manual'
}
```

App tarafı: `source.ts`'deki `PERSONAL_NAMES`'e `'recurring_rules'`, `PERSONAL_KEY_MAP`'e `recurring_rules: 'recurringRules'` eklenir; `Dataset`'e `recurringRules?: RecurringRule[]` eklenir. Dosya eksikse (ilk kurulum) mevcut `PERSONAL_NAMES` deseniyle otomatik `[]` döner — geriye dönük kırılma yok.

Bot tarafı: `PersonalRepository.FILES`'e `"recurring": "recurring_rules.json"` eklenir; `list_recurring_rules()` okuma metodu eklenir (bot bu dosyaya **yazmaz**, D1).

### 2.2 `PersonalTx`'e eklenen alanlar

```ts
tekrarKuralId?: string | null   // hangi RecurringRule'dan üretildiği
durum?: 'planlandi'             // yoksa: normal/gerçekleşmiş kayıt (mevcut 189 kayıt etkilenmez)
```

`durum: 'planlandi'` olan satırlar:
- Harcamalar listesinde **soluk turuncu** gösterilir (yeni bir CSS sınıfı, `--gold` tonunun düşük opasiteli hali).
- `personal.ts` içindeki `monthlyTotals`, `monthSummary`, `categoryBreakdown` bu satırları **hariç tutar** (filtre: `durum !== 'planlandi'`). `instalmentSchedule` bu alandan etkilenmiyor (taksitler ayrı akış).
- `store.ts`'deki `updateRecord`/`deleteRecord` bugün `kaynak === 'manual'` kapısını kontrol ediyor; planlı satırlar da `kaynak: 'manual'` ile üretilir (D1'in devamı — tek yazar app), yani ekstra bir `allowKaynak` genişletmesi gerekmez.

---

## 3. Materialization algoritması

Hem `app/src/lib/data/recurring.ts` (yeni dosya) hem bot'un `src/data/recurring.py` (yeni dosya) içinde, aynı mantıkla:

```
materialize(kurallar, mevcutSatirlar, bugun, ufukAy=12) -> yeni PersonalTx satırları:
  for kural in kurallar where kural.aktif:
    for m in 0..ufukAy-1:
      ay = bugununAyi + m
      gun = min(kural.gunOfMonth, ay.gunSayisi)     // 31 -> Şubat'ta 28/29'a sabitlenir
      tarih = ay/gun
      if tarih < max(bugun, kural.baslangicTarihi): continue
      if kural.bitisTarihi != null and tarih > kural.bitisTarihi: continue
      if (kural.id, tarih) zaten mevcutSatirlar içinde varsa: continue   // idempotent
      yeni satır: durum='planlandi', tekrarKuralId=kural.id, tur/kategori/hesap/tutar/paraBirimi kuraldan kopyalanır
```

Çağrıldığı yerler:
- **App:** Tekrarlayanlar sekmesinde kural eklenince/düzenlenince, hemen `appendRecords` ile fark uygulanır (kullanıcı beklemeden 12 aylık önizlemeyi görür).
- **Bot:** günlük tarama (`src/sync/recurring.py`, bkz. §4) her çalıştığında önce top-up yapar, sonra vadesi gelenleri işler.

---

## 4. Bot değişiklikleri

`src/sync/reminder.py`'deki desenle birebir: yeni `src/sync/recurring.py`, `once.py`'nin döngüsüne (`check_monthly_snapshot_reminder` çağrısının yanına) eklenir.

1. **Top-up:** `PersonalRepository.list_recurring_rules()` + `list_entries()` ile `materialize()` (Python taraf) çağrılır; yeni satır varsa `_save("entries", ...)` ile atomik yazılır.
2. **Vade taraması:** `durum == 'planlandi'` ve `tarih <= bugun` olan satırlardan, daha önce Telegram'da sorulmamış olanları bulur. "Sorulmuş mu" bilgisi `data/.recurring_pending.json` içinde tutulur (satır id → sorulma zamanı) — `bbb-sync` döngüsü 2 dakikada bir çalıştığı için aynı soruyu tekrar tekrar göndermemek gerekiyor (`reminder.py`'deki `.reminder_state.json` ile aynı fikir).
3. **Bildirim:** `notify.send_telegram(text, reply_markup=...)` — `reply_markup` parametresi yeni eklenir (bugün yok, sadece düz metin gönderiyor). Buton `callback_data`: `recur:yes:<txId>` / `recur:no:<txId>`.
4. **Callback işleyici:** yeni `src/bot/handlers/recurring_flow.py`, `main.py`'ye `CallbackQueryHandler(pattern="^recur:")` olarak kaydedilir.
   - `recur:yes:<id>` → satırdan `durum` alanı kaldırılır (artık gerçekleşmiş), `.recurring_pending.json`'dan silinir, mesaj "✅ Kaydedildi" olarak düzenlenir.
   - `recur:no:<id>` → satır `personal_tx.json`'dan tamamen silinir (D6), pending kaydı temizlenir, mesaj "↩️ Bu ay atlandı" olur.
   - Her iki yol da `PersonalRepository._save` üzerinden (yedekli, atomik, `sync_lock` korumalı) yazar — yeni bir kilit mekanizması gerekmez.

`recurring_rules.json`, `once.py`'deki `SEEDED_FILES` listesine eklenir (D8) — böylece Drive'daki (uygulamadan yazılan) güncel kurallar VM'e düzenli akar.

---

## 5. Uygulama (app) değişiklikleri

- **Yeni tip + fonksiyon:** `lib/data/types.ts` (`RecurringRule`, `PersonalTx` ek alanları), `lib/data/recurring.ts` (`materialize`), `lib/data/source.ts` (`PERSONAL_NAMES`/`PERSONAL_KEY_MAP` girişleri), `lib/data/store.ts` `Kind` union'a `'recurring_rules'` eklenir.
- **Yeni sekme:** `routes/hesaplar/Tekrarlayanlar.svelte` — liste (açıklama, tutar, ayın günü, aktif/pasif), "Yeni Ekle" formu (`HesapFormu.svelte`'e benzer basit form), her satırda Durdur/Devam Ettir/Sil aksiyonları. `App.svelte`'deki Hesaplar alt-sekme listesine eklenir.
- **`HarcamaFormu.svelte` genişlemesi:** `editing?.tekrarKuralId` ve `editing?.durum === 'planlandi'` doluysa ve tutar/kategori/hesap alanlarından biri değiştiyse, mevcut `step: 'form' | 'confirm'` akışına üçüncü bir soru eklenir: "Sadece bu kayıt" / "Bundan sonraki tüm tekrarlar" (D7).
- **Görsel:** `Harcamalar.svelte`'deki satır render'ına `durum === 'planlandi'` için soluk turuncu bir CSS sınıfı (örn. `opacity` + `--gold` renginde sol kenarlık) eklenir; ay/kategori toplamlarını hesaplayan yerler zaten `personal.ts`'den geçiyor, oradaki filtre yeterli (§2.2).

---

## 6. Kenar durumlar

- **Ay sonu kayması:** `gunOfMonth=31` gibi bir kural, 30/28/29 çeken aylarda o ayın son gününe sabitlenir (§3).
- **`bitisTarihi` geçmişte:** kural fiilen pasif sayılır, yeni satır üretilmez; var olan geçmiş satırlar kalır.
- **Bot uzun süre kapalıyken geçen günler:** VM ayağa kalktığında, vadesi geçmiş ama hiç sorulmamış birden çok satır varsa, hepsi ayrı ayrı Telegram mesajı olarak sorulur (art arda gelir — MVP için kabul edilebilir, kullanıcı isterse tek mesajda özetlemeye ileride geçilebilir).
- **Aynı gün birden fazla kural:** her biri ayrı mesaj/callback olarak işlenir, birbirini etkilemez.
- **Eşzamanlılık:** `personal_tx.json` zaten üç-yönlü birleştirmeli (Faz 2 spec); bu özellik sadece o dosyaya yazılan satır sayısını artırıyor, mekanizmayı değiştirmiyor. `recurring_rules.json` tek yazarlı (D1), ekstra birleştirme mantığı gerekmiyor — düz stage+pull yeterli.

---

## 7. Test stratejisi

- **App:** `recurring.test.ts` (ay sonu clamp, ufuk, idempotency, `bitisTarihi` sınırı); `personal.test.ts`'e planlı satırların toplamlardan hariç tutulduğuna dair vakalar; `HarcamaFormu.test.ts`'e "sadece bu / bundan sonrası" dallarının doğru satırları güncellediğine dair testler; yeni `Tekrarlayanlar.test.ts`.
- **Bot:** `test_recurring.py` — top-up idempotency, clamp, vade tespiti, `.recurring_pending.json` durum geçişleri, `recur:yes`/`recur:no` callback akışları (mevcut `test_reminder.py`/`test_sync_runner.py` desenleriyle, `BBB_DIR` ortam değişkeniyle çalıştırılır).

---

## 8. Aşamalandırma

Uygulama tarafı bot'a bağımlı değil — kural kurup 12 aylık önizlemeyi görmek tek başına faydalı bir kesim noktası:

1. **App:** veri modeli + `materialize` + Tekrarlayanlar sekmesi + toplamlardan hariç tutma + görsel stil.
2. **Bot:** `recurring_rules.json` okuma + günlük top-up + vade taraması + Telegram onay akışı + callback handler.

İki aşama ayrı implementasyon planı/PR olarak ilerleyebilir.
