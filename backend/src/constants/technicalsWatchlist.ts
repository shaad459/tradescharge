import type { IndexSymbol } from "../constants.js";
import { INDEX_SYMBOLS } from "../constants.js";

/** Indices / benchmarks available in the technicals panel (incl. option-chain underlyings). */
export type TechnicalWatchKey = IndexSymbol | "GIFTNIFTY" | "VIX";

export const OPTION_CHAIN_SYMBOLS: IndexSymbol[] = ["NIFTY", "BANKNIFTY", "SENSEX"];

export const TECHNICAL_WATCH_KEYS: TechnicalWatchKey[] = [
  ...INDEX_SYMBOLS,
  "GIFTNIFTY",
  "VIX",
];

export interface TechnicalWatchMeta {
  key: TechnicalWatchKey;
  label: string;
  exchange: string;
  tradingsymbol: string;
  instrumentToken: number;
  hasOptionChain: boolean;
}

export const TECHNICAL_WATCHLIST: Record<TechnicalWatchKey, TechnicalWatchMeta> = {
  NIFTY: {
    key: "NIFTY",
    label: "Nifty 50",
    exchange: "NSE",
    tradingsymbol: "NIFTY 50",
    instrumentToken: 256265,
    hasOptionChain: true,
  },
  BANKNIFTY: {
    key: "BANKNIFTY",
    label: "Bank Nifty",
    exchange: "NSE",
    tradingsymbol: "NIFTY BANK",
    instrumentToken: 260105,
    hasOptionChain: true,
  },
  SENSEX: {
    key: "SENSEX",
    label: "Sensex",
    exchange: "BSE",
    tradingsymbol: "SENSEX",
    instrumentToken: 265,
    hasOptionChain: true,
  },
  GIFTNIFTY: {
    key: "GIFTNIFTY",
    label: "GIFT Nifty",
    exchange: "NSEIX",
    tradingsymbol: "GIFT NIFTY",
    instrumentToken: 291849,
    hasOptionChain: false,
  },
  VIX: {
    key: "VIX",
    label: "India VIX",
    exchange: "NSE",
    tradingsymbol: "INDIA VIX",
    instrumentToken: 264969,
    hasOptionChain: false,
  },
};

export function isTechnicalWatchKey(value: string): value is TechnicalWatchKey {
  return value in TECHNICAL_WATCHLIST;
}

export function isOptionChainSymbol(key: TechnicalWatchKey): key is IndexSymbol {
  return OPTION_CHAIN_SYMBOLS.includes(key as IndexSymbol);
}
