# Bot Konuşma Kaydı ve Senaryo Testleri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram botuyla yapılan her konuşmayı yeniden kurulabilir biçimde kaydetmek, hatalı çıkarımların tek dokunuşla işaretlenebilmesini sağlamak, ve bu kaydın beslediği bir senaryo test sürecini kurmak.

**Architecture:** Üç kanca (gelen güncelleme, sarmalanmış `Bot` nesnesi, `merge_parses`) tüm konuşmayı `logs/conv-<gün>.ndjson`'a satır satır yazar; kayıt yolu tamamen fail-safe'tir ve botu asla düşürmez. Kayıtlar `/kayit` komutu ile Telegram'dan .md belgesi olarak teslim edilir. Faz B, mevcut sahte Telegram katmanını tek sürüme indirip üstüne bildirimsel bir senaryo motoru kurar; model çağıran anlama eval'leri ayrı bir ağaçta ve CI dışında durur.

**Tech Stack:** Python 3.14, python-telegram-bot ≥22, pytest 9.1.1 (`asyncio_mode=auto`), rclone, systemd. Yeni bağımlılık yok — eval külliyatı için `PyYAML` gerekiyorsa `requirements.txt`'e eklenir, başka hiçbir şey.

**Kod deposu:** `~/Desktop/Market/BBB/bbb-telegram-bot` — **BBB'den ayrı bir git deposu** (`github.com/brcwayne/bbb-telegram-bot`). Tüm kod değişiklikleri orada commit'lenir. Bu doküman BBB deposunda durur (mevcut teamül).

**Spec:** `docs/superpowers/specs/2026-09-09-bot-konusma-kaydi-ve-senaryo-testleri-design.md` — Görev A1'den önce okunmalı. Kararlar K1–K8, bölümler §N olarak anılır.

**Çalışma dizini:** `~/Desktop/Market/BBB/bbb-telegram-bot`. Testler: `.venv/bin/python -m pytest -q`. Taban: **450 test geçiyor, 1.44 sn** — her görevden sonra bu sayı düşmemeli.

## Global Constraints

Spec §2'den birebir alındı. Her görevin gereksinimlerine örtük olarak dahildir.

- **Bot davranışı değişmez.** Tek istisna: K2'nin getirdiği iptal gerekçesi sorusu ve `/hata` komutu. Çıkarım mantığına, kayıt biçimine, mevcut akışlara dokunulmaz.
- **Kayıt hiçbir koşulda botu düşürmez (K5).** Her kayıt çağrısı yutulan `try/except` içindedir.
- **Gizli değer kaydedilmez.** Bot token'ı, API anahtarları, `.env` içeriği hiçbir olayda yer almaz.
- **`logs/` Drive'dan geri çekilmez** — `pull` komutuna `--exclude logs/**` eklenmezse loglar `data/logs/` olarak geri iner.
- **`logs/` systemd `.path` biriminde izlenmez** — izlenirse her mesaj bir rclone koşusu tetikler.
- **İki test türü karıştırılmaz (K7).** Akış senaryoları deterministik ve CI'da; anlama eval'leri gerçek model ve CI dışında.
- Mevcut 450 test yeşil kalır.
- Kullanıcıya görünen metinler Türkçe.

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/obs/__init__.py` (yeni) | — |
| `src/obs/convlog.py` (yeni) | Olay yazıcı: NDJSON, günlük dosya, `conv` üretimi, fail-safe sarma |
| `src/obs/render.py` (yeni) | NDJSON → okunabilir markdown transkript |
| `src/bot/main.py` (değişir) | `LoggingBot`, gelen `TypeHandler`, `/hata` komutu |
| `src/bot/logging_bot.py` (yeni) | `ExtBot` alt sınıfı — giden mesaj kancası |
| `src/bot/handlers/personal_flow.py` (değişir) | `merge_parses` çıkarım kaydı; `pf:cancel` gerekçe sorusu |
| `src/bot/handlers/debt_flow.py` (değişir) | `pf:debt:cancel` gerekçe sorusu |
| `src/bot/handlers/transfer_flow.py` (değişir) | `pf:tr:cancel` gerekçe sorusu |
| `src/ai/qwen_service.py` (değişir) | Ham model yanıtını çıkarım kaydına taşır |
| `src/data/personal_repository.py` (değişir) | Mutasyon metotlarında `yazim` olayı |
| `src/sync/once.py` (değişir) | `logs/` push, `logs/**` pull dışlaması |
| `deploy/README.md` (değişir) | Log klasörü, silme, sorun giderme |
| `tests/support/fake_telegram.py` (yeni) | 9 dosyada kopyalanmış sahte Telegram katmanı, tek sürüm |
| `tests/scenarios/motor.py` (yeni) | Bildirimsel senaryo koşucusu + transkript |
| `tests/scenarios/test_borc.py` vb. (yeni) | Senaryo aileleri |
| `evals/` (yeni ağaç) | Külliyat, koşucu, rapor, hasat |

---

# FAZ A — Konuşma kaydı

### Görev A1: Olay yazıcı çekirdeği

**Dosyalar:**
- Yeni: `src/obs/__init__.py`, `src/obs/convlog.py`
- Test: `tests/test_convlog.py`

**Arayüzler:**
- Üretir: `convlog.yaz(tur, conv, **alanlar)`, `convlog.yeni_conv()`, `convlog.gunluk_dosya(gun=None)`, ve `gelen/giden/cikarim/yazim/isaret/hata` yardımcıları. A2–A8 bunları çağırır.

- [ ] **Adım 1: Spec'in ilgili bölümlerini oku**

`docs/superpowers/specs/2026-09-09-bot-konusma-kaydi-ve-senaryo-testleri-design.md` §3.1, §3.2, §3.3 ve K4, K5. Özellikle K5: bu modülün *hiçbir* çağrısı çağıranı düşürmemeli.

- [ ] **Adım 2: Başarısız testi yaz**

`tests/test_convlog.py`:

```python
import json
import datetime as dt
import pytest
from src.obs import convlog


@pytest.fixture
def logdir(tmp_path, monkeypatch):
    d = tmp_path / "logs"
    monkeypatch.setattr(convlog, "LOG_DIR", d)
    return d


def _satirlar(logdir, gun=None):
    gun = gun or dt.date.today().isoformat()
    p = logdir / f"conv-{gun}.ndjson"
    return [json.loads(s) for s in p.read_text(encoding="utf-8").splitlines() if s.strip()]


def test_olay_gunluk_dosyaya_satir_olarak_yazilir(logdir):
    convlog.yaz("gelen", "c_1", chat=5, user=7, metin="1000tl borç verdim")
    rows = _satirlar(logdir)
    assert len(rows) == 1
    assert rows[0]["tur"] == "gelen"
    assert rows[0]["conv"] == "c_1"
    assert rows[0]["metin"] == "1000tl borç verdim"
    assert rows[0]["chat"] == 5 and rows[0]["user"] == 7
    assert rows[0]["ts"].startswith(dt.date.today().isoformat())


def test_ardisik_olaylar_eklenir_ustune_yazilmaz(logdir):
    convlog.yaz("gelen", "c_1", metin="a")
    convlog.yaz("giden", "c_1", metin="b")
    assert [r["tur"] for r in _satirlar(logdir)] == ["gelen", "giden"]


def test_yeni_conv_benzersiz_ve_desenli(logdir):
    a, b = convlog.yeni_conv(), convlog.yeni_conv()
    assert a != b
    assert a.startswith("c_") and len(a) > 10


def test_serilesemeyen_deger_satiri_dusurmez(logdir):
    class Tuhaf:
        def __repr__(self):
            return "<Tuhaf>"
    convlog.yaz("cikarim", "c_1", model_sonuc=Tuhaf())
    rows = _satirlar(logdir)
    assert len(rows) == 1
    assert "Tuhaf" in str(rows[0]["model_sonuc"])


def test_yazilamayan_dizin_cagirani_dusurmez(tmp_path, monkeypatch):
    # K5: disk dolu / izin yok senaryosu — bot akışı kesintisiz sürmeli
    monkeypatch.setattr(convlog, "LOG_DIR", tmp_path / "yok" / "olmaz")
    monkeypatch.setattr(convlog, "_ac", lambda *a, **k: (_ for _ in ()).throw(PermissionError("izin yok")))
    convlog.yaz("gelen", "c_1", metin="a")   # istisna fırlatmamalı


def test_gizli_degerler_redakte_edilir(logdir):
    convlog.yaz("hata", "c_1", mesaj="token=123:ABCdef bulunamadı", istem="api_key=sk-xyz")
    ham = json.dumps(_satirlar(logdir)[0], ensure_ascii=False)
    assert "123:ABCdef" not in ham
    assert "sk-xyz" not in ham
    assert "***" in ham


def test_yardimcilar_dogru_tur_yazar(logdir):
    convlog.gelen("c_1", chat=1, user=2, metin="x")
    convlog.giden("c_1", chat=1, metin="y", butonlar=[("Bora", "pf:kisi:BORA")])
    convlog.isaret("c_1", sebep="yanlis_anladi", not_="bora'yı yanlış aldı")
    turler = [r["tur"] for r in _satirlar(logdir)]
    assert turler == ["gelen", "giden", "isaret"]
    assert _satirlar(logdir)[1]["butonlar"] == [["Bora", "pf:kisi:BORA"]]
```

- [ ] **Adım 3: Başarısız olduğunu gör**

```bash
cd ~/Desktop/Market/BBB/bbb-telegram-bot && .venv/bin/python -m pytest tests/test_convlog.py -q
```

Beklenen: FAIL — `ModuleNotFoundError: src.obs`.

- [ ] **Adım 4: Uygulamayı yaz**

`src/obs/convlog.py`:

```python
"""Konuşma kaydı — satır başına bir olay, günlük NDJSON dosyası.

Bu modülün hiçbir fonksiyonu çağıranına istisna sızdırmaz (spec K5). Gözlem
aracı gözlediği şeyi bozarsa değersizdir: disk dolsa, izin bozulsa, bir değer
serileşmese bile bot akışı kesintisiz sürmeli.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import secrets
from pathlib import Path
from typing import Any

from ..config import BBB_DIR

LOG_DIR = Path(os.getenv("CONV_LOG_DIR", str(BBB_DIR / "logs")))

# Kayda asla girmemesi gerekenler. Telegram token'ı `12345:AA...`, sağlayıcı
# anahtarları `sk-`/`AIza` önekli.
_GIZLI = [
    re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b"),
]


def yeni_conv() -> str:
    return f"c_{dt.datetime.now():%Y%m%d_%H%M%S}_{secrets.token_hex(2)}"


def gunluk_dosya(gun: str | None = None) -> Path:
    gun = gun or dt.date.today().isoformat()
    return LOG_DIR / f"conv-{gun}.ndjson"


def _ac(path: Path):
    """Ayrı fonksiyon: testler burayı sahteleyip yazma hatasını taklit ediyor."""
    return open(path, "a", encoding="utf-8")


def _redakte(x: Any) -> Any:
    if isinstance(x, str):
        for kalip in _GIZLI:
            x = kalip.sub("***", x)
        return x
    if isinstance(x, dict):
        return {k: _redakte(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_redakte(v) for v in x]
    return x


def yaz(tur: str, conv: str | None = None, **alanlar: Any) -> None:
    try:
        olay: dict[str, Any] = {
            "ts": dt.datetime.now().astimezone().isoformat(timespec="milliseconds"),
            "tur": tur,
            "conv": conv,
        }
        olay.update(alanlar)
        olay = _redakte(olay)
        # `default=repr`: serileşemeyen bir değer satırın tamamını düşürmesin.
        satir = json.dumps(olay, ensure_ascii=False, default=repr)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with _ac(gunluk_dosya()) as f:
            f.write(satir + "\n")
    except Exception:
        # Bilinçli olarak yutuluyor — K5.
        pass


def gelen(conv, **kw): yaz("gelen", conv, **kw)
def giden(conv, **kw): yaz("giden", conv, **kw)
def cikarim(conv, **kw): yaz("cikarim", conv, **kw)
def yazim(conv, **kw): yaz("yazim", conv, **kw)
def hata(conv, **kw): yaz("hata", conv, **kw)


def isaret(conv, sebep: str, not_: str = "") -> None:
    yaz("isaret", conv, sebep=sebep, **({"not": not_} if not_ else {}))
```

`src/obs/__init__.py` boş bırakılır.

- [ ] **Adım 5: Geçtiğini gör**

```bash
.venv/bin/python -m pytest tests/test_convlog.py -q && .venv/bin/python -m pytest -q
```

Beklenen: yeni testler PASS, toplam **450'den az değil**.

- [ ] **Adım 6: Commit**

```bash
git add src/obs tests/test_convlog.py
git commit -m "feat(obs): append-only conversation log with fail-safe writes

Every call is swallowed on failure: a full disk or a bad permission must
never take the bot down with it."
```

---

### Görev A2: `conv` yaşam döngüsü ve gelen taraf kancası

**Dosyalar:**
- Değişir: `src/bot/main.py`
- Yeni: `src/obs/conv.py`
- Test: `tests/test_convlog_akis.py`

**Arayüzler:**
- Tüketir: `convlog` (A1).
- Üretir: `conv.baslat(context)`, `conv.mevcut(context)`, `conv.kapat(context)`, `conv.son(context)` — A4, A5, A6 bunları çağırır.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/test_convlog_akis.py`:

```python
import pytest
from src.obs import conv


class Ctx:
    def __init__(self):
        self.user_data = {}


def test_metin_yeni_conv_baslatir():
    c = Ctx()
    a = conv.baslat(c)
    assert a and conv.mevcut(c) == a


def test_ayni_conv_devam_eder():
    c = Ctx()
    a = conv.baslat(c)
    assert conv.mevcut(c) == a
    assert conv.mevcut(c) == a


def test_kapatinca_son_conv_olarak_saklanir():
    c = Ctx()
    a = conv.baslat(c)
    conv.kapat(c)
    assert conv.mevcut(c) is None
    assert conv.son(c) == a


def test_yeni_metin_onceki_conv_u_degistirir():
    c = Ctx()
    a = conv.baslat(c)
    b = conv.baslat(c)
    assert a != b
    assert conv.mevcut(c) == b


def test_akis_disi_olay_tekil_conv_alir():
    c = Ctx()
    assert conv.mevcut(c) is None
    tek = conv.mevcut_veya_tekil(c)
    assert tek.startswith("c_")
    assert conv.mevcut(c) is None   # user_data'ya yazılmaz
```

- [ ] **Adım 2: Başarısız olduğunu gör**

```bash
.venv/bin/python -m pytest tests/test_convlog_akis.py -q
```

Beklenen: FAIL — `src.obs.conv` yok.

- [ ] **Adım 3: `src/obs/conv.py` yaz**

```python
"""`conv` yaşam döngüsü (spec §3.3).

Bir "konuşma" tek bir işlemi tamamlama denemesidir: serbest metinle başlar,
düğme basışları boyunca sürer, kayıt ya da iptalle kapanır.
"""
from __future__ import annotations

from .convlog import yeni_conv

_ANAHTAR = "conv_id"
_SON = "son_conv_id"


def baslat(context) -> str:
    c = yeni_conv()
    context.user_data[_ANAHTAR] = c
    return c


def mevcut(context) -> str | None:
    return context.user_data.get(_ANAHTAR)


def mevcut_veya_tekil(context) -> str:
    """Akış dışı tekil olaylar (örn. /borclar) kendi tek olaylık conv'unu alır."""
    return mevcut(context) or yeni_conv()


def kapat(context) -> str | None:
    c = context.user_data.pop(_ANAHTAR, None)
    if c:
        context.user_data[_SON] = c
    return c


def son(context) -> str | None:
    """`/hata` komutunun işaretleyeceği konuşma: açık olan, yoksa son kapanan."""
    return mevcut(context) or context.user_data.get(_SON)
```

- [ ] **Adım 4: Gelen taraf kancasını tak**

`src/bot/main.py` içinde, handler kayıtlarından **önce**:

```python
from telegram.ext import TypeHandler
from ..obs import conv as conv_mod
from ..obs import convlog


async def log_inbound(update, context):
    """Her gelen güncellemeyi kaydeder. group=-1'de koştuğu için gerçek
    handler'lardan önce çalışır; ApplicationHandlerStop fırlatmadığı sürece
    akışı hiçbir şekilde etkilemez."""
    try:
        if update.message and update.message.text and not update.message.text.startswith("/"):
            c = conv_mod.baslat(context)
            convlog.gelen(c, chat=update.effective_chat.id, user=update.effective_user.id,
                          metin=update.message.text, mesaj_id=update.message.message_id)
        elif update.message and update.message.text:
            c = conv_mod.mevcut_veya_tekil(context)
            convlog.gelen(c, chat=update.effective_chat.id, user=update.effective_user.id,
                          komut=update.message.text, mesaj_id=update.message.message_id)
        elif update.callback_query:
            c = conv_mod.mevcut_veya_tekil(context)
            convlog.gelen(c, chat=update.effective_chat.id, user=update.effective_user.id,
                          callback=update.callback_query.data)
    except Exception:
        pass
```

Kaydı: `app.add_handler(TypeHandler(Update, log_inbound), group=-1)`.

**Dikkat:** `group=-1` şart. Varsayılan grupta kaydedilirse aynı gruptaki ilk eşleşen handler kazanır ve gerçek handler'lar hiç çalışmaz.

- [ ] **Adım 5: Geçtiğini gör**

```bash
.venv/bin/python -m pytest -q
```

Beklenen: hepsi PASS.

- [ ] **Adım 6: Commit**

```bash
git add src/obs/conv.py src/bot/main.py tests/test_convlog_akis.py
git commit -m "feat(obs): conv lifecycle and the inbound update hook

A free-text message opens a conversation, button presses inherit it, a save
or a cancel closes it — and /hata can still find the one that just closed."
```

---

### Görev A3: Giden taraf — `LoggingBot`

Kodda 100'den fazla doğrudan `reply_text` / `edit_message_text` çağrısı var. Hepsini elle sarmak yerine `Bot` nesnesi sarmalanır (K6): `Message.reply_text` nihayetinde `bot.send_message`'a indiği için tek nokta hepsini yakalar.

**Dosyalar:**
- Yeni: `src/bot/logging_bot.py`
- Değişir: `src/bot/main.py`
- Test: `tests/test_logging_bot.py`

**Arayüzler:**
- Üretir: `LoggingBot(ExtBot)` — `send_message`, `edit_message_text`, `answer_callback_query` sarılı.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/test_logging_bot.py`:

```python
import json
import datetime as dt
import pytest
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from src.obs import convlog
from src.bot.logging_bot import butonlari_duzle


@pytest.fixture
def logdir(tmp_path, monkeypatch):
    d = tmp_path / "logs"
    monkeypatch.setattr(convlog, "LOG_DIR", d)
    return d


def _satirlar(logdir):
    p = logdir / f"conv-{dt.date.today().isoformat()}.ndjson"
    return [json.loads(s) for s in p.read_text(encoding="utf-8").splitlines() if s.strip()]


def test_butonlar_etiket_ve_callback_olarak_duzlesir():
    markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("Bora", callback_data="pf:kisi:BORA"),
         InlineKeyboardButton("Alper", callback_data="pf:kisi:ALPER")],
        [InlineKeyboardButton("❌ İptal", callback_data="pf:debt:cancel")],
    ])
    assert butonlari_duzle(markup) == [
        ["Bora", "pf:kisi:BORA"],
        ["Alper", "pf:kisi:ALPER"],
        ["❌ İptal", "pf:debt:cancel"],
    ]


def test_markup_yoksa_bos_liste():
    assert butonlari_duzle(None) == []


@pytest.mark.asyncio
async def test_gonderilen_mesaj_butonlariyla_kaydedilir(logdir, monkeypatch):
    from src.bot import logging_bot

    class SahteMesaj:
        message_id = 42

    class SahteBot(logging_bot.LoggingBot):
        def __init__(self):  # ExtBot.__init__'i atla
            pass
        async def _super_send(self, *a, **k):
            return SahteMesaj()

    b = SahteBot()
    monkeypatch.setattr(logging_bot.LoggingBot, "_gonder", SahteBot._super_send, raising=False)
    await b.send_message(
        chat_id=5, text="Kime borç verdin?",
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Bora", callback_data="pf:kisi:BORA")]]),
    )
    kayit = [r for r in _satirlar(logdir) if r["tur"] == "giden"]
    assert kayit and kayit[0]["metin"] == "Kime borç verdin?"
    assert kayit[0]["butonlar"] == [["Bora", "pf:kisi:BORA"]]
```

**Not:** `ExtBot` gerçek bir ağ istemcisi kurar; testte alt sınıfın `__init__`'i atlanıp gönderim çağrısı sahteleniyor. Uygulamayı yazarken gerçek gönderimi `_gonder` adlı ince bir metoda ayır ki test onu değiştirebilsin.

- [ ] **Adım 2: Başarısız olduğunu gör**

```bash
.venv/bin/python -m pytest tests/test_logging_bot.py -q
```

Beklenen: FAIL — `src.bot.logging_bot` yok.

- [ ] **Adım 3: Uygulamayı yaz**

`src/bot/logging_bot.py`:

```python
"""Giden her mesajı kaydeden Bot sarmalayıcısı (spec K6).

Kodda 100'den fazla doğrudan `reply_text` çağrısı var. `Message.reply_text`
sonunda `bot.send_message`'a indiği için burada sarmak hepsini yakalar; çağrı
yerlerinin hiçbirine dokunmak gerekmez.
"""
from __future__ import annotations

from telegram import InlineKeyboardMarkup
from telegram.ext import ExtBot

from ..obs import convlog


def butonlari_duzle(markup) -> list[list[str]]:
    if not isinstance(markup, InlineKeyboardMarkup):
        return []
    return [[b.text, b.callback_data or ""] for satir in markup.inline_keyboard for b in satir]


class LoggingBot(ExtBot):
    # Kaydın hangi konuşmaya ait olduğunu handler katmanı belirler; burada
    # sohbet bazında son açık conv okunur. `main.py` her güncellemede günceller.
    aktif_conv: dict[int, str] = {}

    async def _gonder(self, *a, **k):
        return await super().send_message(*a, **k)

    async def send_message(self, chat_id, text, **kw):
        msg = await self._gonder(chat_id=chat_id, text=text, **kw)
        convlog.giden(
            self.aktif_conv.get(int(chat_id)),
            chat=chat_id, metin=text,
            butonlar=butonlari_duzle(kw.get("reply_markup")),
            mesaj_id=getattr(msg, "message_id", None),
        )
        return msg

    async def edit_message_text(self, text, **kw):
        msg = await super().edit_message_text(text=text, **kw)
        convlog.giden(
            self.aktif_conv.get(int(kw.get("chat_id") or 0)),
            chat=kw.get("chat_id"), metin=text, duzenleme=True,
            butonlar=butonlari_duzle(kw.get("reply_markup")),
        )
        return msg

    async def answer_callback_query(self, callback_query_id, text=None, **kw):
        r = await super().answer_callback_query(callback_query_id, text=text, **kw)
        if text:
            convlog.giden(None, metin=text, uyari=True)
        return r
```

`src/bot/main.py` içinde `ApplicationBuilder()` zincirine `.bot(LoggingBot(TELEGRAM_BOT_TOKEN))` eklenir, ve `log_inbound` içinde her güncellemede `LoggingBot.aktif_conv[chat_id] = c` güncellenir.

- [ ] **Adım 4: Geçtiğini gör**

```bash
.venv/bin/python -m pytest -q
```

- [ ] **Adım 5: Commit**

```bash
git add src/bot/logging_bot.py src/bot/main.py tests/test_logging_bot.py
git commit -m "feat(obs): capture every outbound message by wrapping the Bot

One chokepoint instead of touching 100+ scattered reply_text calls — and no
call site can be forgotten later."
```

---

### Görev A4: Çıkarım kaydı (K3)

**Dosyalar:**
- Değişir: `src/bot/handlers/personal_flow.py` (`merge_parses`, satır ~241), `src/ai/qwen_service.py`
- Test: `tests/test_convlog_cikarim.py`

`merge_parses(rule, llm, ctx)` nihai taslağın üretildiği tek yer — hem kural sonucunu hem model sonucunu görüyor. `cikarim` olayı burada yazılır. Ham model metni `qwen_service.parse_personal_message` içinde yakalanır ve taşınır.

- [ ] **Adım 1: Başarısız testi yaz**

```python
def test_merge_parses_cikarim_olayi_yazar(logdir, monkeypatch):
    from src.bot.handlers import personal_flow
    rule = personal_flow.analyze_personal_message("1000tl borç verdim", {})
    birlesik = personal_flow.merge_parses(rule, None, {"conv": "c_1"})
    kayit = [r for r in _satirlar(logdir) if r["tur"] == "cikarim"]
    assert kayit, "merge_parses bir cikarim olayi yazmalı"
    assert kayit[0]["motor"] in {"kural", "qwen", "gemini", "karma"}
    assert "birlesik" in kayit[0]
    assert kayit[0]["birlesik"]["tutar"] == 1000.0


def test_ham_model_yaniti_kayda_gecer(logdir, monkeypatch):
    from src.ai import qwen_service
    monkeypatch.setattr(qwen_service, "_cagir", lambda *a, **k: '{"tur":"BORC_VERME","tutar":1000}')
    qwen_service.parse_personal_message("1000tl borç verdim", {"conv": "c_1"})
    kayit = [r for r in _satirlar(logdir) if r["tur"] == "cikarim"]
    assert any("BORC_VERME" in str(r.get("model_ham", "")) for r in kayit)
```

`_cagir` adı `qwen_service`'in gerçek HTTP çağrı fonksiyonuyla değiştirilmeli — dosyayı önce oku, uydurma.

- [ ] **Adım 2: Başarısız olduğunu gör** → `cikarim` olayı yok.

- [ ] **Adım 3: Kancaları ekle**

`merge_parses` sonunda, `return` öncesi:

```python
    convlog.cikarim(
        ctx.get("conv"),
        motor=("karma" if (rule and llm) else "qwen" if llm else "kural"),
        model=getattr(llm, "model", None),
        ms=ctx.get("llm_ms"),
        kural_sonucu=_ozet(rule),
        model_ham=ctx.get("llm_ham"),
        model_sonuc=_ozet(llm),
        birlesik=birlesik,
        guven=getattr(llm, "guven", None),
    )
```

`_ozet` dataclass'ı düz dict'e çeviren küçük bir yardımcı; `dataclasses.asdict` yeterliyse onu kullan.

`qwen_service.parse_personal_message` içinde ham yanıt ve süre `ctx["llm_ham"]`, `ctx["llm_ms"]`'e yazılır — böylece `merge_parses` tek olayda birleştirir ve iki ayrı satır oluşmaz.

- [ ] **Adım 4: Geçtiğini gör** — `.venv/bin/python -m pytest -q`

- [ ] **Adım 5: Commit**

```bash
git add -A && git commit -m "feat(obs): log the inference, raw model output included

merge_parses is the one place that sees both the rule parse and the model
parse, so one event there answers 'why was this wrong' without a second."
```

---

### Görev A5: Yazım kaydı

**Dosyalar:**
- Değişir: `src/data/personal_repository.py`
- Test: `tests/test_convlog_yazim.py`

- [ ] **Adım 1: Başarısız testi yaz**

```python
def test_borc_eklendiginde_yazim_olayi_dusuyor(logdir, repo):
    row = repo.add_debt(yon="VERDIM", kisi="BORA", tutar=1000.0, para_birimi="TRY")
    kayit = [r for r in _satirlar(logdir) if r["tur"] == "yazim"]
    assert kayit and kayit[-1]["dosya"] == "debts"
    assert kayit[-1]["islem"] == "ekle"
    assert kayit[-1]["id"] == row["id"]
    assert kayit[-1]["satir"]["kisi"] == "BORA"
```

`add_debt`'in gerçek imzasını dosyadan oku; yukarıdaki çağrı tahminî.

- [ ] **Adım 2: Başarısız olduğunu gör.**

- [ ] **Adım 3: Dekoratörü ekle**

`personal_repository.py` içinde küçük bir dekoratör tanımla ve mutasyon yapan public metotlara uygula: `add_entry`, `add_debt`, `settle_debt`, `add_transfer`, `add_category`, `add_account` (dosyadaki gerçek listeyi çıkar):

```python
def _kayitli(dosya: str, islem: str):
    def sar(fn):
        @functools.wraps(fn)
        def ic(self, *a, **k):
            row = fn(self, *a, **k)
            try:
                convlog.yazim(getattr(self, "_conv", None), dosya=dosya, islem=islem,
                              id=(row or {}).get("id"), satir=row)
            except Exception:
                pass
            return row
        return ic
    return sar
```

`self._conv`'u handler katmanı her akış başında `repo._conv = conv.mevcut(context)` ile set eder. Set edilmemişse olay `conv=None` ile yazılır — kayıt yine tutulur, sadece konuşmaya bağlanmaz.

- [ ] **Adım 4: Geçtiğini gör.**

- [ ] **Adım 5: Commit**

```bash
git add -A && git commit -m "feat(obs): log every ledger write with the row that landed"
```

---

### Görev A6: `/hata` komutu ve iptal gerekçesi

Spec §3.5. Bu, **bot davranışını değiştiren tek görev** — dikkatli ol.

**Dosyalar:**
- Değişir: `src/bot/main.py`, `src/bot/handlers/personal_flow.py`, `debt_flow.py`, `transfer_flow.py`
- Yeni: `src/bot/handlers/hata_flow.py`
- Test: `tests/test_hata_flow.py`

Üç iptal düğmesi var ve üçü de aynı ortak yardımcıya bağlanacak: `pf:cancel`, `pf:debt:cancel`, `pf:tr:cancel`.

- [ ] **Adım 1: Başarısız testi yaz**

```python
@pytest.mark.asyncio
async def test_iptal_gerekce_sorar(logdir, repo):
    upd, ctx = sahte_callback("pf:debt:cancel")
    await debt_flow.handle_debt_callbacks(upd, ctx)
    metin = upd.callback_query.message.replies[-1][0]
    assert "sebep" in metin.lower()
    butonlar = butonlari_duzle(upd.callback_query.message.replies[-1][1].get("reply_markup"))
    assert ["Yanlış anladın", "hata:yanlis"] in butonlar
    assert ["Vazgeçtim", "hata:vazgectim"] in butonlar


@pytest.mark.asyncio
async def test_yanlis_anladi_isaret_yazar(logdir):
    upd, ctx = sahte_callback("hata:yanlis")
    ctx.user_data["son_conv_id"] = "c_1"
    await hata_flow.handle_hata_callbacks(upd, ctx)
    kayit = [r for r in _satirlar(logdir) if r["tur"] == "isaret"]
    assert kayit[-1]["sebep"] == "yanlis_anladi"
    assert kayit[-1]["conv"] == "c_1"


@pytest.mark.asyncio
async def test_vazgectim_ayri_sebep_yazar(logdir):
    upd, ctx = sahte_callback("hata:vazgectim")
    ctx.user_data["son_conv_id"] = "c_1"
    await hata_flow.handle_hata_callbacks(upd, ctx)
    assert [r for r in _satirlar(logdir) if r["tur"] == "isaret"][-1]["sebep"] == "vazgectim"


@pytest.mark.asyncio
async def test_hata_komutu_son_konusmayi_isaretler(logdir):
    upd, ctx = sahte_komut("/hata bora'yı borcu ödedi sandı")
    ctx.user_data["son_conv_id"] = "c_9"
    await hata_flow.handle_hata_command(upd, ctx)
    kayit = [r for r in _satirlar(logdir) if r["tur"] == "isaret"][-1]
    assert kayit["conv"] == "c_9"
    assert kayit["sebep"] == "komut"
    assert "ödedi sandı" in kayit["not"]


@pytest.mark.asyncio
async def test_isaretlenecek_konusma_yoksa_nazikce_soyler(logdir):
    upd, ctx = sahte_komut("/hata")
    await hata_flow.handle_hata_command(upd, ctx)   # user_data boş
    assert "konuşma" in upd.message.replies[-1][0].lower()
```

`sahte_callback` / `sahte_komut` yardımcıları `tests/support/fake_telegram.py`'den gelir — **Görev B1 bu görevden önce yapılmalıysa sırayı değiştir.** Aksi halde bu testte yerel sahteler kullan ve B1'de birleştir.

- [ ] **Adım 2: Başarısız olduğunu gör.**

- [ ] **Adım 3: `hata_flow.py`'ı yaz ve üç iptali bağla**

Ortak yardımcı:

```python
GEREKCE_KLAVYESI = InlineKeyboardMarkup([[
    InlineKeyboardButton("Yanlış anladın", callback_data="hata:yanlis"),
    InlineKeyboardButton("Vazgeçtim", callback_data="hata:vazgectim"),
]])

async def iptal_et_ve_sor(query, context, temizle):
    """Akışı iptal eder, sonra tek satırlık gerekçe sorar (spec §3.5)."""
    temizle()                      # mevcut iptal davranışı — değiştirilmez
    conv.kapat(context)
    await query.message.reply_text("İptal edildi. Sebep?", reply_markup=GEREKCE_KLAVYESI)
```

Üç handler'daki `cancel` dallarında **mevcut temizleme mantığı aynen korunur**; sadece sonuna bu çağrı eklenir. İptalin kendisi hiçbir koşulda gecikmemeli veya başarısız olmamalı — gerekçe sorusu bir eklentidir, ön koşul değil.

`/hata` komutu `main.py`'a kaydedilir: `app.add_handler(CommandHandler(["hata"], handle_hata_command))`.

- [ ] **Adım 4: Geçtiğini gör** — `.venv/bin/python -m pytest -q`, 450+ yeşil.

- [ ] **Adım 5: Elle dene**

Botu yerel çalıştır, bir borç kaydı başlat, iptal et, iki düğmeyi de gör. Sonra `/hata deneme` yaz. `logs/conv-<bugün>.ndjson` dosyasında iki `isaret` olayı olmalı.

- [ ] **Adım 6: Commit**

```bash
git add -A && git commit -m "feat(bot): ask why on cancel, and add /hata

Cancel is where a bad inference usually becomes obvious and where the
evidence used to disappear. 'Vazgeçtim' and 'Yanlış anladın' are kept
apart: only one of them is worth reading later."
```

---

### Görev A7: Transkript okuyucu

**Dosyalar:**
- Yeni: `src/obs/render.py`
- Test: `tests/test_render.py`

- [ ] **Adım 1: Başarısız testi yaz**

```python
def test_transkript_konusmayi_bastan_sona_kurar(tmp_path, monkeypatch):
    from src.obs import render, convlog
    monkeypatch.setattr(convlog, "LOG_DIR", tmp_path)
    convlog.yaz("gelen", "c_1", metin="1000tl borç verdim")
    convlog.yaz("cikarim", "c_1", motor="kural", birlesik={"tur": "BORC_VERME", "tutar": 1000})
    convlog.yaz("giden", "c_1", metin="Kime?", butonlar=[["Bora", "pf:kisi:BORA"]])
    convlog.yaz("gelen", "c_1", callback="pf:kisi:BORA")
    convlog.yaz("yazim", "c_1", dosya="debts", islem="ekle", id="db_1")
    md = render.gun(dt.date.today().isoformat())
    assert "1000tl borç verdim" in md
    assert "Bora" in md
    assert "BORC_VERME" in md
    assert "debts" in md


def test_isaretli_filtresi_sadece_isaretlileri_verir(tmp_path, monkeypatch):
    from src.obs import render, convlog
    monkeypatch.setattr(convlog, "LOG_DIR", tmp_path)
    convlog.yaz("gelen", "c_1", metin="temiz konuşma")
    convlog.yaz("gelen", "c_2", metin="bozuk konuşma")
    convlog.yaz("isaret", "c_2", sebep="yanlis_anladi")
    md = render.gun(dt.date.today().isoformat(), sadece_isaretli=True)
    assert "bozuk konuşma" in md
    assert "temiz konuşma" not in md
```

- [ ] **Adım 2: Başarısız olduğunu gör.**

- [ ] **Adım 3: `render.py`'ı yaz**

`gun(gun, sadece_isaretli=False, conv=None) -> str`: NDJSON'ı okur, `conv`'a göre gruplar, her grup için markdown üretir — başlık satırında konuşma id'si, zamanı ve işaretliyse `⚠️`; gövdede zaman damgalı akış; `cikarim` bloğu ``` içinde; `yazim` sonda kalın.

`python -m src.obs.render <gun> [--isaretli] [--conv X] [--yaz]` — `--yaz` çıktıyı `logs/render/<gun>.md`'ye koyar (transkript Telegram'dan `/kayit` ile .md belgesi olarak da alınabilir).

- [ ] **Adım 4: Geçtiğini gör.**

- [ ] **Adım 5: Commit**

```bash
git add -A && git commit -m "feat(obs): render a day's NDJSON into a readable transcript"
```

---

### Görev A8: Drive'a taşıma ve dağıtım

**Dosyalar:**
- Değişir: `src/sync/once.py`, `deploy/README.md`
- Yeni: `logs/README.md` (VM'de; depoda `.gitignore`'a `logs/` eklenir)
- Test: `tests/test_bbb_sync.py`

Spec §4.2. Bu görevin iki maddesi de gözden kaçarsa sessizce zarar verir.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/test_bbb_sync.py`'deki mevcut rclone sahteleme kalıbını izle:

```python
def test_push_loglari_da_gonderir(sahte_rclone):
    once._run_rclone("push")
    komutlar = [" ".join(c) for c in sahte_rclone.cagrilar]
    assert any("logs" in k and "gdrive:logs/" in k for k in komutlar)


def test_pull_loglari_geri_cekmez(sahte_rclone):
    once._run_rclone("pull")
    pull = [c for c in sahte_rclone.cagrilar if "copy" in c and c[-1].endswith("data/")][0]
    assert "--exclude" in pull and "logs/**" in pull
```

- [ ] **Adım 2: Başarısız olduğunu gör.**

- [ ] **Adım 3: `_run_rclone`'u güncelle**

`pull` dalındaki ana komuta `--exclude logs/**` ekle (mevcut `--exclude backups/**` ile aynı kalıp). `push` dalına ikinci bir çağrı ekle:

```python
        logs = str(BBB_DIR / "logs") + "/"
        if Path(logs).is_dir():
            _rclone(["rclone", "copy", logs, "gdrive:logs/"], "push-logs")
```

`is_dir()` kontrolü şart: log klasörü henüz oluşmamışsa rclone hata verir ve tüm senkron döngüsü düşer.

- [ ] **Adım 4: `.path` birimini DEĞİŞTİRME**

`deploy/bbb-sync.path`'e log dosyası eklenmez. Eklenirse her Telegram mesajı bir rclone koşusu tetikler. Loglar bir sonraki zamanlanmış `.timer` koşusuyla gider. Bunu `deploy/README.md`'ye bir cümleyle not düş.

- [ ] **Adım 5: `.gitignore` ve README**

Depoya `logs/` eklenir (kayıtlar asla commit'lenmez). `deploy/README.md`'ye kısa bir bölüm: kayıtlar nerede, Drive'da nereye düşüyor, nasıl silinir (`rm ~/BBB/logs/conv-2026-08-*.ndjson && rclone delete gdrive:logs/...`), ve `bot.log` ile karıştırılmaması gerektiği.

- [ ] **Adım 6: Geçtiğini gör** — `.venv/bin/python -m pytest -q`

- [ ] **Adım 7: Commit ve push**

```bash
git add -A
git commit -m "feat(sync): push logs to Drive, and never pull them back

Without the pull exclusion the logs come back down as data/logs/ and grow
on every cycle."
git push origin main
```

**Faz A burada bitiyor.** VM'e dağıtmadan önce Enis'e haber ver: `git pull && sudo systemctl restart bbb-bot` gerekiyor ve birim adı VM'de teyit edilmeli.

---

# FAZ B — Senaryo test süreci

### Görev B1: Ortak sahte Telegram katmanı

`FakeMessage` / `FakeUpdate` / `FakeContext` **9 test dosyasında kopyalanmış**. Senaryo motorunun ihtiyaç duyduğu yetenekler tek sürümde olmalı.

**Dosyalar:**
- Yeni: `tests/support/__init__.py`, `tests/support/fake_telegram.py`
- Değişir: `class FakeMessage` içeren 9 test dosyası
- Test: mevcut 450 test — davranış değişmediğinin kanıtı bunların yeşil kalması

- [ ] **Adım 1: Kopyaları çıkar**

```bash
cd ~/Desktop/Market/BBB/bbb-telegram-bot
grep -rl "class FakeMessage" tests/
```

Dokuz dosyanın sürümlerini karşılaştır; **birleşik** sürüm hepsinin ihtiyaçlarını karşılamalı. Sürümler farklıysa en zengin olanı temel al, eksik yetenekleri ekle.

- [ ] **Adım 2: `tests/support/fake_telegram.py`'ı yaz**

Taşıması gerekenler: `reply_text` metni **ve** `reply_markup`'ı biriktirir; `edit_text`/`edit_message_text`; `answer_callback_query`; `FakeUpdate.callback(data)` ile düğme basışı üretme; `FakeContext.user_data` sürekliliği; `butonlar()` yardımcısıyla son mesajın düğmelerini düz liste olarak verme.

- [ ] **Adım 3: Dokuz dosyayı tek tek bağla**

Her dosyada yerel sınıfları sil, `from .support.fake_telegram import FakeMessage, FakeUpdate, FakeContext` ekle. **Her dosyadan sonra testleri koş** — dokuzunu birden değiştirip sonunda koşma; hangisinin kırıldığını bulmak zorlaşır.

```bash
.venv/bin/python -m pytest -q
```

- [ ] **Adım 4: 450 testin hâlâ geçtiğini doğrula**

Sayı düştüyse bir dosya sessizce atlanıyor demektir; `-q` yerine `--collect-only | tail` ile kontrol et.

- [ ] **Adım 5: Commit**

```bash
git add -A && git commit -m "refactor(tests): one fake Telegram layer instead of nine copies"
```

---

### Görev B2: Senaryo motoru

**Dosyalar:**
- Yeni: `tests/scenarios/__init__.py`, `tests/scenarios/motor.py`
- Test: `tests/scenarios/test_motor.py`

**Arayüzler:**
- Üretir: `Senaryo` dataclass'ı ve `async def kostur(senaryo, repo) -> Transkript`. B3–B4 bunu kullanır.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/scenarios/test_motor.py` — motorun kendisini sınayan, bota bakmayan testler:

```python
@pytest.mark.asyncio
async def test_motor_beklenen_metni_dogrular(repo):
    s = Senaryo(ad="x", gonder="merhaba", bekle_metin=r"bulunamad|anlamad")
    t = await kostur(s, repo)
    assert t.gecti, t.hata


@pytest.mark.asyncio
async def test_motor_eslesmeyen_butonu_yakalar(repo):
    s = Senaryo(ad="x", gonder="merhaba", bekle_butonlar=["Olmayan Düğme"])
    t = await kostur(s, repo)
    assert not t.gecti
    assert "Olmayan Düğme" in t.hata


@pytest.mark.asyncio
async def test_motor_transkript_uretir(repo):
    s = Senaryo(ad="x", gonder="merhaba")
    t = await kostur(s, repo)
    md = t.markdown()
    assert "merhaba" in md
    assert "→" in md   # gelen/giden yönü görünür olmalı


@pytest.mark.asyncio
async def test_cikarim_verilince_model_stublanir(repo, monkeypatch):
    s = Senaryo(ad="x", gonder="1000tl borç verdim",
                cikarim={"tur": "BORC_VERME", "tutar": 1000.0, "kisi": None})
    t = await kostur(s, repo)
    assert t.kullanilan_cikarim["tur"] == "BORC_VERME"
```

- [ ] **Adım 2: Başarısız olduğunu gör.**

- [ ] **Adım 3: `motor.py`'ı yaz**

```python
@dataclass
class Senaryo:
    ad: str
    gonder: str
    cikarim: dict | None = None      # verilirse model stub'lanır (K7)
    bekle_metin: str | None = None   # regex
    bekle_butonlar: list[str] | None = None
    bas: str | None = None           # bu etiketli düğmeye bas
    sonra: list["Adim"] = field(default_factory=list)
    bekle_kayit: tuple[str, dict] | None = None
    bekle_kayit_yok: bool = False
```

`kostur(senaryo, repo)`:
1. `cikarim` verilmişse `qwen_service.parse_personal_message`'ı sabit dönen bir fonksiyonla değiştir (zaten monkeypatch'lenebilir olduğu kodda not düşülmüş).
2. Metni gerçek `on_text_message` handler'ından geçir.
3. `bekle_metin` / `bekle_butonlar` doğrula.
4. `bas` verilmişse etiketten `callback_data`'yı bul, gerçek callback handler'ını çağır.
5. `sonra` adımlarını sırayla uygula.
6. `bekle_kayit` verilmişse `repo`'nun ilgili dosyasını okuyup **alt küme** eşleşmesi ara (satırın tüm alanları değil, verilenler).
7. Her adımı `Transkript`'e biriktir; `markdown()` okunabilir çıktı verir.

Koşucu her senaryo için `tests/scenarios/_ciktilar/<ad>.md` yazar (K8). Bu klasör `.gitignore`'a eklenir.

- [ ] **Adım 4: Geçtiğini gör.**

- [ ] **Adım 5: Commit**

```bash
git add -A && git commit -m "test(scenarios): declarative scenario engine that also prints a transcript

A green tick does not show how the bot behaved; the transcript does."
```

---

### Görev B3: Borç senaryoları

**Dosyalar:**
- Yeni: `tests/scenarios/test_borc.py`

Spec §5.3'teki tablo. **Beklentiler bugünkü davranışa göre değil, istenen davranışa göre yazılır.** Kırmızı kalan senaryolar rapor edilir — düzeltmek bu planın işi değil (spec §7).

- [ ] **Adım 1: Enis'in asıl örneğini yaz**

```python
BORC_SENARYOLARI = [
    Senaryo(
        ad="borc-verdim-kisi-eksik",
        gonder="1000tl borç verdim",
        cikarim={"tur": "BORC_VERME", "tutar": 1000.0, "paraBirimi": "TRY", "kisi": None},
        bekle_metin=r"kim",
        bekle_butonlar=["Bora", "Alper", "+ Yeni kişi"],
        bas="Bora",
        bekle_kayit=("debts", {"yon": "VERDIM", "kisi": "BORA", "tutar": 1000.0, "durum": "ACIK"}),
    ),
    Senaryo(
        ad="borc-verdim-yeni-kisi",
        gonder="1000tl borç verdim",
        cikarim={"tur": "BORC_VERME", "tutar": 1000.0, "kisi": None},
        bas="+ Yeni kişi",
        sonra=[Adim(yaz="Kerem"), Adim(bekle_metin=r"Kerem")],
        bekle_kayit=("debts", {"kisi": "KEREM", "yon": "VERDIM"}),
    ),
]
```

- [ ] **Adım 2: Kalan aileleri ekle**

| Senaryo adı | Girdi | Beklenen |
|---|---|---|
| `yon-borc-aldim` | "Bora'dan 500 borç aldım" | `yon: ALDIM`, kişi BORA |
| `yon-tersine-dikkat` | "Bora bana 1000 borçlandı" | `yon: VERDIM` (Bora borçlu) |
| `anlatim-odunc` | "Bora'ya 1000 ödünç verdim" | `yon: VERDIM` |
| `anlatim-attim` | "Bora'ya 1000 attım" | Borç mu transfer mi — hangisi olursa olsun **tutarlı** olmalı |
| `yazim-hatali` | "boç verdm bora 1000" | Tutar ve kişi yakalanır |
| `tutar-noktali` | "Bora'ya 1.000 tl verdim" | `tutar: 1000.0` (1.0 değil) |
| `tutar-yaziyla` | "Bora'ya bin lira borç verdim" | `tutar: 1000.0` |
| `belirsiz-kisi` | Defterde iki "Ali" varken "Ali'ye 500 verdim" | Seçim sunulur, ilki sessizce seçilmez |
| `iptal-yarim-kayit-birakmaz` | Akış ortasında iptal | `debts` boş kalır (`bekle_kayit_yok=True`) |
| `kapatma` | "Bora borcunu ödedi" | Mevcut kayıt `KAPALI`, yeni kayıt açılmaz |

`tutar-noktali` özellikle önemli: Türkçe binlik ayırıcı nokta, ondalık ayırıcı virgül. `1.000` bir yerde `1.0` olarak ayrıştırılıyorsa bu sessiz ve pahalı bir hatadır.

- [ ] **Adım 3: Koş ve **kırmızıları raporla****

```bash
.venv/bin/python -m pytest tests/scenarios/test_borc.py -q
```

Geçmeyen her senaryo için `tests/scenarios/_ciktilar/<ad>.md` transkriptini oku ve **kısa bir bulgu listesi çıkar**: senaryo adı, beklenen, gerçekleşen. Bu liste Enis'e sunulacak; kod düzeltmesi bu planın kapsamında değil.

Kırmızı senaryolar `@pytest.mark.xfail(reason="istenen davranış, henüz yok — bkz. bulgular")` ile işaretlenir ki suite yeşil kalsın ama fark kaybolmasın.

- [ ] **Adım 4: Commit**

```bash
git add -A && git commit -m "test(scenarios): debt scenarios, missing person to closing a debt

Scenarios are written against the behaviour we want; the ones that fail are
marked xfail and reported rather than quietly adjusted to today's output."
```

---

### Görev B4: Harcama, transfer ve taksit senaryoları

**Dosyalar:**
- Yeni: `tests/scenarios/test_harcama.py`, `tests/scenarios/test_transfer.py`, `tests/scenarios/test_taksit.py`

| Dosya | Senaryolar |
|---|---|
| `test_harcama.py` | "markette 340 lira"; "maaş yattı 85000" (GELIR); kategori eksik → sorulur; hesap eksik → sorulur; "dün markette 200" (tarih ifadesi); yabancı para "45 dolar yemek" |
| `test_transfer.py` | "garantiden nakite 5000 çektim" → iki hesap da doğru etkilenir; kaynak eksik → sorulur; aynı hesap seçilirse reddedilir |
| `test_taksit.py` | "3 taksitle 6000 buzdolabı" → 1 plan + 3 satır; taksit sayısı eksik → sorulur; tek çekim ile taksit ayrımı |

Her dosya B3'ün kalıbını izler: geçenler doğrulanır, geçmeyenler `xfail` + bulgu.

- [ ] **Adım 1: Üç dosyayı yaz, her birinden sonra koş.**
- [ ] **Adım 2: Bulgu listesini B3'ünkiyle birleştir.**
- [ ] **Adım 3: Commit**

```bash
git add -A && git commit -m "test(scenarios): expense, transfer and instalment families"
```

---

### Görev B5: Anlama eval'leri

**CI'da koşmaz (K7).** Ayrı ağaç, ayrı komut.

**Dosyalar:**
- Yeni: `evals/__init__.py`, `evals/run.py`, `evals/corpus/borc.yaml`, `evals/corpus/harcama.yaml`
- Değişir: `requirements.txt` (yalnızca `PyYAML` gerekiyorsa), `pytest.ini` (`evals` toplanmasın)

- [ ] **Adım 1: `pytest.ini`'nin evals'ı toplamadığını garanti et**

`testpaths = tests` zaten öyle, ama `--collect-only` ile doğrula. Eval dosyalarının adı `test_` ile başlamamalı.

- [ ] **Adım 2: Külliyat biçimi**

```yaml
# evals/corpus/borc.yaml
- girdi: "1000tl borç verdim"
  beklenen: {tur: BORC_VERME, tutar: 1000.0, paraBirimi: TRY}
- girdi: "Bora'dan 500 borç aldım"
  beklenen: {tur: BORC_ALMA, tutar: 500.0, kisi: BORA}
- girdi: "boç verdm bora 1000"
  beklenen: {tur: BORC_VERME, tutar: 1000.0, kisi: BORA}
```

En az 20 borç, 20 harcama girdisi. Enis'in saydığı yazım hatası ve farklı anlatım vakaları buranın asıl malzemesi.

- [ ] **Adım 3: Koşucuyu yaz**

`python -m evals.run [--aile borc] [--model qwen|gemini]`:
- Külliyatı okur, her girdi için **gerçek** `parse_personal_message`'ı çağırır.
- Alan alan karşılaştırır; `beklenen`de olmayan alanlara bakmaz.
- `evals/raporlar/<tarih>-<aile>.md` üretir: üstte aile skoru (`17/20`), altta **her ıskalanın** girdisi, beklenen, gelen ve modelin ham çıktısı.
- Çıkış kodu daima 0 — bu bir test değil, bir ölçüm.

- [ ] **Adım 4: Bir kez koştur ve taban skoru kaydet**

```bash
.venv/bin/python -m evals.run --aile borc
```

Qwen yerel olarak çalışmıyorsa (`QWEN_URL` erişilemiyorsa) koşucu bunu net söyleyip çıkmalı — sessizce sıfır skor üretmemeli.

- [ ] **Adım 5: Commit**

```bash
git add -A && git commit -m "eval: scored understanding corpus, deliberately outside CI

Real model calls are not deterministic; mixing them into the suite would
make CI flaky and nobody would trust red again."
```

---

### Görev B6: Kayıttan külliyata hasat

Döngüyü kapatan halka: elle deneme → işaret → aday → külliyat → ölçüm.

**Dosyalar:**
- Yeni: `evals/harvest.py`
- Test: `tests/test_harvest.py`

- [ ] **Adım 1: Başarısız testi yaz**

```python
def test_isaretli_konusmadan_aday_uretir(tmp_path, monkeypatch):
    from src.obs import convlog
    from evals import harvest
    monkeypatch.setattr(convlog, "LOG_DIR", tmp_path)
    convlog.yaz("gelen", "c_1", metin="bora'ya bin lira verdim")
    convlog.yaz("cikarim", "c_1", model_ham='{"tur":"GIDER"}', birlesik={"tur": "GIDER"})
    convlog.yaz("isaret", "c_1", sebep="yanlis_anladi")
    convlog.yaz("gelen", "c_2", metin="temiz olan")
    adaylar = harvest.topla(dt.date.today().isoformat())
    assert len(adaylar) == 1
    assert adaylar[0]["girdi"] == "bora'ya bin lira verdim"
    assert adaylar[0]["beklenen"] is None      # elle doldurulacak
    assert "GIDER" in str(adaylar[0]["gelen"])


def test_vazgectim_isareti_aday_uretmez(tmp_path, monkeypatch):
    # "Vazgeçtim" bot doğru çalıştığı halde fikir değiştirmektir — külliyata girmez
    ...
```

- [ ] **Adım 2: Başarısız olduğunu gör.**

- [ ] **Adım 3: `harvest.py`'ı yaz**

`topla(gun)` günün NDJSON'ını okur, `isaret.sebep == "yanlis_anladi"` olan `conv`'ları bulur, her birinden `{girdi, gelen, model_ham, beklenen: None}` üretir. `python -m evals.harvest --gun 2026-09-09` bunları `evals/corpus/_aday.yaml`'a yazar; `beklenen` alanları `TODO` olarak durur ve elle doldurulur.

`vazgectim` işaretleri **atlanır** — bot doğru çalışmış, kullanıcı fikir değiştirmiştir.

- [ ] **Adım 4: Geçtiğini gör.**

- [ ] **Adım 5: Commit ve push**

```bash
git add -A
git commit -m "eval: harvest flagged conversations into corpus candidates

This is the link that closes the loop: a bad inference Enis hits by hand
becomes a measured case instead of a story he has to retell."
git push origin main
```

---

## Bitti sayılır

- `.venv/bin/python -m pytest -q` yeşil ve test sayısı 450'nin altına düşmemiş.
- Bot bir mesaj aldığında `~/BBB/logs/conv-<bugün>.ndjson` büyüyor; içinde `gelen`, `cikarim` (ham model yanıtıyla), `giden` (düğmeleriyle) ve `yazim` olayları var.
- İptal edildiğinde bot sebep soruyor; iki düğme de `isaret` yazıyor. `/hata not` son konuşmayı işaretliyor.
- `logs/` Drive'da `logs/` klasöründe görünüyor ve bir sonraki `pull` onu `data/` içine **geri indirmiyor**.
- `python -m src.obs.render <gun> --isaretli` okunabilir bir transkript veriyor.
- `tests/scenarios/` altındaki senaryolar koşuyor ve `_ciktilar/` altına transkript basıyor; geçmeyenler `xfail` + Enis'e sunulan bulgu listesi.
- `python -m evals.run --aile borc` bir skor raporu üretiyor ve CI'da koşmuyor.
- `python -m evals.harvest --gun <gun>` işaretlenen konuşmalardan külliyat adayı çıkarıyor.

## Bu planın yapmadığı

Spec §7. Bu iş botu **ölçer, düzeltmez.** B3–B4'te kırmızı kalan senaryolar birer bulgudur; onları düzeltmek ayrı bir iştir ve ayrı bir plana konu olur. Senaryo beklentilerini bugünkü çıktıya uydurup yeşile boyamak bu planın açık ihlalidir.
