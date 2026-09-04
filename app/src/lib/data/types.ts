export interface Transaction {
  id: string
  tarih: string
  hesap: string
  portfoy: string
  enstruman: string
  yon: 'AL' | 'SAT'
  lot: number
  girisParaBirimi: string
  fiyat_tl: number | null
  fiyat_usd: number
  kur: number | null
  komisyon_usd: number
  brut_usd: number
  net_usd: number
  not: string
  kaynak: string
  olusturulma: string | null
}

export interface Cashflow {
  id: string
  tarih: string
  hesap: string
  portfoy: string | null
  tur: 'YATIRMA' | 'CEKME' | 'TEMETTU' | 'TRANSFER'
  enstruman: string | null
  tutar_tl: number | null
  tutar_usd: number
  kur: number | null
  aciklama: string
  kaynak: string
  hedefHesap?: string
}

export interface AssetTransfer {
  id: string
  tarih: string
  enstruman: string
  lot: number
  kaynakHesap: string
  hedefHesap: string
  kaynakPortfoy: string | null
  hedefPortfoy: string | null
  aciklama: string
  kaynak: string
}

export interface Snapshot {
  tarih: string
  toplamOzkaynak_usd: number
  baslangicSermayesi_usd: number | null
  netMevduatCekim_usd: number
  cekim_usd: number
  nakitTemettu_usd: number
  nakit_usd: number | null
  gerceklesmemisKZ_usd: number | null
  netKZ_usd: number
  vergiKomisyon_usd: number
  kaynak: string
}

export interface Instrument {
  kod: string
  ad: string
  sinif: 'BIST' | 'ALTIN' | 'FON_PARA' | 'FON_HISSE' | 'USA'
  girisParaBirimi: string
  fiyatKaynagi: string
  fiyatSembolu: string
  seviyeler: {
    destek?: number
    direnc?: number
    hedef?: number
    birim?: string
    not?: string
    guncelleme?: string
  } | null
  /** grams of fine gold per unit — present only on `fiyatKaynagi: "altin-turev"` rows */
  altinKatsayi?: number
}

export interface Broker {
  kod: string
  ad: string
  tur: string
  sahip: string
  aktif: boolean
}

export interface Portfolio {
  kod: string
  ad: string
  aktif: boolean
}

export interface Meta {
  semaVersiyonu: number
  olusturulma: string
  kaynak: string
  nakitHesapBazli: Record<string, number>
  p0Sinirlari: string[]
}

export type FxRates = Record<string, number>

export interface Dataset {
  transactions: Transaction[]
  cashflows: Cashflow[]
  snapshots: Snapshot[]
  instruments: Instrument[]
  brokers: Broker[]
  portfolios: Portfolio[]
  meta: Meta
  fxrates: FxRates
  assetTransfers: AssetTransfer[]
}
