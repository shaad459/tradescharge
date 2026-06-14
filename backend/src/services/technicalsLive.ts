import type { Response } from "express";
import { applyTickToBars, intervalMinutesForTimeframe } from "./barBuckets.js";
import { ensureMarketWatch, setTechnicalWatchToken } from "./kiteMarketWatch.js";
import type { OhlcBar } from "./technicalIndicators.js";
import {
  istDateKey,
  previousDaySessionFromBars,
  sessionVwapForBars,
} from "./technicalIndicators.js";
import { vwapFromTimeframeBars } from "./technicalsService.js";
import {
  computeTimeframeRow,
  fetchTechnicals,
  findTechnicalTimeframe,
  resolveTimeframeVwap,
  type InstrumentTarget,
  type TechnicalsResponse,
  type TechnicalTimeframeId,
  TECHNICAL_TIMEFRAME_ORDER,
  TECHNICAL_TIMEFRAMES,
} from "./technicalsService.js";
import {
  fetchCandlesForTechnicals,
  invalidateTechnicalsDayCache,
} from "./technicalsCandles.js";

const EMIT_THROTTLE_MS = 400;

interface ActiveWatch {
  userId: string;
  accessToken: string;
  target: InstrumentTarget;
  previousDayClose: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  barsByTf: Map<TechnicalTimeframeId, OhlcBar[]>;
  vwapByTf: Map<TechnicalTimeframeId, number | null>;
  lastPayload: TechnicalsResponse | null;
  lastEmitAt: number;
  /** IST date key (YYYY-MM-DD) for the session we last rolled prev-day refs on. */
  tradingDayKey: string;
}

const watchesByUser = new Map<string, ActiveWatch>();

/** Prior completed session from daily bars (bar before today's forming day). */
function syncPreviousDayFromDayBars(watch: ActiveWatch): void {
  const session = previousDaySessionFromBars(watch.barsByTf.get("1D") ?? []);
  if (!session) {
    return;
  }
  watch.previousDayClose = session.close;
  watch.previousDayHigh = session.high;
  watch.previousDayLow = session.low;
}

function maybeRefreshDayCandlesOnRoll(watch: ActiveWatch, todayKey: string, lastPrice: number): void {
  if (todayKey === watch.tradingDayKey) {
    return;
  }
  watch.tradingDayKey = todayKey;
  invalidateTechnicalsDayCache(watch.target.instrumentToken);
  void fetchCandlesForTechnicals(
    watch.accessToken,
    watch.target.instrumentToken,
    "day",
    30,
  )
    .then((dayBars) => {
      watch.barsByTf.set("1D", dayBars);
      syncPreviousDayFromDayBars(watch);
      const payload = buildPayload(watch, lastPrice);
      watch.lastPayload = payload;
      watch.lastEmitAt = Date.now();
      broadcastToUser(watch.userId, payload);
    })
    .catch((err) => {
      console.error("Technicals day-candle refresh failed:", err);
    });
}

const streamClients = new Map<Response, string>();

function buildPayload(watch: ActiveWatch, lastPrice: number): TechnicalsResponse {
  const timeframes = TECHNICAL_TIMEFRAME_ORDER.map((id) => {
    const tf = findTechnicalTimeframe(id)!;
    const bars = watch.barsByTf.get(id) ?? [];
    const stored = watch.vwapByTf.get(id);
    const vwap =
      stored != null && stored > 0
        ? stored
        : sessionVwapForBars(bars, lastPrice) ?? vwapFromTimeframeBars(bars, lastPrice);
    return computeTimeframeRow(tf, bars, watch.previousDayClose, vwap);
  });

  const bars1m = watch.barsByTf.get("1m") ?? [];
  const sessionVwap =
    watch.vwapByTf.get("1m") ??
    sessionVwapForBars(bars1m, lastPrice) ??
    vwapFromTimeframeBars(bars1m, lastPrice);

  return {
    kind: watch.target.kind,
    indexSymbol: watch.target.indexSymbol,
    watchKey: watch.target.watchKey,
    label: watch.target.label,
    exchange: watch.target.exchange,
    tradingsymbol: watch.target.tradingsymbol,
    instrumentToken: watch.target.instrumentToken,
    lastPrice,
    previousDayClose: watch.previousDayClose,
    previousDayHigh: watch.previousDayHigh,
    previousDayLow: watch.previousDayLow,
    sessionVwap,
    asOf: new Date().toISOString(),
    timeframes,
  };
}

function recomputeFromTick(watch: ActiveWatch, price: number, tickTime: Date): TechnicalsResponse {
  const todayKey = istDateKey(tickTime);

  for (const tf of TECHNICAL_TIMEFRAMES) {
    const mins = intervalMinutesForTimeframe(tf.id);
    const prev = watch.barsByTf.get(tf.id) ?? [];
    watch.barsByTf.set(tf.id, applyTickToBars(prev, price, tickTime, mins));

    const bars = watch.barsByTf.get(tf.id) ?? [];
    const fromBars =
      sessionVwapForBars(bars, price, tickTime) ?? vwapFromTimeframeBars(bars, price);
    if (fromBars != null) {
      watch.vwapByTf.set(tf.id, fromBars);
    }
  }

  syncPreviousDayFromDayBars(watch);
  maybeRefreshDayCandlesOnRoll(watch, todayKey, price);

  return buildPayload(watch, price);
}

function writeStream(res: Response, payload: TechnicalsResponse) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function broadcastToUser(userId: string, payload: TechnicalsResponse) {
  for (const [res, uid] of streamClients) {
    if (uid === userId) {
      writeStream(res, payload);
    }
  }
}

export async function startTechnicalsLiveWatch(
  userId: string,
  accessToken: string,
  target: InstrumentTarget,
): Promise<TechnicalsResponse> {
  const barsByTf = new Map<TechnicalTimeframeId, OhlcBar[]>();
  const vwapByTf = new Map<TechnicalTimeframeId, number | null>();

  await Promise.all(
    TECHNICAL_TIMEFRAMES.map(async (tf) => {
      const bars = await fetchCandlesForTechnicals(
        accessToken,
        target.instrumentToken,
        tf.kiteInterval,
        tf.lookbackDays,
      );
      barsByTf.set(tf.id, bars);
      const vwap = await resolveTimeframeVwap(
        accessToken,
        target,
        tf.kiteInterval,
        tf.lookbackDays,
        bars,
      );
      vwapByTf.set(tf.id, vwap);
    }),
  );

  const watch: ActiveWatch = {
    userId,
    accessToken,
    target,
    previousDayClose: null,
    previousDayHigh: null,
    previousDayLow: null,
    barsByTf,
    vwapByTf,
    lastPayload: null,
    lastEmitAt: 0,
    tradingDayKey: istDateKey(new Date()),
  };

  syncPreviousDayFromDayBars(watch);

  const lastPrice = barsByTf.get("1m")?.at(-1)?.close ?? 0;
  watch.lastPayload = buildPayload(watch, lastPrice);
  watchesByUser.set(userId, watch);

  await ensureMarketWatch(userId, accessToken);
  setTechnicalWatchToken(userId, target.instrumentToken);

  return watch.lastPayload;
}

export function stopTechnicalsLiveWatch(userId: string): void {
  watchesByUser.delete(userId);
  setTechnicalWatchToken(userId, null);
}

export function technicalsLiveOnTicks(userId: string, ltpByToken: Map<number, number>): void {
  const watch = watchesByUser.get(userId);
  if (!watch) {
    return;
  }

  const price = ltpByToken.get(watch.target.instrumentToken);
  if (!price || price <= 0) {
    return;
  }

  const payload = recomputeFromTick(watch, price, new Date());
  watch.lastPayload = payload;

  const now = Date.now();
  if (now - watch.lastEmitAt < EMIT_THROTTLE_MS) {
    return;
  }
  watch.lastEmitAt = now;
  broadcastToUser(userId, payload);
}

export async function subscribeTechnicalsStream(
  res: Response,
  userId: string,
  accessToken: string,
  target: InstrumentTarget,
  options?: { bootstrapOnly?: boolean },
): Promise<void> {
  streamClients.set(res, userId);
  const bootstrapOnly = options?.bootstrapOnly === true;

  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keepalive\n\n");
    }
  }, 12_000);

  const cleanup = () => {
    clearInterval(keepalive);
    streamClients.delete(res);
    if (![...streamClients.values()].includes(userId)) {
      stopTechnicalsLiveWatch(userId);
    }
  };

  res.on("close", cleanup);

  try {
    const existing = watchesByUser.get(userId);
    if (
      existing?.target.instrumentToken === target.instrumentToken &&
      existing.lastPayload
    ) {
      writeStream(res, existing.lastPayload);
      if (!bootstrapOnly) {
        return;
      }
    }

    if (bootstrapOnly) {
      void startTechnicalsLiveWatch(userId, accessToken, target)
        .then((payload) => {
          writeStream(res, payload);
          broadcastToUser(userId, payload);
        })
        .catch((err) => {
          console.error("Technicals live watch init failed:", err);
        });
      return;
    }

    const snapshot = await fetchTechnicals(accessToken, target);
    writeStream(res, snapshot);

    void startTechnicalsLiveWatch(userId, accessToken, target)
      .then((payload) => {
        writeStream(res, payload);
        broadcastToUser(userId, payload);
      })
      .catch((err) => {
        console.error("Technicals live watch init failed:", err);
      });
  } catch (error) {
    cleanup();
    throw error;
  }
}
