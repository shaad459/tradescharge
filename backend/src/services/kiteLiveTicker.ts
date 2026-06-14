import { KiteTicker, type Tick, type Ticker } from "kiteconnect";
import { getKiteConfig } from "./kite.js";
import { mergeMarketTicks } from "./kiteTickCache.js";

export interface TickerSubscription {
  ltpTokens: number[];
  quoteTokens: number[];
}

export type LiveTickHandler = (userId: string, ticks: Tick[], ltpByToken: Map<number, number>) => void;

interface UserTicker {
  ticker: Ticker;
  ltpTokens: number[];
  quoteTokens: number[];
}

const tickers = new Map<string, UserTicker>();
let tickHandler: LiveTickHandler | null = null;

function sameTokenSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((token, index) => token === sortedB[index]);
}

function sameSubscription(a: TickerSubscription, b: TickerSubscription): boolean {
  return sameTokenSet(a.ltpTokens, b.ltpTokens) && sameTokenSet(a.quoteTokens, b.quoteTokens);
}

function subscribeTokenGroups(ticker: Ticker, ltpTokens: number[], quoteTokens: number[]) {
  const all = [...new Set([...ltpTokens, ...quoteTokens])];
  if (all.length === 0) {
    return;
  }

  ticker.subscribe(all);
  if (ltpTokens.length > 0) {
    ticker.setMode(ticker.modeLTP, ltpTokens);
  }
  if (quoteTokens.length > 0) {
    // Full mode includes OI + day high/low (quote mode does not).
    ticker.setMode(ticker.modeFull, quoteTokens);
  }
}

function resubscribeTokenGroups(
  ticker: Ticker,
  previous: TickerSubscription,
  next: TickerSubscription,
) {
  const previousAll = new Set([...previous.ltpTokens, ...previous.quoteTokens]);
  const nextAll = new Set([...next.ltpTokens, ...next.quoteTokens]);
  const toRemove = [...previousAll].filter((token) => !nextAll.has(token));
  const toAdd = [...nextAll].filter((token) => !previousAll.has(token));

  if (toRemove.length > 0) {
    ticker.unsubscribe(toRemove);
  }
  if (toAdd.length > 0) {
    ticker.subscribe(toAdd);
  }

  const addedLtp = toAdd.filter((token) => next.ltpTokens.includes(token));
  const addedQuote = toAdd.filter((token) => next.quoteTokens.includes(token));
  if (addedLtp.length > 0) {
    ticker.setMode(ticker.modeLTP, addedLtp);
  }
  if (addedQuote.length > 0) {
    ticker.setMode(ticker.modeFull, addedQuote);
  }

  const modeOnlyLtp = next.ltpTokens.filter((token) => !next.quoteTokens.includes(token));
  const modeQuote = next.quoteTokens;
  if (modeOnlyLtp.length > 0) {
    ticker.setMode(ticker.modeLTP, modeOnlyLtp);
  }
  if (modeQuote.length > 0) {
    ticker.setMode(ticker.modeFull, modeQuote);
  }
}

export function setLiveTickHandler(handler: LiveTickHandler | null): void {
  tickHandler = handler;
}

export function syncLiveTicker(
  userId: string,
  accessToken: string,
  subscription: TickerSubscription,
): void {
  const ltpTokens = [...new Set(subscription.ltpTokens.filter((token) => token > 0))];
  const quoteTokens = [...new Set(subscription.quoteTokens.filter((token) => token > 0))];
  const next = { ltpTokens, quoteTokens };

  if (ltpTokens.length === 0 && quoteTokens.length === 0) {
    stopLiveTicker(userId);
    return;
  }

  const existing = tickers.get(userId);
  if (existing && sameSubscription(existing, next)) {
    return;
  }

  if (existing?.ticker.connected()) {
    resubscribeTokenGroups(existing.ticker, existing, next);
    tickers.set(userId, { ticker: existing.ticker, ...next });
    return;
  }

  if (existing) {
    try {
      existing.ticker.disconnect();
    } catch {
      // ignore disconnect errors while replacing ticker
    }
    tickers.delete(userId);
  }

  const { apiKey } = getKiteConfig();
  if (!apiKey) {
    return;
  }

  const ticker = new KiteTicker({
    api_key: apiKey,
    access_token: accessToken,
    reconnect: true,
    max_retry: 50,
    max_delay: 5,
  });

  ticker.on("ticks", (ticks) => {
    if (!tickHandler) {
      return;
    }
    const ltpByToken = mergeMarketTicks(userId, ticks);
    if (ltpByToken.size > 0) {
      tickHandler(userId, ticks, ltpByToken);
    }
  });

  ticker.on("connect", () => {
    subscribeTokenGroups(ticker, ltpTokens, quoteTokens);
  });

  ticker.on("error", (error) => {
    console.error(`Kite ticker error (${userId}):`, error);
  });

  ticker.on("noreconnect", () => {
    console.warn(`Kite ticker stopped reconnecting (${userId})`);
  });

  tickers.set(userId, { ticker, ...next });
  ticker.connect();
}

export function stopLiveTicker(userId: string): void {
  const existing = tickers.get(userId);
  if (!existing) {
    return;
  }
  try {
    existing.ticker.disconnect();
  } catch {
    // ignore
  }
  tickers.delete(userId);
}

export function stopAllLiveTickers(): void {
  for (const userId of [...tickers.keys()]) {
    stopLiveTicker(userId);
  }
}
