import type { UsdInrSpotQuote } from "./usdInrSpotService.js";

let usdInrInstrumentToken: number | null = null;
let live: UsdInrSpotQuote | null = null;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function setUsdInrInstrumentToken(token: number | null): void {
  usdInrInstrumentToken = token != null && token > 0 ? token : null;
}

export function getUsdInrInstrumentToken(): number | null {
  return usdInrInstrumentToken;
}

export function updateUsdInrFromKiteTick(
  instrumentToken: number,
  lastPrice: number,
  netChange?: number,
  previousClose?: number,
): void {
  if (usdInrInstrumentToken == null || instrumentToken !== usdInrInstrumentToken) {
    return;
  }
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
    return;
  }

  let change = Number.isFinite(netChange ?? NaN) ? round2(netChange!) : 0;
  if (change === 0 && previousClose != null && previousClose > 0) {
    change = round2(lastPrice - previousClose);
  }

  const prev = lastPrice - change;
  const changePct =
    prev > 0 && change !== 0 ? round2((change / prev) * 100) : 0;

  live = {
    lastPrice: round2(lastPrice),
    change,
    changePct,
    asOf: new Date().toISOString(),
    source: "kite",
  };
}

/** Fresh Kite tick quote (used ahead of slower REST/Yahoo). */
export function getUsdInrLiveTickQuote(maxAgeMs = 30_000): UsdInrSpotQuote | null {
  if (!live) {
    return null;
  }
  const age = Date.now() - new Date(live.asOf).getTime();
  if (age > maxAgeMs) {
    return null;
  }
  return live;
}
