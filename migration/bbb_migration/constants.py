"""Statik eşlemeler ve sabitler — tasarım dokümanı §5.3, §5.4, §8.2."""

MONEY_ROUND = 6
DATA_START_ROW = 15

TRADE_LOG_COLS = {
    "no": "C", "portfoy": "D", "tarih": "E", "kod": "F",
    "yon": "G", "tl": "H", "fiyat": "I", "lot": "J", "komisyon": "K",
}


def normalize_label(s: str) -> str:
    return s.strip().lower().replace(".", "").replace(" ", "")


_RAW_LABEL_MAP = {
    "QNB": ("QNB", "ENIS"),
    "KASA": ("KASA", "ENIS"),
    "MID.USA": ("MIDAS", "USA"),
    "TEB": ("TEB", "ENIS"),
    "OYAK E": ("OYAK-E", "ENIS"),
    "M.Delta": ("MIDAS", "DELTA"),
    "GARAN": ("GARAN", "ENIS"),
    "MIDAS": ("MIDAS", "ENIS"),
    "M.Alfa": ("MIDAS", "ALFA"),
    "QNB.F": ("QNB", "FON"),
}
LABEL_MAP = {normalize_label(k): v for k, v in _RAW_LABEL_MAP.items()}

BROKERS = [
    {"kod": "GARAN", "ad": "Garanti Yatırım", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "MIDAS", "ad": "Midas", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "QNB", "ad": "QNB Finansinvest", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "TEB", "ad": "TEB Yatırım", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "OYAK-E", "ad": "Oyak · Enis", "tur": "BROKER", "sahip": "Enis", "aktif": True},
    {"kod": "OYAK-ANNE", "ad": "Oyak · Anne", "tur": "BROKER", "sahip": "Anne", "aktif": True},
    {"kod": "KASA", "ad": "Kasa (fiziki)", "tur": "FIZIKI", "sahip": "Enis", "aktif": True},
]

PORTFOLIOS = [
    {"kod": "ENIS", "ad": "Enis (kendi seçimlerim)", "aktif": True},
    {"kod": "ALFA", "ad": "Alfa (Yatırım101)", "aktif": True},
    {"kod": "DELTA", "ad": "Delta (Yatırım101)", "aktif": True},
    {"kod": "FON", "ad": "Fonlar", "aktif": True},
    {"kod": "USA", "ad": "ABD Piyasası", "aktif": True},
]
