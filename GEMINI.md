# Big Black Book (BBB) - Proje Kuralları ve Çalışma İlkeleri

## 🔄 Otomatik Bulut Senkronizasyon Kuralı (Mandatory Step 0)
Bu projede kullanıcı işlemleri ağırlıklı olarak canlı **Telegram Botu (Oracle VM)** üzerinden girmekte, veriler **Google Drive** ve **Oracle VM** üzerinde canlı olarak güncellenmektedir.

Yerel ortamda (`/Users/enisuslu/Desktop/Market/BBB`) portföy analizi, mutabakat, hesaplama veya işlem ekleme yapılacağı zaman:
1. **Her zaman önce bulut durumunu kontrol et**:
   ```bash
   ./scripts/sync-cloud.sh status
   ```
2. **Eğer buluttaki işlem sayısı yerelden fazlaysa** veya kullanıcı son zamanlarda bot üzerinden işlem girdiğini belirtmişse, analiz yapmadan önce mutlaka en güncel veriyi çek:
   ```bash
   ./scripts/sync-cloud.sh pull
   ```
3. **Eğer yerelde yeni işlemler veya düzeltmeler yapılmışsa**, kullanıcının onayı ile bunu buluta ve Google Drive'a ilet:
   ```bash
   ./scripts/sync-cloud.sh push
   ```

## 📂 Veri ve Dosya Yapısı
- Yerel `data/` klasörü git tarafından yoksayılır (`.gitignore`).
- Canlı gerçek veriler Oracle Cloud VM (`ubuntu@130.210.62.219`) üzerinde `/home/ubuntu/bbb-telegram-bot/data` ve `/home/ubuntu/BBB/data` dizinlerinde tutulur.
- Google Drive senkronizasyonu VM üzerindeki `bbb-sync` ve `/home/ubuntu/bbb-push.sh` tarafından yönetilir.
- Test dosyaları için `data/transactions_canonical.json` (189 satırlık kanonik veri) ve test kopyaları korunmalıdır.
