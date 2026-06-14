import type { IndexSymbol } from "../constants.js";
import type { OptionChainResponse } from "../types.js";
import {
  buildOptionChainFromInstruments,
  chainIncludesAtmStrike,
  getAllIndexInstrumentTokens,
  getIndexInstrumentTokens,
} from "./kiteInstruments.js";
import { enrichOptionChainWithLiveQuotes, fetchLiveIndexTickers } from "./kite.js";
import { getCachedMarketTick } from "./kiteTickCache.js";
import { syncLiveTicker, type TickerSubscription } from "./kiteLiveTicker.js";
import { clearMarketTickCache } from "./kiteTickCache.js";
import {
  buildIndexTickersFromCache,
  enrichOptionChainFromTickCache,
} from "./marketStreamApply.js";
import { lookupInstrumentToken } from "./kiteInstruments.js";
import { setUsdInrInstrumentToken, getUsdInrInstrumentToken } from "./usdInrLiveCache.js";

export interface ChainWatchState {
  symbol: IndexSymbol;
  expiry: string;
  chain: OptionChainResponse;
  indexToken?: number;
  quoteTokens: number[];
}

interface UserMarketWatch {
  accessToken: string;
  positionTokens: number[];
  chainWatch: ChainWatchState | null;
  indexTokens: Partial<Record<IndexSymbol, number>>;
  technicalWatchToken: number | null;
  usdInrToken: number | null;
}

const watches = new Map<string, UserMarketWatch>();
const chainRewindowInFlight = new Set<string>();

async function resolveLiveIndexSpot(
  accessToken: string,
  symbol: IndexSymbol,
): Promise<number | undefined> {
  try {
    const tickers = await fetchLiveIndexTickers(accessToken);
    return tickers.find((ticker) => ticker.symbol === symbol)?.spotPrice;
  } catch {
    return undefined;
  }
}

/** Rebuild strike window when live spot moved outside the loaded grid (e.g. stale default spot for Bank Nifty). */
export async function refreshChainWatchIfNeeded(userId: string): Promise<boolean> {
  const watch = watches.get(userId);
  const chainWatch = watch?.chainWatch;
  if (!watch || !chainWatch || chainRewindowInFlight.has(userId)) {
    return false;
  }

  const indexTick =
    chainWatch.indexToken != null
      ? getCachedMarketTick(userId, chainWatch.indexToken)
      : undefined;
  const spot = indexTick?.lastPrice;
  if (!spot || spot <= 0) {
    return false;
  }
  if (chainIncludesAtmStrike(chainWatch.symbol, chainWatch.chain.chain, spot)) {
    return false;
  }

  chainRewindowInFlight.add(userId);
  try {
    const rebuilt = await buildOptionChainFromInstruments(
      chainWatch.symbol,
      chainWatch.expiry,
      spot,
    );
    if (!rebuilt) {
      return false;
    }
    const enriched = await enrichOptionChainWithLiveQuotes(watch.accessToken, rebuilt);
    chainWatch.chain = { ...enriched, liveData: true };
    chainWatch.quoteTokens = quoteTokensFromChain(enriched);
    pushSubscriptions(userId);
    return true;
  } finally {
    chainRewindowInFlight.delete(userId);
  }
}

function quoteTokensFromChain(chain: OptionChainResponse): number[] {
  const tokens = new Set<number>();
  for (const row of chain.chain) {
    if (row.ce?.instrumentToken) {
      tokens.add(row.ce.instrumentToken);
    }
    if (row.pe?.instrumentToken) {
      tokens.add(row.pe.instrumentToken);
    }
  }
  return [...tokens];
}

function buildSubscription(watch: UserMarketWatch): TickerSubscription {
  const quoteSet = new Set<number>();

  for (const token of Object.values(watch.indexTokens)) {
    if (token != null && token > 0) {
      quoteSet.add(token);
    }
  }

  for (const token of watch.positionTokens) {
    if (token > 0) {
      quoteSet.add(token);
    }
  }

  if (watch.chainWatch) {
    for (const token of watch.chainWatch.quoteTokens) {
      quoteSet.add(token);
    }
    if (watch.chainWatch.indexToken != null && watch.chainWatch.indexToken > 0) {
      quoteSet.add(watch.chainWatch.indexToken);
    }
  }

  if (watch.technicalWatchToken != null && watch.technicalWatchToken > 0) {
    quoteSet.add(watch.technicalWatchToken);
  }

  return {
    ltpTokens: [],
    quoteTokens: [...quoteSet],
  };
}

export function setTechnicalWatchToken(userId: string, token: number | null): void {
  const watch = watches.get(userId);
  if (!watch) {
    return;
  }
  watch.technicalWatchToken = token != null && token > 0 ? token : null;
  pushSubscriptions(userId);
}

function pushSubscriptions(userId: string): void {
  const watch = watches.get(userId);
  if (!watch) {
    return;
  }
  syncLiveTicker(userId, watch.accessToken, buildSubscription(watch));
}

async function resolveUsdInrToken(): Promise<number | null> {
  let token = getUsdInrInstrumentToken();
  if (token != null) {
    return token;
  }
  token = (await lookupInstrumentToken("CDS", "USDINR")) ?? null;
  setUsdInrInstrumentToken(token);
  return token;
}

export async function ensureMarketWatch(
  userId: string,
  accessToken: string,
  positionTokens: number[] = [],
): Promise<void> {
  const existing = watches.get(userId);
  const indexTokens = await getIndexInstrumentTokens();
  const usdInrToken = await resolveUsdInrToken();

  watches.set(userId, {
    accessToken,
    positionTokens: [...new Set(positionTokens.filter((token) => token > 0))],
    chainWatch: existing?.chainWatch ?? null,
    indexTokens,
    technicalWatchToken: existing?.technicalWatchToken ?? null,
    usdInrToken,
  });

  pushSubscriptions(userId);
}

export async function setChainWatch(
  userId: string,
  accessToken: string,
  symbol: IndexSymbol,
  expiry: string,
): Promise<ChainWatchState | null> {
  const indexTokens = await getIndexInstrumentTokens();
  const indexToken = indexTokens[symbol];
  const spotPrice = await resolveLiveIndexSpot(accessToken, symbol);
  const built = await buildOptionChainFromInstruments(symbol, expiry, spotPrice);
  if (!built) {
    return null;
  }

  const chain = await enrichOptionChainWithLiveQuotes(accessToken, built);
  const quoteTokens = quoteTokensFromChain(chain);
  const chainWatch: ChainWatchState = {
    symbol,
    expiry: chain.expiry,
    chain: { ...chain, liveData: true },
    indexToken,
    quoteTokens,
  };

  const existing = watches.get(userId);
  const usdInrToken = existing?.usdInrToken ?? (await resolveUsdInrToken());
  watches.set(userId, {
    accessToken,
    positionTokens: existing?.positionTokens ?? [],
    chainWatch,
    indexTokens,
    technicalWatchToken: existing?.technicalWatchToken ?? null,
    usdInrToken,
  });

  pushSubscriptions(userId);
  return chainWatch;
}

export function clearChainWatch(userId: string): void {
  const watch = watches.get(userId);
  if (!watch) {
    return;
  }
  watch.chainWatch = null;
  pushSubscriptions(userId);
}

export function getStreamMarketData(userId: string) {
  const watch = watches.get(userId);
  if (!watch) {
    return {};
  }

  void refreshChainWatchIfNeeded(userId);

  const indexTickers = buildIndexTickersFromCache(userId, watch.indexTokens);
  if (watch.chainWatch) {
    const enriched = enrichOptionChainFromTickCache(
      userId,
      watch.chainWatch.chain,
      watch.chainWatch.indexToken,
    );
    watch.chainWatch.chain = enriched;
    return { indexTickers, optionChain: enriched };
  }

  return { indexTickers };
}

export function clearMarketWatch(userId: string): void {
  watches.delete(userId);
  clearMarketTickCache(userId);
}

export async function warmIndexTokens(): Promise<number[]> {
  return getAllIndexInstrumentTokens();
}
