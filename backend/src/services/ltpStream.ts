import type { Response } from "express";
import { enrichOpenPositions } from "./dashboard.js";
import { computePortfolioSummary } from "./portfolio.js";
import {
  computeAvailableMargin,
  computeCapitalBalance,
  marginSnapshotFromParts,
} from "./capitalBalance.js";
import {
  clearLiveStream,
  applyLiveStreamTicks,
  getCachedLiveSnapshot,
  liveSnapshotToStreamPayload,
  refreshLiveStream,
  withMarketStreamExtras,
} from "./liveStream.js";
import { setLiveTickHandler, stopLiveTicker } from "./kiteLiveTicker.js";
import { ensureMarketWatch, getStreamMarketData } from "./kiteMarketWatch.js";
import {
  fetchLiveMargins,
  getSession,
  refreshMockPositionsFromKite,
} from "./kite.js";
import type { EnrichedPosition, ExecutionAlert, Position } from "../types.js";
import { MOCK_BALANCE, getMockPositions, getClosedPositions, tickAllMockLtps } from "../mock/positionStore.js";
import { getExecutedOrders, getOpenOrders, processPendingOrders } from "../mock/orderBook.js";
import { getOvernightCarryItems } from "../mock/overnightCarry.js";
import type { TradingMode } from "../utils/tradingMode.js";
import { shouldStreamLive } from "../utils/tradingMode.js";
import { technicalsLiveOnTicks } from "./technicalsLive.js";

const MAX_SSE_CLIENTS = 4;
const TICK_MS = 2000;
const LIVE_REST_SYNC_MS = 2000;

interface StreamClient {
  res: Response;
  userId?: string;
  tradingMode: TradingMode;
}

const clients = new Map<Response, StreamClient>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let liveSyncTimer: ReturnType<typeof setInterval> | null = null;
let liveTickInFlight = false;

function liveClientsForUser(userId: string): StreamClient[] {
  return [...clients.values()].filter(
    (client) => client.userId === userId && shouldStreamLive(client.userId, client.tradingMode),
  );
}

function liveUserIds(): Set<string> {
  const users = new Set<string>();
  for (const client of clients.values()) {
    if (client.userId && shouldStreamLive(client.userId, client.tradingMode)) {
      users.add(client.userId);
    }
  }
  return users;
}

function writePayload(client: StreamClient, payload: unknown) {
  if (!client.res.writableEnded) {
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function broadcastLivePayload(userId: string, payload: ReturnType<typeof liveSnapshotToStreamPayload>) {
  for (const client of liveClientsForUser(userId)) {
    writePayload(client, payload);
  }
}

setLiveTickHandler((userId, _ticks, ltpByToken) => {
  if (ltpByToken.size > 0) {
    technicalsLiveOnTicks(userId, ltpByToken);
  }

  const cached = getCachedLiveSnapshot(userId);
  const market = getStreamMarketData(userId);

  if (cached) {
    const updated = applyLiveStreamTicks(userId, ltpByToken);
    const snapshot = updated ?? cached;

    for (const client of clients.values()) {
      if (client.userId !== userId) {
        continue;
      }
      if (shouldStreamLive(client.userId, client.tradingMode)) {
        writePayload(client, liveSnapshotToStreamPayload(snapshot, userId));
      } else if (market.indexTickers?.length || market.optionChain) {
        writePayload(
          client,
          withMarketStreamExtras(
            {
              timestamp: new Date().toISOString(),
              liveMarketData: true,
              marketStream: true,
            },
            userId,
          ),
        );
      }
    }
    return;
  }

  if (!market.optionChain && !market.indexTickers?.some((ticker) => ticker.spotPrice > 0)) {
    return;
  }

  for (const client of clients.values()) {
    if (client.userId === userId) {
      writePayload(
        client,
        withMarketStreamExtras(
          {
            timestamp: new Date().toISOString(),
            liveMarketData: true,
            marketStream: true,
          },
          userId,
        ),
      );
    }
  }
});

function enrichPositionsForStream(positions: Position[]): EnrichedPosition[] {
  return enrichOpenPositions(positions, getClosedPositions());
}

function orderFieldsForDemo(executionAlerts: ExecutionAlert[] = []) {
  const positions = getMockPositions();
  return {
    openOrders: getOpenOrders(),
    orderHistory: getExecutedOrders(),
    overnightCarry: getOvernightCarryItems(positions),
    executionAlerts,
  };
}

async function buildMockStreamPayload(advanceLtps: boolean, balanceBase = MOCK_BALANCE) {
  let executionAlerts: ExecutionAlert[] = [];
  if (advanceLtps) {
    tickAllMockLtps();
    const pendingResult = await processPendingOrders();
    executionAlerts = pendingResult.alerts;
  }
  const positions = getMockPositions();
  const enriched = enrichPositionsForStream(positions);
  const portfolio = computePortfolioSummary(enriched);
  const margins = marginSnapshotFromParts(balanceBase, balanceBase * 0.82, balanceBase);

  return {
    updates: positions.map((p) => ({ id: p.id, ltp: p.ltp })),
    positions: enriched,
    balance: computeCapitalBalance(margins, positions, enriched),
    portfolio,
    timestamp: new Date().toISOString(),
    mode: "demo" as const,
    liveMarketData: false,
    ...orderFieldsForDemo(executionAlerts),
  };
}

async function buildDemoWithKiteStreamPayload(userId: string, accessToken: string) {
  const [positions, margins] = await Promise.all([
    refreshMockPositionsFromKite(accessToken),
    fetchLiveMargins(accessToken),
  ]);
  await ensureMarketWatch(userId, accessToken, []);
  const pendingResult = await processPendingOrders(accessToken);
  const enriched = enrichPositionsForStream(positions);
  const portfolio = computePortfolioSummary(enriched);
  const marginSnapshot = marginSnapshotFromParts(
    margins.net,
    margins.available,
    margins.openingBalance,
    margins.m2mRealised,
    margins.m2mUnrealised,
    margins.marginEnabled,
  );

  return withMarketStreamExtras(
    {
      updates: positions.map((p) => ({ id: p.id, ltp: p.ltp })),
      positions: enriched,
      balance: computeCapitalBalance(marginSnapshot, positions, enriched, portfolio.netPnL),
      availableMargin: computeAvailableMargin(marginSnapshot, portfolio.netPnL),
      openingBalance: margins.openingBalance,
      portfolio,
      timestamp: new Date().toISOString(),
      mode: "demo" as const,
      liveMarketData: true,
      ...orderFieldsForDemo(pendingResult.alerts),
    },
    userId,
  );
}

async function buildLiveStreamPayload(userId: string, accessToken: string) {
  const cached = getCachedLiveSnapshot(userId);
  if (cached) {
    return liveSnapshotToStreamPayload(cached, userId);
  }
  const snapshot = await refreshLiveStream(userId, accessToken);
  return liveSnapshotToStreamPayload(snapshot, userId);
}

async function payloadForClient(client: StreamClient, advanceMockLtps: boolean) {
  if (client.userId) {
    const session = getSession(client.userId);
    if (session?.accessToken) {
      try {
        if (shouldStreamLive(client.userId, client.tradingMode)) {
          return await buildLiveStreamPayload(client.userId, session.accessToken);
        }
        return await buildDemoWithKiteStreamPayload(client.userId, session.accessToken);
      } catch (error) {
        console.error("Live LTP stream fetch failed:", error);
      }
    }
  }
  return buildMockStreamPayload(advanceMockLtps);
}

async function broadcastTick() {
  if (clients.size === 0 || liveTickInFlight) {
    return;
  }

  liveTickInFlight = true;
  try {
    const entries = [...clients.values()];
    await Promise.all(
      entries.map(async (client) => {
        if (shouldStreamLive(client.userId, client.tradingMode)) {
          return;
        }
        const payload = await payloadForClient(client, true);
        writePayload(client, payload);
      }),
    );
  } finally {
    liveTickInFlight = false;
  }
}

async function syncLiveStreams() {
  await Promise.all(
    [...liveUserIds()].map(async (userId) => {
      const session = getSession(userId);
      if (!session?.accessToken) {
        return;
      }
      try {
        const snapshot = await refreshLiveStream(userId, session.accessToken);
        broadcastLivePayload(userId, liveSnapshotToStreamPayload(snapshot, userId));
      } catch (error) {
        console.error(`Live REST sync failed (${userId}):`, error);
      }
    }),
  );
}

function stopTickerIfIdle() {
  if (clients.size === 0 && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (clients.size === 0 && liveSyncTimer) {
    clearInterval(liveSyncTimer);
    liveSyncTimer = null;
  }
}

function ensureTicker() {
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      void broadcastTick();
    }, TICK_MS);
  }
  if (!liveSyncTimer) {
    liveSyncTimer = setInterval(() => {
      void syncLiveStreams();
    }, LIVE_REST_SYNC_MS);
  }
}

function detachClient(res: Response) {
  const client = clients.get(res);
  clients.delete(res);

  if (client?.userId && shouldStreamLive(client.userId, client.tradingMode)) {
    const stillActive = [...clients.values()].some(
      (entry) => entry.userId === client.userId && shouldStreamLive(entry.userId, entry.tradingMode),
    );
    if (!stillActive) {
      stopLiveTicker(client.userId);
      clearLiveStream(client.userId);
    }
  }

  stopTickerIfIdle();
}

export function subscribeLtpStreamClient(
  res: Response,
  userId?: string,
  tradingMode: TradingMode = "demo",
) {
  while (clients.size >= MAX_SSE_CLIENTS) {
    const oldest = clients.keys().next().value as Response | undefined;
    if (!oldest) {
      break;
    }
    clients.delete(oldest);
    if (!oldest.writableEnded) {
      oldest.end();
    }
  }

  clients.set(res, { res, userId, tradingMode });
  ensureTicker();

  void payloadForClient({ res, userId, tradingMode }, false).then((payload) => {
    writePayload({ res, userId, tradingMode }, payload);
  });

  if (userId && shouldStreamLive(userId, tradingMode)) {
    setTimeout(() => {
      void syncLiveStreams();
    }, 500);
  }

  const cleanup = () => {
    detachClient(res);
    if (!res.writableEnded) {
      res.end();
    }
  };

  res.on("close", cleanup);
  res.on("finish", cleanup);
}

export { refreshLiveStream };
