import type { OhlcBar } from "./technicalIndicators.js";
import { sessionVwapForBars } from "./technicalIndicators.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** NSE cash session open — 15m/5m Kite candles align from here, not midnight. */
const NSE_SESSION_OPEN_MIN = 9 * 60 + 15;

/** Wall-clock instant as milliseconds in IST (UTC+5:30, no DST). */
export function istWallMs(date: Date): number {
  return date.getTime() + IST_OFFSET_MS;
}

export function istWallMsFromBar(bar: OhlcBar): number | null {
  if (!bar.date) {
    return null;
  }
  return istWallMs(bar.date);
}

/** Candle bucket start in IST wall-ms (matches NSE / ChartIQ intraday alignment). */
export function bucketStartMsIst(wallMs: number, intervalMinutes: number): number {
  if (intervalMinutes >= 24 * 60) {
    return Math.floor(wallMs / DAY_MS) * DAY_MS;
  }

  const dayStart = Math.floor(wallMs / DAY_MS) * DAY_MS;
  const minsInDay = (wallMs - dayStart) / (60 * 1000);

  if (minsInDay < NSE_SESSION_OPEN_MIN) {
    return dayStart + NSE_SESSION_OPEN_MIN * 60 * 1000;
  }

  const minsFromOpen = minsInDay - NSE_SESSION_OPEN_MIN;
  const slot = Math.floor(minsFromOpen / intervalMinutes);
  return dayStart + (NSE_SESSION_OPEN_MIN + slot * intervalMinutes) * 60 * 1000;
}

export function intervalMinutesForTimeframe(id: string): number {
  switch (id) {
    case "1m":
      return 1;
    case "3m":
      return 3;
    case "5m":
      return 5;
    case "15m":
      return 15;
    case "30m":
      return 30;
    case "1h":
      return 60;
    case "1D":
      return 24 * 60;
    default:
      return 1;
  }
}

const MAX_BARS = 600;

/** Update or append the forming candle for the tick (chart-style live bar). */
export function applyTickToBars(
  bars: OhlcBar[],
  price: number,
  tickTime: Date,
  intervalMinutes: number,
): OhlcBar[] {
  if (!Number.isFinite(price) || price <= 0) {
    return bars;
  }

  const wallMs = istWallMs(tickTime);
  const bucketMs = bucketStartMsIst(wallMs, intervalMinutes);
  const bucketDate = new Date(bucketMs - IST_OFFSET_MS);
  const intervalMs = intervalMinutes * 60 * 1000;

  const next = bars.length > 0 ? [...bars] : [];
  const last = next[next.length - 1];
  const lastBucket =
    last?.date != null ? bucketStartMsIst(istWallMs(last.date), intervalMinutes) : null;

  if (last && lastBucket === bucketMs) {
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
    return next;
  }

  // Kite bar timestamp vs session bucket can differ by one slot — update forming candle, don't duplicate.
  if (last && lastBucket != null && bucketMs > lastBucket && bucketMs - lastBucket < intervalMs * 2) {
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      date: bucketDate,
    };
    return next;
  }

  next.push({
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 0,
    date: bucketDate,
  });

  if (next.length > MAX_BARS) {
    return next.slice(-MAX_BARS);
  }
  return next;
}

export function sessionVwapForIstDay(bars: OhlcBar[], livePrice: number, now = new Date()): number | null {
  return sessionVwapForBars(bars, livePrice, now);
}
