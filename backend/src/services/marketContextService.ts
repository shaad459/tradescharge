import {
  crudeFutDisplayLabel,
  parseQuoteKey,
  resolveCrudeQuoteKey,
} from "../constants/crudeFuture.js";
import {
  MARKET_CONTEXT_INSTRUMENTS,
  NIFTY_SPOT_QUOTE_KEY,
  USDINR_KITE_QUOTE_KEY,
  type MarketContextId,
} from "../constants/marketContext.js";
import { kiteClient } from "./kite.js";
import { fetchUsdInrSpot } from "./usdInrSpotService.js";
import { getUsdInrLiveTickQuote } from "./usdInrLiveCache.js";

export interface FetchMarketContextOptions {
  crudeQuoteKey?: string | null;
}

export interface MarketContextQuote {
  id: MarketContextId;
  label: string;
  exchange: string;
  tradingsymbol: string;
  lastPrice: number;
  change: number;
  changePct: number;
  source?: "kite" | "yahoo" | "frankfurter" | "morningstar";
}

export interface GiftNiftyDivergence {
  giftPrice: number;
  spotPrice: number;
  points: number;
}

export interface MarketContextResponse {
  quotes: MarketContextQuote[];
  giftDivergence: GiftNiftyDivergence | null;
  asOf: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function changePct(last: number, change: number): number {
  const prev = last - change;
  if (!Number.isFinite(prev) || prev <= 0) {
    return 0;
  }
  return round2((change / prev) * 100);
}

function quoteDayChange(raw: Record<string, unknown>): number {
  const last = Number(raw.last_price ?? 0);
  const net = Number(raw.net_change ?? raw.change ?? 0);
  if (Number.isFinite(net) && net !== 0) {
    return round2(net);
  }
  const ohlc = raw.ohlc as { close?: number } | undefined;
  const prevClose = Number(ohlc?.close ?? 0);
  if (last > 0 && prevClose > 0) {
    return round2(last - prevClose);
  }
  return 0;
}

function quoteLastPrice(raw: Record<string, unknown> | undefined): number {
  if (!raw) {
    return 0;
  }
  const last = Number(raw.last_price ?? 0);
  if (Number.isFinite(last) && last > 0) {
    return last;
  }
  const ohlc = raw.ohlc as { close?: number } | undefined;
  const prevClose = Number(ohlc?.close ?? 0);
  return Number.isFinite(prevClose) && prevClose > 0 ? prevClose : 0;
}

function usdInrSpotToQuote(spot: {
  lastPrice: number;
  change: number;
  changePct: number;
  source: MarketContextQuote["source"];
}): MarketContextQuote {
  const exchange =
    spot.source === "kite"
      ? "CDS"
      : spot.source === "morningstar"
        ? "Morningstar"
        : spot.source === "yahoo"
          ? "Yahoo"
          : "Spot";
  return {
    id: "USDINR",
    label: "USD/INR",
    exchange,
    tradingsymbol: spot.source === "yahoo" ? "INR=X" : "USDINR",
    lastPrice: round2(spot.lastPrice),
    change: spot.change,
    changePct: spot.changePct,
    source: spot.source,
  };
}

async function resolveUsdInrQuote(
  accessToken: string | undefined,
  kiteQuotes?: Record<string, Record<string, unknown>>,
): Promise<MarketContextQuote | null> {
  const usdInrSpot = await fetchUsdInrSpot();
  if (usdInrSpot) {
    return usdInrSpotToQuote(usdInrSpot);
  }

  const liveTick = getUsdInrLiveTickQuote(60_000);
  if (liveTick) {
    return usdInrSpotToQuote(liveTick);
  }

  if (accessToken && kiteQuotes) {
    const quote = kiteQuotes[USDINR_KITE_QUOTE_KEY];
    const lastPrice = quoteLastPrice(quote);
    if (lastPrice > 0) {
      const change = quote ? quoteDayChange(quote) : 0;
      return usdInrSpotToQuote({
        lastPrice,
        change,
        changePct: changePct(lastPrice, change),
        source: "kite",
      });
    }
  }

  return null;
}

export async function fetchMarketContext(
  accessToken: string | undefined,
  options?: FetchMarketContextOptions,
): Promise<MarketContextResponse> {
  const crudeQuoteKey = resolveCrudeQuoteKey(options?.crudeQuoteKey);
  const resultQuotes: MarketContextQuote[] = [];

  if (!accessToken) {
    const usdInr = await resolveUsdInrQuote(undefined);
    if (usdInr) {
      resultQuotes.push(usdInr);
    }
    return {
      quotes: resultQuotes,
      giftDivergence: null,
      asOf: new Date().toISOString(),
    };
  }

  const kiteDefs = MARKET_CONTEXT_INSTRUMENTS.filter(
    (d) => d.provider === "kite" && d.quoteKey && d.id !== "USDINR",
  );
  const kiteKeys = [
    ...kiteDefs.map((d) => d.quoteKey!),
    crudeQuoteKey,
    NIFTY_SPOT_QUOTE_KEY,
    USDINR_KITE_QUOTE_KEY,
  ];

  const quotes = await kiteClient(accessToken).getQuote([...new Set(kiteKeys)]);

  const usdInr = await resolveUsdInrQuote(accessToken, quotes as Record<string, Record<string, unknown>>);
  if (usdInr) {
    resultQuotes.push(usdInr);
  }

  for (const def of kiteDefs) {
    const key = def.quoteKey!;
    const quote = quotes[key] as Record<string, unknown> | undefined;
    const lastPrice = quoteLastPrice(quote);
    if (lastPrice <= 0) {
      continue;
    }
    const change = quote ? quoteDayChange(quote) : 0;
    const { exchange, tradingsymbol } = parseQuoteKey(key);
    resultQuotes.push({
      id: def.id,
      label: def.label,
      exchange,
      tradingsymbol,
      lastPrice: round2(lastPrice),
      change,
      changePct: changePct(lastPrice, change),
      source: "kite",
    });
  }

  const crudeQuote = quotes[crudeQuoteKey] as Record<string, unknown> | undefined;
  const crudeLast = quoteLastPrice(crudeQuote);
  if (crudeLast > 0) {
    const { exchange, tradingsymbol } = parseQuoteKey(crudeQuoteKey);
    const crudeChange = crudeQuote ? quoteDayChange(crudeQuote) : 0;
    resultQuotes.push({
      id: "CRUDE_JUN",
      label: crudeFutDisplayLabel(tradingsymbol),
      exchange: "MCX",
      tradingsymbol,
      lastPrice: round2(crudeLast),
      change: crudeChange,
      changePct: changePct(crudeLast, crudeChange),
      source: "kite",
    });
  }

  const gift = resultQuotes.find((q) => q.id === "GIFTNIFTY");
  const niftyQuote = quotes[NIFTY_SPOT_QUOTE_KEY] as Record<string, unknown> | undefined;
  const spotPrice = Number(niftyQuote?.last_price ?? 0);

  let giftDivergence: GiftNiftyDivergence | null = null;
  if (gift && Number.isFinite(spotPrice) && spotPrice > 0) {
    giftDivergence = {
      giftPrice: gift.lastPrice,
      spotPrice: round2(spotPrice),
      points: round2(gift.lastPrice - spotPrice),
    };
  }

  return {
    quotes: resultQuotes,
    giftDivergence,
    asOf: new Date().toISOString(),
  };
}
