import type { IndexSymbol } from "../constants.js";
import { kiteClient } from "./kite.js";

const INDIA_VIX_KEY = "NSE:INDIA VIX";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedPercentile: { value: number; fetchedAt: number } | null = null;

function percentileRank(current: number, history: number[]): number {
  const sorted = history.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0 || current <= 0) {
    return 0;
  }
  const below = sorted.filter((v) => v <= current).length;
  return Math.round((below / sorted.length) * 100);
}

function ivRankFromChain(atmIv: number, chainIvs: number[]): number {
  const valid = chainIvs.filter((iv) => iv > 0);
  if (valid.length === 0 || atmIv <= 0) {
    return 0;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max <= min) {
    return 50;
  }
  return Math.round(Math.min(100, Math.max(0, ((atmIv - min) / (max - min)) * 100)));
}

export function chainIvRank(atmIv: number, chainIvs: number[]): number {
  return ivRankFromChain(atmIv, chainIvs);
}

/** India VIX 1y percentile for Nifty; IV rank within chain for other indices. */
export async function resolveIvPercentile(
  accessToken: string | undefined,
  symbol: IndexSymbol,
  atmIv: number,
  chainIvs: number[],
): Promise<number> {
  if (symbol === "NIFTY" && accessToken) {
    try {
      if (cachedPercentile && Date.now() - cachedPercentile.fetchedAt < CACHE_TTL_MS) {
        return cachedPercentile.value;
      }

      const kite = kiteClient(accessToken);
      const quotes = await kite.getQuote([INDIA_VIX_KEY]);
      const vixQuote = quotes[INDIA_VIX_KEY];
      const token = vixQuote?.instrument_token;
      const currentVix = vixQuote?.last_price;

      if (token && currentVix && currentVix > 0) {
        const to = new Date();
        const from = new Date();
        from.setFullYear(from.getFullYear() - 1);

        const candles = await kite.getHistoricalData(token, "day", from, to);
        const closes = candles.map((c) => c.close).filter((c) => c > 0);
        const percentile = percentileRank(currentVix, closes);
        cachedPercentile = { value: percentile, fetchedAt: Date.now() };
        return percentile;
      }
    } catch {
      // fall through to chain rank
    }
  }

  return ivRankFromChain(atmIv, chainIvs);
}

export function clearIvPercentileCache(): void {
  cachedPercentile = null;
}
