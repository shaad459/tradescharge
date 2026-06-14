export const NIFTY_LOT_SIZE = 65;
export const BANKNIFTY_LOT_SIZE = 30;
export const SENSEX_LOT_SIZE = 20;

export type IndexSymbol = "NIFTY" | "BANKNIFTY" | "SENSEX";

export interface IndexConfig {
  symbol: IndexSymbol;
  label: string;
  lotSize: number;
  exchange: "NFO" | "BFO";
  strikeStep: number;
  spotPrice: number;
}

export const INDEX_CONFIG: Record<IndexSymbol, IndexConfig> = {
  NIFTY: {
    symbol: "NIFTY",
    label: "Nifty 50",
    lotSize: NIFTY_LOT_SIZE,
    exchange: "NFO",
    strikeStep: 50,
    spotPrice: 24520,
  },
  BANKNIFTY: {
    symbol: "BANKNIFTY",
    label: "Bank Nifty",
    lotSize: BANKNIFTY_LOT_SIZE,
    exchange: "NFO",
    strikeStep: 100,
    spotPrice: 51200,
  },
  SENSEX: {
    symbol: "SENSEX",
    label: "Sensex",
    lotSize: SENSEX_LOT_SIZE,
    exchange: "BFO",
    strikeStep: 100,
    spotPrice: 80500,
  },
};

export const INDEX_SYMBOLS = Object.keys(INDEX_CONFIG) as IndexSymbol[];

export function getLotSize(symbol: string): number {
  const key = symbol.toUpperCase() as IndexSymbol;
  return INDEX_CONFIG[key]?.lotSize ?? NIFTY_LOT_SIZE;
}

/** Kite position `multiplier` is often 1 for F&O — use index lot size unless multiplier is a real lot. */
export function resolveFoLotSize(kiteMultiplier: number | undefined, symbol: string): number {
  const fromSymbol = getLotSize(symbol);
  if (kiteMultiplier != null && kiteMultiplier > 1) {
    return kiteMultiplier;
  }
  return fromSymbol;
}
