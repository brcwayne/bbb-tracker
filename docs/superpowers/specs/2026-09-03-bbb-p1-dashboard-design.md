# BBB Tracker P1 — Salt-Okunur Görsel Dashboard Tasarım Dokümanı

**Tarih:** 2026-09-03
**Durum:** Kabul edildi (Enis sözlü onay verdi ve teknik dokümanların kendisine ayrıca onaylatılmamasını istedi — yürütme yetkisi kontrolörde)
**Üst tasarım:** `docs/superpowers/specs/2026-09-02-bbb-tracker-design.md` (sistem mimarisi, sanat yönü §10, faz tablosu §14, sayfa içerikleri §9). Bu doküman yalnızca **P1'e özgü** kararları sabitler; çelişki olursa üst doküman + burada yazılı kararlar bağlayıcıdır.
**Girdi verisi:** P0 migration çıktısı — `data/*.json` (bkz. §2).

---

## 1. Amaç ve kapsam

P1, P0 migration çıktısının üzerine kurulu **salt-okunur, görsel bir dashboard PWA**'sıdır. Mac ve iPhone tarayıcısında çalışır, ana ekrana kurulabilir. Yazma yok, canlı fiyat yok — yalnızca migration'daki **tarihsel** veriden türetilen görünümler.

### Hedefler

1. Üç sayfa: **Panorama**, **Pozisyonlar**, **Aylık Rapor** (Enis "Pozisyonlar" ve "Aylık Rapor"u kritik sayfalar olarak işaretledi).
2. Tasarım dokümanı §10 sanat yönü: koyu varsayılan + açık mod, mürekkep mavisi + oküra vurgu, editoryal ızgara, elle çizilmiş SVG grafikler (çizim kütüphanesi yok), tabular rakamlar, hairline çizgi sistemi.
3. **Veri kaynağı soyutlaması:** uygulama JSON'un yerel dosyadan mı Drive'dan mı geldiğini bilmez. İki adaptör — `local` (geliştirme) ve `drive` (yayın) — ikisi de P1'de.
4. **Veri asla repoda / bundle'da değil.** Yayındaki site sadece koddur; Google ile giriş yapılıp kullanıcının Drive `BBB/` klasörü okunana kadar hiçbir finansal veri göstermez.
5. GitHub deposu + GitHub Pages ile yayın (`main`'e push → otomatik). Ücretsiz, HTTPS, gerçek URL, PWA kurulabilir.

### Kapsam dışı (P2 / P3+)

- Güncel piyasa fiyatı, güncel piyasa değeri, **gerçekleşmemiş K/Z** → P3 (Cloudflare Worker). P1'de bu sütunlar `—` yer tutucusu.
- "Seviye Takibi / Yaklaşanlar" kartı (hedefe yakınlık %, uyarı) → güncel fiyat gerektirir → P3.
- **İşlem Günlüğü / Tez sayfası** ("bu hisseyi neden aldım" + ekran görüntüleri) → yeni özellik, yazma + Drive'da resim depolama gerektirir. Parklandı; Enis P1'i kullandıktan sonra yeniden değerlendirir. Üst dokümanın gelecek-iş listesine eklenir.
- Portföyler sayfası, Temettü & Nakit sayfası → P4.
- Drive'a **yazma**, çevrimdışı senkron kuyruğu, hızlı işlem girişi → P2.
- Uygulama içi `seviyeler` / `overrides` editörü → P2+.

### P1'in gerçek verinin canlı olmamasıyla başa çıkışı

KPI şeridi ve türetilen toplamlar **"son bilinen (2026-08-31)"** tarih damgasıyla gösterilir — gerçek sayılar, ama canlı değil. P3 gelince gerçekleşmemiş katman üstüne oturur; P1 bileşenleri bu sütunlar için baştan `—` gösterecek şekilde yazılır.

---

## 2. Girdi verisi — P0 migration çıktısı

`data/` klasörü (gitignore; geliştirmede yerelde, yayında Drive `BBB/` klasöründe). Dosyalar ve P1'in kullandığı alanlar:

| Dosya | P1 kullanımı |
|-------|--------------|
| `transactions.json` | 153 kayıt. **Pozisyon türetiminin tek kaynağı.** Alanlar: `id, tarih, hesap, portfoy, enstruman, yon (AL/SAT), lot, fiyat_usd, kur, komisyon_usd, brut_usd, net_usd, kaynak`. |
| `cashflows.json` | 21 kayıt. `tur (YATIRMA/CEKME/TEMETTU), tarih, tutar_usd, enstruman`. Nakit akışı / temettü görünümleri (Aylık Rapor bağlamı). |
| `snapshots.json` | 124 aylık kayıt. `tarih (ay sonu), toplamOzkaynak_usd, baslangicSermayesi_usd, netMevduatCekim_usd, cekim_usd, nakitTemettu_usd, netKZ_usd, vergiKomisyon_usd`. **Equity curve ve Aylık Rapor'un ana kaynağı.** `hesapBazli/portfoyBazli/sinifBazli` **boş `{}`** (P0 sınırı) — dağılım bunlardan gelmez. |
| `instruments.json` | 46 kayıt. `kod, ad, sinif (BIST/ALTIN/FON_PARA/FON_HISSE/USA), fiyatSembolu, seviyeler (şu an hep null)`. Sınıf-bazlı dağılım + opsiyonel seviye göstergesi. |
| `brokers.json` | 7 kayıt. `kod, ad, tur, sahip`. Hesap adları. |
| `portfolios.json` | 5 kayıt. `kod, ad`. Portföy etiketi adları. |
| `meta.json` | `olusturulma, kaynak, nakitHesapBazli, p0Sinirlari`. "Son güncelleme" damgası + toplam nakit (`nakitHesapBazli` toplamı — **yalnızca agregada geçerli**, hesap kırılımı gösterilmez). |
| `reconciliation-report.md` | P1 kullanmaz (bilgi amaçlı). |

**`positions.json` YOK** — migration onu yazmıyor. P1 açık/kapalı pozisyonları `transactions.json`'dan `derive.ts` ile hesaplar (spec §11 hareketli ağırlıklı ortalama mantığı, TS'te testli).

---

## 3. Görev 0 — id düzeltmesi (parklanan Ruling 4)

P1'in ilk işi, **Drive'a hiç veri yazılmadan önce** migration id'lerini içerik-türevli yapmak.

- Şu an `migration/bbb_migration/transform.py` `_rid("t_", f"trades:{row_no}")` — id yalnızca Excel satır numarasını hash'liyor. Excel'e satır eklenince altındaki tüm id'ler sessizce kayar.
- **Düzeltme:** id, kaydın içeriğinden türetilsin: `sha1(f"{tarih}|{hesap}|{portfoy}|{enstruman}|{yon}|{lot}|{fiyat_usd}|{dup_idx}")[:16]`, `t_` / `c_` önekiyle. `dup_idx` = aynı `(tarih,hesap,portfoy,enstruman,yon,lot,fiyat_usd)` demetinin daha önce kaç kez görüldüğü (0'dan başlar) — birebir aynı iki fiş için tiebreaker. Sayaç `build_transactions` / `build_cashflows` döngüsünde tutulur (satır sırası = extract sırası, deterministik).
- `test_transform.py` / `test_transform_cashflows.py` id-sabitleyen assert'ler yeni şemaya güncellenir. Determinizm testi (`test_cli_integration.py`) korunmalı.
- Migration yeniden koşulur → `data/*.json` yeni id'lerle. `data/` commit'lenmez.
- Bu görev tamamen `migration/` içinde; `app/` başlamadan biter.

---

## 4. Mimari ve kod yapısı

Aynı repo, yeni `app/` klasörü (`migration/` ile yan yana):

```
app/
  index.html · vite.config.ts · package.json · tsconfig.json · svelte.config.js
  public/  manifest.webmanifest · icons/ · (sw service worker vite-plugin-pwa ile üretilir)
  src/
    main.ts · App.svelte · router.ts        (küçük hash router — 3 rota)
    lib/
      data/
        types.ts        Dataset + tüm JSON şemalarının TS tipleri
        source.ts       DataSource arayüzü: { id: 'local'|'drive', load(): Promise<Dataset>, meta }
        local.ts        LocalFileSource — fetch('./data/<f>.json') x8 (reconciliation-report.md hariç)
        drive.ts        DriveSource — Google Identity Services OAuth (drive.file) + BBB/ klasörü listeleme/okuma
        derive.ts       transactions -> { openPositions, closedPositions, realizedTotal, byClass, byPortfolio, gainBuckets, periodPerf, topMovers }
      charts/           LineChart · Donut · BarChart · Histogram · Sparkline (her biri kendi SVG'sini çizer; d3-scale/d3-shape yalnız matematik)
      ui/               KpiBand · SectionHeader · DataTable · Rule · ThemeToggle · SourceStamp · EmptyState
      format.ts         para (USD), yüzde, tarih, tabular rakam biçimleme
      theme.ts          :root token'ları (light) + prefers-color-scheme dark + [data-theme] override; mürekkep mavisi + oküra
    routes/
      Panorama.svelte · Pozisyonlar.svelte · AylikRapor.svelte
```

**Sınırlar:**
- `derive.ts` saf fonksiyonlar, `Dataset` girer, türetilmiş yapılar çıkar — DOM/fetch yok, birim testli. Spec §11 muhasebe kuralları (AL: hareketli ağırlıklı ort.; SAT: ort. maliyet sabit, gerçekleşmiş K/Z = `(fiyat_usd - ort) * lot - komisyon`; kısa yok — eldekinden fazla SAT clamp+işaretle).
- Her grafik bileşeni tek sorumluluk: veri dizisi + boyut girer, SVG çıkar. Renk/tema `theme.ts` token'larından, efsane yerine doğrudan etiketleme.
- `DataSource` iki uygulama; sayfalar hangisini kullandığını bilmez. Uygulama açılışta: URL param / localStorage'a göre `local` veya `drive` seçer; `drive` seçiliyse ve oturum yoksa "Google ile bağlan" ekranı.
- PWA: `vite-plugin-pwa` ile manifest + otomatik service worker (yalnızca **uygulama kabuğu** önbelleği — statik varlıklar; veri önbelleği P2).

---

## 5. Sayfalar

Tüm para değerleri USD. Sanat yönü tasarım dokümanı §10.

### 5.1 Panorama

- **KPI şeridi** (`SourceStamp`: "son bilinen — <meta.olusturulma> · kaynak: <local|Drive>"):
  Toplam Özkaynak (`snapshots` son `toplamOzkaynak_usd`) · Gerçekleşmiş Kâr (`derive.realizedTotal`) · Nakit (`sum(meta.nakitHesapBazli)`) · YTD K/Z (`snapshots` içinden yıl-başından itibaren `Σ netKZ_usd`) · İşlem sayısı (`transactions.length`).
- **Equity curve** — `snapshots` `tarih` × `toplamOzkaynak_usd`, `LineChart` (ince çizgi + hafif alan yıkaması).
- **Varlık sınıfı dağılımı** — `derive.byClass`: açık pozisyonların `toplam_maliyet_usd`'si `instruments.sinif`'a göre gruplu, **maliyet bazlı**. `Donut`, doğrudan etiket. Başlık "maliyet bazlı" notu.
- **Portföy dağılımı** — `derive.byPortfolio`: aynı, `transaction.portfoy`'a göre.
- **Kâr/zarar dağılımı histogramı** — `derive.gainBuckets`: kapanmış pozisyonların % getirisi, tasarım dokümanı §9.1'deki kova sınırları. `Histogram`.
- **Win/Loss** ve **Profit/Loss** halkaları — kapanmış pozisyon sayısı kazançlı/zararlı; gerçekleşmiş kâr toplamı / zarar toplamı. İki küçük `Donut`.
- **Kümülatif en çok kazandıran/kaybettiren** — `derive.topMovers`: kapanmış pozisyonlar gerçekleşmiş K/Z'ye göre sıralı, ilk 5 / son 5, yatay `BarChart`.
- **Dönemsel performans** — `derive.periodPerf`: bu ay / Ç1–Ç4 / YTD / önceki YTD, `snapshots` `netKZ_usd` toplamları + `%` (dönem başı sermayeye göre). `DataTable`.

### 5.2 Pozisyonlar

- **Açık pozisyonlar** `DataTable` (`derive.openPositions`): Hisse · Sınıf · Portföy · Lot · Ort. Maliyet (USD) · Toplam Maliyet · Maliyet Payı % (portföy içi ve/veya genel) · **Güncel Fiyat `—`** · **Gerçekleşmemiş K/Z `—`** (P3'te dolacak). Sınıf / portföy / hesap filtresi. Ağırlığa göre görsel bar. Sıralanabilir.
- **Opsiyonel seviye göstergesi:** `instruments.seviyeler` doluysa (destek / direnç / hedef) satırda küçük bir rozet/sütun olarak sayıları göster; boşsa (şu an hepsi) sade. Yakınlık hesabı YOK (P3).
- **Kapanmış pozisyonlar** `DataTable` (`derive.closedPositions`): Hisse · Alış Ort. · Alış Tutarı · Satış Ort. · Satış Tutarı · Gerçekleşmiş K/Z (USD) · Gerçekleşmiş K/Z %.
- **İstatistik başlığı:** Win : Loss · Kazanma oranı · Ort. Kazanç % · Ort. Kayıp % · En Büyük Kazanç · En Büyük Kayıp · Risk/Ödül (ort. kazanç / ort. kayıp).

### 5.3 Aylık Rapor

- **Ay-ay tablo** `DataTable` (124 satır, `snapshots`): Ay · Başlangıç Sermaye · Net Mevduat/Çekim · Kazanç · Kayıp · Nakit Temettü · Dönem Sonu · Vergi & Komisyon · % Getiri (`netKZ_usd / baslangicSermayesi_usd`). En yeni ay üstte.
- **Seçili ayın kartı** — tabloda tıklanan ay için büyük kart (tasarım dokümanı §9.2 "This Month Performance" düzeni).
- **Aylık net K/Z bar grafiği** — `BarChart`, pozitif = mürekkep mavisi, negatif = oküra (yön migration verisiyle netleşir; §10).
- **Performans eğrisi** — aylık `toplamOzkaynak_usd` çizgisi (Panorama equity curve ile aynı veri, bu sayfada ay ekseninde).

### 5.4 Gezinme ve kabuk

- **Mobil:** alt sekme çubuğu — Panorama · Pozisyonlar · Aylık.
- **Mac / geniş:** sol kenar gezinme + geniş içerik.
- Üstte akan başlık: seçili sayfa + `SourceStamp` (veri kaynağı + son güncelleme) + `ThemeToggle`.
- `drive` kaynağında oturum yoksa: tam-ekran "Google ile bağlan" ekranı; bağlanınca `BBB/` klasörü okunur.
- Veri yüklenemezse (`local`: dosya yok; `drive`: klasör yok/boş) → `EmptyState` açıklaması ("`data/` klasörü boş — migration'ı çalıştır" / "Drive `BBB/` klasörü bulunamadı — JSON'ları yükle").

---

## 6. Drive adaptörü (`drive.ts`)

- **Kimlik:** Google Identity Services (GIS) token client, tarayıcıda, kapsam `https://www.googleapis.com/auth/drive.file`. Token bellekte/oturumda.
- **Klasör:** `BBB/` adlı klasörü ada göre bul (`files.list` q=`name='BBB' and mimeType='application/vnd.google-apps.folder'`); yoksa `EmptyState`.
- **Okuma:** klasördeki 8 JSON.u `files.list` + her biri için `files.get?alt=media`. `Dataset`'e ayrıştır.
- P1'de **yazma yok** — `drive.file` yalnızca uygulamanın oluşturduğu/açtığı dosyaları görür; Enis JSON'ları elle yüklediği için uygulama onları görebilmek için ilk seferde bir "klasör seç" (Google Picker) veya "uygulamayla oluşturulmuş" olması gerekebilir. **Karar:** P1 Google Picker ile klasörü bir kez seçtirir (`drive.file` + Picker, kullanıcının seçtiği dosyalara erişim verir); seçim `localStorage`'da klasör id olarak saklanır.
- **OAuth uygulaması:** Google Cloud Console'da proje + OAuth consent screen. `drive.file` doğrulama gerektirmediği için uygulama "production"a alınır; ilk girişte "doğrulanmamış uygulama" uyarısı kullanıcı tarafından geçilir. (Test modu = 7 günde bir yeniden giriş; production = kalıcı.) Adımlar Enis'e tarif edilir; `client_id` build-time env değişkeni, public (client_id gizli değildir).

---

## 7. Yayın (GitHub Pages)

- Enis'in hesabında yeni bir GitHub deposu (`gh repo create`, public — içinde veri yok). Mevcut yerel `main` push edilir.
- `.github/workflows/pages.yml`: `main`'e push → `app/` build (`npm ci && npm run build`) → `app/dist/` GitHub Pages'e deploy.
- `vite.config.ts` `base` = `/<repo-adı>/` (Pages alt-yol).
- Sonuç: `https://<kullanıcı>.github.io/<repo>/` — HTTPS, PWA kurulabilir. OAuth redirect/origin bu URL'e göre ayarlanır.
- `data/` ve `migration/.venv/` `.gitignore`'da kalır (zaten öyle).

---

## 8. Görev sırası (writing-plans bunu detaylandıracak)

0. **id düzeltmesi** — `migration/` içerik-türevli id + testler + yeniden koşum (§3).
1. `app/` iskeleti — Vite + Svelte + TS + vite-plugin-pwa; `theme.ts` token'ları; `format.ts`.
2. `types.ts` + `source.ts` arayüzü + `local.ts` adaptörü (yerel `data/` okur).
3. `derive.ts` — pozisyon/kapalı-pozisyon/gerçekleşmiş-K/Z/dağılım/kova/dönem/topMovers türetme, birim testli (spec §11).
4. Grafik ilkelleri: `LineChart`, `Donut`, `BarChart`, `Histogram` (+ `Sparkline` gerekiyorsa) — her biri kendi testi (SVG çıktısı / ölçek doğruluğu).
5. UI ilkelleri: `KpiBand`, `DataTable`, `SectionHeader`, `Rule`, `ThemeToggle`, `SourceStamp`, `EmptyState`.
6. `router.ts` + `App.svelte` + 3 rota iskeleti + gezinme (mobil alt sekme / masaüstü yan).
7. **Panorama** sayfası — tüm bileşenleri bağla.
8. **Pozisyonlar** sayfası — açık/kapalı tablolar, istatistik başlığı, opsiyonel seviye göstergesi.
9. **Aylık Rapor** sayfası — tablo, seçili ay kartı, bar grafiği, performans eğrisi.
10. PWA kabuğu — manifest, ikonlar, service worker (uygulama kabuğu önbelleği), yüklenebilirlik doğrulaması.
11. `drive.ts` — GIS OAuth + Google Picker ile klasör seçimi + 8 JSON okuma + kaynak seçici / bağlan ekranı.
12. GitHub deposu + `pages.yml` + `vite base` + ilk deploy.
13. Uçtan uca: Enis JSON'ları Drive `BBB/` klasörüne yükler, yayındaki URL'i telefonda açar, "Google ile bağlan", dashboard'u doğrular.

Her görev bağımsız test edilebilir bir teslimat. 3–5 (kütüphane katmanı) ve 7–9 (sayfalar) çoğunlukla mekanik; 11 (OAuth) ve 12 (deploy) Enis'in hesabını gerektirir.

---

## 9. Test yaklaşımı

- `derive.ts` — birim testleri, elle hesaplanmış küçük `Dataset` fixture'larıyla (spec §11 kurallarının TS karşılığı; P0'daki `test_positions.py` senaryolarının aynısı yeniden kullanılabilir).
- Grafik bileşenleri — ölçek/geometri birim testleri (verilen veri + boyut → beklenen path `d` / eksen tick'leri); görsel snapshot değil.
- `local.ts` — `data/` fixture'ıyla `load()` bütün dosyaları okuyup birleştiriyor mu.
- Sayfalar — Svelte bileşen testleri (Vitest + @testing-library/svelte): fixture `Dataset` verilince doğru KPI/satır/etiket render ediliyor mu; `—` yer tutucuları gerçekleşmemiş sütunlarda görünüyor mu; `EmptyState` boş veride çıkıyor mu.
- `drive.ts` — GIS/Picker/fetch mock'lanır; gerçek OAuth yalnızca Görev 13 manuel doğrulamasında.
- Deploy — `npm run build` temiz + `vite preview` açılış dumansız.

## 10. Açık noktalar / riskler

1. **`drive.file` + elle yüklenen dosyalar** — `drive.file` kapsamı uygulamanın kendi oluşturmadığı dosyaları görmez; Google Picker ile kullanıcı seçimi bunu çözer ama Picker API'si ek bir script + API key ister. Alternatif: Enis JSON'ları yüklemek yerine uygulama P2'de kendisi yazar (o zaman P1 Drive okuması yalnızca uygulamanın yazdığı dosyalar için çalışır → P1'de Drive tam çalışmaz, yerelde kalır). Görev 11 bu ikilemi netleştirecek; varsayılan = Picker.
2. **GitHub Pages alt-yol** — `base` yanlışsa varlıklar 404; `vite preview` alt-yolu taklit etmez, ilk deploy'da doğrulanır.
3. **OAuth "doğrulanmamış uygulama" ekranı** — `drive.file` için beklenen; Enis'e "Gelişmiş → devam et" adımı gösterilir.
4. **Snapshot `%` getiri** — `baslangicSermayesi_usd` bazı erken aylarda `null` (ilk ay); `derive` bunu 0'a bölmeden ele alır (getiri `—`).
5. **Renk yönü** (kazanç mavisi mi oküra mı) — tasarım dokümanı §10 "migration verisiyle netleşir" diyor; P1'de kazanç = derin mürekkep mavisi, kayıp = yanık oküra olarak sabitlenir, gerekirse toggle.
6. **`nakitHesapBazli` hesap kırılımı** — anlamsız (P0 sınırı); P1 yalnızca toplamı gösterir, hesap bazında dağıtmaz.
