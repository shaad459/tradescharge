import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG, INDEX_SYMBOLS } from "../constants.js";
import type { AccountDetails, IndexTicker, OptionChainResponse, OptionLeg, Transaction } from "../types.js";
import { KiteConnect } from "kiteconnect";
import type { Position } from "../types.js";
import { getCachedMarketLtp } from "./kiteTickCache.js";
import {
  atmStrikeForSpot,
  buildOptionChainFromInstruments,
  chainIncludesAtmStrike,
  lookupInstrumentToken,
} from "./kiteInstruments.js";
import { computeSessionOiChange } from "./oiSession.js";
import { computeSummaryFromChain, withIvPercentile } from "./optionChainSummary.js";
import { collectChainIvs, enrichChainWithIv } from "./optionChainIv.js";
import { resolveIvPercentile } from "./ivPercentile.js";
import {
  destroySessionsForUserId,
  getSession,
} from "./sessionManager.js";

const INDEX_QUOTE_KEYS: Record<IndexSymbol, string> = {
  NIFTY: "NSE:NIFTY 50",
  BANKNIFTY: "NSE:NIFTY BANK",
  SENSEX: "BSE:SENSEX",
};

const OPTIONS_EXCHANGE: Record<IndexSymbol, "NFO" | "BFO"> = {
  NIFTY: "NFO",
  BANKNIFTY: "NFO",
  SENSEX: "BFO",
};

export function getKiteConfig() {
  const apiKey = process.env.KITE_API_KEY ?? "";
  const apiSecret = process.env.KITE_API_SECRET ?? "";
  const redirectUrl = process.env.KITE_REDIRECT_URL ?? "";

  return { apiKey, apiSecret, redirectUrl };
}

export function isKiteConfigured(): boolean {
  const { apiKey, apiSecret } = getKiteConfig();
  return Boolean(apiKey && apiSecret);
}

export function getLoginUrl(): string {
  const { apiKey } = getKiteConfig();
  const kite = new KiteConnect({ api_key: apiKey });
  return kite.getLoginURL();
}

export async function exchangeRequestToken(
  requestToken: string,
): Promise<{ accessToken: string; userId: string }> {
  const { apiKey, apiSecret } = getKiteConfig();

  if (!apiSecret) {
    throw new Error(
      "KITE_API_SECRET is missing. Add it to .env to enable live Zerodha login.",
    );
  }

  const kite = new KiteConnect({ api_key: apiKey });
  const session = await kite.generateSession(requestToken, apiSecret);

  return {
    accessToken: session.access_token,
    userId: session.user_id,
  };
}

export {
  appendOAuthStateToLoginUrl,
  clearAuthCookies,
  clearAuthCookies as clearSessionCookies,
  consumeOAuthState,
  createOAuthState,
  setOAuthStateCookie,
  createSession,
  destroySessionById,
  destroySessionsForUserId,
  getActiveSessionUserIds,
  getCsrfTokenForRequest,
  getSession,
  reconcileStaleSession,
  resolveRequestSession,
  restorePersistedSessions,
  setAuthCookies,
} from "./sessionManager.js";

export async function logoutSession(userId: string): Promise<void> {
  const session = getSession(userId);
  if (session?.accessToken) {
    try {
      const kite = kiteClient(session.accessToken);
      await kite.invalidateAccessToken();
    } catch (error) {
      console.error("Kite access token invalidation failed:", error);
    }
  }
  await destroySessionsForUserId(userId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positionExchange(symbol: string): "NFO" | "BFO" {
  return symbol === "SENSEX" ? "BFO" : "NFO";
}

function buildPositionTradingsymbol(position: Position): string {
  const d = new Date(position.expiry);
  const yy = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${position.symbol}${yy}${m}${dd}${position.strike}${position.instrumentType}`;
}

function quoteKeyForPosition(position: Position): string {
  const tradingsymbol = position.id.includes(":") ? position.id.split(":")[0]! : buildPositionTradingsymbol(position);
  const exchange = position.exchange ?? positionExchange(position.symbol);
  return `${exchange}:${tradingsymbol}`;
}

export async function fetchInstrumentLtp(
  accessToken: string,
  exchange: string,
  tradingsymbol: string,
  userId?: string,
): Promise<number | undefined> {
  if (userId) {
    const token = await lookupInstrumentToken(exchange, tradingsymbol);
    if (token != null) {
      const cached = getCachedMarketLtp(userId, token);
      if (cached != null && cached > 0) {
        return cached;
      }
    }
  }

  const kite = kiteClient(accessToken);
  const key = `${exchange}:${tradingsymbol}`;
  const quotes = await kite.getQuote([key]);
  const ltp = quotes[key]?.last_price;
  return ltp != null && ltp > 0 ? ltp : undefined;
}

export async function fetchLiveQuotesForPositions(
  accessToken: string,
  positions: Position[],
  _userId?: string,
): Promise<Map<string, number>> {
  if (positions.length === 0) {
    return new Map();
  }

  const kite = kiteClient(accessToken);
  const keys = positions.map((position) => quoteKeyForPosition(position));
  const quotes = await kite.getQuote(keys);
  const ltps = new Map<string, number>();

  for (const position of positions) {
    const quote = quotes[quoteKeyForPosition(position)];
    if (quote?.last_price != null && quote.last_price > 0) {
      ltps.set(position.id, quote.last_price);
    }
  }

  return ltps;
}

export async function refreshMockPositionsFromKite(accessToken: string): Promise<Position[]> {
  const { getMockPositions, setMockPositionLtp } = await import("../mock/positionStore.js");
  const positions = getMockPositions();
  const ltps = await fetchLiveQuotesForPositions(accessToken, positions);

  for (const [id, ltp] of ltps) {
    setMockPositionLtp(id, ltp);
  }

  return getMockPositions();
}

function syntheticIndexChange(spot: number): { spotChange: number; spotChangePct: number } {
  const spotChange = round2(spot * 0.0027);
  const spotChangePct = round2((spotChange / (spot - spotChange)) * 100);
  return { spotChange, spotChangePct };
}

export function getIndexTickers(): IndexTicker[] {
  return INDEX_SYMBOLS.map((symbol) => {
    const config = INDEX_CONFIG[symbol];
    const { spotChange, spotChangePct } = syntheticIndexChange(config.spotPrice);
    return {
      symbol,
      label: config.label,
      spotPrice: config.spotPrice,
      spotChange,
      spotChangePct,
    };
  });
}

/** Demo stream — gently drift index spots so the strip feels live without Kite. */
export function getAnimatedIndexTickers(): IndexTicker[] {
  const t = Date.now() / 4000;
  return INDEX_SYMBOLS.map((symbol, index) => {
    const config = INDEX_CONFIG[symbol];
    const jitter = Math.sin(t + index * 1.7) * (symbol === "SENSEX" ? 18 : 6);
    const spotPrice = round2(config.spotPrice + jitter);
    const { spotChange, spotChangePct } = syntheticIndexChange(spotPrice);
    return {
      symbol,
      label: config.label,
      spotPrice,
      spotChange,
      spotChangePct,
    };
  });
}

export async function fetchLiveIndexTickers(accessToken: string): Promise<IndexTicker[]> {
  const kite = kiteClient(accessToken);
  const keys = INDEX_SYMBOLS.map((symbol) => INDEX_QUOTE_KEYS[symbol]);
  const quotes = await kite.getQuote(keys);

  return INDEX_SYMBOLS.map((symbol) => {
    const config = INDEX_CONFIG[symbol];
    const quote = quotes[INDEX_QUOTE_KEYS[symbol]];
    const spotPrice = quote?.last_price ?? config.spotPrice;
    const spotChange = quote?.net_change ?? syntheticIndexChange(spotPrice).spotChange;
    const spotChangePct =
      spotPrice > 0 && spotChange !== 0
        ? round2((spotChange / (spotPrice - spotChange)) * 100)
        : syntheticIndexChange(spotPrice).spotChangePct;

    return {
      symbol,
      label: config.label,
      spotPrice,
      spotChange: round2(spotChange),
      spotChangePct,
    };
  });
}

export function kiteClient(accessToken: string) {
  const { apiKey } = getKiteConfig();
  const kite = new KiteConnect({ api_key: apiKey });
  kite.setAccessToken(accessToken);
  return kite;
}

export type ParsedEquityMargins = {
  net: number;
  available: number;
  openingBalance: number;
  m2mRealised: number;
  m2mUnrealised: number;
  marginEnabled: boolean;
};

export function parseEquityMargins(margins: unknown): ParsedEquityMargins {
  const payload = margins as {
    enabled?: boolean;
    net?: number;
    available?: { live_balance?: number; cash?: number; opening_balance?: number };
    utilised?: { m2m_realised?: number; m2m_unrealised?: number };
    equity?: {
      enabled?: boolean;
      net?: number;
      available?: { live_balance?: number; cash?: number; opening_balance?: number };
      utilised?: { m2m_realised?: number; m2m_unrealised?: number };
    };
  };
  const equity = payload.equity ?? payload;
  const net = Number(equity.net ?? 0);
  const available = Number(
    equity.available?.live_balance ?? equity.available?.cash ?? net,
  );
  const openingBalance = Number(equity.available?.opening_balance ?? net);
  const m2mRealised = Number(equity.utilised?.m2m_realised ?? 0);
  const m2mUnrealised = Number(equity.utilised?.m2m_unrealised ?? 0);
  const marginEnabled = Boolean(equity.enabled ?? payload.enabled ?? false);
  return { net, available, openingBalance, m2mRealised, m2mUnrealised, marginEnabled };
}

export async function fetchLiveMargins(accessToken: string): Promise<ParsedEquityMargins> {
  const kite = kiteClient(accessToken);
  const margins = await kite.getMargins("equity");
  return parseEquityMargins(margins);
}

export async function fetchLiveBalance(accessToken: string): Promise<number> {
  const { net } = await fetchLiveMargins(accessToken);
  return net;
}

export async function fetchLiveProfile(accessToken: string): Promise<AccountDetails> {
  const kite = kiteClient(accessToken);
  const profile = await kite.getProfile();
  return {
    userName: profile.user_name,
    broker: profile.broker ?? "Zerodha",
    clientId: profile.user_id,
    email: profile.email,
    segment: profile.exchanges?.join(", ") ?? "F&O",
    pan: "—",
  };
}

export async function fetchLiveTrades(accessToken: string): Promise<Transaction[]> {
  const kite = kiteClient(accessToken);
  const trades = await kite.getTrades();

  return trades.map((trade) => {
    const gross = trade.average_price * trade.quantity;
    return {
      id: String(trade.trade_id),
      timestamp: new Date(trade.fill_timestamp).toISOString(),
      symbol: trade.tradingsymbol,
      type: trade.transaction_type as "BUY" | "SELL",
      quantity: trade.quantity,
      price: trade.average_price,
      charges: 0,
      netAmount: trade.transaction_type === "BUY" ? -gross : gross,
    };
  });
}

export async function fetchLivePositions(accessToken: string): Promise<Position[]> {
  const { fetchLiveKiteSnapshot } = await import("./liveKiteSync.js");
  const snapshot = await fetchLiveKiteSnapshot(accessToken);
  return snapshot.positions;
}

export async function cancelKiteOrder(
  accessToken: string,
  orderId: string,
  variety = "regular",
): Promise<void> {
  await kiteClient(accessToken).cancelOrder(variety, orderId);
}

async function fetchQuotesBatched(
  kite: ReturnType<typeof kiteClient>,
  keys: string[],
): Promise<Record<string, NormalizedQuote>> {
  const BATCH_SIZE = 250;
  const merged: Record<string, NormalizedQuote> = {};

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const quotes = await kite.getQuote(batch);
    for (const [key, raw] of Object.entries(quotes)) {
      merged[key] = normalizeKiteQuote(raw as Record<string, unknown>);
    }
  }

  return merged;
}

interface NormalizedQuote {
  last_price: number;
  net_change: number;
  oi: number;
  volume: number;
  oi_day_high: number;
  oi_day_low: number;
}

function normalizeKiteQuote(raw: Record<string, unknown>): NormalizedQuote {
  const volume = Number(
    raw.volume ?? raw.volume_traded ?? raw.day_volume ?? raw.traded_volume ?? 0,
  );
  return {
    last_price: Number(raw.last_price ?? 0),
    net_change: Number(raw.net_change ?? raw.change ?? 0),
    oi: Number(raw.oi ?? raw.open_interest ?? 0),
    volume: Number.isFinite(volume) ? volume : 0,
    oi_day_high: Number(raw.oi_day_high ?? 0),
    oi_day_low: Number(raw.oi_day_low ?? 0),
  };
}

function quoteHasData(quote?: NormalizedQuote): boolean {
  return Boolean(quote && (quote.last_price > 0 || quote.oi > 0));
}

function applyQuoteToLeg(leg: OptionLeg, quote: NormalizedQuote): OptionLeg {
  const oi = quote.oi > 0 ? quote.oi : leg.oi;
  const token = leg.instrumentToken ?? 0;
  const oiChange =
    token > 0 ? computeSessionOiChange(token, oi, quote.oi_day_low) : leg.oiChange;

  return {
    ...leg,
    ltp: quote.last_price > 0 ? quote.last_price : leg.ltp,
    ltpChange: quote.last_price > 0 ? round2(quote.net_change) : leg.ltpChange,
    oi,
    oiChange,
    volume: Math.max(leg.volume, quote.volume > 0 ? quote.volume : 0),
  };
}

export async function enrichOptionChainWithLiveQuotes(
  accessToken: string,
  chain: OptionChainResponse,
): Promise<OptionChainResponse> {
  const kite = kiteClient(accessToken);
  const symbol = chain.symbol as IndexSymbol;
  const exchange = OPTIONS_EXCHANGE[symbol] ?? "NFO";
  const indexKey = INDEX_QUOTE_KEYS[symbol];

  const indexQuotes = await fetchQuotesBatched(kite, [indexKey]);
  const indexQuote = indexQuotes[indexKey];
  const spotPrice = indexQuote?.last_price ?? chain.spotPrice;
  const spotChange = indexQuote?.net_change ?? chain.spotChange;
  const spotChangePct =
    spotPrice > 0 && spotChange !== 0
      ? round2((spotChange / (spotPrice - spotChange)) * 100)
      : chain.spotChangePct;

  let baseChain = chain;
  if (!chainIncludesAtmStrike(symbol, chain.chain, spotPrice)) {
    const rebuilt = await buildOptionChainFromInstruments(symbol, chain.expiry, spotPrice);
    if (rebuilt) {
      baseChain = {
        ...rebuilt,
        expiries: chain.expiries.length > 0 ? chain.expiries : rebuilt.expiries,
        spotChange,
        spotChangePct,
      };
    }
  }

  const keys: string[] = [indexKey];
  for (const row of baseChain.chain) {
    if (row.ce) {
      keys.push(`${exchange}:${row.ce.tradingsymbol}`);
    }
    if (row.pe) {
      keys.push(`${exchange}:${row.pe.tradingsymbol}`);
    }
  }

  const quotes = await fetchQuotesBatched(kite, keys);
  const atmStrike = atmStrikeForSpot(symbol, spotPrice);

  const updatedChain = baseChain.chain.map((row) => {
    const ceKey = row.ce ? `${exchange}:${row.ce.tradingsymbol}` : null;
    const peKey = row.pe ? `${exchange}:${row.pe.tradingsymbol}` : null;
    const ceQuote = ceKey ? quotes[ceKey] : undefined;
    const peQuote = peKey ? quotes[peKey] : undefined;

    return {
      ...row,
      isAtm: row.strike === atmStrike,
      ce: row.ce && ceQuote && quoteHasData(ceQuote) ? applyQuoteToLeg(row.ce, ceQuote) : row.ce,
      pe: row.pe && peQuote && quoteHasData(peQuote) ? applyQuoteToLeg(row.pe, peQuote) : row.pe,
    };
  });

  const quoted = {
    ...baseChain,
    spotPrice,
    spotChange: round2(spotChange),
    spotChangePct,
    chain: updatedChain,
    liveData: true,
  };

  const withIv = enrichChainWithIv(quoted);
  const ivPercentile = await resolveIvPercentile(
    accessToken,
    chain.symbol as IndexSymbol,
    withIv.summary.atmIv,
    collectChainIvs(withIv),
  );

  return {
    ...withIv,
    summary: withIvPercentile(withIv.summary, ivPercentile),
  };
}

export async function placeKiteOrder(
  accessToken: string,
  params: {
    exchange: string;
    tradingsymbol: string;
    transaction_type: "BUY" | "SELL";
    quantity: number;
    product: string;
    order_type: "MARKET" | "LIMIT" | "SL" | "SL-M";
    price?: number;
    trigger_price?: number;
    validity?: "DAY" | "IOC";
    disclosed_quantity?: number;
    amo?: boolean;
  },
): Promise<string | number> {
  const kite = kiteClient(accessToken);
  const variety = params.amo ? "amo" : "regular";

  const orderPromise = kite.placeOrder(variety, {
    exchange: params.exchange as "NFO" | "BFO" | "NSE" | "BSE",
    tradingsymbol: params.tradingsymbol,
    transaction_type: params.transaction_type,
    quantity: params.quantity,
    product: params.product as "NRML" | "MIS" | "CNC",
    order_type: params.order_type,
    validity: params.validity ?? "DAY",
    price:
      params.order_type === "LIMIT" || params.order_type === "SL"
        ? params.price
        : undefined,
    trigger_price:
      params.order_type === "SL" || params.order_type === "SL-M"
        ? params.trigger_price
        : undefined,
    disclosed_quantity: params.disclosed_quantity,
  });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Kite order timed out after 15s")), 15000);
  });

  const response = await Promise.race([orderPromise, timeout]);
  return response.order_id;
}
