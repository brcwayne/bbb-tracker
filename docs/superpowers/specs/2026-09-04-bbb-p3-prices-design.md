# BBB Tracker — P3: Canlı Fiyat + FX + Gerçekleşmemiş K/Z

**Tarih:** 2026-09-04
**Durum:** Taslak — Enis uzakta, kararları controller aldı; async inceleme için
**Sahibi:** Enis
**Üst tasarım:** `docs/superpowers/specs/2026-09-02-bbb-tracker-design.md` (§7 Worker, §11 K/Z kuralları, §14 faz tablosu)
**Önceki faz:** P1 (`2026-09-03-bbb-p1-dashboard-design.md`) — salt-okunur dashboard, `main` @ `cbe7276`

---

## 1. Amaç

P1 dashboard'u açık pozisyonlarda **Güncel Fiyat** ve **Gerçekleşmemiş K/Z** sütunlarını
`—` gösteriyor; TL modundaki kur `fxrates.json`'daki *son bilinen* TCMB kuru. P3:

1. Küçük bir **Cloudflare Worker** proxy'si: BIST / ABD hisseleri ve altın için güncel fiyat,
   TCMB'den güncel USD/TRY.
2. Uygulamada **"Fiyatları yenile"** düğmesi (talep üzerine; otomatik akış yok — üst tasarım §2).
3. Açık pozisyonlarda güncel fiyat + gerçekleşmemiş K/Z; Panorama'da toplam gerçekleşmemiş K/Z.
4. TL modundaki kur, yenileme yapıldıysa **canlı** TCMB kuru olur.

## 2. Hedef olmayanlar (P3'te YOK)

- **TEFAS fon fiyatları** — üst tasarım §16.4 gereği P4'e ertelendi. Fonlar (`fiyatKaynagi: "tefas"`:
  MAC, PTS, THF, FSK, OYL, TP2, PHE) fiyat sütununda `—` kalır.
- **"Hedefe / dirence yakın" kartı** — `instruments.json`'da `seviyeler` alanları henüz boş (Enis
  girmedi); veri girişi P2/P4 işi. Fiyat altyapısı hazır olunca kart kolay eklenir.
- Tarihsel `GET /fx?date=` ucu — P3 yalnızca `/fx/latest` kullanır.
- Worker için CI/otomatik deploy — Enis `wrangler deploy`'u elle çalıştırır (nadir değişir).
- Piyasa-değeri bazlı dağılım grafikleri — dağılım maliyet bazlı kalır.
- Günlük fiyat botu / intraday akış (üst tasarım §2 hedef-olmayan).

## 3. Mimari

```
┌──────────────────────────┐        ┌────────────────────────────────┐
│  PWA (GitHub Pages)       │        │  Cloudflare Worker "bbb-prices"│
│  brcwayne.github.io       │ HTTPS  │  *.workers.dev                 │
│  - "Fiyatları yenile"     │──────▶ │  GET /prices?symbols=...       │
│  - prices.svelte.ts       │        │  GET /fx/latest                │
│    (bellek + sessionStorage)│      │  - Yahoo Finance chart API     │
│  - unrealized.ts (saf K/Z) │       │  - TCMB today.xml (+ walk-back)│
└──────────────────────────┘        │  - durumsuz; Cache API 5 dk     │
                                    │  - CORS: yalnız Pages origin    │
                                    └────────────────────────────────┘
```

- **Backend kullanıcı verisi görmez.** Worker'a yalnızca sembol listesi gider (ör. `THYAO.IS`);
  adet, maliyet, portföy, kimlik gitmez. Finansal veri hâlâ repoda/bundle'da değil.
- Worker durumsuz; Cloudflare **Cache API** ile istek-URL'i başına 5 dk önbellek (tekrar tıklamalar
  bedava/anında). Anahtar gerektiren API yok.
- `VITE_PRICE_API` = Worker'ın public URL'i, GitHub repo **variable**'ı (Google anahtarları gibi),
  commit edilmez. Tanımsızsa "yenile" düğmesi gizli/pasif.

## 4. Fiyat kaynağı: Yahoo Finance (tek kaynak)

Tek uç her üç türü de karşılıyor (2026-09-04 doğrulandı):

`GET https://query1.finance.yahoo.com/v8/finance/chart/<SYM>?interval=1d&range=1d`
→ `result[0].meta` içinde `regularMarketPrice`, `currency`, `regularMarketTime`.

| Enstrüman türü | `instruments.json` | Yahoo sembolü | Dönen |
|---|---|---|---|
| BIST hissesi | `fiyatKaynagi: "yahoo"`, `fiyatSembolu: "THYAO.IS"` | `THYAO.IS` | fiyat **TRY** |
| ABD hissesi | `fiyatKaynagi: "yahoo"`, `fiyatSembolu: "SPCX"` | `SPCX` | fiyat **USD** |
| Altın (XAU/ATA/YARIM) | `fiyatKaynagi: "altin-turev"`, `fiyatSembolu: "XAUUSD"` | **`GC=F`** (COMEX ons) | USD/ons |

- **Altın:** Worker `fiyatKaynagi: "altin-turev"` gören her sembolü `GC=F`'ye eşler, tek çağrı yapar,
  `usdPerGram = gcPrice / 31.1034768` döndürür. Birim fiyata çevirme (`× altinKatsayi`) uygulamada
  yapılır (katsayı `instruments.json`'da: XAU 1.0, ATA LIRA 6.612, YARIM 3.208 — **saf gram**).
  Sikke primi (`altinPrim`) P3'te **0** kabul; ileride override ile ayarlanır.
- **`query1` 429/5xx** → Worker `query2.finance.yahoo.com`'a bir kez düşer, yine olmazsa o sembol
  için `{ error: "kaynak" }` döner (uygulama `—` gösterir). Bir sembolün hatası diğerlerini bozmaz.
- Worker `User-Agent: Mozilla/5.0 (BBB-Tracker)` gönderir.

## 5. FX: TCMB

`GET https://www.tcmb.gov.tr/kurlar/today.xml` → `<Currency Kod="USD"><ForexBuying>` = "Döviz Alış"
(migration `tcmb.py` ile aynı alan). Tatil/haftasonu 404 → **iş günü geri-yürüyüş**: `kurlar/YYYYMM/DDMMYYYY.xml`
en fazla 7 gün geriye (migration `tcmb.py` mantığının JS portu).

- `/prices` cevabı üst düzey `usdtry` alanı taşır (BIST TRY fiyatlarını USD'ye çevirmek için).
- `/fx/latest` bağımsız uç: `{ date, usdtry }` — uygulama fiyat çekmeden de canlı kuru alabilir.

## 5.1 Worker uçları ve cevap şekli

**`GET /prices?symbols=THYAO.IS,SPCX,GC=F`** (virgülle ayrık; en fazla 60 sembol):
```json
{
  "asOf": "2026-09-04T09:20:00Z",
  "usdtry": 48.2238,
  "prices": {
    "THYAO.IS": { "price": 294.0, "currency": "TRY", "priceUsd": 6.0965 },
    "SPCX":     { "price": 149.74, "currency": "USD", "priceUsd": 149.74 },
    "GC=F":     { "price": 4516.9, "currency": "USD", "priceUsd": 4516.9, "usdPerGram": 145.22 }
  }
}
```
`priceUsd = currency === "TRY" ? price / usdtry : price`. Hatalı sembol: `{ "error": "kaynak" }`.

**`GET /fx/latest`** → `{ "date": "2026-09-03", "usdtry": 48.2238 }`

- **CORS:** `Access-Control-Allow-Origin: https://brcwayne.github.io` (+ `OPTIONS` yanıtı).
  `ALLOWED_ORIGIN` bir `wrangler.toml` `[vars]` değeri; localhost geliştirme için ikinci değer.
- **Hata:** üst düzey hata → `{ "error": "<mesaj>" }` + uygun HTTP kodu. Kısmi başarı 200.
- **Önbellek:** `caches.default`, `Cache-Control: s-maxage=300`. `?fresh=1` önbelleği atlar.

## 6. Uygulama entegrasyonu

### 6.1 `src/lib/prices.svelte.ts` (yeni)
```
export const prices = $state({
  bySymbol: {} as Record<string, { price: number; currency: string; priceUsd: number }>,
  usdPerGram: null as number | null,
  usdtry: null as number | null,
  asOf: null as string | null,
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: undefined as string | undefined,
})
export const PRICE_API: string | undefined = import.meta.env.VITE_PRICE_API
export function priceApiEnabled(): boolean
export async function refreshPrices(ds: Dataset): Promise<void>   // sembolleri topla → /prices → state + sessionStorage['bbb-prices']
export function hydratePrices(): void                              // sessionStorage'dan; asOf > 30 dk ise atla
```
- Semboller: açık pozisyonların `instruments.json` kayıtlarından `fiyatSembolu`; `altin-turev` → `GC=F` (tek sefer).
- `refreshPrices` başarısında `settings.rate` da `usdtry` ile güncellenir (TL modu canlı kur kullanır).

### 6.2 `src/lib/data/unrealized.ts` (yeni, saf)
```
export interface Unrealized { kod: string; guncelFiyatUsd: number | null; kzUsd: number | null; kzPct: number | null }
export function unrealizedByKod(open: OpenPosition[], instruments: Instrument[], p: typeof prices): Map<string, Unrealized>
export function unrealizedTotalUsd(...): number | null   // Σ kzUsd (fiyatı olan pozisyonlar)
```
- BIST: `guncelFiyatUsd = priceUsd`. Altın: `guncelFiyatUsd = usdPerGram * altinKatsayi`.
- `kzUsd = (guncelFiyatUsd - ortMaliyetUsd) * lot`; `kzPct = kzUsd / toplamMaliyetUsd`.
- Fiyat yoksa hepsi `null` (üst tasarım §11: fiyatı olmayan pozisyon toplamı bozmaz).

### 6.3 Pozisyonlar sayfası
- **Güncel Fiyat** sütunu: `money(guncelFiyatUsd)` ya da `—`.
- **Gerçekleşmemiş K/Z** sütunu: `money(kzUsd, {sign:true})` + küçük `kzPct` — ya da `—`.
- `derived.movers` vb. değişmez. Sütun `fmt`'leri `prices` state'ini okuduğu için yenilemede reaktif güncellenir.

### 6.4 Panorama
- KPI şeridine **"Gerçekleşmemiş K/Z"** öğesi (fiyat yoksa `—`). "İşlem" öğesi kalır; şerit 5→6 öğe.
- Fiyat varsa "Toplam Özkaynak" KPI'sının altında küçük "canlı: <money(realized+unrealized+nakit...)>" satırı — **YAGNI: P3'te eklenmez**, yalnız gerçekleşmemiş K/Z öğesi.

### 6.5 Başlık (App.svelte)
- Kontroller grubuna **"Fiyatları yenile"** düğmesi + yanında `prices.asOf` varsa `HH:MM`.
- `priceApiEnabled()` false → düğme gizli.
- `status==='loading'` → düğme "Yenileniyor…", pasif. `error` → düğme yanında küçük kırmızı uyarı.
- Açılışta `hydratePrices()` (otomatik ağ çağrısı yok — üst tasarım §2).

## 7. Dosya yapısı

**Yeni: `worker/`** (repo kökünde, ayrı paket)
- `worker/package.json` — `wrangler`, `vitest`, `typescript` devDeps; `deploy`, `test` script'leri.
- `worker/wrangler.toml` — `name = "bbb-prices"`, `main = "src/index.ts"`, `compatibility_date`,
  `[vars] ALLOWED_ORIGIN`.
- `worker/src/index.ts` — `fetch` handler: yönlendirme (`/prices`, `/fx/latest`, `OPTIONS`), CORS,
  Cache API.
- `worker/src/yahoo.ts` — `fetchQuotes(symbols): Promise<Record<sym, {price,currency}|{error}>>`;
  `query1`→`query2` fallback; cevap ayrıştırma.
- `worker/src/tcmb.ts` — `fetchUsdTry(): Promise<{date, usdtry}>`; today.xml + iş-günü geri-yürüyüş;
  XML'den `ForexBuying` çekme (regex, migration ile aynı alan).
- `worker/src/symbols.ts` — enstrüman sembolü → Yahoo sembolü eşlemesi (`altin-turev` → `GC=F`);
  gram sabiti `31.1034768`.
- `worker/test/*.test.ts` — yahoo/tcmb/symbols saf fonksiyon testleri (fetch mock'lu); XML/JSON
  fixture'ları. Gerçek dış çağrı CI'da yok; `worker/smoke.mjs` elle.
- `worker/README.md` — `wrangler login && wrangler deploy`, URL'i repo variable'a ekleme, `smoke`.

**Yeni: `app/src/lib/prices.svelte.ts`, `app/src/lib/data/unrealized.ts`** (+ testleri)

**Değişen:**
- `app/src/App.svelte` — "Fiyatları yenile" düğmesi + stamp; `hydratePrices()` on mount.
- `app/src/routes/Pozisyonlar.svelte` — iki sütun `prices`/`unrealized`'dan.
- `app/src/routes/Panorama.svelte` — KPI'ya gerçekleşmemiş K/Z.
- `app/src/lib/settings.svelte.ts` — `refreshPrices` sonrası `settings.rate`'i canlı `usdtry` yap;
  `money()` değişmez.
- `app/src/vite-env.d.ts` — `VITE_PRICE_API?: string`.
- `app/vite.config.ts` — geliştirmede `/price-api/*` → Worker `wrangler dev` (opsiyonel proxy) YA DA
  sadece `.env`'den tam URL. **Karar:** `.env`'den tam URL (proxy yok, basit).
- `.github/workflows/pages.yml` — build `env:`'ine `VITE_PRICE_API: ${{ vars.VITE_PRICE_API }}`.
- `app/README.md` — P3 kurulum adımları (aşağıdaki §9).

## 8. Test stratejisi

- **Worker (saf):** yahoo cevabı ayrıştırma (TRY vs USD), `query1→query2` fallback, hatalı sembol
  izolasyonu; TCMB XML ayrıştırma + 404 geri-yürüyüş; sembol eşlemesi + gram bölme. `fetch` mock.
- **`unrealized.ts`:** fixture fiyatlarla BIST + altın K/Z ve %; fiyat eksik → `null`, toplam bozulmaz.
- **`prices.svelte.ts`:** mock `fetch` → `idle→loading→ready`; `sessionStorage` yazma; `hydratePrices`
  taze/bayat (30 dk) ayrımı; `VITE_PRICE_API` yoksa `priceApiEnabled()` false.
- **Sayfalar:** fixture'a `prices` enjekte → Pozisyonlar iki sütun dolu; Panorama KPI; `VITE_PRICE_API`
  yokken düğme yok.
- **Var olan 76 test yeşil kalır.** CI'ya `worker` test adımı eklenir (`cd worker && npm ci && npm test`).
- Gerçek Yahoo/TCMB çağrısı CI'da yok (flaky/dış). `worker/smoke.mjs` elle doğrulama.

## 9. Enis'in P3 kurulumu (döndüğünde, ~10 dk)

1. Ücretsiz **Cloudflare** hesabı (e-posta yeter).
2. `npm i -g wrangler` → `wrangler login` (tarayıcıda onay).
3. `cd worker && npm install && wrangler deploy` → çıkan `https://bbb-prices.<subdomain>.workers.dev`.
4. `wrangler.toml` içindeki `ALLOWED_ORIGIN` zaten `https://brcwayne.github.io` — repo adı farklıysa güncelle.
5. GitHub repo → Settings → Secrets and variables → Actions → **Variables** → `VITE_PRICE_API` =
   Worker URL'i.
6. Actions → en son "Deploy dashboard to Pages" → **Re-run all jobs**.
7. Sitede başlıkta **"Fiyatları yenile"** → Pozisyonlar'da Güncel Fiyat + Gerçekleşmemiş K/Z dolar.

Kod, testler, app entegrasyonu, workflow değişikliği controller tarafından yapılır ve `main`'e
push edilir; Enis yalnızca yukarıdaki 7 adımı yapar.

## 10. Riskler / açık noktalar

- **Yahoo API resmi değil** — sözleşmesiz, IP bazlı rate-limit uygulayabilir. 5 dk önbellek + tek
  kullanıcı ile risk düşük. Bozulursa Worker soyutlaması tek noktadan kaynağı değiştirmeye izin verir.
- **`GC=F` ≈ spot** — vadeli, spot'tan küçük fark (taşıma maliyeti). Kişisel takip için yeterli;
  Enis isterse ileride spot kaynağı eklenir.
- **Sikke primi 0** — ATA/YARIM için gerçek piyasa fiyatı saf-altın değerinin biraz üstünde. Enis
  gözlemleyip `altinPrim` override'ı girince düzelir (P3.5/P4).
- **`altinKatsayi` yorumu** — saf gram kabul edildi (Ata 7.216g × %91.6 ≈ 6.612). Enis doğrulamalı.
- **TCMB haftasonu** — Cuma kuru Pazartesi'ye kadar geçerli sayılır (geri-yürüyüş). Migration ile tutarlı.
