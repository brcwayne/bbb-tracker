# Bot Konuşma Kaydı ve Senaryo Testleri — Design

**Tarih:** 2026-09-09
**Kapsam:** İki bağlantılı iş. (A) Telegram botuyla yapılan her konuşmayı — gelen mesaj, giden cevap, çıkarım, diske yazılan kayıt — yapılandırılmış biçimde kaydetmek ve kullanıcının hatalı çıkarımları anında işaretleyebilmesi. (B) Bu kaydın da beslediği, botu gerçek cümlelerle sınayan bir senaryo test süreci.
**Depo:** Kod `github.com/brcwayne/bbb-telegram-bot` deposunda (BBB'den ayrı bir repo). Spec ve plan dokümanları, mevcut teamüle uyarak BBB deposunda `docs/superpowers/` altında durur — `2026-09-05-bbb-p5-telegram-drive-design.md` de böyle yapılmıştı.

---

## 0. Buradan başlıyoruz

Enis botu günlük kullanıyor ve çeşitli anlatım biçimlerini kendisi denemek istiyor. Bugünkü döngü şu: bir şey ters gidiyor, Enis durumu bana uzun uzun anlatıyor, ben tahmin yürütüyorum. Üstelik **iptal edildiğinde konuşma tümden kayboluyor** — yani kanıt tam da en çok gerektiği anda siliniyor.

Botta hâlihazırda `logging.basicConfig` ile bir `bot.log` var; bu serbest metin bir uygulama günlüğü, konuşmayı yeniden kurmaya elverişli değil. Test tarafında 450 test geçiyor (1.44 sn) ve `tests/test_debt_flow.py` içinde `FakeMessage` / `FakeUpdate` / `FakeContext` üçlüsüyle iyi bir sahte Telegram iskeleti var — ama bu üçlü **9 ayrı test dosyasında kopyalanmış** durumda, ve mevcut testler akışa ham cümleyle değil hazır taslakla giriyor. Yani "ham cümle → nihai kayıt" yolu bugün kapsanmıyor.

Bu tasarımın çıktısı tek bir döngü: **Enis elle dener → hatalıyı işaretler → kayıt Drive'a düşer → ben okurum → işaretlenen konuşma test senaryosuna dönüşür.**

---

## 1. Kararlar

Aksi belirtilmedikçe 2026-09-09'da Enis tarafından verildi.

| # | Karar | Gerekçe |
|---|---|---|
| K1 | **Kayıtlar ayrı bir `logs/` klasörüne yazılır ve kendi rclone push'uyla Drive'a çıkar.** | Enis'in seçimi. Defter JSON'larıyla karışmaz, istenirse tümü tek hamlede silinir, ve Drive'a çıktığı için ben SSH'sız okuyabilirim — asıl amaç buydu. |
| K2 | **İşaretleme: iptal ekranında gerekçe + `/hata` komutu.** | Enis'in seçimi. Her mesaja düğme koymak ekranı kalabalıklaştırır; hata en sık iptal anında belli olur, o an zaten akış bitiyor, bir dokunuş maliyeti yok. |
| K3 | **Modelin ham çıktısı da kaydedilir** — istem özeti, ham yanıt, hangi motor, kaç ms. | Enis'in seçimi. "Bu çıkarım neden yanlış oldu" sorusunun cevabı neredeyse her zaman burada. |
| K4 | **Saklama sınırsız; silme elle yapılır.** | Enis'in seçimi. Bu yüzden dosyalar **günlük** bölünür (`conv-2026-09-09.ndjson`) — tek dosya şişmez, bir günü silmek bir `rm`. |
| K5 | **Kayıt hiçbir koşulda botu düşürmez.** Her kayıt çağrısı yutulan bir `try/except` içindedir. | Gözlem aracı, gözlediği şeyi bozarsa değersizdir. Disk dolsa, izin bozulsa, JSON serileşmese bile kullanıcı bunu fark etmemeli. |
| K6 | **Giden mesajlar `Bot` nesnesi sarmalanarak yakalanır**, çağrı yerleri değiştirilmez. | Kodda 100'den fazla doğrudan `reply_text`/`edit_message_text` çağrısı var. Hepsini elle sarmak hem büyük hem de kırılgan; biri unutulduğunda kayıt sessizce eksik kalır. `Message.reply_text` sonunda `bot.send_message`'a indiği için tek nokta yeterli. |
| K7 | **İki ayrı test türü, birbirine karıştırılmaz.** Akış senaryoları deterministiktir (model stub'lanır) ve CI'da koşar; anlama eval'leri gerçek modeli çağırır, skor üretir, CI'da koşmaz. | Gerçek model çağrısı deterministik değildir. İkisi karışırsa CI rastgele kırılır ve kimse kırmızıya güvenmez olur. |
| K8 | **Senaryo koşucusu okunabilir bir transkript üretir**, sadece geçti/kaldı değil. | Enis'in asıl istediği şey botun nasıl davrandığını *görmek*. Yeşil tik bunu göstermez. |

---

## 2. Değişmezler

- **Bot davranışı bu işte değişmez.** Tek istisna K2'nin getirdiği iptal gerekçesi sorusu ve yeni `/hata` komutu. Çıkarım mantığına, kayıt biçimine, mevcut akışlara dokunulmaz.
- **Kayıt asenkron yolu yavaşlatmaz.** Satır ekleme (`append`) tek süreçli bot için yeterli; kilit yok, `jsonstore`'un atomik yazma makinesi kullanılmaz — o dosyanın tamamını yeniden yazanlar içindir.
- **Gizli değer kaydedilmez.** Bot token'ı, API anahtarları, `.env` içeriği hiçbir olayda yer almaz.
- **`logs/` Drive'dan geri **çekilmez**.** Mevcut `pull` komutu `gdrive:` kökünü `data/` içine kopyalıyor; dışlanmazsa loglar `data/logs/` olarak geri iner. Bu, tasarımın en kolay gözden kaçan gerçek dünya ayrıntısı (§4.2).
- **`logs/` systemd `.path` biriminde izlenmez.** İzlenirse her Telegram mesajı bir rclone koşusu tetikler. Loglar bir sonraki zamanlanmış senkronla gider.
- Mevcut 450 test yeşil kalır; `pytest` (9.1.1, `asyncio_mode=auto`) tek komutla koşar.
- Kullanıcıya görünen metinler Türkçe, mevcut botun diline uygun.

---

## 3. Faz A — Konuşma kaydı

### 3.1 Nereye yazılır

```
/home/ubuntu/BBB/logs/
  conv-2026-09-09.ndjson      ← günün tüm olayları, satır başına bir JSON
  conv-2026-09-10.ndjson
  render/2026-09-09.md        ← istenince üretilen okunabilir transkript
  README.md                   ← nasıl silinir, ne içerir
```

NDJSON seçilmesinin sebebi: satır ekleme çökmeye dayanıklıdır (yarım yazılan tek satır kaybolur, dosya bozulmaz), `grep`'lenebilir, ve akış hâlinde okunabilir. Tek bir dev JSON dizisi her yazışta yeniden serileştirme gerektirirdi.

### 3.2 Olay biçimi

Her satır tek bir olay. Ortak alanlar:

```json
{"ts":"2026-09-09T12:34:56.789+03:00","conv":"c_20260909_123456_a1b2","chat":123,"user":456,"tur":"..."}
```

`tur` değerine göre ek alanlar:

| `tur` | Ne zaman | Ek alanlar |
|---|---|---|
| `gelen` | Kullanıcı mesajı, komut veya düğme basışı | `metin` \| `komut` \| `callback`, `mesaj_id` |
| `giden` | Botun her cevabı | `metin`, `butonlar` (etiket + callback listesi), `duzenleme` (mevcut mesajı güncelliyorsa), `mesaj_id` |
| `cikarim` | Nihai taslak üretildiğinde | `motor` (`kural`\|`qwen`\|`gemini`\|`karma`), `model`, `ms`, `kural_sonucu`, `model_ham`, `model_sonuc`, `birlesik`, `guven` |
| `yazim` | Diske kayıt düştüğünde | `dosya`, `islem` (`ekle`\|`guncelle`\|`sil`), `id`, `satir` |
| `isaret` | K2'deki iki yoldan biri | `sebep` (`yanlis_anladi`\|`vazgectim`\|`komut`), `not` |
| `hata` | Handler istisna fırlattığında | `tip`, `mesaj`, `iz` (kısaltılmış) |

Bu alan kümesi bir konuşmayı baştan sona yeniden kurmaya yeter: ne yazdı → bot ne anladı (ve model ham olarak ne döndü) → ne cevap verdi, hangi düğmeler çıktı → hangisine bastı → diske ne yazıldı.

### 3.3 `conv` — konuşmayı gruplayan anahtar

Bir "konuşma" = tek bir işlemi tamamlama denemesi. Sınırları:

- Serbest metinli bir mesaj yeni bir `conv` **başlatır** ve `context.user_data["conv_id"]`e yazılır.
- O andan itibaren aynı sohbetteki her olay (düğme basışları dahil) bu `conv`'u taşır.
- Kayıt tamamlandığında, iptal edildiğinde veya akış düştüğünde `conv` **kapanır** (`user_data`'dan silinir), ama son değeri `son_conv_id` olarak saklanır — `/hata` komutunun neyi işaretleyeceğini bilmesi için.
- Akış dışındaki tekil olaylar (örn. `/borclar`) kendi tek olaylık `conv`'unu alır.

### 3.4 Üç kanca, üçü de tek noktada

**Gelen:** `TypeHandler(Update, log_inbound)` handler'ı `group=-1`'e kaydedilir. PTB önce düşük grup numarasını çalıştırır; `ApplicationHandlerStop` fırlatılmadığı sürece gerçek handler'lar normal akışına devam eder. Böylece tek yerden her gelen güncelleme görülür.

**Giden:** `ExtBot` alt sınıfı:

```python
class LoggingBot(ExtBot):
    async def send_message(self, chat_id, text, **kw):
        msg = await super().send_message(chat_id, text, **kw)
        convlog.giden(chat_id, text, kw.get("reply_markup"), msg)
        return msg
    # edit_message_text ve answer_callback_query için aynısı
```

`ApplicationBuilder().bot(LoggingBot(token))` ile takılır. **Bu K6'nın tamamı**: koddaki 100+ `reply_text` çağrısının hiçbirine dokunmadan hepsi yakalanır, çünkü `Message.reply_text` nihayetinde `bot.send_message`'ı çağırır.

**Çıkarım:** `personal_flow.merge_parses(rule, llm, ctx)` nihai taslağın üretildiği tek yer — hem kural sonucunu hem model sonucunu görüp birleştiriyor. `cikarim` olayı burada yazılır. Modelin **ham** metni ise `qwen_service.parse_personal_message` içinde yakalanıp `merge_parses`'a taşınır.

**Yazım:** `PersonalRepository`'nin mutasyon yapan public metotları (`add_entry`, `add_debt`, `settle_debt`, `add_transfer`, `add_category`, …) küçük bir dekoratörle sarılır; dönen satır `yazim` olayına yazılır.

### 3.5 İşaretleme (K2)

**İptal yolu.** Kullanıcı iptal düğmesine bastığında akış hemen silinmez; bot tek satırlık bir soru sorar:

> İptal edildi. Sebep?  `[Yanlış anladın]` `[Vazgeçtim]`

Her iki düğme de bir `isaret` olayı yazar ve konuşmayı kapatır. İki seçeneği ayırmak önemli: "vazgeçtim" botun doğru çalıştığı ama fikrin değiştiği durumdur ve incelenmeye değmez; "yanlış anladın" tam da aradığımız şeydir. Düğmelerden birine basılmazsa konuşma yine de kayıtlıdır, sadece işaretsizdir.

**Komut yolu.** `/hata [açıklama]` son kapanmış konuşmayı (`son_conv_id`) işaretler. Açıklama isteğe bağlı ve serbest metindir; "bora'yı borcu ödedi sandı" gibi bir cümle bana çoğu zaman transkriptten daha hızlı yol gösterir.

### 3.6 Transkript okuyucu

```
python -m src.obs.render 2026-09-09              # o günün tümü
python -m src.obs.render 2026-09-09 --isaretli   # sadece işaretlenenler
python -m src.obs.render --conv c_2026...        # tek konuşma
```

Markdown üretir: her konuşma bir başlık, altında zaman damgalı akış, çıkarım bloğu daraltılmış kod bloğunda, yazılan satır sonda. `--yaz` bayrağıyla `logs/render/<gun>.md` dosyasına yazar; o dosya da Drive'a gider, böylece ben NDJSON ayrıştırmadan doğrudan okuyabilirim.

---

## 4. Faz A — Dağıtım

### 4.1 Gerçek düzen

| Ne | Nerede |
|---|---|
| Bot kodu | `/home/ubuntu/bbb-telegram-bot`, sanal ortam `.venv` |
| Bot servisi | systemd, birim adı `bbb-bot` (VM'de teyit edilmeli — `deploy/README.md` de bunu not düşüyor) |
| Defter verisi | `/home/ubuntu/BBB/data` (kişisel defter dosyaları tek kopya, sadece burada) |
| Senkron | `bbb-sync.service` (oneshot) + `.timer` + `.path`, kilit `~/BBB/.sync.lock` |
| Drive | rclone uzak adı `gdrive:`, kökü BBB veri klasörü |

### 4.2 rclone değişiklikleri

`src/sync/once.py` içindeki `_run_rclone`:

- **push**: mevcut `data/ → gdrive:` çağrısından sonra ikinci bir çağrı — `rclone copy /home/ubuntu/BBB/logs/ gdrive:logs/`.
- **pull**: mevcut `gdrive: → data/` çağrısına `--exclude logs/**` eklenir.

İkinci madde ihmal edilirse loglar bir sonraki çekmede `data/logs/` olarak geri iner ve her döngüde büyüyerek kopyalanır. Mevcut kodda zaten `--exclude backups/**` var; aynı kalıp izlenir.

`.path` birimi **değiştirilmez** (§2).

---

## 5. Faz B — Senaryo test süreci

### 5.1 B1: Ortak sahte Telegram katmanı

`FakeMessage` / `FakeUpdate` / `FakeContext` üçlüsü 9 test dosyasında kopyalanmış durumda. `tests/support/fake_telegram.py` altında tek sürüme indirilir ve mevcut testler ona bağlanır. Bu bir temizlik işi değil, ön koşul: senaryo motorunun ihtiyaç duyduğu yetenekler (düğmelere basabilme, çok adımlı diyalog sürdürme, giden mesajları sıralı toplama) tek bir sürümde olmalı.

Sahte katmanın taşıması gerekenler: `reply_text` çağrılarının metni **ve** `reply_markup`'ı, `edit_message_text`, `answer_callback_query`, `callback_query` üretimi, `user_data` sürekliliği.

### 5.2 B2: Senaryo motoru

Senaryolar bildirimsel yazılır; koşucu hem doğrular hem transkript basar:

```python
Senaryo(
    ad="borc-verdim-kisi-eksik",
    gonder="1000tl borç verdim",
    cikarim={"tur": "BORC_VERME", "tutar": 1000.0, "paraBirimi": "TRY", "kisi": None},
    bekle_metin=r"kime",
    bekle_butonlar=["Bora", "Alper", "+ Yeni kişi"],
    bas="Bora",
    bekle_kayit=("debts", {"yon": "VERDIM", "kisi": "BORA", "tutar": 1000.0, "durum": "ACIK"}),
)
```

- `cikarim` verilmişse model stub'lanır (K7) — `parse_personal_message` zaten testlerde monkeypatch'leniyor, yol açık.
- `cikarim` verilmezse **kural motoru** (`analyze_personal_message`) gerçek haliyle koşar; kural tabanlı ayrıştırmayı sınayan senaryolar böyle yazılır.
- `bekle_kayit` `tmp_path` altındaki gerçek `PersonalRepository`'ye bakar — kaydın gerçekten diske düştüğü doğrulanır.
- Koşucu her senaryo için `tests/scenarios/_ciktilar/<ad>.md` üretir (K8).

### 5.3 B3–B4: Senaryo aileleri

Enis'in saydığı vakalar. Her satır en az bir senaryo:

| Aile | Örnek girdi | Sınanan |
|---|---|---|
| Eksik bilgi | "1000tl borç verdim" | Kişi sorulur mu, mevcut kişiler listelenir mi, "yeni kişi" yolu var mı |
| Farklı anlatım | "ödünç verdim", "Bora'ya 1000 attım", "Bora bana 1000 borçlandı" | Hepsi aynı kayda düşüyor mu |
| Yön karışıklığı | "borç aldım" ↔ "borç verdim" | `yon` ters kaydediliyor mu — en pahalı hata sınıfı |
| Yazım hatası | "boç verdm", "1.000 tl", "1000₺", "bin lira" | Tutar ve niyet yakalanıyor mu |
| Belirsizlik | Defterde iki "Ali" varken "Ali'ye verdim" | Seçim sunuluyor mu, yoksa ilki mi seçiliyor |
| İptal / düzeltme | Akış ortasında iptal; yanlış düğme sonrası geri dönüş | Taslak temizleniyor mu, yarım kayıt kalıyor mu |
| Kapatma | "Bora borcunu ödedi" | Mevcut kayıt `KAPALI` mı oluyor, yoksa yeni kayıt mı açılıyor |
| Harcama/gelir | "markette 340", "maaş yattı 85000" | Kategori ve yön |
| Taksit | "3 taksitle 6000 buzdolabı" | Plan + 3 satır |
| Transfer | "garantiden nakite 5000 çektim" | İki hesabın da doğru etkilenmesi |

**Bu senaryoların bir kısmı kırmızı başlayacak.** "Bot kişi listesini gösterip Ekle butonu sunmalı" Enis'in *istediği* davranış; bugünkü davranış olmayabilir. Kırmızı senaryo listesi doğrudan yapılacaklar listesidir — senaryo yazarken beklenti bugünkü koda göre değil, istenen davranışa göre yazılır ve fark açıkça raporlanır.

### 5.4 B5: Anlama eval'leri

`evals/` ayrı bir ağaç. CI'da koşmaz.

- Külliyat: `evals/corpus/*.yaml` — her girdi bir cümle ve beklenen alanlar.
- Koşucu: `python -m evals.run --aile borc` gerçek modeli (Qwen yerel / Gemini) çağırır, alan alan karşılaştırır, `evals/raporlar/<tarih>.md` üretir: aile bazında skor tablosu ve **her ıskalanın** yanında modelin ham çıktısı.
- Geçti/kaldı yok; eşik yok. Amaç bir sayının zaman içinde nereye gittiğini görmek.

### 5.5 B6: Kayıttan külliyata hasat

`python -m evals.harvest --gun 2026-09-09` günün NDJSON'ını okur, `isaret` olayı `yanlis_anladi` olan konuşmaları bulur, her birinden `{girdi, model_ham, birlesik, beklenen: TODO}` şeklinde bir külliyat adayı üretir ve `evals/corpus/_aday.yaml`'a yazar. `beklenen` alanını Enis (veya ben) doldurur.

Döngüyü kapatan halka budur: elle deneme → işaret → aday → külliyat → ölçüm.

---

## 6. Test edilecekler (Faz A'nın kendisi)

- Olay biçimi: her `tur` için zorunlu alanlar; JSON'a serileşemeyen değer geldiğinde satır yine de yazılır (repr'e düşülür).
- `conv` yaşam döngüsü: metin başlatır, düğmeler devralır, kayıt/iptal kapatır, `/hata` kapananı bulur.
- **K5 dayanıklılığı:** `logs/` yazılamaz olduğunda (izin hatası, disk dolu) botun akışı kesintisiz sürer ve kullanıcı hiçbir şey fark etmez. Bu, tüm tasarımın en kritik testidir.
- `LoggingBot` sarmalayıcısı: bir handler'ın `reply_text` çağrısı `giden` olayı üretir; `reply_markup` düğmeleri etiketleriyle kaydedilir.
- Gizli değer sızmaz: token ve API anahtarı hiçbir olayda görünmez.
- `/hata` ve iptal gerekçesi doğru `sebep` ile `isaret` yazar.
- rclone: push ikinci çağrıyı yapar, pull `logs/**` dışlar (mevcut `test_bbb_sync.py` kalıbıyla, `subprocess.run` sahtelenerek).
- Transkript okuyucu: bilinen bir NDJSON'dan beklenen markdown'ı üretir.

---

## 7. Kapsam dışı

- Mevcut çıkarım mantığında herhangi bir iyileştirme. Bu iş botu **ölçer**, düzeltmez. Ölçüm sonucu çıkacak düzeltmeler kendi işleridir.
- Yatırım tarafı akışları (`trade_flow`, `pdf_flow`) için senaryo yazmak — kayıt onları da kapsar, senaryolar Faz B'de kişisel deftere odaklanır.
- Web arayüzünde kayıtları gösterme.
- Çok kullanıcılı kullanım; bot `ALLOWED_USER_IDS` ile zaten tek kullanıcıya kapalı.
- Kayıtların şifrelenmesi. Drive hesabı Enis'in kendi hesabı ve klasör paylaşıma açık değil.
