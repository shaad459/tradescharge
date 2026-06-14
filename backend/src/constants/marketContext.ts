export type MarketContextId = "GIFTNIFTY" | "VIX" | "CRUDE_JUN" | "USDINR";

export type MarketContextProvider = "kite" | "yahoo" | "frankfurter" | "morningstar";

export interface MarketContextInstrumentDef {
  id: MarketContextId;
  label: string;
  provider: MarketContextProvider;
  /** Kite quote key when provider is kite */
  quoteKey?: string;
}

export const MARKET_CONTEXT_INSTRUMENTS: MarketContextInstrumentDef[] = [
  {
    id: "GIFTNIFTY",
    label: "GIFT Nifty",
    provider: "kite",
    quoteKey: "NSEIX:GIFT NIFTY",
  },
  {
    id: "VIX",
    label: "India VIX",
    provider: "kite",
    quoteKey: "NSE:INDIA VIX",
  },
  {
    id: "USDINR",
    label: "USD/INR",
    provider: "kite",
    quoteKey: "CDS:USDINR",
  },
];

/** Kite NSE-CD spot; Yahoo used when logged out or quote missing. */
export const USDINR_KITE_QUOTE_KEY = "CDS:USDINR";

export const NIFTY_SPOT_QUOTE_KEY = "NSE:NIFTY 50";
