import type { Tick } from "kiteconnect";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Day change vs previous session close (Kite ohlc.close). */
export function dayChangeFromPreviousClose(
  lastPrice: number,
  previousClose: number,
): { spotChange: number; spotChangePct: number } {
  if (lastPrice <= 0 || previousClose <= 0) {
    return { spotChange: 0, spotChangePct: 0 };
  }
  const spotChange = round2(lastPrice - previousClose);
  const spotChangePct = round2((spotChange / previousClose) * 100);
  return { spotChange, spotChangePct };
}

/**
 * Kite WebSocket ticks expose `change` as day change **percentage**, not points.
 * Prefer ohlc.close (previous close); fall back to deriving close from change %.
 */
export function dayChangeFromKiteTick(tick: Tick): { spotChange: number; spotChangePct: number } | null {
  if (tick.last_price <= 0) {
    return null;
  }

  if ("ohlc" in tick && typeof tick.ohlc?.close === "number" && tick.ohlc.close > 0) {
    return dayChangeFromPreviousClose(tick.last_price, tick.ohlc.close);
  }

  if ("change" in tick && typeof tick.change === "number") {
    const spotChangePct = round2(tick.change);
    const previousClose = tick.last_price / (1 + tick.change / 100);
    if (previousClose <= 0) {
      return null;
    }
    return dayChangeFromPreviousClose(tick.last_price, previousClose);
  }

  return null;
}
