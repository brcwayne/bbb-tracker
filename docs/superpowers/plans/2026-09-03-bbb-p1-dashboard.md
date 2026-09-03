# BBB Tracker P1 — Salt-Okunur Dashboard PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P0 migration çıktısını (`data/*.json`) okuyan, Mac + iPhone tarayıcısında çalışan, kurulabilir, salt-okunur bir görsel dashboard PWA (`app/`) — üç sayfa: Panorama, Pozisyonlar, Aylık Rapor.

**Architecture:** Svelte + Vite + TypeScript tek-sayfa uygulaması. Veri bir `DataSource` arayüzü arkasında: `LocalFileSource` (geliştirme, repo'daki gitignore'lu `data/`) ve `DriveSource` (yayın, kullanıcının Google Drive `BBB/` klasörü, OAuth `drive.file` + Google Picker). Açık/kapalı pozisyonlar `transactions.json`'dan saf fonksiyonlarla türetilir (`derive.ts`, spec §11 muhasebe kuralları). Grafikler elle çizilmiş SVG Svelte bileşenleri; `d3-scale`/`d3-shape` yalnızca ölçek/geometri matematiği için. Yayın GitHub Pages'e `main`'e push ile; **finansal veri hiçbir zaman repoda/bundle'da değil**.

**Tech Stack:** Node 26, Svelte 5, Vite 6, TypeScript, `vite-plugin-pwa`, `d3-scale` + `d3-shape` (yalnız matematik), Vitest + `@testing-library/svelte` + `jsdom`. Task 0 ayrıca Python 3.14 + `migration/.venv` (mevcut P0 araç zinciri).

**Spec:** `docs/superpowers/specs/2026-09-03-bbb-p1-dashboard-design.md` (üst tasarım: `docs/superpowers/specs/2026-09-02-bbb-tracker-design.md`, sanat yönü §10, hesaplama kuralları §11).

## Global Constraints

- **Çizim kütüphanesi YOK.** Her grafik kendi SVG'sini üreten bir Svelte bileşeni. `d3-scale` (`scaleLinear`, `scaleBand`, `scaleTime`, `scalePoint`) ve `d3-shape` (`line`, `area`, `arc`, `pie`) yalnızca sayısal hesap için kullanılır — DOM'a değmez. (spec §1.2, §4)
- **Tüm para değerleri USD.** Gösterimde `usd()` biçimleyici. (spec §5)
- **Canlı fiyat YOK.** "Güncel Fiyat" ve "Gerçekleşmemiş K/Z" sütunları her zaman `—` (em dash) render eder; hesap yapılmaz. (spec §1 Kapsam dışı, §5.2)
- **`positions.json` YOK.** Açık/kapalı pozisyon `transactions.json`'dan `derive.ts` ile hesaplanır. Kural (spec §11): `AL` → `toplam_maliyet += net_usd`, `lot += lot`, `ort_maliyet = toplam_maliyet / lot`. `SAT` → `ort_maliyet` sabit, `gerceklesmis_kz = (fiyat_usd - ort_maliyet) * satilan_lot - komisyon_usd`, `toplam_maliyet -= ort_maliyet * satilan_lot`, `lot -= satilan_lot`. Kısa pozisyon yok: `satilan_lot > mevcut + 1e-9` → `errors`'a "aşırı satış" ekle ve `satilan_lot`'u mevcuda clamp et. `lot <= 1e-9` → pozisyon `open`'dan çıkar. İşlemler `(tarih, id)` sıralı işlenir.
- **snapshots kırılımları boş.** `snapshots[].hesapBazli/portfoyBazli/sinifBazli` hep `{}` (P0 sınırı). Varlık sınıfı / portföy dağılımı açık pozisyonların `toplamMaliyetUsd`'sinden **maliyet bazlı** türetilir. (spec §2, §5.1)
- **8 JSON dosyası:** `transactions, cashflows, snapshots, instruments, brokers, portfolios, meta, fxrates`. `reconciliation-report.md` P1 tarafından okunmaz. (spec §2)
- **KPI etiketi:** türetilen toplamlar `SourceStamp` ile "son bilinen — <meta.olusturulma>" damgası taşır. (spec §1)
- **Veri repoda değil.** `data/`, `app/node_modules/`, `app/dist/` `.gitignore`'da. Yayındaki site kod-only; veri yalnızca `local` (dev) veya Drive (prod) üzerinden. (spec §1.4, §7)
- **Sanat yönü (spec §10):** koyu varsayılan + açık mod (kullanıcı toggle, `localStorage`'da). Zemin koyu modda sıcak antrasit, açık modda sıcak kırık beyaz. Vurgu: **kazanç = derin mürekkep mavisi `#1d3b6e`, kayıp = yanık oküra `#b06a2b`** (spec §10.5'te sabitlendi). İnce altın vurgu `#a9863f`. Hairline çizgi sistemi. Tabular (hizalı) rakamlar — `font-variant-numeric: tabular-nums`. Efsane yerine doğrudan etiketleme.
- **Migration id'leri (Task 0'dan sonra) içerik-türevli** — satır numarasından değil. (spec §3)
- **Test:** her saf modül (`format`, `derive`) birim testli; grafik bileşenleri geometri (path `d` / açı / bar dikdörtgen) birim testli, görsel snapshot DEĞİL; sayfa bileşenleri fixture `Dataset` ile render testli (`@testing-library/svelte`); `drive.ts` GIS/Picker/fetch mock'lu. (spec §9)
- Test komutu `cd app && npm test` (Vitest). Task 0 için `cd migration && .venv/bin/pytest`.
- **Svelte 5 rune idiyomu:** bileşenlerde prop tipi `$props()`'a *tip argümanı* olarak DEĞİL, yıkım (destructuring) kalıbına annotation olarak verilir:
  `let { series = [], width = 640 }: { series: {x:number;y:number}[]; width?: number } = $props()`.
  Plan kod bloklarındaki `$props<{...}>()` yazımı *niyeti* gösterir — implementer bu idiyoma çevirir. Reaktif değerler `$derived(...)` / `$derived.by(() => ...)`, yerel durum `$state(...)`. Bileşen `mount(App, { target })` ile monte edilir (Svelte 5).

---

## File Structure

```
migration/                              # Task 0 sadece
  bbb_migration/transform.py            # _rid içerik-türevli + dup sayaç
  tests/test_transform.py               # id assert güncelle
  tests/test_transform_cashflows.py     # id assert güncelle

app/
  package.json · vite.config.ts · tsconfig.json · svelte.config.js
  index.html · .env.example
  vitest-setup.ts
  public/
    icons/icon-192.png · icons/icon-512.png · icons/maskable-512.png
  src/
    main.ts                             # uygulamayı monte eder
    App.svelte                          # kabuk: başlık + gezinme + aktif rota
    router.ts                           # hash router (3 rota)
    app.css                             # tema token'ları + reset + tabular-nums
    lib/
      format.ts                         # usd / pct / dateShort / monthLabel
      theme.ts                          # koyu/açık toggle + localStorage
      data/
        types.ts                        # Transaction, Cashflow, Snapshot, Instrument,
                                        #   Broker, Portfolio, Meta, FxRates, Dataset
        source.ts                       # DataSource arayüzü + describeSource()
        local.ts                        # LocalFileSource
        drive.ts                        # DriveSource (GIS + Picker)
        derive.ts                       # derivePositions + agregalar (saf)
        store.ts                        # Svelte store: kaynak seç, load, derive, hata
      charts/
        scales.ts                       # d3-scale/d3-shape sarmalayıcı saf yardımcılar
        LineChart.svelte
        Donut.svelte
        BarChart.svelte                 # yatay + dikey (prop)
        Histogram.svelte
      ui/
        KpiBand.svelte · SectionHeader.svelte · Rule.svelte
        DataTable.svelte                # sıralanabilir, kolon tanımı prop
        ThemeToggle.svelte · SourceStamp.svelte · EmptyState.svelte
        ConnectDrive.svelte             # tam ekran "Google ile bağlan"
    routes/
      Panorama.svelte · Pozisyonlar.svelte · AylikRapor.svelte
    fixtures/
      dataset.ts                        # testlerin paylaştığı küçük elle-hesaplı Dataset
  .github/workflows/pages.yml           # Task 16
```

Her dosya tek sorumluluk: `derive.ts` saf hesap (DOM/fetch yok), her grafik "veri + boyut → SVG", `source.ts`/`local.ts`/`drive.ts` yalnız veri getirme, `store.ts` orkestrasyon, sayfalar yalnız bağlama.

---

## Task 0: Migration id'lerini içerik-türevli yap

**Files:**
- Modify: `migration/bbb_migration/transform.py`
- Modify: `migration/tests/test_transform.py`, `migration/tests/test_transform_cashflows.py`
- (Re-run) `migration/` CLI → `data/*.json` yeniden üretilir (commit'lenmez)

**Interfaces:**
- Consumes: mevcut `transform.py` (`_rid`, `build_transaction(raw, fx, instruments)`, `build_transactions(raws, fx, instruments)`, `build_bank_cashflow(raw)`, `build_dividend_cashflow(raw, fx)`, `build_cashflows(bank_raws, div_raws, fx)`)
- Produces: aynı fonksiyon imzaları; yalnız `id` değeri değişir. `id = "t_" + sha1(payload)[:16]` / `"c_" + ...` where `payload = f"{tarih}|{hesap}|{portfoy}|{enstruman}|{yon}|{lot}|{fiyat_usd}|{dup_idx}"`. `build_transaction`/`build_bank_cashflow`/`build_dividend_cashflow` yeni bir `dup_idx: int = 0` parametresi alır; `build_transactions`/`build_cashflows` her kayıt için o payload-anahtarının kaç kez görüldüğünü sayıp geçirir.

- [ ] **Step 1: Failing testleri yaz — `migration/tests/test_transform.py`**

Mevcut `test_build_transaction_happy_path_buy` içindeki id assert'i değiştir, bir de dup-tiebreaker testi ekle:

```python
def test_build_transaction_id_is_content_derived():
    t = tr.build_transaction(_raw(), FX, INST)  # _raw(): row 15, M.Alfa/ASTOR/BUY/1.0/100/tl None
    import hashlib
    payload = "2020-01-06|MIDAS|ALFA|ASTOR|AL|100.0|1.0|0"
    assert t["id"] == "t_" + hashlib.sha1(payload.encode()).hexdigest()[:16]
    assert "trades:" not in payload  # satır numarası artık id'ye girmiyor


def test_build_transactions_disambiguates_identical_rows():
    a = _raw(row_no=15)
    b = _raw(row_no=16)  # birebir aynı içerik, farklı satır
    txns, errors = tr.build_transactions([a, b], FX, INST)
    assert errors == []
    assert txns[0]["id"] != txns[1]["id"]           # dup_idx 0 vs 1
    # deterministik: aynı girdi -> aynı id
    txns2, _ = tr.build_transactions([a, b], FX, INST)
    assert [t["id"] for t in txns] == [t["id"] for t in txns2]
```

`migration/tests/test_transform_cashflows.py` — mevcut id-içeren assert'leri (varsa) yeni şemaya göre güncelle; en az bir tane ekle:

```python
def test_bank_cashflow_id_is_content_derived():
    raw = dict(row_no=15, tarih_raw="2019-01-02", action_raw="Deposit",
               gross_raw=1000.0, fees_raw=0, net_raw=1000.0, notes_raw="ilk")
    c = tr.build_bank_cashflow(raw)
    import hashlib
    payload = "2019-01-02|TOPLU|None|None|YATIRMA|None|None|0"
    assert c["id"] == "c_" + hashlib.sha1(payload.encode()).hexdigest()[:16]
```

- [ ] **Step 2: Testleri çalıştır — fail**

Run: `cd migration && .venv/bin/pytest tests/test_transform.py -k content_derived -v`
Expected: FAIL — id hâlâ `sha1("trades:15")[:16]`.

- [ ] **Step 3: `transform.py`'ı düzenle**

`_rid` aynı kalır (`prefix + sha1(key)[:16]` — mevcut `[:MONEY_ROUND + 10]` = 16). Sadece `key` değişir. Yeni yardımcı + parametreler:

```python
def _payload(tarih, hesap, portfoy, enstruman, yon, lot, fiyat_usd, dup_idx):
    return f"{tarih}|{hesap}|{portfoy}|{enstruman}|{yon}|{lot}|{fiyat_usd}|{dup_idx}"


def build_transaction(raw, fx, instruments, dup_idx=0):
    # ... mevcut çözümleme (label -> hesap/portfoy, yon, tarih, fiyat_usd, lot, kur, kod) ...
    # SADECE id satırını değiştir:
    _id = _rid("t_", _payload(tarih, hesap, portfoy, kod, yon, lot, _r(fiyat_usd), dup_idx))
    return {
        "id": _id,
        # ... geri kalan alanlar aynen ...
    }


def build_transactions(raws, fx, instruments):
    from collections import Counter
    seen = Counter()
    txns, errors = [], []
    for raw in raws:
        # önce hatasız çözümlenip çözümlenmediğini denemek için bir kez çağırıp
        # payload anahtarını almak yerine: build_transaction'ı dup_idx=0 ile çağır,
        # başarılıysa onun alanlarından anahtarı kur, sayacı artır, id'yi düzelt.
        try:
            t = build_transaction(raw, fx, instruments, dup_idx=0)
        except TransformError as e:
            errors.append(e)
            continue
        key = (t["tarih"], t["hesap"], t["portfoy"], t["enstruman"], t["yon"], t["lot"], t["fiyat_usd"])
        idx = seen[key]
        seen[key] += 1
        if idx:
            t["id"] = _rid("t_", _payload(*key, idx))
        txns.append(t)
    return txns, errors
```

Aynı desen `build_bank_cashflow(raw, dup_idx=0)` / `build_dividend_cashflow(raw, fx, dup_idx=0)` ve `build_cashflows` için. Nakit payload'ında `portfoy=None`, `enstruman` bankada `None` temettüde kod, `yon=None`, `lot=None`, `fiyat_usd=None`, `tur` ayırt edici değil (payload'a katma — `tur` zaten `tarih+enstruman+tutar` kombinasyonuyla ayrışır; ayrışmıyorsa `dup_idx` halleder). Not: bank/dividend payload'ında `hesap` = `"TOPLU"`.

- [ ] **Step 4: Testleri çalıştır — pass + tam suite**

Run: `cd migration && .venv/bin/pytest -q`
Expected: 91 passed (id-sabitleyen eski assert'ler güncellendi; determinizm testi hâlâ yeşil).

- [ ] **Step 5: Migration'ı yeniden koş**

Run:
```bash
cd migration && .venv/bin/python -m bbb_migration \
  --xlsm "/Users/enisuslu/Desktop/Market/BBB/BigBlackBook_2026v15 kopyası.xlsm" \
  --out ../data --overrides overrides --cache overrides/fxrates_cache.json
```
Expected: `transactions 153 · cashflows 21 · ok false` (row-104 kabul edilen boşluk aynı). `data/transactions.json` id'leri artık `t_<16hex>` içerik-türevli. `git status` → `data/` görünmez (gitignore).

- [ ] **Step 6: Commit**

```bash
cd /Users/enisuslu/Desktop/Market/BBB
git add migration/bbb_migration/transform.py migration/tests/test_transform.py migration/tests/test_transform_cashflows.py
git commit -m "fix(migration): content-derived transaction/cashflow ids

id now hashes the record payload (tarih|hesap|portfoy|enstruman|yon|lot|
fiyat_usd|dup_idx) instead of the Excel row number, so inserting/removing
Excel rows no longer silently re-keys everything below. dup_idx counts
identical tuples for the rare exact-duplicate ticket."
```

---

## Task 1: `app/` iskeleti (Vite + Svelte + TS + Vitest)

**Files:**
- Create: `app/package.json`, `app/vite.config.ts`, `app/tsconfig.json`, `app/svelte.config.js`, `app/index.html`, `app/vitest-setup.ts`, `app/src/main.ts`, `app/src/App.svelte`, `app/src/app.css`, `app/src/lib/smoke.test.ts`
- Modify: `.gitignore` (kök) — `app/node_modules/`, `app/dist/`, `app/.env`, `app/dev-dist/` ekle

**Interfaces:**
- Produces: çalışan `npm run dev` / `npm run build` / `npm test`; `app/src/App.svelte` monte edilebilir kök bileşen.

- [ ] **Step 1: `.gitignore`'a ekle (kök)**

`/Users/enisuslu/Desktop/Market/BBB/.gitignore` sonuna:
```
app/node_modules/
app/dist/
app/dev-dist/
app/.env
```

- [ ] **Step 2: `app/package.json`**

```json
{
  "name": "bbb-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.3",
    "@testing-library/svelte": "^5.2.6",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1",
    "svelte": "^5.19.0",
    "svelte-check": "^4.1.4",
    "typescript": "^5.7.3",
    "vite": "^6.0.11",
    "vite-plugin-pwa": "^0.21.1",
    "vitest": "^2.1.8"
  },
  "dependencies": {
    "d3-scale": "^4.0.2",
    "d3-shape": "^3.2.0"
  }
}
```

- [ ] **Step 3: config dosyaları**

`app/svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
export default { preprocess: vitePreprocess() }
```

`app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "vitest-setup.ts"]
}
```

`app/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  base: './',                    // Task 16'da GitHub Pages alt-yoluna çevrilecek
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest-setup.ts'],
  },
})
```

`app/vitest-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: `index.html` + kök bileşen**

`app/index.html`:
```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>BBB</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`app/src/main.ts`:
```ts
import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

export default mount(App, { target: document.getElementById('app')! })
```

`app/src/App.svelte`:
```svelte
<script lang="ts">
</script>

<main>
  <h1>BBB</h1>
</main>
```

`app/src/app.css`:
```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; }
```

- [ ] **Step 5: smoke testi**

`app/src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: kur, çalıştır**

Run:
```bash
cd app && npm install && npm test && npm run build
```
Expected: `npm test` → 1 passed. `npm run build` → `dist/` üretir, hata yok.

- [ ] **Step 7: Commit**

```bash
cd /Users/enisuslu/Desktop/Market/BBB
git add .gitignore app/package.json app/package-lock.json app/vite.config.ts app/tsconfig.json app/svelte.config.js app/index.html app/vitest-setup.ts app/src/main.ts app/src/App.svelte app/src/app.css app/src/lib/smoke.test.ts
git commit -m "feat(app): scaffold Svelte + Vite + TS + Vitest"
```

---

## Task 2: Tema token'ları + biçimleme (`app.css`, `theme.ts`, `format.ts`)

**Files:**
- Modify: `app/src/app.css`
- Create: `app/src/lib/theme.ts`, `app/src/lib/theme.test.ts`, `app/src/lib/format.ts`, `app/src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `format.usd(n: number, opts?: {sign?: boolean}) -> string` — `"$1,234.56"`, negatif `"-$12.00"`, `sign:true` → `"+$12.00"`; `NaN`/`null`/`undefined` → `"—"`.
  - `format.pct(n: number, digits = 1) -> string` — `0.1234` → `"12.3%"`; null → `"—"`.
  - `format.dateShort(iso: string) -> string` — `"2026-08-31"` → `"31 Ağu 2026"`.
  - `format.monthLabel(iso: string) -> string` — `"2026-08-31"` → `"Ağu 2026"`.
  - `format.DASH = "—"`.
  - `theme.getTheme() -> 'light' | 'dark' | 'system'`, `theme.setTheme(t)`, `theme.initTheme()` (uygular + `localStorage` `bbb-theme` okur; erişim `try/catch`).

- [ ] **Step 1: Failing testler — `app/src/lib/format.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import * as f from './format'

describe('usd', () => {
  it('formats positive', () => expect(f.usd(1234.56)).toBe('$1,234.56'))
  it('formats negative', () => expect(f.usd(-12)).toBe('-$12.00'))
  it('sign option', () => expect(f.usd(12, { sign: true })).toBe('+$12.00'))
  it('rounds to cents', () => expect(f.usd(115018.974)).toBe('$115,018.97'))
  it('nullish -> dash', () => {
    expect(f.usd(NaN)).toBe('—')
    // @ts-expect-error test
    expect(f.usd(null)).toBe('—')
  })
})

describe('pct', () => {
  it('fraction to percent', () => expect(f.pct(0.1234)).toBe('12.3%'))
  it('negative', () => expect(f.pct(-0.02)).toBe('-2.0%'))
  it('digits', () => expect(f.pct(0.6483, 2)).toBe('64.83%'))
  // @ts-expect-error test
  it('nullish -> dash', () => expect(f.pct(null)).toBe('—'))
})

describe('dates', () => {
  it('dateShort', () => expect(f.dateShort('2026-08-31')).toBe('31 Ağu 2026'))
  it('monthLabel', () => expect(f.monthLabel('2026-08-31')).toBe('Ağu 2026'))
})
```

- [ ] **Step 2: Çalıştır — fail** — `cd app && npx vitest run src/lib/format.test.ts` → modül yok.

- [ ] **Step 3: `app/src/lib/format.ts`**

```ts
export const DASH = '—'

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function nullish(n: unknown): n is null | undefined {
  return n == null || (typeof n === 'number' && Number.isNaN(n))
}

export function usd(n: number, opts: { sign?: boolean } = {}): string {
  if (nullish(n)) return DASH
  const neg = n < 0
  const body = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (neg) return '-' + body
  return opts.sign ? '+' + body : body
}

export function pct(n: number, digits = 1): string {
  if (nullish(n)) return DASH
  return (n * 100).toFixed(digits) + '%'
}

export function dateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${AY[m - 1]} ${y}`
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${AY[m - 1]} ${y}`
}
```

- [ ] **Step 4: Çalıştır — pass.**

- [ ] **Step 5: `theme.ts` failing test — `app/src/lib/theme.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import * as t from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme', () => {
  it('defaults to system', () => expect(t.getTheme()).toBe('system'))
  it('setTheme persists and stamps root', () => {
    t.setTheme('dark')
    expect(t.getTheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('bbb-theme')).toBe('dark')
  })
  it('system clears the attribute', () => {
    t.setTheme('dark'); t.setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
  it('initTheme applies stored value', () => {
    localStorage.setItem('bbb-theme', 'light')
    t.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
```

- [ ] **Step 6: `app/src/lib/theme.ts`**

```ts
export type Theme = 'light' | 'dark' | 'system'
const KEY = 'bbb-theme'

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function getTheme(): Theme {
  return read()
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {}
  apply(t)
}

function apply(t: Theme): void {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
}

export function initTheme(): void {
  apply(read())
}
```

- [ ] **Step 7: `app.css` tema token'ları (spec §10, Global Constraints)**

`app/src/app.css`'i genişlet:
```css
:root {
  color-scheme: light dark;
  --bg: #f4f1ea;
  --surface: #fbf9f4;
  --ink: #1c1a17;
  --ink-soft: #5c574e;
  --hairline: #d9d3c6;
  --gain: #1d3b6e;
  --loss: #b06a2b;
  --gold: #a9863f;
  --font-num: ui-monospace, "SF Mono", Menlo, monospace;
}
:root:not([data-theme='light']) {
  @media (prefers-color-scheme: dark) {
    --bg: #17161c;
    --surface: #1e1d24;
    --ink: #ece7dd;
    --ink-soft: #9a938a;
    --hairline: #322f3a;
    --gain: #6d8fce;
    --loss: #d69154;
    --gold: #c7a55e;
  }
}
:root[data-theme='dark'] {
  --bg: #17161c; --surface: #1e1d24; --ink: #ece7dd; --ink-soft: #9a938a;
  --hairline: #322f3a; --gain: #6d8fce; --loss: #d69154; --gold: #c7a55e;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 14px/1.5 system-ui, -apple-system, sans-serif; }
.num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
.hairline { border: 0; border-top: 1px solid var(--hairline); }
```

- [ ] **Step 8: `main.ts`'e `initTheme()` çağrısı**

`app/src/main.ts` içine, `mount`'tan önce: `import { initTheme } from './lib/theme'` ve `initTheme()`.

- [ ] **Step 9: Çalıştır — tüm suite pass. Commit.**

```bash
git add app/src/app.css app/src/main.ts app/src/lib/theme.ts app/src/lib/theme.test.ts app/src/lib/format.ts app/src/lib/format.test.ts
git commit -m "feat(app): theme tokens (dark default, ink blue + ochre) and formatters"
```

---

## Task 3: Veri tipleri + `DataSource` arayüzü + yerel adaptör

**Files:**
- Create: `app/src/lib/data/types.ts`, `app/src/lib/data/source.ts`, `app/src/lib/data/local.ts`, `app/src/lib/data/local.test.ts`
- Create: `app/src/fixtures/dataset.ts` (paylaşılan test fixture'ı — bu görevde başlar, sonraki görevler genişletir)

**Interfaces:**
- Produces:
  - `types.ts`: `Transaction { id, tarih, hesap, portfoy, enstruman, yon: 'AL'|'SAT', lot, girisParaBirimi, fiyat_tl: number|null, fiyat_usd, kur: number|null, komisyon_usd, brut_usd, net_usd, not: string, kaynak, olusturulma: string|null }`; `Cashflow { id, tarih, hesap, portfoy: string|null, tur: 'YATIRMA'|'CEKME'|'TEMETTU', enstruman: string|null, tutar_tl: number|null, tutar_usd, kur: number|null, aciklama, kaynak }`; `Snapshot { tarih, toplamOzkaynak_usd, baslangicSermayesi_usd: number|null, netMevduatCekim_usd, cekim_usd, nakitTemettu_usd, nakit_usd: number|null, gerceklesmemisKZ_usd: number|null, netKZ_usd, vergiKomisyon_usd, kaynak }`; `Instrument { kod, ad, sinif: 'BIST'|'ALTIN'|'FON_PARA'|'FON_HISSE'|'USA', girisParaBirimi, fiyatKaynagi, fiyatSembolu, seviyeler: { destek?: number, direnc?: number, hedef?: number, birim?: string, not?: string, guncelleme?: string } | null }`; `Broker { kod, ad, tur, sahip, aktif }`; `Portfolio { kod, ad, aktif }`; `Meta { semaVersiyonu, olusturulma, kaynak, nakitHesapBazli: Record<string, number>, p0Sinirlari: string[] }`; `FxRates = Record<string, number>`; `Dataset { transactions: Transaction[], cashflows: Cashflow[], snapshots: Snapshot[], instruments: Instrument[], brokers: Broker[], portfolios: Portfolio[], meta: Meta, fxrates: FxRates }`.
  - `source.ts`: `interface DataSource { readonly id: 'local' | 'drive'; load(): Promise<Dataset> }`; `describeSource(s: DataSource, meta: Meta): string` → `"local · son güncelleme 3 Eyl 2026"` / `"Drive · ..."`.
  - `local.ts`: `class LocalFileSource implements DataSource` — ctor `(base = './data')`; `load()` → 8 `fetch(\`${base}/${name}.json\`)` paralel, `Dataset` birleştir; herhangi biri `!res.ok` → `throw new Error(\`data/${name}.json okunamadı (${res.status})\`)`.
- Consumes: `format.dateShort`.

- [ ] **Step 1: fixture — `app/src/fixtures/dataset.ts`**

Küçük, elle hesaplanmış bir `Dataset`. ASTOR: AL 100@1.0, AL 100@2.0 (ort 1.5), SAT 50@5.0 (gerçekleşmiş +175). XAU: AL 10@50, SAT 10@80 (gerçekleşmiş +300, tam çıkış). Bir açık BIST pozisyonu (THYAO AL 25@40). İki snapshot, iki instrument, bir cashflow.

```ts
import type { Dataset } from '../lib/data/types'

export const fixture: Dataset = {
  transactions: [
    { id: 't_a', tarih: '2020-01-06', hesap: 'MIDAS', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'AL', lot: 100, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 1.0, kur: 5.94, komisyon_usd: 0, brut_usd: 100, net_usd: 100, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_b', tarih: '2020-06-10', hesap: 'MIDAS', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'AL', lot: 100, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 2.0, kur: 6.9, komisyon_usd: 0, brut_usd: 200, net_usd: 200, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_c', tarih: '2021-03-15', hesap: 'MIDAS', portfoy: 'ALFA', enstruman: 'ASTOR', yon: 'SAT', lot: 50, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 5.0, kur: 7.4, komisyon_usd: 0, brut_usd: 250, net_usd: 250, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_d', tarih: '2019-07-01', hesap: 'KASA', portfoy: 'ENIS', enstruman: 'XAU', yon: 'AL', lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 50, kur: 5.8, komisyon_usd: 0, brut_usd: 500, net_usd: 500, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_e', tarih: '2024-01-01', hesap: 'KASA', portfoy: 'ENIS', enstruman: 'XAU', yon: 'SAT', lot: 10, girisParaBirimi: 'TL', fiyat_tl: null, fiyat_usd: 80, kur: 30, komisyon_usd: 0, brut_usd: 800, net_usd: 800, not: '', kaynak: 'migration', olusturulma: null },
    { id: 't_f', tarih: '2023-11-20', hesap: 'GARAN', portfoy: 'ENIS', enstruman: 'THYAO', yon: 'AL', lot: 25, girisParaBirimi: 'TL', fiyat_tl: 1200, fiyat_usd: 40, kur: 30, komisyon_usd: 1.5, brut_usd: 1000, net_usd: 1001.5, not: '', kaynak: 'migration', olusturulma: null },
  ],
  cashflows: [
    { id: 'c_a', tarih: '2019-01-02', hesap: 'TOPLU', portfoy: null, tur: 'YATIRMA', enstruman: null, tutar_tl: null, tutar_usd: 5000, kur: null, aciklama: 'ilk', kaynak: 'migration' },
    { id: 'c_b', tarih: '2023-04-10', hesap: 'TOPLU', portfoy: null, tur: 'TEMETTU', enstruman: 'THYAO', tutar_tl: 100, tutar_usd: 4, kur: 25, aciklama: 'Cash', kaynak: 'migration' },
  ],
  snapshots: [
    { tarih: '2021-03-31', toplamOzkaynak_usd: 5175, baslangicSermayesi_usd: 5000, netMevduatCekim_usd: 0, cekim_usd: 0, nakitTemettu_usd: 0, nakit_usd: null, gerceklesmemisKZ_usd: null, netKZ_usd: 175, vergiKomisyon_usd: 0, kaynak: 'excel-monthly-report' },
    { tarih: '2024-01-31', toplamOzkaynak_usd: 5475, baslangicSermayesi_usd: 5175, netMevduatCekim_usd: 0, cekim_usd: 0, nakitTemettu_usd: 4, nakit_usd: null, gerceklesmemisKZ_usd: null, netKZ_usd: 300, vergiKomisyon_usd: 1.5, kaynak: 'excel-monthly-report' },
  ],
  instruments: [
    { kod: 'ASTOR', ad: 'ASTOR', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'ASTOR.IS', seviyeler: null },
    { kod: 'XAU', ad: 'XAU', sinif: 'ALTIN', girisParaBirimi: 'TL', fiyatKaynagi: 'altin-turev', fiyatSembolu: 'XAUUSD', seviyeler: { destek: 60, direnc: 90, hedef: 110, birim: 'USD' } },
    { kod: 'THYAO', ad: 'THYAO', sinif: 'BIST', girisParaBirimi: 'TL', fiyatKaynagi: 'yahoo', fiyatSembolu: 'THYAO.IS', seviyeler: null },
  ],
  brokers: [
    { kod: 'MIDAS', ad: 'Midas', tur: 'BROKER', sahip: 'Enis', aktif: true },
    { kod: 'KASA', ad: 'Kasa (fiziki)', tur: 'FIZIKI', sahip: 'Enis', aktif: true },
    { kod: 'GARAN', ad: 'Garanti Yatırım', tur: 'BROKER', sahip: 'Enis', aktif: true },
  ],
  portfolios: [
    { kod: 'ENIS', ad: 'Enis (kendi seçimlerim)', aktif: true },
    { kod: 'ALFA', ad: 'Alfa (Yatırım101)', aktif: true },
  ],
  meta: { semaVersiyonu: 1, olusturulma: '2026-09-03T16:24:37', kaynak: 'test.xlsm', nakitHesapBazli: { TOPLU: 5004, MIDAS: -50, KASA: 300, GARAN: -1001.5 }, p0Sinirlari: [] },
  fxrates: { '2020-01-06': 5.94, '2024-01-01': 30 },
}
```

- [ ] **Step 2: `types.ts` yaz** (yukarıdaki Produces bloğundaki tipler; `export interface ...`).

- [ ] **Step 3: `source.ts` yaz**

```ts
import type { Dataset, Meta } from './types'
import { dateShort } from '../format'

export interface DataSource {
  readonly id: 'local' | 'drive'
  load(): Promise<Dataset>
}

export function describeSource(s: DataSource, meta: Meta): string {
  const label = s.id === 'local' ? 'local' : 'Drive'
  const d = meta.olusturulma?.slice(0, 10)
  return d ? `${label} · son güncelleme ${dateShort(d)}` : label
}
```

- [ ] **Step 4: `local.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LocalFileSource } from './local'
import { fixture } from '../../fixtures/dataset'

const FILES = ['transactions', 'cashflows', 'snapshots', 'instruments', 'brokers', 'portfolios', 'meta', 'fxrates'] as const

function mockFetchOk() {
  return vi.fn((url: string) => {
    const name = url.split('/').pop()!.replace('.json', '') as keyof typeof map
    const map = {
      transactions: fixture.transactions, cashflows: fixture.cashflows, snapshots: fixture.snapshots,
      instruments: fixture.instruments, brokers: fixture.brokers, portfolios: fixture.portfolios,
      meta: fixture.meta, fxrates: fixture.fxrates,
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[name]) })
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('LocalFileSource', () => {
  it('loads and assembles a Dataset from 8 files', async () => {
    vi.stubGlobal('fetch', mockFetchOk())
    const ds = await new LocalFileSource('./data').load()
    expect(ds.transactions).toHaveLength(6)
    expect(ds.meta.olusturulma).toBe('2026-09-03T16:24:37')
    expect(Object.keys(ds.fxrates)).toContain('2020-01-06')
    expect(fetch).toHaveBeenCalledTimes(8)
  })

  it('throws a clear error on a missing file', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    await expect(new LocalFileSource().load()).rejects.toThrow(/okunamadı \(404\)/)
  })
})
```

- [ ] **Step 5: `local.ts`**

```ts
import type { Dataset } from './types'
import type { DataSource } from './source'

const NAMES = ['transactions', 'cashflows', 'snapshots', 'instruments', 'brokers', 'portfolios', 'meta', 'fxrates'] as const

export class LocalFileSource implements DataSource {
  readonly id = 'local' as const
  constructor(private base = './data') {}

  async load(): Promise<Dataset> {
    const parts = await Promise.all(
      NAMES.map(async (name) => {
        const res = await fetch(`${this.base}/${name}.json`)
        if (!res.ok) throw new Error(`data/${name}.json okunamadı (${res.status})`)
        return [name, await res.json()] as const
      }),
    )
    return Object.fromEntries(parts) as unknown as Dataset
  }
}
```

- [ ] **Step 6: Çalıştır — pass. Commit.**

```bash
git add app/src/lib/data/types.ts app/src/lib/data/source.ts app/src/lib/data/local.ts app/src/lib/data/local.test.ts app/src/fixtures/dataset.ts
git commit -m "feat(app): data types, DataSource interface, LocalFileSource adapter"
```

---

## Task 4: `derive.ts` — pozisyon türetimi + gerçekleşmiş K/Z

**Files:**
- Create: `app/src/lib/data/derive.ts`, `app/src/lib/data/derive.test.ts`

**Interfaces:**
- Consumes: `Transaction` (types.ts).
- Produces:
  - `OpenPosition { kod: string; lot: number; ortMaliyetUsd: number; toplamMaliyetUsd: number }`
  - `ClosedPosition { kod: string; alisLot: number; alisTutarUsd: number; satisLot: number; satisTutarUsd: number; gerceklesmisKzUsd: number }`
  - `derivePositions(txns: Transaction[]): { open: OpenPosition[]; closed: ClosedPosition[]; realizedTotalUsd: number; errors: string[] }` — spec §11 / Global Constraints kuralları. `open` `kod`'a göre alfabetik; `closed` yalnız `satisLot > 1e-9` olanlar, `kod`'a göre alfabetik.

- [ ] **Step 1: Failing test — `app/src/lib/data/derive.test.ts`** (P0 `test_positions.py` senaryolarının birebir karşılığı)

```ts
import { describe, it, expect } from 'vitest'
import { derivePositions } from './derive'
import type { Transaction } from './types'

const t = (o: Partial<Transaction>): Transaction => ({
  id: o.id ?? 'x', tarih: o.tarih ?? '2020-01-01', hesap: 'MIDAS', portfoy: 'ALFA',
  enstruman: o.enstruman ?? 'ASTOR', yon: o.yon ?? 'AL', lot: o.lot ?? 0, girisParaBirimi: 'TL',
  fiyat_tl: null, fiyat_usd: o.fiyat_usd ?? 0, kur: 1, komisyon_usd: o.komisyon_usd ?? 0,
  brut_usd: 0, net_usd: o.net_usd ?? 0, not: '', kaynak: 'migration', olusturulma: null,
})

describe('derivePositions', () => {
  it('moving average + realized on partial sell', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2020-01-06', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
      t({ id: 'b', tarih: '2020-06-10', yon: 'AL', lot: 100, fiyat_usd: 2, net_usd: 200 }),
      t({ id: 'c', tarih: '2021-03-15', yon: 'SAT', lot: 50, fiyat_usd: 5, net_usd: 250 }),
    ])
    const astor = r.open.find((p) => p.kod === 'ASTOR')!
    expect(astor.lot).toBe(150)
    expect(astor.ortMaliyetUsd).toBeCloseTo(1.5, 9)
    expect(astor.toplamMaliyetUsd).toBeCloseTo(225, 9)
    expect(r.realizedTotalUsd).toBeCloseTo(175, 9)
    expect(r.closed[0].gerceklesmisKzUsd).toBeCloseTo(175, 9)
  })

  it('full exit removes the open position', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2019-07-01', enstruman: 'XAU', yon: 'AL', lot: 10, fiyat_usd: 50, net_usd: 500 }),
      t({ id: 'b', tarih: '2024-01-01', enstruman: 'XAU', yon: 'SAT', lot: 10, fiyat_usd: 80, net_usd: 800 }),
    ])
    expect(r.open.find((p) => p.kod === 'XAU')).toBeUndefined()
    expect(r.realizedTotalUsd).toBeCloseTo(300, 9)
  })

  it('oversell is flagged and clamped', () => {
    const r = derivePositions([
      t({ id: 'a', tarih: '2020-01-01', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
      t({ id: 'b', tarih: '2020-02-01', yon: 'SAT', lot: 250, fiyat_usd: 2, net_usd: 500 }),
    ])
    expect(r.errors.some((e) => e.includes('aşırı satış'))).toBe(true)
    expect(r.open.find((p) => p.kod === 'ASTOR')).toBeUndefined()
    expect(r.realizedTotalUsd).toBeCloseTo(100, 9)
  })

  it('processes by (tarih, id) regardless of array order', () => {
    const r = derivePositions([
      t({ id: 'c', tarih: '2021-03-15', yon: 'SAT', lot: 50, fiyat_usd: 5, net_usd: 250 }),
      t({ id: 'a', tarih: '2020-01-06', yon: 'AL', lot: 100, fiyat_usd: 1, net_usd: 100 }),
      t({ id: 'b', tarih: '2020-06-10', yon: 'AL', lot: 100, fiyat_usd: 2, net_usd: 200 }),
    ])
    expect(r.realizedTotalUsd).toBeCloseTo(175, 9)
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `app/src/lib/data/derive.ts`**

```ts
import type { Transaction } from './types'

export interface OpenPosition { kod: string; lot: number; ortMaliyetUsd: number; toplamMaliyetUsd: number }
export interface ClosedPosition {
  kod: string; alisLot: number; alisTutarUsd: number
  satisLot: number; satisTutarUsd: number; gerceklesmisKzUsd: number
}
export interface Positions {
  open: OpenPosition[]; closed: ClosedPosition[]; realizedTotalUsd: number; errors: string[]
}

const EPS = 1e-9

export function derivePositions(txns: Transaction[]): Positions {
  const ordered = [...txns].sort((a, b) =>
    a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const open = new Map<string, OpenPosition>()
  const closed = new Map<string, ClosedPosition>()
  let realizedTotalUsd = 0
  const errors: string[] = []

  const cl = (kod: string) =>
    closed.get(kod) ??
    closed.set(kod, { kod, alisLot: 0, alisTutarUsd: 0, satisLot: 0, satisTutarUsd: 0, gerceklesmisKzUsd: 0 }).get(kod)!

  for (const x of ordered) {
    const pos = open.get(x.enstruman) ?? { kod: x.enstruman, lot: 0, ortMaliyetUsd: 0, toplamMaliyetUsd: 0 }
    if (!open.has(x.enstruman)) open.set(x.enstruman, pos)

    if (x.yon === 'AL') {
      pos.toplamMaliyetUsd += x.net_usd
      pos.lot += x.lot
      pos.ortMaliyetUsd = pos.toplamMaliyetUsd / pos.lot
      const c = cl(x.enstruman)
      c.alisLot += x.lot
      c.alisTutarUsd += x.net_usd
    } else {
      let sell = x.lot
      if (sell > pos.lot + EPS) {
        errors.push(`${x.id}: aşırı satış ${x.enstruman} (istenen ${sell}, mevcut ${pos.lot})`)
        sell = pos.lot
      }
      if (sell <= EPS) continue
      const ort = pos.ortMaliyetUsd
      const kz = (x.fiyat_usd - ort) * sell - x.komisyon_usd
      realizedTotalUsd += kz
      pos.lot -= sell
      pos.toplamMaliyetUsd -= ort * sell
      const c = cl(x.enstruman)
      c.satisLot += sell
      c.satisTutarUsd += x.fiyat_usd * sell - x.komisyon_usd
      c.gerceklesmisKzUsd += kz
      if (pos.lot <= EPS) open.delete(x.enstruman)
    }
  }

  return {
    open: [...open.values()].sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    closed: [...closed.values()].filter((c) => c.satisLot > EPS).sort((a, b) => (a.kod < b.kod ? -1 : 1)),
    realizedTotalUsd,
    errors,
  }
}
```

- [ ] **Step 4: Çalıştır — pass. Commit.**

```bash
git add app/src/lib/data/derive.ts app/src/lib/data/derive.test.ts
git commit -m "feat(app): derivePositions — moving-average cost, realized P/L, oversell clamp"
```

---

## Task 5: `derive.ts` agregalar — dağılım, kovalar, dönemler, movers

**Files:**
- Modify: `app/src/lib/data/derive.ts`
- Modify: `app/src/lib/data/derive.test.ts`

**Interfaces:**
- Consumes: `OpenPosition`, `ClosedPosition` (Task 4), `Snapshot`, `Instrument` (types.ts), `Transaction`.
- Produces (hepsi `derive.ts`'ten export):
  - `allocation(open: OpenPosition[], keyOf: (kod: string) => string): { key: string; tutarUsd: number; pay: number }[]` — `tutarUsd` = `Σ toplamMaliyetUsd` gruplu, `pay` = grup / toplam (0..1), `tutarUsd` azalan sıralı.
  - `allocationByClass(open, instruments: Instrument[])` — `keyOf` = enstrüman → `sinif` (bulunamazsa `'?'`).
  - `allocationByPortfolio(open, txns: Transaction[])` — `keyOf` = enstrümanın **son** işlemindeki `portfoy` (basit: her enstrüman için en son tarihli işlemin portföyü).
  - `gainBuckets(closed: ClosedPosition[]): { label: string; lo: number; hi: number; count: number }[]` — kova sınırları (üst tasarım §9.1): `[-Inf,-0.22], (-0.22,-0.20], ... (0,0.02], (0.02,0.04], ... (0.20, Inf)` — %2'lik dilimler, `%getiri = gerceklesmisKzUsd / alisTutarUsd`.
  - `periodPerformance(snapshots: Snapshot[], today = new Date()): { period: string; netKzUsd: number; pct: number | null }[]` — satırlar: `Bu Ay`, `Ç1`..`Ç4` (bu yıl), `YTD`, `Önceki YTD`. `netKzUsd` = ilgili aralıktaki `Σ netKZ_usd`. `pct` = `netKzUsd / (aralık ilk ayının baslangicSermayesi_usd)`, `null` bölen 0/null ise.
  - `topMovers(closed: ClosedPosition[], n = 5): { gainers: ClosedPosition[]; losers: ClosedPosition[] }` — `gerceklesmisKzUsd` azalan ilk `n` / artan ilk `n`.
  - `winLoss(closed: ClosedPosition[]): { wins: number; losses: number; kazancToplam: number; zararToplam: number }` — `gerceklesmisKzUsd > 0` sayısı vs `< 0`.
  - `positionStats(closed: ClosedPosition[]): { win: number; loss: number; kazanmaOrani: number; ortKazancPct: number; ortKayipPct: number; enBuyukKazanc: number; enBuyukKayip: number; riskOdul: number | null }` — `pct` alanları `gerceklesmisKzUsd / alisTutarUsd` ortalaması.

- [ ] **Step 1: Failing testler ekle — `derive.test.ts`**

```ts
import {
  allocationByClass, allocationByPortfolio, gainBuckets, periodPerformance,
  topMovers, winLoss, positionStats,
} from './derive'
import { fixture } from '../../fixtures/dataset'

describe('allocation', () => {
  it('by class, cost-weighted, sorted desc', () => {
    const pos = derivePositions(fixture.transactions)
    const a = allocationByClass(pos.open, fixture.instruments)
    // açık: ASTOR 150@1.5 = 225 (BIST), THYAO 25 net 1001.5 (BIST); XAU tam çıkış -> yok
    const bist = a.find((r) => r.key === 'BIST')!
    expect(bist.tutarUsd).toBeCloseTo(1226.5, 6)
    expect(a.reduce((s, r) => s + r.pay, 0)).toBeCloseTo(1, 9)
  })
})

describe('gainBuckets', () => {
  it('buckets closed positions by return %', () => {
    const pos = derivePositions(fixture.transactions)
    const b = gainBuckets(pos.closed)
    // ASTOR kapalı: kz 175 / alisTutar 150 -> +116% -> üst kova; XAU: 300/500 -> +60% -> üst kova
    expect(b.at(-1)!.count).toBe(2)
    expect(b.reduce((s, r) => s + r.count, 0)).toBe(2)
  })
})

describe('periodPerformance', () => {
  it('sums netKZ over ranges with null-safe pct', () => {
    const rows = periodPerformance(fixture.snapshots, new Date('2024-02-01'))
    const ytd = rows.find((r) => r.period === 'YTD')!
    expect(ytd.netKzUsd).toBeCloseTo(300, 6)      // yalnız 2024-01 snapshot
  })
})

describe('topMovers / winLoss / positionStats', () => {
  it('ranks and counts', () => {
    const pos = derivePositions(fixture.transactions)
    const m = topMovers(pos.closed, 5)
    expect(m.gainers[0].kod).toBe('ASTOR')       // +175 > +300? hayır: XAU +300 önce
    // düzeltme: XAU 300 > ASTOR 175
    expect(m.gainers[0].kod).toBe('XAU')
    const wl = winLoss(pos.closed)
    expect(wl.wins).toBe(2)
    expect(wl.losses).toBe(0)
    const st = positionStats(pos.closed)
    expect(st.win).toBe(2)
    expect(st.enBuyukKazanc).toBeCloseTo(300, 6)
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `derive.ts`'e agregaları ekle**

```ts
import type { Snapshot, Instrument } from './types'

export function allocation(open: OpenPosition[], keyOf: (kod: string) => string) {
  const groups = new Map<string, number>()
  for (const p of open) groups.set(keyOf(p.kod), (groups.get(keyOf(p.kod)) ?? 0) + p.toplamMaliyetUsd)
  const total = [...groups.values()].reduce((s, v) => s + v, 0) || 1
  return [...groups.entries()]
    .map(([key, tutarUsd]) => ({ key, tutarUsd, pay: tutarUsd / total }))
    .sort((a, b) => b.tutarUsd - a.tutarUsd)
}

export function allocationByClass(open: OpenPosition[], instruments: Instrument[]) {
  const cls = new Map(instruments.map((i) => [i.kod, i.sinif]))
  return allocation(open, (kod) => cls.get(kod) ?? '?')
}

export function allocationByPortfolio(open: OpenPosition[], txns: Transaction[]) {
  const last = new Map<string, { tarih: string; portfoy: string }>()
  for (const x of txns) {
    const prev = last.get(x.enstruman)
    if (!prev || x.tarih >= prev.tarih) last.set(x.enstruman, { tarih: x.tarih, portfoy: x.portfoy })
  }
  return allocation(open, (kod) => last.get(kod)?.portfoy ?? '?')
}

const BUCKET_EDGES = [
  -Infinity, -0.22, -0.20, -0.18, -0.16, -0.14, -0.12, -0.10, -0.08, -0.06, -0.04, -0.02,
  0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, Infinity,
]

export function gainBuckets(closed: ClosedPosition[]) {
  const buckets = BUCKET_EDGES.slice(0, -1).map((lo, i) => ({
    lo, hi: BUCKET_EDGES[i + 1],
    label: `${(lo * 100) | 0}%–${BUCKET_EDGES[i + 1] === Infinity ? '∞' : (BUCKET_EDGES[i + 1] * 100) | 0}%`,
    count: 0,
  }))
  for (const c of closed) {
    if (c.alisTutarUsd <= 0) continue
    const r = c.gerceklesmisKzUsd / c.alisTutarUsd
    const b = buckets.find((b) => r > b.lo && r <= b.hi) ?? buckets.at(-1)!
    b.count++
  }
  return buckets
}

function ym(iso: string) { return iso.slice(0, 7) }

export function periodPerformance(snapshots: Snapshot[], today = new Date()) {
  const s = [...snapshots].sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
  const yr = today.getFullYear()
  const inRange = (from: string, to: string) => s.filter((x) => x.tarih >= from && x.tarih <= to)
  const row = (period: string, list: Snapshot[]) => {
    const netKzUsd = list.reduce((sum, x) => sum + x.netKZ_usd, 0)
    const base = list[0]?.baslangicSermayesi_usd
    return { period, netKzUsd, pct: base ? netKzUsd / base : null }
  }
  const thisMonth = ym(today.toISOString())
  const q = (n: number) => inRange(`${yr}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`, `${yr}-${String(n * 3).padStart(2, '0')}-31`)
  return [
    row('Bu Ay', s.filter((x) => ym(x.tarih) === thisMonth)),
    row('Ç1', q(1)), row('Ç2', q(2)), row('Ç3', q(3)), row('Ç4', q(4)),
    row('YTD', inRange(`${yr}-01-01`, `${yr}-12-31`)),
    row('Önceki YTD', inRange(`${yr - 1}-01-01`, `${yr - 1}-12-31`)),
  ]
}

export function topMovers(closed: ClosedPosition[], n = 5) {
  const byKz = [...closed].sort((a, b) => b.gerceklesmisKzUsd - a.gerceklesmisKzUsd)
  return { gainers: byKz.slice(0, n), losers: [...byKz].reverse().slice(0, n) }
}

export function winLoss(closed: ClosedPosition[]) {
  let wins = 0, losses = 0, kazancToplam = 0, zararToplam = 0
  for (const c of closed) {
    if (c.gerceklesmisKzUsd > 0) { wins++; kazancToplam += c.gerceklesmisKzUsd }
    else if (c.gerceklesmisKzUsd < 0) { losses++; zararToplam += c.gerceklesmisKzUsd }
  }
  return { wins, losses, kazancToplam, zararToplam }
}

export function positionStats(closed: ClosedPosition[]) {
  const pcts = closed.filter((c) => c.alisTutarUsd > 0).map((c) => ({ c, r: c.gerceklesmisKzUsd / c.alisTutarUsd }))
  const wins = pcts.filter((p) => p.r > 0), losses = pcts.filter((p) => p.r < 0)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)
  const ortKazancPct = avg(wins.map((p) => p.r))
  const ortKayipPct = avg(losses.map((p) => p.r))
  return {
    win: wins.length, loss: losses.length,
    kazanmaOrani: pcts.length ? wins.length / pcts.length : 0,
    ortKazancPct, ortKayipPct,
    enBuyukKazanc: Math.max(0, ...closed.map((c) => c.gerceklesmisKzUsd)),
    enBuyukKayip: Math.min(0, ...closed.map((c) => c.gerceklesmisKzUsd)),
    riskOdul: ortKayipPct !== 0 ? Math.abs(ortKazancPct / ortKayipPct) : null,
  }
}
```

- [ ] **Step 4: Çalıştır — pass (test dosyasındaki yanlış ilk `expect(m.gainers[0].kod).toBe('ASTOR')` satırını sil, altındaki `'XAU'` doğru). Commit.**

```bash
git add app/src/lib/data/derive.ts app/src/lib/data/derive.test.ts
git commit -m "feat(app): derive aggregates — allocation, gain buckets, periods, movers, stats"
```

---

## Task 6: Grafik ilkelleri — `LineChart` + `Donut`

**Files:**
- Create: `app/src/lib/charts/scales.ts`, `app/src/lib/charts/scales.test.ts`
- Create: `app/src/lib/charts/LineChart.svelte`, `app/src/lib/charts/LineChart.test.ts`
- Create: `app/src/lib/charts/Donut.svelte`, `app/src/lib/charts/Donut.test.ts`

**Interfaces:**
- Produces:
  - `scales.ts`: `linePath(pts: [number, number][]): string` (d3-shape `line()`), `areaPath(pts, y0): string`, `arcs(values: number[], r: number, ir: number): { d: string; startAngle: number; endAngle: number }[]` (d3-shape `pie()` + `arc()`).
  - `LineChart.svelte` props: `series: { x: number; y: number }[]`, `width = 640`, `height = 200`, `pad = 24`. Bir `<svg>` içinde bir `<path class="line">` + `<path class="area">`. `data-testid="line"` path'inde `d` attribute.
  - `Donut.svelte` props: `slices: { label: string; value: number }[]`, `size = 180`, `thickness = 28`. Her dilim `<path data-slice="<label>" d="...">` + doğrudan etiket `<text>`.

- [ ] **Step 1: `scales.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { linePath, arcs } from './scales'

describe('linePath', () => {
  it('produces an SVG path through the points', () => {
    const d = linePath([[0, 0], [10, 10], [20, 0]])
    expect(d).toMatch(/^M0,0/)
    expect(d).toContain('10,10')
  })
})

describe('arcs', () => {
  it('one full circle for a single value', () => {
    const a = arcs([1], 90, 62)
    expect(a).toHaveLength(1)
    expect(a[0].endAngle - a[0].startAngle).toBeCloseTo(Math.PI * 2, 6)
  })
  it('splits proportionally', () => {
    const a = arcs([3, 1], 90, 62)
    expect((a[0].endAngle - a[0].startAngle) / (a[1].endAngle - a[1].startAngle)).toBeCloseTo(3, 6)
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `scales.ts`**

```ts
import { line, area, pie, arc } from 'd3-shape'

export function linePath(pts: [number, number][]): string {
  return line<[number, number]>().x((p) => p[0]).y((p) => p[1])(pts) ?? ''
}

export function areaPath(pts: [number, number][], y0: number): string {
  return area<[number, number]>().x((p) => p[0]).y0(y0).y1((p) => p[1])(pts) ?? ''
}

export function arcs(values: number[], r: number, ir: number) {
  const p = pie<number>().sort(null).value((v) => v)(values)
  const a = arc<any>().innerRadius(ir).outerRadius(r)
  return p.map((s) => ({ d: a(s) ?? '', startAngle: s.startAngle, endAngle: s.endAngle }))
}
```

- [ ] **Step 4: `LineChart.svelte`**

```svelte
<script lang="ts">
  import { scaleLinear } from 'd3-scale'
  import { linePath, areaPath } from './scales'

  let { series = [], width = 640, height = 200, pad = 24 } =
    $props<{ series: { x: number; y: number }[]; width?: number; height?: number; pad?: number }>()

  const xs = $derived(series.map((d) => d.x))
  const ys = $derived(series.map((d) => d.y))
  const sx = $derived(scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([pad, width - pad]))
  const sy = $derived(scaleLinear().domain([Math.min(...ys, 0), Math.max(...ys)]).range([height - pad, pad]))
  const pts = $derived(series.map((d) => [sx(d.x), sy(d.y)] as [number, number]))
</script>

<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="çizgi grafik">
  <path class="area" d={areaPath(pts, height - pad)} fill="var(--gain)" fill-opacity="0.08" />
  <path class="line" data-testid="line" d={linePath(pts)} fill="none" stroke="var(--gain)" stroke-width="1.25" />
</svg>
```

- [ ] **Step 5: `LineChart.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import LineChart from './LineChart.svelte'

describe('LineChart', () => {
  it('draws a path with as many points as the series', () => {
    const { getByTestId } = render(LineChart, {
      props: { series: [{ x: 0, y: 0 }, { x: 1, y: 10 }, { x: 2, y: 5 }], width: 100, height: 100, pad: 10 },
    })
    const d = getByTestId('line').getAttribute('d')!
    expect(d.split('L').length + (d.match(/^M/) ? 0 : 0)).toBe(3) // M + 2×L
    expect(d).toMatch(/^M10,/)                                    // sol kenar = pad
  })
})
```

- [ ] **Step 6: `Donut.svelte` + `Donut.test.ts`**

`Donut.svelte`:
```svelte
<script lang="ts">
  import { arcs } from './scales'
  let { slices = [], size = 180, thickness = 28 } =
    $props<{ slices: { label: string; value: number }[]; size?: number; thickness?: number }>()
  const r = $derived(size / 2)
  const parts = $derived(arcs(slices.map((s) => s.value), r, r - thickness))
  const palette = ['var(--gain)', 'var(--gold)', 'var(--loss)', 'var(--ink-soft)']
</script>

<svg viewBox={`${-r} ${-r} ${size} ${size}`} role="img" aria-label="halka grafik">
  {#each parts as p, i}
    <path data-slice={slices[i].label} d={p.d} fill={palette[i % palette.length]} />
  {/each}
</svg>
```

`Donut.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Donut from './Donut.svelte'

describe('Donut', () => {
  it('renders one path per slice, tagged by label', () => {
    const { container } = render(Donut, { props: { slices: [{ label: 'BIST', value: 3 }, { label: 'ALTIN', value: 1 }] } })
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('[data-slice="BIST"]')).toBeTruthy()
  })
})
```

- [ ] **Step 7: Çalıştır — pass. Commit.**

```bash
git add app/src/lib/charts/scales.ts app/src/lib/charts/scales.test.ts app/src/lib/charts/LineChart.svelte app/src/lib/charts/LineChart.test.ts app/src/lib/charts/Donut.svelte app/src/lib/charts/Donut.test.ts
git commit -m "feat(app): LineChart + Donut chart primitives (hand-drawn SVG)"
```

---

## Task 7: Grafik ilkelleri — `BarChart` + `Histogram`

**Files:**
- Create: `app/src/lib/charts/BarChart.svelte`, `app/src/lib/charts/BarChart.test.ts`
- Create: `app/src/lib/charts/Histogram.svelte`, `app/src/lib/charts/Histogram.test.ts`

**Interfaces:**
- Produces:
  - `BarChart.svelte` props: `bars: { label: string; value: number }[]`, `orient: 'h' | 'v' = 'v'`, `width = 640`, `height = 220`, `pad = 28`. Her bar `<rect data-bar="<label>" x y width height>`; pozitif `fill: var(--gain)`, negatif `fill: var(--loss)`.
  - `Histogram.svelte` props: `buckets: { label: string; count: number }[]`, `width = 640`, `height = 200`. Her kova `<rect data-bucket="<label>">`; sıfır sayımlı kovalar 0 yükseklik.

- [ ] **Step 1: `BarChart.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import BarChart from './BarChart.svelte'

describe('BarChart', () => {
  it('vertical: one rect per bar, sign-colored', () => {
    const { container } = render(BarChart, {
      props: { bars: [{ label: 'a', value: 10 }, { label: 'b', value: -4 }], width: 200, height: 100, pad: 10 },
    })
    const rects = container.querySelectorAll('rect')
    expect(rects).toHaveLength(2)
    expect(container.querySelector('[data-bar="a"]')!.getAttribute('fill')).toContain('--gain')
    expect(container.querySelector('[data-bar="b"]')!.getAttribute('fill')).toContain('--loss')
  })
  it('bar height is proportional to value', () => {
    const { container } = render(BarChart, {
      props: { bars: [{ label: 'a', value: 10 }, { label: 'b', value: 5 }], width: 200, height: 100, pad: 0 },
    })
    const [a, b] = [...container.querySelectorAll('rect')].map((r) => +r.getAttribute('height')!)
    expect(a / b).toBeCloseTo(2, 5)
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `BarChart.svelte`**

```svelte
<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale'
  let { bars = [], orient = 'v', width = 640, height = 220, pad = 28 } =
    $props<{ bars: { label: string; value: number }[]; orient?: 'h' | 'v'; width?: number; height?: number; pad?: number }>()

  const vals = $derived(bars.map((b) => b.value))
  const band = $derived(
    scaleBand<string>().domain(bars.map((b) => b.label)).range(orient === 'v' ? [pad, width - pad] : [pad, height - pad]).padding(0.3),
  )
  const lin = $derived(
    scaleLinear().domain([Math.min(0, ...vals), Math.max(0, ...vals)]).range(orient === 'v' ? [height - pad, pad] : [pad, width - pad]),
  )
  const zero = $derived(lin(0))
</script>

<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="bar grafik">
  {#each bars as b}
    {#if orient === 'v'}
      <rect data-bar={b.label} x={band(b.label)} width={band.bandwidth()}
        y={Math.min(zero, lin(b.value))} height={Math.abs(lin(b.value) - zero)}
        fill={b.value < 0 ? 'var(--loss)' : 'var(--gain)'} />
    {:else}
      <rect data-bar={b.label} y={band(b.label)} height={band.bandwidth()}
        x={Math.min(zero, lin(b.value))} width={Math.abs(lin(b.value) - zero)}
        fill={b.value < 0 ? 'var(--loss)' : 'var(--gain)'} />
    {/if}
  {/each}
</svg>
```

- [ ] **Step 4: `Histogram.svelte` + `Histogram.test.ts`**

`Histogram.svelte`:
```svelte
<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale'
  let { buckets = [], width = 640, height = 200, pad = 24 } =
    $props<{ buckets: { label: string; count: number }[]; width?: number; height?: number; pad?: number }>()
  const band = $derived(scaleBand<string>().domain(buckets.map((b) => b.label)).range([pad, width - pad]).padding(0.15))
  const y = $derived(scaleLinear().domain([0, Math.max(1, ...buckets.map((b) => b.count))]).range([height - pad, pad]))
</script>

<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="histogram">
  {#each buckets as b}
    <rect data-bucket={b.label} x={band(b.label)} width={band.bandwidth()}
      y={y(b.count)} height={height - pad - y(b.count)} fill="var(--ink-soft)" />
  {/each}
</svg>
```

`Histogram.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Histogram from './Histogram.svelte'

describe('Histogram', () => {
  it('zero-count buckets have zero height', () => {
    const { container } = render(Histogram, {
      props: { buckets: [{ label: 'a', count: 0 }, { label: 'b', count: 4 }], width: 100, height: 100, pad: 0 },
    })
    const [a, b] = [...container.querySelectorAll('rect')].map((r) => +r.getAttribute('height')!)
    expect(a).toBe(0)
    expect(b).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 5: Çalıştır — pass. Commit.**

```bash
git add app/src/lib/charts/BarChart.svelte app/src/lib/charts/BarChart.test.ts app/src/lib/charts/Histogram.svelte app/src/lib/charts/Histogram.test.ts
git commit -m "feat(app): BarChart + Histogram chart primitives"
```

---

## Task 8: UI ilkelleri

**Files:**
- Create: `app/src/lib/ui/KpiBand.svelte`, `SectionHeader.svelte`, `Rule.svelte`, `SourceStamp.svelte`, `EmptyState.svelte`, `ThemeToggle.svelte`, `DataTable.svelte`
- Create: `app/src/lib/ui/DataTable.test.ts`, `app/src/lib/ui/ThemeToggle.test.ts`

**Interfaces:**
- Produces:
  - `KpiBand.svelte` props: `items: { label: string; value: string; tone?: 'gain' | 'loss' | 'neutral' }[]`. `<dl>` içinde her biri `<div class="kpi"><dt>label</dt><dd class="num">value</dd></div>`.
  - `SectionHeader.svelte` props: `title: string`, `note?: string`. `<h2>` + isteğe bağlı `<span class="note">`.
  - `Rule.svelte` — `<hr class="hairline" />`.
  - `SourceStamp.svelte` props: `text: string`. `<span class="stamp num">{text}</span>`.
  - `EmptyState.svelte` props: `title: string`, `detail?: string`. Ortalanmış kutu.
  - `ThemeToggle.svelte` — light/dark/system arasında döner; `theme.setTheme` çağırır; aktif durumu `aria-pressed`/etiketle gösterir.
  - `DataTable.svelte` props: `columns: { key: string; label: string; align?: 'left' | 'right'; sortable?: boolean; fmt?: (v: any, row: any) => string }[]`, `rows: any[]`, `initialSort?: { key: string; dir: 'asc' | 'desc' }`, `onRowClick?: (row: any) => void`. Başlık tıklaması sıralar (sortable kolonlar); hücre `fmt` varsa onunla render eder.

- [ ] **Step 1: `DataTable.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import DataTable from './DataTable.svelte'

const columns = [
  { key: 'kod', label: 'Kod' },
  { key: 'n', label: 'N', align: 'right' as const, sortable: true, fmt: (v: number) => v.toFixed(1) },
]
const rows = [{ kod: 'B', n: 2 }, { kod: 'A', n: 10 }, { kod: 'C', n: 5 }]

describe('DataTable', () => {
  it('renders rows with fmt applied', () => {
    const { getAllByRole } = render(DataTable, { props: { columns, rows } })
    expect(getAllByRole('row')).toHaveLength(4) // header + 3
    expect(document.body.textContent).toContain('2.0')
  })
  it('sorts on sortable header click', async () => {
    const { getByText, getAllByRole } = render(DataTable, { props: { columns, rows } })
    await fireEvent.click(getByText('N'))
    const firstDataRow = getAllByRole('row')[1].textContent!
    expect(firstDataRow).toContain('B') // n=2 en küçük, asc
    await fireEvent.click(getByText('N'))
    expect(getAllByRole('row')[1].textContent).toContain('A') // n=10, desc
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `DataTable.svelte`**

```svelte
<script lang="ts">
  type Col = { key: string; label: string; align?: 'left' | 'right'; sortable?: boolean; fmt?: (v: any, row: any) => string }
  let { columns = [], rows = [], initialSort = undefined, onRowClick = undefined } =
    $props<{ columns: Col[]; rows: any[]; initialSort?: { key: string; dir: 'asc' | 'desc' }; onRowClick?: (r: any) => void }>()

  let sort = $state(initialSort ?? null)
  const sorted = $derived.by(() => {
    if (!sort) return rows
    const { key, dir } = sort
    return [...rows].sort((a, b) => {
      const x = a[key], y = b[key]
      const c = x < y ? -1 : x > y ? 1 : 0
      return dir === 'asc' ? c : -c
    })
  })
  function toggle(col: Col) {
    if (!col.sortable) return
    sort = sort?.key === col.key ? { key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
  }
</script>

<table>
  <thead><tr>
    {#each columns as col}
      <th style:text-align={col.align ?? 'left'} class:sortable={col.sortable}
        aria-sort={sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onclick={() => toggle(col)}>{col.label}</th>
    {/each}
  </tr></thead>
  <tbody>
    {#each sorted as row}
      <tr onclick={() => onRowClick?.(row)} class:clickable={!!onRowClick}>
        {#each columns as col}
          <td style:text-align={col.align ?? 'left'} class:num={col.align === 'right'}>
            {col.fmt ? col.fmt(row[col.key], row) : row[col.key]}
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
```

- [ ] **Step 4: `ThemeToggle.svelte` + `ThemeToggle.test.ts`**

`ThemeToggle.svelte`:
```svelte
<script lang="ts">
  import { getTheme, setTheme, type Theme } from '../theme'
  let current = $state<Theme>(getTheme())
  const order: Theme[] = ['system', 'light', 'dark']
  const labels: Record<Theme, string> = { system: 'Sistem', light: 'Açık', dark: 'Koyu' }
  function cycle() {
    current = order[(order.indexOf(current) + 1) % order.length]
    setTheme(current)
  }
</script>

<button type="button" onclick={cycle} aria-label={`Tema: ${labels[current]}`}>{labels[current]}</button>
```

`ThemeToggle.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import ThemeToggle from './ThemeToggle.svelte'

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme') })

describe('ThemeToggle', () => {
  it('cycles system -> light -> dark and stamps the root', async () => {
    const { getByRole } = render(ThemeToggle)
    const btn = getByRole('button')
    await fireEvent.click(btn) // light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    await fireEvent.click(btn) // dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('bbb-theme')).toBe('dark')
  })
})
```

- [ ] **Step 5: Kalan sunum bileşenleri** (`KpiBand`, `SectionHeader`, `Rule`, `SourceStamp`, `EmptyState`) — yukarıdaki Produces bloğundaki minimal işaretleme; her biri `app.css` token'larını kullanır (kısa CSS bileşen içinde `<style>`). Bunlar için ayrı test yok (saf sunum); Task 11–13 sayfa testleri dolaylı kapsar.

- [ ] **Step 6: Çalıştır — pass. Commit.**

```bash
git add app/src/lib/ui/
git commit -m "feat(app): UI primitives — DataTable, ThemeToggle, KpiBand, stamps"
```

---

## Task 9: Router + App kabuğu + gezinme

**Files:**
- Create: `app/src/router.ts`, `app/src/router.test.ts`
- Modify: `app/src/App.svelte`
- Create: `app/src/routes/Panorama.svelte`, `app/src/routes/Pozisyonlar.svelte`, `app/src/routes/AylikRapor.svelte` (stub — sadece `<SectionHeader>` başlık)

**Interfaces:**
- Produces:
  - `router.ts`: `type Route = 'panorama' | 'pozisyonlar' | 'aylik'`; `currentRoute(): Route` (hash'ten; bilinmeyen → `'panorama'`); `ROUTES: { id: Route; path: string; label: string }[]`; `onRouteChange(cb: (r: Route) => void): () => void` (hashchange dinler, unsub döner).
  - `App.svelte`: üstte akan başlık (aktif sayfa başlığı + `SourceStamp` yer tutucu + `ThemeToggle`), altta/yanda gezinme (3 link, aktif olan işaretli), ortada aktif rota bileşeni.

- [ ] **Step 1: `router.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { currentRoute, ROUTES } from './router'

beforeEach(() => { location.hash = '' })

describe('router', () => {
  it('defaults to panorama', () => expect(currentRoute()).toBe('panorama'))
  it('maps known hashes', () => {
    location.hash = '#/pozisyonlar'; expect(currentRoute()).toBe('pozisyonlar')
    location.hash = '#/aylik'; expect(currentRoute()).toBe('aylik')
  })
  it('unknown hash -> panorama', () => { location.hash = '#/zzz'; expect(currentRoute()).toBe('panorama') })
  it('exposes 3 routes', () => expect(ROUTES.map((r) => r.id)).toEqual(['panorama', 'pozisyonlar', 'aylik']))
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `router.ts`**

```ts
export type Route = 'panorama' | 'pozisyonlar' | 'aylik'

export const ROUTES: { id: Route; path: string; label: string }[] = [
  { id: 'panorama', path: '#/', label: 'Panorama' },
  { id: 'pozisyonlar', path: '#/pozisyonlar', label: 'Pozisyonlar' },
  { id: 'aylik', path: '#/aylik', label: 'Aylık' },
]

export function currentRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  return (['pozisyonlar', 'aylik'] as const).find((r) => r === h) ?? 'panorama'
}

export function onRouteChange(cb: (r: Route) => void): () => void {
  const h = () => cb(currentRoute())
  addEventListener('hashchange', h)
  return () => removeEventListener('hashchange', h)
}
```

- [ ] **Step 4: `App.svelte` + stub sayfalar**

`App.svelte` (Task 10'da veri bağlanacak — şimdilik yalnız iskelet):
```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { currentRoute, onRouteChange, ROUTES, type Route } from './router'
  import ThemeToggle from './lib/ui/ThemeToggle.svelte'
  import Panorama from './routes/Panorama.svelte'
  import Pozisyonlar from './routes/Pozisyonlar.svelte'
  import AylikRapor from './routes/AylikRapor.svelte'

  let route = $state<Route>(currentRoute())
  onMount(() => onRouteChange((r) => (route = r)))
  const pages = { panorama: Panorama, pozisyonlar: Pozisyonlar, aylik: AylikRapor }
  const Active = $derived(pages[route])
  const title = $derived(ROUTES.find((r) => r.id === route)!.label)
</script>

<header class="running">
  <strong>{title}</strong>
  <span class="stamp num" data-testid="source-stamp">—</span>
  <ThemeToggle />
</header>

<Active />

<nav class="tabs">
  {#each ROUTES as r}
    <a href={r.path} class:active={r.id === route}>{r.label}</a>
  {/each}
</nav>

<style>
  .running { display: flex; gap: 1rem; align-items: baseline; padding: 1rem 1.25rem; border-bottom: 1px solid var(--hairline); }
  .running strong { font-size: 1.1rem; }
  .stamp { margin-left: auto; color: var(--ink-soft); font-size: 0.8rem; }
  .tabs { position: sticky; bottom: 0; display: flex; border-top: 1px solid var(--hairline); background: var(--surface); }
  .tabs a { flex: 1; text-align: center; padding: 0.9rem; color: var(--ink-soft); text-decoration: none; }
  .tabs a.active { color: var(--ink); box-shadow: inset 0 2px 0 var(--gold); }
  @media (min-width: 900px) {
    .tabs { position: fixed; left: 0; top: 0; bottom: 0; flex-direction: column; width: 180px; border-top: 0; border-right: 1px solid var(--hairline); }
    :global(body) { padding-left: 180px; }
  }
</style>
```

`routes/Panorama.svelte` (stub):
```svelte
<script lang="ts">
  import SectionHeader from '../lib/ui/SectionHeader.svelte'
</script>
<SectionHeader title="Panorama" />
```
(`Pozisyonlar.svelte`, `AylikRapor.svelte` aynı biçim, kendi başlıklarıyla.)

- [ ] **Step 5: Çalıştır — router testi pass, `npm run build` temiz. Commit.**

```bash
git add app/src/router.ts app/src/router.test.ts app/src/App.svelte app/src/routes/
git commit -m "feat(app): hash router + app shell with responsive nav"
```

---

## Task 10: Veri deposu (`store.ts`) + bootstrap

**Files:**
- Create: `app/src/lib/data/store.ts`, `app/src/lib/data/store.test.ts`
- Modify: `app/src/App.svelte` (deposu bağla, yükleniyor/hata/EmptyState)

**Interfaces:**
- Consumes: `DataSource`, `LocalFileSource`, `derivePositions` + agregalar, `describeSource`.
- Produces:
  - `store.ts`: `pickSource(): DataSource` — `?source=drive` param'ı veya `localStorage['bbb-source']` `'drive'` ise `DriveSource` (Task 15'e kadar `LocalFileSource`'a düş — geçici `throw`'suz stub), aksi `LocalFileSource`. `createAppStore()` → Svelte `readable`/`writable` combosu: `{ status: 'loading' | 'ready' | 'error', dataset?: Dataset, derived?: DerivedBundle, error?: string, sourceText?: string }`. `DerivedBundle = { positions: ReturnType<typeof derivePositions>, byClass, byPortfolio, buckets, periods, movers, winLoss, stats }`.
  - `load(store, source)` — `source.load()` → başarı: `dataset` + tüm türetmeler + `describeSource` → `status: 'ready'`; hata: `status: 'error', error: e.message`.

- [ ] **Step 1: `store.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'
import { createAppStore, load } from './store'
import { fixture } from '../../fixtures/dataset'
import type { DataSource } from './source'

const okSource: DataSource = { id: 'local', load: () => Promise.resolve(fixture) }
const badSource: DataSource = { id: 'local', load: () => Promise.reject(new Error('data/meta.json okunamadı (404)')) }

describe('app store', () => {
  it('loads and derives', async () => {
    const s = createAppStore()
    await load(s, okSource)
    const v = get(s)
    expect(v.status).toBe('ready')
    expect(v.derived!.positions.realizedTotalUsd).toBeCloseTo(475, 6) // 175 + 300
    expect(v.sourceText).toContain('local')
  })
  it('captures load errors', async () => {
    const s = createAppStore()
    await load(s, badSource)
    const v = get(s)
    expect(v.status).toBe('error')
    expect(v.error).toMatch(/okunamadı/)
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `store.ts`**

```ts
import { writable, type Writable } from 'svelte/store'
import type { Dataset } from './types'
import type { DataSource } from './source'
import { describeSource } from './source'
import { LocalFileSource } from './local'
import {
  derivePositions, allocationByClass, allocationByPortfolio, gainBuckets,
  periodPerformance, topMovers, winLoss, positionStats,
} from './derive'

export type DerivedBundle = ReturnType<typeof deriveAll>
export interface AppState {
  status: 'loading' | 'ready' | 'error'
  dataset?: Dataset
  derived?: DerivedBundle
  error?: string
  sourceText?: string
}

function deriveAll(ds: Dataset) {
  const positions = derivePositions(ds.transactions)
  return {
    positions,
    byClass: allocationByClass(positions.open, ds.instruments),
    byPortfolio: allocationByPortfolio(positions.open, ds.transactions),
    buckets: gainBuckets(positions.closed),
    periods: periodPerformance(ds.snapshots),
    movers: topMovers(positions.closed),
    winLoss: winLoss(positions.closed),
    stats: positionStats(positions.closed),
  }
}

export function createAppStore(): Writable<AppState> {
  return writable<AppState>({ status: 'loading' })
}

export async function load(store: Writable<AppState>, source: DataSource): Promise<void> {
  store.set({ status: 'loading' })
  try {
    const dataset = await source.load()
    store.set({
      status: 'ready',
      dataset,
      derived: deriveAll(dataset),
      sourceText: describeSource(source, dataset.meta),
    })
  } catch (e) {
    store.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

export function pickSource(): DataSource {
  try {
    const p = new URLSearchParams(location.search).get('source')
    const pref = p ?? localStorage.getItem('bbb-source')
    if (pref === 'drive') return new LocalFileSource() // Task 15'te DriveSource ile değişecek
  } catch {}
  return new LocalFileSource()
}
```

- [ ] **Step 4: `App.svelte`'i depoya bağla**

`onMount` içinde: `const store = createAppStore(); load(store, pickSource())`. Şablonda `{#if $store.status === 'loading'}` bir yükleniyor satırı, `{:else if $store.status === 'error'}` `<EmptyState title="Veri yüklenemedi" detail={$store.error} />`, `{:else}` `<Active dataset={$store.dataset} derived={$store.derived} />` ve `SourceStamp`'a `$store.sourceText`. Sayfa bileşenleri `dataset` + `derived` prop'u alır.

- [ ] **Step 5: Çalıştır — store testi pass, `npm run build` temiz. Commit.**

```bash
git add app/src/lib/data/store.ts app/src/lib/data/store.test.ts app/src/App.svelte
git commit -m "feat(app): app store — pick source, load, derive, error state"
```

---

## Task 11: Panorama sayfası

**Files:**
- Modify: `app/src/routes/Panorama.svelte`
- Create: `app/src/routes/Panorama.test.ts`

**Interfaces:**
- Consumes: `dataset: Dataset`, `derived: DerivedBundle` (props), `format.*`, `KpiBand`, `SectionHeader`, `LineChart`, `Donut`, `Histogram`, `BarChart`, `DataTable`.
- Produces: tam Panorama (spec §5.1).

- [ ] **Step 1: `Panorama.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Panorama from './Panorama.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function derived() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Panorama', () => {
  it('shows KPI band with realized profit and equity', async () => {
    const v = await derived()
    const { getByText, container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(getByText('Gerçekleşmiş Kâr')).toBeInTheDocument()
    expect(container.textContent).toContain('$475.00')       // 175 + 300
    expect(container.textContent).toContain('$5,475.00')      // son snapshot toplamOzkaynak
    expect(container.textContent).toMatch(/son bilinen/i)
  })
  it('renders each chart once', async () => {
    const v = await derived()
    const { container } = render(Panorama, { props: { dataset: v.dataset, derived: v.derived } })
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5)
    expect(container.querySelector('[data-testid="line"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `Panorama.svelte`** — KPI şeridi (`Toplam Özkaynak` = son `snapshots.toplamOzkaynak_usd`; `Gerçekleşmiş Kâr` = `derived.positions.realizedTotalUsd`; `Nakit` = `Σ meta.nakitHesapBazli`; `YTD K/Z` = `derived.periods` içindeki `YTD`; `İşlem` = `dataset.transactions.length`), her biri `usd()`/sayı ile; `SectionHeader title="Panorama" note="son bilinen — {dateShort(meta.olusturulma)}"`; `LineChart` (`snapshots` → `{x: idx, y: toplamOzkaynak_usd}`); `Donut` ×2 (`derived.byClass`, `derived.byPortfolio` → `{label: key, value: tutarUsd}`); `Donut` ×2 küçük (win/loss sayıları; kazanç/zarar toplamı); `Histogram` (`derived.buckets`); `BarChart` yatay (`derived.movers.gainers` + `losers` birleşik, `{label: kod, value: gerceklesmisKzUsd}`); `DataTable` (`derived.periods`, kolonlar: Dönem / K-Z (usd, sign) / % (pct)).

- [ ] **Step 4: Çalıştır — pass. `npm run build` temiz. Commit.**

```bash
git add app/src/routes/Panorama.svelte app/src/routes/Panorama.test.ts
git commit -m "feat(app): Panorama page"
```

---

## Task 12: Pozisyonlar sayfası

**Files:**
- Modify: `app/src/routes/Pozisyonlar.svelte`
- Create: `app/src/routes/Pozisyonlar.test.ts`

**Interfaces:**
- Consumes: `dataset`, `derived`, `DataTable`, `SectionHeader`, `format.*`, `DASH`.
- Produces: tam Pozisyonlar (spec §5.2). Açık tablo kolonları: Hisse · Sınıf · Portföy · Lot (num) · Ort. Maliyet (usd) · Toplam Maliyet (usd) · Maliyet Payı % (pct) · Güncel Fiyat (`DASH` sabit) · Gerçekleşmemiş K/Z (`DASH` sabit) · Seviye (varsa `instruments.seviyeler` → `"D 60 / R 90 / H 110"`, yoksa `DASH`). Filtre: sınıf / portföy / hesap `<select>`'leri. Kapalı tablo: Hisse · Alış Ort. · Alış Tutarı · Satış Ort. · Satış Tutarı · Gerçekleşmiş K/Z (usd, sign) · % (pct). İstatistik başlığı: `derived.stats`.

- [ ] **Step 1: `Pozisyonlar.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Pozisyonlar from './Pozisyonlar.svelte'
import { fixture } from '../fixtures/dataset'
import { createAppStore, load } from '../lib/data/store'
import { get } from 'svelte/store'

async function v() {
  const s = createAppStore()
  await load(s, { id: 'local', load: () => Promise.resolve(fixture) })
  return get(s)
}

describe('Pozisyonlar', () => {
  it('lists open positions with — placeholders and level badge', async () => {
    const d = await v()
    const { container, getByText } = render(Pozisyonlar, { props: { dataset: d.dataset, derived: d.derived } })
    expect(getByText('ASTOR')).toBeInTheDocument()
    expect(getByText('THYAO')).toBeInTheDocument()
    expect(container.textContent).not.toContain('XAU')      // tam çıkış -> açıkta yok
    expect(container.textContent).toContain('—')            // güncel fiyat / gerçekleşmemiş K/Z
  })
  it('closed table shows realized P/L', async () => {
    const d = await v()
    const { getByText } = render(Pozisyonlar, { props: { dataset: d.dataset, derived: d.derived } })
    expect(getByText('XAU')).toBeInTheDocument()            // kapalı tabloda
    expect(getByText(/\+\$300\.00/)).toBeInTheDocument()
  })
  it('class filter narrows the open table', async () => {
    const d = await v()
    const { getByLabelText, container } = render(Pozisyonlar, { props: { dataset: d.dataset, derived: d.derived } })
    await fireEvent.change(getByLabelText('Sınıf'), { target: { value: 'ALTIN' } })
    expect(container.querySelector('tbody')!.textContent).not.toContain('ASTOR')
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `Pozisyonlar.svelte`** — açık pozisyonları `derived.positions.open`'dan; her satıra `sinif` (`instruments`'tan), `portfoy` (`allocationByPortfolio` mantığı ya da son işlem), maliyet payı (`p.toplamMaliyetUsd / Σ`). Filtre state'i `$state`, `$derived` ile satırları daralt. Kapalı: `derived.positions.closed`, `% = gerceklesmisKzUsd / alisTutarUsd`. İstatistik başlığı `derived.stats` → `KpiBand` benzeri küçük ızgara.

- [ ] **Step 4: Çalıştır — pass. `npm run build` temiz. Commit.**

```bash
git add app/src/routes/Pozisyonlar.svelte app/src/routes/Pozisyonlar.test.ts
git commit -m "feat(app): Pozisyonlar page — open/closed tables, filters, stats"
```

---

## Task 13: Aylık Rapor sayfası

**Files:**
- Modify: `app/src/routes/AylikRapor.svelte`
- Create: `app/src/routes/AylikRapor.test.ts`

**Interfaces:**
- Consumes: `dataset`, `DataTable`, `BarChart`, `LineChart`, `format.*`.
- Produces: tam Aylık Rapor (spec §5.3). Tablo (124 satır, en yeni üstte) kolonları: Ay (`monthLabel`) · Başlangıç Sermaye · Net Mevduat/Çekim · Kazanç · Kayıp · Nakit Temettü · Dönem Sonu · Vergi & Komisyon · % Getiri (`netKZ_usd / baslangicSermayesi_usd`, `baslangicSermayesi_usd` null/0 → `DASH`). Satır tıklaması `selectedMonth` state'ini set eder → seçili ay kartı. Bar grafiği: aylık `{label: monthLabel, value: netKZ_usd}`. Çizgi: aylık `toplamOzkaynak_usd`.

- [ ] **Step 1: `AylikRapor.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import AylikRapor from './AylikRapor.svelte'
import { fixture } from '../fixtures/dataset'

describe('AylikRapor', () => {
  it('renders one row per snapshot, newest first', () => {
    const { getAllByRole } = render(AylikRapor, { props: { dataset: fixture } })
    const rows = getAllByRole('row')
    expect(rows).toHaveLength(1 + fixture.snapshots.length)
    expect(rows[1].textContent).toContain('Oca 2024')   // en yeni
  })
  it('% getiri is — when baslangicSermayesi is 0/null', () => {
    const ds = structuredClone(fixture)
    ds.snapshots[0].baslangicSermayesi_usd = null
    const { container } = render(AylikRapor, { props: { dataset: ds } })
    expect(container.textContent).toContain('—')
  })
  it('clicking a row updates the selected-month card', async () => {
    const { getAllByRole, getByTestId } = render(AylikRapor, { props: { dataset: fixture } })
    await fireEvent.click(getAllByRole('row')[2])           // 2021-03
    expect(getByTestId('month-card').textContent).toContain('Mar 2021')
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `AylikRapor.svelte`** — `rows = [...dataset.snapshots].sort desc`; `DataTable` + `onRowClick`; `selectedMonth = $state(rows[0])`; kart `data-testid="month-card"`; `BarChart` + `LineChart` yukarıdaki gibi.

- [ ] **Step 4: Çalıştır — pass. `npm run build` temiz. Commit.**

```bash
git add app/src/routes/AylikRapor.svelte app/src/routes/AylikRapor.test.ts
git commit -m "feat(app): Aylık Rapor page — monthly table, selected-month card, charts"
```

---

## Task 14: PWA kabuğu (manifest + service worker)

**Files:**
- Modify: `app/vite.config.ts` (`VitePWA` eklentisi)
- Create: `app/public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (basit — bir script veya elle üretilmiş düz renk + "BBB")
- Create: `app/src/lib/pwa.test.ts`

**Interfaces:**
- Produces: `npm run build` → `dist/manifest.webmanifest` + `dist/sw.js`; SW yalnız uygulama kabuğunu precache eder; `data/` ve Google alan adları **NetworkOnly** (önbelleğe alınmaz).

- [ ] **Step 1: ikonlar** — `app/public/icons/` altına 3 PNG. Basit üretim (Node script `app/scripts/make-icons.mjs`, `canvas` bağımlılığı istemeden bir SVG'yi `sharp` ile... — bağımlılık şişmesini önlemek için: elle hazırlanmış 512×512 koyu zemin + oküra "BBB" PNG'yi commit et; 192 ve maskable onun ölçeklenmişi). Deterministik olması gerekmez, sadece geçerli PNG.

- [ ] **Step 2: `vite.config.ts`'e `VitePWA`**

```ts
import { VitePWA } from 'vite-plugin-pwa'
// plugins: [svelte(), VitePWA({ ... })]
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['icons/*.png'],
  manifest: {
    name: 'BBB Tracker', short_name: 'BBB', lang: 'tr',
    theme_color: '#17161c', background_color: '#17161c', display: 'standalone', start_url: './',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    navigateFallback: 'index.html',
    runtimeCaching: [
      { urlPattern: /\/data\/.*\.json$/, handler: 'NetworkOnly' },
      { urlPattern: /^https:\/\/(www\.googleapis\.com|accounts\.google\.com|apis\.google\.com)\//, handler: 'NetworkOnly' },
    ],
  },
})
```

- [ ] **Step 3: `pwa.test.ts`** — `npm run build`'i çalıştırmak testte pahalı; bunun yerine config'i içe aktarıp assert et:

```ts
import { describe, it, expect } from 'vitest'
import config from '../../vite.config'

describe('PWA config', () => {
  it('excludes data/ and google from precache', () => {
    const cfg = typeof config === 'function' ? (config as any)({ command: 'build', mode: 'production' }) : config
    const pwa = (cfg.plugins.flat().find((p: any) => p?.name?.includes('pwa')) ?? {}) as any
    // eklenti örneği yerine, manifest/workbox'ı ayrı bir modüle çıkarıp onu test etmek daha temiz:
    expect(true).toBe(true)
  })
})
```

Daha temiz: manifest + workbox ayarlarını `app/pwa.config.ts`'e taşı, `vite.config.ts` onu içe aktarsın, test `pwa.config.ts`'i doğrulasın:

```ts
// app/pwa.config.ts
export const manifest = { /* yukarıdaki */ }
export const workbox = { /* yukarıdaki */ }
```

```ts
// app/src/lib/pwa.test.ts
import { workbox, manifest } from '../../pwa.config'
it('data json is NetworkOnly', () => {
  const rule = workbox.runtimeCaching.find((r) => String(r.urlPattern).includes('data'))
  expect(rule?.handler).toBe('NetworkOnly')
})
it('manifest is standalone + tr', () => {
  expect(manifest.display).toBe('standalone')
  expect(manifest.lang).toBe('tr')
})
```

- [ ] **Step 4: `npm run build` → `dist/sw.js` + `dist/manifest.webmanifest` var mı elle doğrula; `npm test` pass. Commit.**

```bash
git add app/vite.config.ts app/pwa.config.ts app/public/icons/ app/src/lib/pwa.test.ts
git commit -m "feat(app): PWA shell — manifest, service worker (app-shell only, data NetworkOnly)"
```

---

## Task 15: Drive adaptörü + kaynak seçici

**Files:**
- Create: `app/src/lib/data/drive.ts`, `app/src/lib/data/drive.test.ts`
- Create: `app/src/lib/ui/ConnectDrive.svelte`
- Modify: `app/src/lib/data/store.ts` (`pickSource` → gerçek `DriveSource`), `app/src/App.svelte` (bağlan ekranı + kaynak seçici), `app/.env.example`, `app/index.html` (GIS + Picker script'leri)

**Interfaces:**
- Consumes: `DataSource`, `Dataset`, `types`.
- Produces:
  - `drive.ts`: `class DriveSource implements DataSource` — `id = 'drive'`. `connect(): Promise<void>` (GIS token client, scope `drive.file`; token'ı bellekte tut). `chooseFolder(): Promise<string>` (Google Picker, klasör seç, id'yi döndür + `localStorage['bbb-drive-folder']`). `load(): Promise<Dataset>` — klasör id'siyle `files.list?q='<id>' in parents and mimeType='application/json'` + her biri `files.get?alt=media` → 8 dosyayı `Dataset`'e. Token yoksa `throw new NeedsAuthError()`. Bağımlılıklar `window.google` (script `index.html`'de) — test'te `vi.stubGlobal('google', ...)`.
  - `NeedsAuthError extends Error`.
  - `ConnectDrive.svelte` — tam ekran; "Google ile bağlan" butonu → `source.connect()` → `source.chooseFolder()` → başarıda `onConnected()` callback.

- [ ] **Step 1: `drive.test.ts` (mock'lu)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DriveSource, NeedsAuthError } from './drive'
import { fixture } from '../../fixtures/dataset'

const FILE_MAP: Record<string, unknown> = {
  transactions: fixture.transactions, cashflows: fixture.cashflows, snapshots: fixture.snapshots,
  instruments: fixture.instruments, brokers: fixture.brokers, portfolios: fixture.portfolios,
  meta: fixture.meta, fxrates: fixture.fxrates,
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('google', {
    accounts: { oauth2: { initTokenClient: ({ callback }: any) => ({ requestAccessToken: () => callback({ access_token: 'tok' }) }) } },
  })
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('files?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: Object.keys(FILE_MAP).map((n) => ({ id: n, name: `${n}.json` })) }) })
    }
    const id = url.match(/files\/(\w+)/)![1]
    return Promise.resolve({ ok: true, json: () => Promise.resolve(FILE_MAP[id]) })
  }))
})

describe('DriveSource', () => {
  it('load throws NeedsAuthError before connect', async () => {
    await expect(new DriveSource('CID').load()).rejects.toBeInstanceOf(NeedsAuthError)
  })
  it('after connect + folder, load assembles a Dataset', async () => {
    const s = new DriveSource('CID')
    await s.connect()
    ;(s as any).folderId = 'FOLDER'
    const ds = await s.load()
    expect(ds.transactions).toHaveLength(6)
    expect(ds.meta.olusturulma).toBe('2026-09-03T16:24:37')
  })
})
```

- [ ] **Step 2: Çalıştır — fail.**

- [ ] **Step 3: `drive.ts`** — yukarıdaki Produces bloğu; `NAMES` sabiti `local.ts` ile aynı (ortak bir `NAMES` sabitini `source.ts`'e taşı ve ikisi de import etsin — DRY). `load()` içinde: token yoksa `throw new NeedsAuthError()`; `folderId` yoksa `throw new NeedsAuthError('klasör seçilmedi')`; `files.list` + `Promise.all(files.map(f => fetch(get?alt=media).json()))` → dosya adını `.json`'sız anahtara indir → `Object.fromEntries`.

- [ ] **Step 4: `ConnectDrive.svelte`** + `App.svelte` entegrasyonu — `pickSource()` `drive` döndürdüğünde ve `$store.status === 'error'` + hata `NeedsAuthError` ise `<ConnectDrive source={...} onConnected={() => load(store, source)} />`. Başlıkta küçük bir kaynak seçici (`local` / `Drive`) → seçim `localStorage['bbb-source']` + reload.

- [ ] **Step 5: `index.html`'e script'ler** — `<script src="https://accounts.google.com/gsi/client" async></script>` ve `<script src="https://apis.google.com/js/api.js" async></script>`. `.env.example`: `VITE_GOOGLE_CLIENT_ID=`.

- [ ] **Step 6: `store.ts` `pickSource`** — `drive` tercihinde `new DriveSource(import.meta.env.VITE_GOOGLE_CLIENT_ID)`; `client_id` yoksa `LocalFileSource`'a düş + konsola uyarı.

- [ ] **Step 7: Çalıştır — `drive.test.ts` + tüm suite pass; `npm run build` temiz (env yokken de build olur). Commit.**

```bash
git add app/src/lib/data/drive.ts app/src/lib/data/drive.test.ts app/src/lib/ui/ConnectDrive.svelte app/src/lib/data/store.ts app/src/App.svelte app/.env.example app/index.html app/src/lib/data/source.ts
git commit -m "feat(app): Drive data source — GIS OAuth (drive.file) + Picker folder + read"
```

---

## Task 16: GitHub Pages deploy + uçtan uca

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `app/vite.config.ts` (`base`), `app/pwa.config.ts` (`start_url`/`scope`)
- Create: `app/README.md`

**Interfaces:**
- Produces: `main`'e push → `app/` build → GitHub Pages'e deploy. `app/README.md`: geliştirme, build, yerel `data/` gereği, Enis'in yapması gereken adımlar (GitHub deposu, Pages'i açma, Google Cloud OAuth).

- [ ] **Step 1: `app/README.md`** — şu bölümlerle: **Geliştirme** (`cd app && npm install && npm run dev`; `data/` klasörü repoda gitignore — `cd migration && .venv/bin/python -m bbb_migration ... --out ../data` ile üret). **Test** (`npm test`). **Yayın**: `main`'e push otomatik deploy eder. **Enis'in bir kerelik kurulumu**:
  1. GitHub deposu: `gh repo create bbb-tracker --private=false --source=. --push` (ya da web'den repo aç + `git remote add origin ... && git push -u origin main`). *Not: `gh` kurulu değil — `brew install gh` veya web arayüzü.*
  2. Repo → Settings → Pages → Source: "GitHub Actions".
  3. Google Cloud Console → yeni proje → "APIs & Services" → OAuth consent screen → External → uygulama adı/e-posta → Scopes'a `.../auth/drive.file` ekle → "Publish app" (production; `drive.file` doğrulama gerektirmez, ilk girişte "doğrulanmamış" uyarısı "Gelişmiş → devam et" ile geçilir). Credentials → "OAuth client ID" → Web application → Authorized JavaScript origins: `https://<kullanıcı>.github.io` → client ID'yi kopyala.
  4. Repo → Settings → Secrets and variables → Actions → Variables → `VITE_GOOGLE_CLIENT_ID` = kopyalanan id. (Workflow bunu build env'ine geçirir.)
  5. Drive'da `BBB/` adlı bir klasör aç, `migration` çıktısındaki 8 JSON'u içine yükle.
  6. `https://<kullanıcı>.github.io/bbb-tracker/` → aç → tema/gezinme çalışır → kaynak seçici "Drive" → "Google ile bağlan" → `BBB/` klasörünü seç → dashboard dolu gelir. Telefonda aynı URL → "Ana ekrana ekle".

- [ ] **Step 2: `pages.yml`**

```yaml
name: Deploy dashboard to Pages
on:
  push:
    branches: [main]
    paths: ['app/**', '.github/workflows/pages.yml']
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: app } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: app/package-lock.json }
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: app/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: `vite.config.ts` `base`** — `base: process.env.GITHUB_ACTIONS ? '/bbb-tracker/' : './'` (repo adı Enis'in seçimine göre; README'de repo adı `bbb-tracker` varsayıldı — farklıysa burada ve README'de güncelle). `pwa.config.ts` `manifest.start_url` ve `scope`'u `'./'` bırak (görece).

- [ ] **Step 4: Doğrulama (kontrolörün yapabileceği kısım)** — `cd app && npm ci && npm test && npm run build` temiz; `dist/index.html` içindeki varlık yolları `./` göreli. `git status` → `data/` yok.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml app/vite.config.ts app/pwa.config.ts app/README.md
git commit -m "feat(app): GitHub Pages deploy workflow + setup docs"
```

- [ ] **Step 6: Enis'e devir** — Kontrolör, README'nin "Enis'in bir kerelik kurulumu" adımlarını Enis'e iletir. Enis 1–5'i yaptıktan sonra ilk push deploy'u tetikler; 6. adımda telefonda doğrular. Bu adım plan yürütmesinin dışında, Enis'e bağlı.

---

## Self-Review

**1. Spec coverage**

| Spec bölümü | Görev |
|---|---|
| §1 salt-okunur, 3 sayfa, sanat yönü | Task 2 (tema), 9 (kabuk), 11–13 (sayfalar) |
| §1 veri kaynağı soyutlaması | Task 3 (arayüz + local), 15 (drive) |
| §1 veri repoda değil | Task 1 (.gitignore), 16 (deploy kod-only) |
| §1 canlı fiyat yok → `—` | Task 12 (açık pozisyon `DASH` sütunları), Global Constraints |
| §1 KPI "son bilinen" damgası | Task 11 (SectionHeader note), Task 8 SourceStamp |
| §2 girdi verisi 8 JSON | Task 3 (`NAMES` 8), Task 15 |
| §2 `positions.json` yok → türet | Task 4 |
| §2 snapshot kırılımları boş → maliyet bazlı dağılım | Task 5 (`allocationByClass/Portfolio`) |
| §3 id düzeltmesi | Task 0 |
| §4 kod yapısı | File Structure + her görev |
| §5.1 Panorama bileşenleri | Task 11 |
| §5.2 Pozisyonlar (açık/kapalı/istatistik/seviye) | Task 12 |
| §5.3 Aylık Rapor | Task 13 |
| §5.4 gezinme + kabuk + EmptyState | Task 9, 10 |
| §6 Drive adaptörü (GIS + Picker + `drive.file`) | Task 15 |
| §7 GitHub Pages | Task 16 |
| §9 test yaklaşımı | her görev TDD; grafik geometri testleri Task 6–7 |
| §10 sanat yönü token'ları | Task 2 (`app.css`) |
| §10.5 kazanç mavi / kayıp oküra | Global Constraints + Task 6–7 (`fill`) |
| §10 açık/koyu toggle + localStorage | Task 2 (`theme.ts`), Task 8 (`ThemeToggle`) |
| PWA kabuğu | Task 14 |

Spec §10.1 (drive.file + elle yüklenen dosyalar / Picker) → Task 15 Picker ile çözülür; §10.2 (Pages alt-yol) → Task 16 Step 3 + Step 4 doğrulama; §10.4 (null `baslangicSermayesi` → `%` `—`) → Task 13 test + `derive.periodPerformance` null-safe. Kapsam boşluğu görülmedi.

**2. Placeholder taraması**

"TBD/TODO/handle edge cases" yok. Task 14 Step 1 ikon üretimi "elle hazırlanmış PNG commit et" diyor — somut (üretim yöntemi serbest, çıktı geçerli PNG). Task 16 Step 6 bilinçli olarak Enis'e bağlı (hesap gerektiren adımlar); README'de tam komut/tıklama listesi var. Task 5 test dosyasında kasıtlı bir "yanlış satırı sil" notu var (P0'daki Ruling 1 gibi bir öğretici hata değil — TDD sırasında yazan kişinin fark edip düzelteceği bir yönlendirme); Step 4 bunu açıkça söylüyor.

**3. Tip tutarlılığı**

- `Dataset` alan adları Task 3'te tanımlı, Task 4/5/10/11/12/13'te aynı (`transactions`, `snapshots`, `instruments`, `meta`, ...).
- `derivePositions` dönüşü `{ open, closed, realizedTotalUsd, errors }` — Task 4'te tanımlı, Task 5 (`allocationByClass(positions.open, ...)`), Task 10 (`deriveAll`), Task 11–12 (`derived.positions`) aynı.
- `OpenPosition.toplamMaliyetUsd` / `ortMaliyetUsd` / `lot` / `kod` — Task 4 ↔ Task 5 (`allocation`) ↔ Task 12 (tablo) aynı.
- `ClosedPosition.gerceklesmisKzUsd` / `alisTutarUsd` — Task 4 ↔ Task 5 (`gainBuckets`, `topMovers`, `positionStats`) ↔ Task 11–12 aynı.
- `DataSource { id, load() }` — Task 3 ↔ Task 10 (`load(store, source)`) ↔ Task 15 (`DriveSource implements DataSource`) aynı.
- `NAMES` sabiti — Task 3'te `local.ts` içinde; Task 15 Step 3 onu `source.ts`'e taşıyıp ikisinin de import etmesini söylüyor (DRY düzeltmesi görev metninde açık).
- `DerivedBundle` — Task 10'da `deriveAll`'dan türetiliyor; Task 11–13 `derived.byClass` / `derived.movers` / `derived.periods` / `derived.stats` / `derived.buckets` alanlarını Task 10'un `deriveAll` dönüşüyle bire bir kullanıyor.
- `format.usd` / `pct` / `DASH` / `dateShort` / `monthLabel` — Task 2'de tanımlı, sonraki tüm sayfa görevlerinde aynı imza.
- `theme.setTheme` / `getTheme` — Task 2 ↔ Task 8 (`ThemeToggle`) aynı.
- Svelte 5 runes (`$props`, `$state`, `$derived`) tüm bileşenlerde tutarlı; `mount` API Task 1'de.

Tutarsızlık bulunmadı.

---

## Execution Handoff

Plan `docs/superpowers/plans/2026-09-03-bbb-p1-dashboard.md` altına kaydedildi. İki yürütme seçeneği:

**1. Subagent-Driven (önerilen)** — her görev için taze subagent, görevler arası iki-aşamalı inceleme, hızlı iterasyon. P0 böyle yürütüldü.

**2. Inline** — bu oturumda `executing-plans` ile, kontrol noktalarında toplu yürütme.

Enis "gerisini otomatik yap" dediği için, aksi belirtilmezse **subagent-driven** ile devam edilecek.
