import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG } from "../constants.js";
import type { OptionChainResponse, OptionChainRow, OptionChainSummary, OptionLeg } from "../types.js";
import { computeSummaryFromChain, withIvPercentile } from "./optionChainSummary.js";
import { chainIvRank } from "./ivPercentile.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nearestThursday(): string {
  const date = new Date();
  const day = date.getDay();
  const daysUntil = (4 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntil);
  return date.toISOString().slice(0, 10);
}

function nextThursday(offsetWeeks: number): string {
  const date = new Date();
  const day = date.getDay();
  const daysUntil = (4 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntil + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}

/** Weekly + long-dated mock expiries when Kite instrument master is unavailable. */
function generateMockExpiries(symbol: IndexSymbol): string[] {
  const weekday = symbol === "SENSEX" ? 5 : symbol === "BANKNIFTY" ? 3 : 2;
  const expiries = new Set<string>();
  const start = new Date();

  for (let week = 0; week < 52; week++) {
    const date = new Date(start);
    date.setDate(start.getDate() + week * 7);
    const day = date.getDay();
    const delta = (weekday - day + 7) % 7;
    date.setDate(date.getDate() + delta);
    expiries.add(date.toISOString().slice(0, 10));
  }

  const endYear = start.getFullYear() + 4;
  for (let year = start.getFullYear(); year <= endYear; year++) {
    for (const month of [5, 8, 11]) {
      const date = new Date(year, month, 1);
      while (date.getDay() !== weekday) {
        date.setDate(date.getDate() + 1);
      }
      date.setDate(date.getDate() + 21);
      while (date.getMonth() === month) {
        date.setDate(date.getDate() + 7);
      }
      date.setDate(date.getDate() - 7);
      expiries.add(date.toISOString().slice(0, 10));
    }
    for (const month of [2, 5]) {
      const date = new Date(year, month, 25);
      while (date.getDay() !== weekday) {
        date.setDate(date.getDate() - 1);
      }
      expiries.add(date.toISOString().slice(0, 10));
    }
  }

  const today = start.toISOString().slice(0, 10);
  return [...expiries].filter((d) => d >= today).sort();
}

function buildTradingsymbol(symbol: IndexSymbol, expiry: string, strike: number, type: "CE" | "PE") {
  const d = new Date(expiry);
  const yy = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${symbol}${yy}${m}${dd}${strike}${type}`;
}

function syntheticPremium(spot: number, strike: number, type: "CE" | "PE"): number {
  const intrinsic = type === "CE" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const distance = Math.abs(spot - strike);
  const timeValue = Math.max(8, 180 - distance * 0.35) * (type === "CE" ? 1 : 0.95);
  return Math.round((intrinsic + timeValue) * 100) / 100;
}

function seededMetrics(strike: number, type: "CE" | "PE", spot: number) {
  const seed = strike * (type === "CE" ? 17 : 31) + spot * 0.01;
  const oi = Math.round(45000 + ((Math.sin(seed) + 1) / 2) * 550000);
  const oiChange = Math.round(((Math.cos(seed * 1.3) + 1) / 2 - 0.48) * 85000);
  const volume = Math.round(800 + ((Math.sin(seed * 2.1) + 1) / 2) * 12000);
  const prevLtp = syntheticPremium(spot, strike, type) * (1 + ((Math.cos(seed * 0.9) + 1) / 2 - 0.5) * 0.08);
  const ltp = syntheticPremium(spot, strike, type);
  const ltpChange = round2(ltp - prevLtp);
  const iv = round2(12 + ((Math.sin(seed * 0.5) + 1) / 2) * 18 + distanceIvBoost(strike, spot));
  return { oi, oiChange, volume, ltpChange, ltp, iv };
}

function distanceIvBoost(strike: number, spot: number): number {
  return Math.max(0, 4 - Math.abs(strike - spot) / spot * 100);
}

function buildLeg(
  symbol: IndexSymbol,
  expiry: string,
  strike: number,
  type: "CE" | "PE",
  spot: number,
): OptionLeg {
  const metrics = seededMetrics(strike, type, spot);
  return {
    instrumentType: type,
    strike,
    ltp: metrics.ltp,
    ltpChange: metrics.ltpChange,
    oi: metrics.oi,
    oiChange: metrics.oiChange,
    volume: metrics.volume,
    iv: metrics.iv,
    tradingsymbol: buildTradingsymbol(symbol, expiry, strike, type),
    expiry,
  };
}

function computeSummary(chain: OptionChainRow[], spot: number): OptionChainSummary {
  const base = computeSummaryFromChain(chain, spot);
  const ivs: number[] = [];
  for (const row of chain) {
    if (row.ce?.iv && row.ce.iv > 0) {
      ivs.push(row.ce.iv);
    }
    if (row.pe?.iv && row.pe.iv > 0) {
      ivs.push(row.pe.iv);
    }
  }
  return withIvPercentile(base, chainIvRank(base.atmIv, ivs));
}

export function getOptionChain(
  symbol: IndexSymbol,
  expiry?: string,
  search?: string,
): OptionChainResponse {
  const config = INDEX_CONFIG[symbol];
  const spot = config.spotPrice;
  const spotChange = round2(spot * 0.0027);
  const spotChangePct = round2((spotChange / (spot - spotChange)) * 100);
  const atmStrike = Math.round(spot / config.strikeStep) * config.strikeStep;
  const selectedExpiry = expiry ?? nearestThursday();
  const expiries = generateMockExpiries(symbol);
  const resolvedExpiry = expiry && expiries.includes(expiry) ? expiry : expiries[0] ?? selectedExpiry;

  const strikes: number[] = [];
  for (let i = -20; i <= 20; i++) {
    strikes.push(atmStrike + i * config.strikeStep);
  }

  const chain: OptionChainRow[] = strikes.map((strike) => ({
    strike,
    ce: buildLeg(symbol, resolvedExpiry, strike, "CE", spot),
    pe: buildLeg(symbol, resolvedExpiry, strike, "PE", spot),
    isAtm: strike === atmStrike,
  }));

  return {
    symbol,
    label: config.label,
    spotPrice: spot,
    spotChange,
    spotChangePct,
    lotSize: config.lotSize,
    expiry: resolvedExpiry,
    expiries,
    chain,
    summary: computeSummary(chain, spot),
  };
}

export function findChainLeg(
  symbol: IndexSymbol,
  strike: number,
  instrumentType: "CE" | "PE",
  expiry?: string,
): OptionLeg | null {
  const chain = getOptionChain(symbol, expiry);
  const row = chain.chain.find((r) => r.strike === strike);
  if (!row) {
    return null;
  }
  return instrumentType === "CE" ? row.ce : row.pe;
}
