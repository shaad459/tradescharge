import { istDateKey } from "./technicalIndicators.js";

/** Session-open OI baseline per instrument (IST day) for Kite-style OI change. */
const openingOiByKey = new Map<string, number>();

function cacheKey(instrumentToken: number, dateKey: string): string {
  return `${dateKey}:${instrumentToken}`;
}

/**
 * OI change since session baseline (opening OI ≈ first oi_day_low of the day).
 * Matches Kite's "OI change" vs previous session when baseline is captured at open.
 */
export function computeSessionOiChange(
  instrumentToken: number,
  oi: number,
  oiDayLow: number,
): number {
  if (!Number.isFinite(oi) || oi <= 0) {
    return 0;
  }

  const dateKey = istDateKey(new Date());
  const key = cacheKey(instrumentToken, dateKey);
  let opening = openingOiByKey.get(key);

  if (opening == null) {
    opening = oiDayLow > 0 ? oiDayLow : oi;
    openingOiByKey.set(key, opening);
    return 0;
  }

  return Math.round(oi - opening);
}
