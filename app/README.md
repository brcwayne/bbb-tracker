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
   - **OAuth consent screen** → **External** → uygulama adı + destek e-postası →
     Scopes'a `https://www.googleapis.com/auth/drive.file` ekle → **Publish app**
     (production'a al). `drive.file` doğrulama gerektirmez; ilk girişte çıkan
     "unverified app" ekranını **Advanced → continue** ile geç.
   - **Credentials** → **Create OAuth client ID** → **Web application** →
     Authorized JavaScript origins: `https://<kullanıcı>.github.io` → **Client ID**'yi
     kopyala.
   - **Credentials** → **Create credentials** → **API key** → oluşan anahtarı
     **Picker API**'ye kısıtla → kopyala. Bu senin `VITE_GOOGLE_API_KEY`'in.
   - **App ID**, Google Cloud **proje numarandır** (proje ayarları / kadran
     sayfasında görünür) → `VITE_GOOGLE_APP_ID`.
   - **Enabled APIs & services** → **Google Picker API**'yi de etkinleştir.

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
