import type { Tick } from "kiteconnect";
import { dayChangeFromKiteTick } from "./indexDayChange.js";
import {
  getUsdInrInstrumentToken,
  updateUsdInrFromKiteTick,
} from "./usdInrLiveCache.js";
import { isPlausibleOptionLtp } from "./ltpPlausibility.js";
import type { IndexSymbol } from "../constants.js";
import type { IndexTicker } from "../types.js";
import type { Position } from "../types.js";

export interface CachedMarketTick {
  lastPrice: number;
  /** Kite REST anchor — not updated by WebSocket ticks */
  restAnchor?: number;
  netChange?: number;
  netChangePct?: number;
  previousClose?: number;
  oi?: number;
  volume?: number;
  oiDayHigh?: number;
  oiDayLow?: number;
  updatedAt: string;
}

const caches = new Map<string, Map<number, CachedMarketTick>>();

function tickToCache(tick: Tick): CachedMarketTick {
  const cached: CachedMarketTick = {
    lastPrice: tick.last_price,
    updatedAt: new Date().toISOString(),
  };

  const dayChange = dayChangeFromKiteTick(tick);
  if (dayChange) {
    cached.netChange = dayChange.spotChange;
    cached.netChangePct = dayChange.spotChangePct;
  }
  if ("ohlc" in tick && typeof tick.ohlc?.close === "number" && tick.ohlc.close > 0) {
    cached.previousClose = tick.ohlc.close;
  }
  if ("oi" in tick && typeof tick.oi === "number") {
    cached.oi = tick.oi;
    cached.oiDayHigh = tick.oi_day_high;
    cached.oiDayLow = tick.oi_day_low;
  }
  if ("volume_traded" in tick && typeof tick.volume_traded === "number") {
    cached.volume = tick.volume_traded;
  }

  return cached;
}

export function mergeMarketTicks(userId: string, ticks: Tick[]): Map<number, number> {
  let cache = caches.get(userId);
  if (!cache) {
    cache = new Map();
    caches.set(userId, cache);
  }

  const ltpByToken = new Map<number, number>();
  for (const tick of ticks) {
    if (tick.last_price <= 0) {
      continue;
    }

    const prior = cache.get(tick.instrument_token);
    const anchor = prior?.restAnchor ?? prior?.lastPrice;
    if (
      prior &&
      anchor != null &&
      anchor > 0 &&
      !isPlausibleOptionLtp(prior.lastPrice, tick.last_price, anchor)
    ) {
      continue;
    }

    const cached = tickToCache(tick);
    cache.set(tick.instrument_token, {
      ...cached,
      volume: cached.volume ?? prior?.volume,
      restAnchor: prior?.restAnchor ?? anchor,
    });
    ltpByToken.set(tick.instrument_token, tick.last_price);

    const usdToken = getUsdInrInstrumentToken();
    if (usdToken != null && tick.instrument_token === usdToken) {
      const dayChange = dayChangeFromKiteTick(tick);
      updateUsdInrFromKiteTick(
        tick.instrument_token,
        tick.last_price,
        dayChange?.spotChange,
        "ohlc" in tick && typeof tick.ohlc?.close === "number" ? tick.ohlc.close : undefined,
      );
    }
  }

  return ltpByToken;
}

/** After Kite REST sync, anchor WebSocket cache to authoritative position LTPs. */
export function seedRestLtpsFromPositions(userId: string, positions: Position[]): void {
  let cache = caches.get(userId);
  if (!cache) {
    cache = new Map();
    caches.set(userId, cache);
  }

  const now = new Date().toISOString();
  for (const position of positions) {
    const token = position.instrumentToken;
    const restLtp = position.restLtp ?? position.ltp;
    if (token == null || token <= 0 || restLtp <= 0) {
      continue;
    }
    cache.set(token, {
      lastPrice: restLtp,
      restAnchor: restLtp,
      updatedAt: now,
    });
  }
}

/** Seed index tokens from Kite REST so tickers move before WebSocket connects. */
export function seedIndexTickersFromRest(
  userId: string,
  indexTokens: Partial<Record<IndexSymbol, number>>,
  tickers: IndexTicker[],
): void {
  let cache = caches.get(userId);
  if (!cache) {
    cache = new Map();
    caches.set(userId, cache);
  }

  const now = new Date().toISOString();
  for (const ticker of tickers) {
    const token = indexTokens[ticker.symbol];
    if (token == null || token <= 0) {
      continue;
    }
    cache.set(token, {
      lastPrice: ticker.spotPrice,
      netChange: ticker.spotChange,
      netChangePct: ticker.spotChangePct,
      updatedAt: now,
    });
  }
}

export function getCachedMarketTick(
  userId: string,
  instrumentToken: number,
): CachedMarketTick | undefined {
  return caches.get(userId)?.get(instrumentToken);
}

export function getCachedMarketLtp(userId: string, instrumentToken: number): number | undefined {
  return getCachedMarketTick(userId, instrumentToken)?.lastPrice;
}

export function clearMarketTickCache(userId: string): void {
  caches.delete(userId);
}
