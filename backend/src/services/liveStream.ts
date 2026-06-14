import { enrichClosedPositions, enrichOpenPositions } from "./dashboard.js";
import { fetchLiveKiteSnapshot, type LiveKiteSnapshot } from "./liveKiteSync.js";
import { computePortfolioSummary } from "./portfolio.js";
import { computeAvailableMargin, computeCapitalBalance } from "./capitalBalance.js";
import {
  applyLiveTickUpdates,
  clearLiveStreamCache,
  getLiveStreamCache,
  setLiveStreamCache,
} from "./liveStreamCache.js";
import { fetchLiveIndexTickers } from "./kite.js";
import { seedIndexTickersFromRest } from "./kiteTickCache.js";
import { getIndexInstrumentTokens } from "./kiteInstruments.js";
import {
  clearMarketWatch,
  ensureMarketWatch,
  getStreamMarketData,
} from "./kiteMarketWatch.js";

export function withMarketStreamExtras<T extends Record<string, unknown>>(payload: T, userId?: string) {
  if (!userId) {
    return payload;
  }

  const { indexTickers, optionChain } = getStreamMarketData(userId);
  return {
    ...payload,
    indexTickers,
    optionChain,
    marketStream: Boolean(indexTickers?.length || optionChain),
  };
}

export function liveSnapshotToStreamPayload(snapshot: LiveKiteSnapshot, userId?: string) {
  const enrichedClosed = enrichClosedPositions(snapshot.closedPositions, snapshot.trades);
  const enriched = enrichOpenPositions(snapshot.positions, snapshot.closedPositions, snapshot.trades);
  const portfolio = computePortfolioSummary(enriched, enrichedClosed);
  const margins = snapshot.margins;

  return withMarketStreamExtras(
    {
      updates: snapshot.positions.map((position) => ({ id: position.id, ltp: position.ltp })),
      positions: enriched,
      closedPositions: enrichedClosed,
      balance: computeCapitalBalance(margins, snapshot.positions, enriched, portfolio.netPnL),
      availableMargin: computeAvailableMargin(margins, portfolio.netPnL),
      openingBalance: margins.openingBalance,
      portfolio,
      timestamp: new Date().toISOString(),
      mode: "live" as const,
      liveMarketData: true,
      openOrders: snapshot.openOrders,
      orderHistory: snapshot.orderHistory,
      executedTransactions: snapshot.executedTransactions,
      overnightCarry: [],
      executionAlerts: [],
    },
    userId,
  );
}

export function primeLiveStreamCache(userId: string, snapshot: LiveKiteSnapshot): void {
  setLiveStreamCache(userId, snapshot);
}

export async function refreshLiveStream(userId: string, accessToken: string) {
  const snapshot = await fetchLiveKiteSnapshot(accessToken, {
    userId,
    source: "live-stream",
  });
  setLiveStreamCache(userId, snapshot);

  const positionTokens = snapshot.positions
    .map((position) => position.instrumentToken)
    .filter((token): token is number => token != null && token > 0);

  await ensureMarketWatch(userId, accessToken, positionTokens);

  try {
    const [indexTickers, indexTokens] = await Promise.all([
      fetchLiveIndexTickers(accessToken),
      getIndexInstrumentTokens(),
    ]);
    seedIndexTickersFromRest(userId, indexTokens, indexTickers);
  } catch {
    // indices refresh on next sync
  }

  return snapshot;
}

export function applyLiveStreamTicks(
  userId: string,
  ltpByToken: Map<number, number>,
): LiveKiteSnapshot | undefined {
  return applyLiveTickUpdates(userId, ltpByToken);
}

export function getCachedLiveSnapshot(userId: string): LiveKiteSnapshot | undefined {
  return getLiveStreamCache(userId);
}

export function clearLiveStream(userId: string): void {
  clearLiveStreamCache(userId);
  clearMarketWatch(userId);
}

export { setChainWatch, clearChainWatch } from "./kiteMarketWatch.js";
