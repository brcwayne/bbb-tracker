# bbb-prices — fiyat / FX proxy

Durumsuz Cloudflare Worker. BIST/ABD hisseleri ve altın için Yahoo Finance,
USD/TRY için TCMB, TEFAS yatırım fonları için fonoloji.com. CORS yalnızca
PWA origin'ine açık; tek anahtar `FONOLOJI_API_KEY` (Worker secret).

## Uçlar
- `GET /health` → `{ok:true}`
- `GET /fx/latest` → `{date, usdtry}` (TCMB "Döviz Alış", iş-günü geri-yürüyüş)
- `GET /prices?symbols=THYAO.IS,GC=F,SPCX,tefas:MAC` → `{asOf, usdtry, prices:{SYM:{price,currency,priceUsd[,usdPerGram]}}}`
  - en fazla 45 sembol (tekilleştirilmiş); `?fresh=1` kenar önbelleğini atlar
  - `altin-turev` enstrümanları uygulamada `GC=F`'ye eşlenir; Worker `usdPerGram` döndürür
  - `tefas:<kod>` önekli semboller fonoloji.com'a gider; yanıt anahtarı öneki korur
    (`prices["tefas:MAC"]`), `currency:"TRY"`, `priceUsd = price / usdtry`
  - `FONOLOJI_API_KEY` tanımsızsa `tefas:*` sembolleri `{error:"fon anahtarı yok"}`
    döner; diğer semboller ve uç normal 200 yanıtını verir

Cloudflare **Free** planında bir Worker isteği ~50 alt-istek (subrequest) ile sınırlıdır.
Olağan kullanım (~30 sembol, her biri 1 istek + 1 TCMB) bu sınırın epey altında kalır.
Ancak `query1` genelinde bir kesinti her sembol için `query2`'ye düşmeye zorlarsa alt-istek
sayısı sınıra yaklaşabilir; ücretli plan bu limiti 1000'e çıkarır.

## Test
```bash
cd worker && npm install && npm test
```

## Gerçek uçları elle doğrula
```bash
npx wrangler dev        # ayrı terminal, http://localhost:8787
npm run smoke           # ya da: node smoke.mjs https://bbb-prices.<sub>.workers.dev
```

## TEFAS fon fiyatları (fonoloji.com)

TEFAS'ın kendi uçları 2026'da kapatıldı; fon fiyatları artık fonoloji.com
üzerinden geliyor. Ücretsiz kota: 15.000 kayıt/ay (kredi kartı yok).

1. https://fonoloji.com → ücretsiz hesap → API anahtarını kopyala
2. Anahtarı Worker secret olarak ekle:
   ```bash
   cd worker && wrangler secret put FONOLOJI_API_KEY   # anahtarı yapıştır
   wrangler deploy
   ```
3. Yerelde denemek için `worker/.dev.vars` (gitignore'lu):
   `FONOLOJI_API_KEY = "fon_..."`

Anahtar eklenmeden de her şey çalışır; sadece fonlar `—` kalır.

## Deploy (Enis)
```bash
npm i -g wrangler
wrangler login                 # tarayıcıda onayla
cd worker && npm install && wrangler deploy
cd worker && wrangler secret put FONOLOJI_API_KEY   # bkz. yukarısı (opsiyonel)
```
Çıkan `https://bbb-prices.<subdomain>.workers.dev` adresini kopyala:
GitHub repo → Settings → Secrets and variables → Actions → **Variables** →
`VITE_PRICE_API` = o adres. Sonra Actions → son "Deploy dashboard to Pages" → **Re-run all jobs**.

Repo adın `bbb-tracker` değilse `wrangler.toml` içindeki `ALLOWED_ORIGIN`'i güncelle
(`https://<kullanıcı>.github.io`).
