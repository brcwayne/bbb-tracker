# BBB Veri Senkronizasyonu Mimarisi ve Kuralları

Bu belge; BBB Tracker ekosisteminde verinin nerede yaşadığını, üç kopya arasındaki veri akış yönlerini, senkronizasyon araçlarını ve repo kopyasının ne zaman güncellenmesi gerektiğini tanımlar.

---

## 1. Üç Veri Kopyası ve Görevleri

Sistemde verinin bulunduğu üç ayrı katman vardır:

| Katman | Konum | Rol | Yazma İzni |
|---|---|---|---|
| **Google Drive** | `Drive: BBB/*.json` | **Tek Gerçek Kaynağı (Golden Master / Single Source of Truth)** | PWA Web Uygulaması & VM Senkronizasyonu |
| **Oracle VM / Telegram Botu** | `~/BBB/data/*.json` | Canlı bot çalışma alanı ve otomatik senkron düğümü | Telegram Botu & Otomatik `bbb-sync` servisi |
| **Git Deposu** | `BBB/data/*.json` | Yerel geliştirme, göç tohumu (seed) ve test fixture'ları | Geliştirici (Manuel / Kontrollü) |

### a. Google Drive (`Drive: BBB/`)
- Canlı PWA web uygulamasının doğrudan GIS OAuth (`DriveSource`) üzerinden bağlandığı, okuduğu ve optimistic concurrency (`md5Checksum`) ile yazdığı **ana veri ambarıdır**.
- Herhangi bir uyuşmazlıkta veya doğrulamada nihai otorite Google Drive'daki dosyalardır.

### b. Oracle VM / Telegram Botu (`~/BBB/data/`)
- Enis'in hareket halindeyken Telegram üzerinden yaptığı harcama, nakit akışı ve piyasa işlemlerini anında karşılar.
- `systemd` üzerinde çalışan `bbb-sync.timer` (10 dakikada bir) ve `bbb-sync.path` (dosya yazıldığında tetiklenen) servisleri ile Drive ile sürekli iki yönlü haberleşir.
- Kişisel defter dosyaları (`personal_tx.json`, `cashflows.json` vb.) için satır düzeyinde **3 yönlü birleştirme (3-way merge)** uygular (`~/BBB/.sync-base/`).
- Çakışma durumunda kural **"Dashboard-wins"** (web uygulaması önceliklidir); çakışma olursa Telegram üzerinden bildirim düşer.

### c. Git Deposu (`BBB/data/`)
- Repo içindeki `data/` klasörü, uygulamanın ilk göç tarihindeki (10–11 Eyl 2026) durumunu ve yerel testleri besler.
- `LocalFileSource` ile Vite dev sunucusunda (`npm run dev`) çalışırken kullanılır.
- **Canlı veri değildir!** Web uygulamasında veya Telegram'da yapılan düzeltmeler (ör. portföy etiketi düzeltmesi) repo kopyasına kendiliğinden akmaz. Bu nedenle arayüzde yerel kaynak seçiliyken **`⚠ yerel kopya — canlı veri olmayabilir`** rozeti kalıcı olarak gösterilir.

---

## 2. Hangi Yön Güvenli? (Veri Akış Güvenliği)

```
       [ PWA Web Uygulaması ]
                 ↕ (Doğrudan GIS OAuth API)
       ┌─────────────────────┐
       │    Google Drive     │  ◄─── TEK GERÇEK KAYNAĞI
       └─────────────────────┘
                 ↕ (rclone + 3-way merge)
       [  Oracle VM / Bot   ]
                 │
                 │ (Sadece kontrollü export/pull)
                 ▼
       ┌─────────────────────┐
       │   Git Deposu data/  │  ◄─── SADECE TEST & GELİŞTİRME
       └─────────────────────┘
```

- **Drive ⇄ Oracle VM (Bot): GÜVENLİ.**
  - `bbb-sync` servisi ve `src/data/merge.py` algoritması çakışmaları çözer, yazma öncesi `backups/` altına otomatik zaman damgalı yedek alır.
- **Drive → Git Deposu (Local Pull): GÜVENLİ.**
  - Canlı Drive verisinin testleri beslemek veya yerel analizi güncellemek amacıyla yerele çekilmesidir.
- **Git Deposu → Drive (Push): ⛔ KESİNLİKLE YASAK / TEHLİKELİ.**
  - Repodaki bayat `data/*.json` dosyalarının doğrudan Google Drive'a kopyalanması, Drive'da o ana kadar kaydedilmiş canlı verileri, yeni işlemleri ve bot girdilerini ezerek **kalıcı veri kaybına** yol açar. Drive'a yalnızca PWA'nın kendi ekranları veya VM'deki test edilmiş senkronizasyon köprüsü yazmalıdır.

---

## 3. `bbb-pull.sh` ve `bbb-push.sh` Ne Yapar?

Oracle VM üzerinde acil durumlar veya bakım için tanımlanmış el kumandası betikleridir (`~/` dizininde yer alırlar):

1. **`~/bbb-pull.sh`**:
   - `rclone` kullanarak Google Drive'daki en son dosyaları VM'deki `~/BBB/.sync-stage/` alanına çeker.
   - Kişisel ve genel defter dosyalarını 3-way merge süzgecinden geçirerek yerel `~/BBB/data/` dizinini Drive ile eşitler.
2. **`~/bbb-push.sh`**:
   - VM'de biriken değişiklikleri ve son merge sonucunu Google Drive'a basar (`rclone copy`).
3. **Telegram `/senkronize` komutu**:
   - Bu iki adımı Telegram arayüzünden önizlemeli ve güvenli olarak tetikler.

> **Önemli Kural:** `rclone` çalışırken `--update` bayrağı ASLA kullanılmaz. İki taraflı yazıcı olduğunda `--update` uzak tarafın değişikliklerini maskeleyerek sessiz veri kaybı yaratır.

---

## 4. Repo Kopyası (`BBB/data/`) Ne Zaman Güncellenmeli?

Repodaki `data/*.json` dosyaları aşağıdaki özel durumlar haricinde **güncellenmemelidir**:

1. **Test Fixture'larını Canlı Veriyle Yenileme İhtiyacı:**
   - Yeni bir geliştirme dalında (örneğin Dalga 3 görevleri) gerçek hayat verisindeki yeni bir uç durum (edge-case) test edilecekse, Drive'dan indirilen güncel kopya repoya kontrollü olarak commit'lenir.
2. **Kalıcı Şema Değişikliği / Göç (Migration):**
   - Yeni bir alan eklendiğinde (ör. `SaleEvent` modeline yeni bir bayrak gelmesi veya kişisel defter şeması genişlemesi) ve geriye dönük göç betiği çalıştırıldığında.
3. **Commit Öncesi Hijyen Kontrolü:**
   - Repo kopyası güncellenirken şahsi/özel bilgilerin veya hassas token'ların depoya girmemesine dikkat edilir (`personal_*.json` dosyaları ve yetki anahtarları).

---

## 5. Özet İlke

- **Günlük Kullanıcı:** Verisini Google Drive üzerinden PWA veya Telegram Botu üzerinden görür ve yönetir.
- **Geliştirici:** `npm run dev` sırasında gördüğü `⚠ yerel kopya — canlı veri olmayabilir` uyarısının bilincindedir; yereldeki testlerini bu kopyayla yapar, canlı veriyi teyit etmek istediğinde PWA kaynak seçicisini `Drive` moduna alır.
