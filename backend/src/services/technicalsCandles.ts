import { kiteClient } from "./kite.js";
import { withKiteRequestSlot } from "./kiteRequestGate.js";
import type { OhlcBar } from "./technicalIndicators.js";

interface CandleCacheEntry {
  bars: OhlcBar[];
  fetchedAt: number;
}

const candleCache = new Map<string, CandleCacheEntry>();
const CANDLE_CACHE_MS = 90_000;

function cacheKey(token: number, interval: string): string {
  return `${token}:${interval}`;
}

function kiteCandlesToBars(
  candles: { open: number; high: number; low: number; close: number; volume?: number; date?: Date }[],
): OhlcBar[] {
  return candles
    .filter((c) => c.close > 0)
    .map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      date: c.date != null ? new Date(c.date) : undefined,
    }));
}

export function invalidateTechnicalsDayCache(instrumentToken: number): void {
  candleCache.delete(cacheKey(instrumentToken, "day"));
}

export async function fetchCandlesForTechnicals(
  accessToken: string,
  token: number,
  interval: string,
  lookbackDays: number,
): Promise<OhlcBar[]> {
  const key = cacheKey(token, interval);
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CANDLE_CACHE_MS) {
    return cached.bars.map((b) => ({ ...b }));
  }

  const kite = kiteClient(accessToken);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - lookbackDays);

  const raw = await withKiteRequestSlot(() =>
    kite.getHistoricalData(token, interval, from, to),
  );
  const bars = kiteCandlesToBars(raw);
  candleCache.set(key, { bars, fetchedAt: Date.now() });
  return bars.map((b) => ({ ...b }));
}
