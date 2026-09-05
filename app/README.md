# BBB Tracker — dashboard

Salt-okunur Svelte 5 PWA. Portföy panoraması, açık/kapalı pozisyonlar ve aylık
rapor. Veri repoya girmez; yerelde `data/` klasöründen ya da Google Drive'daki
`BBB/` klasöründen okunur.

## Geliştirme

```bash
cd app
npm install
npm run dev
```

Uygulama varsayılan olarak `local` kaynağı seçer ve `./data/*.json` dosyalarını
`fetch` eder. Vite'ın kökü `app/` olduğu için `vite.config.ts` içindeki
**dev-only** `serve-repo-data` eklentisi `/data/*` isteklerini repo kökündeki
`../data` klasörüne yönlendirir — yerelde `data/` böyle çalışır (bu eklenti
olmasa istek SPA `index.html`'ine düşer ve `res.json()` patlar). Eklenti yalnızca
`apply: 'serve'` olduğundan `npm run build` çıktısına hiçbir veri girmez.

Depoda `data/` **gitignore**'dur — önce migration ile üret:

```bash
cd migration
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # ilk sefer
.venv/bin/python -m bbb_migration --xlsm "<BigBlackBook .xlsm yolu>" --out ../data
```

Bu, 8 JSON'u repo kökündeki `data/` klasörüne yazar
(`transactions.json cashflows.json snapshots.json instruments.json brokers.json
portfolios.json meta.json fxrates.json`).

Drive kaynağını yerelde denemek için `app/.env` oluştur:

```
VITE_GOOGLE_CLIENT_ID=<Web application OAuth client id>
VITE_GOOGLE_API_KEY=<Picker API'ye kısıtlı API key>
VITE_GOOGLE_APP_ID=<Google Cloud proje numarası>
```

## Test

```bash
cd app
npm test
```

## Yayın

`main` dalına push → `.github/workflows/pages.yml` çalışır: `app/` içinde
`npm ci && npm test && npm run check && npm run build`, sonra `app/dist` GitHub
Pages'e deploy edilir. Build ayrıca `dist/` içinde manifest dışında hiçbir
`.json` olmadığını doğrular (veri paketlenmesin diye kalıcı koruma). Yalnızca
`app/**` veya workflow dosyası değişince tetiklenir. Build
`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` ve `VITE_GOOGLE_APP_ID` repo
değişkenlerini env'e geçirir.

GitHub Actions üzerinde `base` `/bbb-tracker/` olur (repo alt-yolu). Repo adını
`bbb-tracker` dışında seçersen `app/vite.config.ts` içindeki `base` değerini ve
aşağıdaki 6. adımdaki URL'yi güncelle.

## Enis'in bir kerelik kurulumu

1. **GitHub deposu.** `gh` kuruluysa:

   ```bash
   brew install gh          # kurulu değilse
   gh auth login
   gh repo create bbb-tracker --public --source=. --remote=origin --push
   ```

   Ya da github.com'da `bbb-tracker` deposunu elle aç, sonra:

   ```bash
   git remote add origin https://github.com/<kullanıcı>/bbb-tracker.git
   git push -u origin main
   ```

2. **Pages'i aç.** Repo → Settings → Pages → Source: **GitHub Actions**.

3. **Google Cloud OAuth.** [console.cloud.google.com](https://console.cloud.google.com)
   → yeni proje → **APIs & Services**:
   - **OAuth consent screen / Branding** → **External** → uygulama adı + destek
     e-postası + developer e-postası. **Audience** sekmesinde **Publishing status =
     Testing** bırak ve **Test users**'a kendi Google hesabını ekle. (Production +
     `drive.readonly` = Google doğrulaması + homepage/privacy URL ister; tek
     kullanıcı için gereksiz. Testing'de her girişte "unverified app" ekranı çıkar
     → **Advanced → continue**.)
   - Kapsam (**Data access → Add scopes**): `https://www.googleapis.com/auth/drive.readonly`.
     `drive.file` yetmez — 8 JSON'u Drive'a başka bir araç/elle koyduğun için
     uygulama onları ancak `drive.readonly` ile listeleyip okuyabilir. P1 hiç
     yazmaz, salt-okunur en dar yetki budur.
   - **Credentials** → **Create OAuth client ID** → **Web application** →
     Authorized JavaScript origins: `https://<kullanıcı>.github.io` → **Client ID**'yi
     kopyala.
   - **Credentials** → **Create credentials** → **API key** → oluşan anahtarı
     **Picker API**'ye kısıtla → kopyala. Bu senin `VITE_GOOGLE_API_KEY`'in.
   - **App ID**, Google Cloud **proje numarandır** (proje ayarları / kadran
     sayfasında görünür) → `VITE_GOOGLE_APP_ID`.
   - **Enabled APIs & services** → **Google Picker API** ve **Google Drive API**'yi
     etkinleştir.

4. **Repo değişkenleri.** Repo → Settings → Secrets and variables → **Actions** →
   **Variables** sekmesi → **New repository variable** ile üçünü ekle:
   `VITE_GOOGLE_CLIENT_ID` = kopyalanan Client ID,
   `VITE_GOOGLE_API_KEY` = kopyalanan API key,
   `VITE_GOOGLE_APP_ID` = Google Cloud proje numarası.

5. **Drive klasörü.** Google Drive'da adı tam olarak `BBB` olan bir klasör aç,
   migration çıktısındaki (`data/`) 8 JSON'u içine yükle:
   `transactions.json cashflows.json snapshots.json instruments.json brokers.json
   portfolios.json meta.json fxrates.json`.

6. **Doğrula.** `https://<kullanıcı>.github.io/bbb-tracker/` adresini aç. Sayfa
   `local` kaynağıyla açılır ve veri bulamaz (repoda `data/` yok) — başlık
   çubuğundaki kaynak seçiciden **Drive**'ı seç → **"Google ile bağlan"** → `BBB`
   klasörünü seç → dashboard dolar. iPhone'da: aynı URL → Paylaş →
   **Ana Ekrana Ekle**.

> Repo adı `bbb-tracker` değilse: `app/vite.config.ts` içindeki `base` ve yukarıdaki
> 6. adımın URL'si buna göre değişmeli.

## P3 — canlı fiyat (fiyat proxy'si)

Açık pozisyonlarda **Güncel Fiyat** / **Gerçekleşmemiş K/Z** ve TL modunda canlı kur için
küçük bir Cloudflare Worker gerekir (`worker/` klasörü). Kimlik/anahtar yok.

1. Ücretsiz **Cloudflare** hesabı aç.
2. `npm i -g wrangler` → `wrangler login`.
3. `cd worker && npm install && wrangler deploy` → çıkan
   `https://bbb-prices.<subdomain>.workers.dev` adresini kopyala.
4. `worker/wrangler.toml` içindeki `ALLOWED_ORIGIN`, repo adın `bbb-tracker` değilse
   `https://<kullanıcı>.github.io` olacak şekilde güncelle, tekrar `wrangler deploy`.
5. GitHub repo → Settings → Secrets and variables → **Actions → Variables** →
   `VITE_PRICE_API` = Worker URL'i.
6. Actions → son "Deploy dashboard to Pages" çalışması → **Re-run all jobs**.
7. Sitede başlıkta **"Fiyatları yenile"** düğmesi çıkar; bas → fiyatlar dolar.

Worker'ı elle doğrulamak: `cd worker && npx wrangler dev` (ayrı terminal) + `npm run smoke`.
Worker kodu değişince `wrangler deploy`'u tekrar çalıştır (CI yalnızca testini koşar, deploy etmez).

## P1.6 — yeni sayfalar

Panorama'nın üst bloğu Excel Dashboard'unun 7 alanını birebir gösterir (Toplam Sermaye = Σ
para yatırma, Dönem Sonu = Sermaye + İçeride Kalan Kâr − Çekimler, …). Gerçekleşmemiş K/Z ve
Özkaynak Değeri "Fiyatları yenile" sonrası dolar.

Yeni sekmeler (hepsi salt-okunur, mevcut veriden türetilir): **Portföyler** (portföy başına
dağılım + holdings), **Kurumlar** (kurum başına holdings; kurum ekleme P2), **Banka** (para
yatırma/çekme + para piyasası hareketleri), **Temettü** (enstrüman bazında temettü + yeniden
yatırım ipuçları).

Excel sayılarıyla mutabakat kontrolü (CI'da değil): `cd app && npx vitest run scripts/reconcile-dashboard.test.ts`.

## P2 — manuel kayıt girişi

"Ekle" sekmesinden dört tür kayıt eklenebilir: **İşlem** (Al/Sat), **Nakit Hareketi**
(yatırma/çekme/temettü/kurumlar arası transfer), **Varlık Transferi** (bir pozisyonun
hangi kurum/portföy altında göründüğünü değiştirir, maliyet/kâr-zarar hesabını etkilemez),
**Kurum Ekle**. Her kayıt önce bir özet ekranında gösterilir, "Onayla ve Kaydet" ile
Google Drive'a yazılır. Düzenleme/silme henüz desteklenmiyor — sıradaki fazda ele alınacak.

Varlık Transferi, formdaki lot sayısına bakmaksızın enstrümandaki **mevcut tüm pozisyonu**
hedef kurum/portföye taşır — lot alanı yalnızca bilgi/denetim amaçlıdır, kısmi transfer
desteklenmez.

Kurum bazlı nakit bakiyesi (Kurumlar sayfasındaki "Nakit" satırı), Excel'den gelen son
bilinen bakiyeleri başlangıç noktası kabul edip bu andan sonraki her manuel hareketle
güncellenir — geçmiş, hesap bazında ayrıştırılamayan veri olduğu için hesaba katılmaz.

## P3.5 — düzenleme/silme + geçmişe dönük tarih

Manuel olarak eklenmiş kayıtlar (Excel'den gelen migration verisi hariç) artık "Kayıtlar" sekmesinden düzenlenebilir veya silinebilir: İşlemlerim / Nakit Hareketlerim / Transferlerim / Kurumlarım listelerinden bir kayıt seçilip Düzenle veya Sil'e basılabilir. Silme kalıcıdır ve geri alınamaz — iki adımlı bir onay ister. Düzenleme, ilgili formu kaydın mevcut değerleriyle önceden doldurur; kaydın kimliği (işlem/nakit/transfer id'si, kurum kodu) değiştirilemez.

Tüm 4 giriş formu artık bir tarih alanı içeriyor (varsayılan: bugün) — geçmişe dönük kayıt girmek mümkün, ancak gelecek bir tarih girilemez.

Excel'den gelen (migration) kayıtlar bu ekrandan hiçbir zaman düzenlenemez veya silinemez — onlar için hâlâ doğrudan Drive dosyası düzenlemesi gerekir.
