# Big Black Book (BBB) - Proje Kuralları ve Çalışma İlkeleri

## 🔄 Otomatik Bulut Senkronizasyon Kuralı (Mandatory Step 0)
Bu projede kullanıcı işlemleri canlı **Telegram Botu (Synology DS220+ NAS / Docker)** üzerinden girmekte, veriler **Synology NAS** üzerinde canlı olarak saklanmaktadır.

Yerel ortamda (`/Users/enisuslu/Desktop/Market/BBB`) portföy analizi, mutabakat, hesaplama veya işlem ekleme yapılacağı zaman:
1. **Her zaman önce sunucu durumunu kontrol et**:
   ```bash
   ./scripts/sync-cloud.sh status
   ```
2. **Eğer sunucudaki işlem sayısı yerelden fazlaysa** veya kullanıcı son zamanlarda bot üzerinden işlem girdiğini belirtmişse, analiz yapmadan önce mutlaka en güncel veriyi çek:
   ```bash
   ./scripts/sync-cloud.sh pull
   ```
3. **Eğer yerelde yeni işlemler veya düzeltmeler yapılmışsa**, kullanıcının onayı ile bunu sunucuya ilet:
   ```bash
   ./scripts/sync-cloud.sh push
   ```

## 📂 Veri ve Dosya Yapısı
- Yerel `data/` klasörü git tarafından yoksayılır (`.gitignore`).
- Canlı gerçek veriler Synology DS220+ NAS (`admin@100.113.9.116`) üzerinde `/volume1/docker/bbb-telegram-bot/data` dizininde tutulur.
- Bot, NAS üzerindeki Docker / Container Manager içerisinde `bbb-telegram-bot` konteyneri olarak 7/24 kesintisiz çalışır.
- Test dosyaları için `data/transactions_canonical.json` (189 satırlık kanonik veri) ve test kopyaları korunmalıdır.
