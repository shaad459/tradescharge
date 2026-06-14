import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG } from "../constants.js";
import type { OptionChainResponse, OptionChainRow, OptionLeg } from "../types.js";
import { computeSummaryFromChain } from "./optionChainSummary.js";
import { fetchKiteInstrumentsCsv } from "./kiteInstrumentsCsv.js";

interface CachedInstrument {
  instrumentToken: number;
  tradingsymbol: string;
  expiry: string;
  strike: number;
  instrumentType: "CE" | "PE";
  lotSize: number;
  segment: string;
  exchange: string;
}

let cache: { loadedAt: number; instruments: CachedInstrument[] } | null = null;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const STRIKE_WINDOW = 20;

export function atmStrikeForSpot(symbol: IndexSymbol, spotPrice: number): number {
  const { strikeStep } = INDEX_CONFIG[symbol];
  return Math.round(spotPrice / strikeStep) * strikeStep;
}

/** True when the strike grid already includes the ATM row for this spot (same window as buildOptionChainFromInstruments). */
export function chainIncludesAtmStrike(
  symbol: IndexSymbol,
  rows: OptionChainRow[],
  spotPrice: number,
): boolean {
  const atm = atmStrikeForSpot(symbol, spotPrice);
  return rows.some((row) => row.strike === atm);
}

const SYMBOL_EXCHANGE: Record<IndexSymbol, string> = {
  NIFTY: "NFO",
  BANKNIFTY: "NFO",
  SENSEX: "BFO",
};

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function isSymbolOption(symbol: IndexSymbol, tradingsymbol: string): boolean {
  if (symbol === "NIFTY") {
    return tradingsymbol.startsWith("NIFTY") && !tradingsymbol.startsWith("NIFTYNXT");
  }
  return tradingsymbol.startsWith(symbol);
}

function parseInstrumentRow(cols: string[]): CachedInstrument | null {
  if (cols.length < 12) {
    return null;
  }

  const tradingsymbol = cols[2]?.trim();
  const instrumentToken = Number(cols[0]);
  const expiry = cols[5]?.trim();
  const strike = Number(cols[6]);
  const lotSize = Number(cols[8]);
  const instrumentType = cols[9]?.trim() as "CE" | "PE";
  const segment = cols[10]?.trim();
  const exchange = cols[11]?.trim();

  if (!tradingsymbol || !expiry || !Number.isFinite(strike) || !Number.isFinite(lotSize)) {
    return null;
  }

  if (!Number.isFinite(instrumentToken) || instrumentToken <= 0) {
    return null;
  }

  if (instrumentType !== "CE" && instrumentType !== "PE") {
    return null;
  }

  if (segment !== "NFO-OPT" && segment !== "BFO-OPT") {
    return null;
  }

  return {
    instrumentToken,
    tradingsymbol,
    expiry,
    strike,
    instrumentType,
    lotSize,
    segment,
    exchange,
  };
}

export async function loadKiteInstruments(force = false): Promise<CachedInstrument[]> {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.instruments;
  }

  const text = await fetchKiteInstrumentsCsv(force);
  const lines = text.trim().split("\n");
  const instruments: CachedInstrument[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseInstrumentRow(lines[i].split(","));
    if (row) {
      instruments.push(row);
    }
  }

  cache = { loadedAt: Date.now(), instruments };
  return instruments;
}

function filterSymbolOptions(symbol: IndexSymbol, instruments: CachedInstrument[]): CachedInstrument[] {
  const exchange = SYMBOL_EXCHANGE[symbol];
  return instruments.filter(
    (inst) =>
      inst.exchange === exchange &&
      isSymbolOption(symbol, inst.tradingsymbol),
  );
}

export async function listExpiriesForSymbol(symbol: IndexSymbol): Promise<string[]> {
  const instruments = await loadKiteInstruments();
  const options = filterSymbolOptions(symbol, instruments);
  const today = istToday();

  return [...new Set(options.map((opt) => opt.expiry))]
    .filter((date) => date >= today)
    .sort();
}

function instrumentToLeg(inst: CachedInstrument, expiry: string): OptionLeg {
  return {
    instrumentType: inst.instrumentType,
    strike: inst.strike,
    ltp: 0,
    ltpChange: 0,
    oi: 0,
    oiChange: 0,
    volume: 0,
    iv: 0,
    tradingsymbol: inst.tradingsymbol,
    expiry,
    instrumentToken: inst.instrumentToken,
  };
}

export async function buildOptionChainFromInstruments(
  symbol: IndexSymbol,
  expiryFilter?: string,
  spotPrice?: number,
): Promise<OptionChainResponse | null> {
  const instruments = await loadKiteInstruments();
  const options = filterSymbolOptions(symbol, instruments);
  if (options.length === 0) {
    return null;
  }

  const config = INDEX_CONFIG[symbol];

  const expiries = await listExpiriesForSymbol(symbol);

  if (expiries.length === 0) {
    return null;
  }

  let selectedExpiry = expiries[0];
  if (expiryFilter && expiries.includes(expiryFilter)) {
    selectedExpiry = expiryFilter;
  }

  const legsForExpiry = options.filter((opt) => opt.expiry === selectedExpiry);
  if (legsForExpiry.length === 0) {
    return null;
  }

  const spot = spotPrice ?? config.spotPrice;
  const atmStrike = atmStrikeForSpot(symbol, spot);
  const strikes = [...new Set(legsForExpiry.map((leg) => leg.strike))]
    .sort((a, b) => a - b)
    .filter((strike) => Math.abs(strike - atmStrike) <= config.strikeStep * STRIKE_WINDOW);

  const chain: OptionChainRow[] = strikes
    .map((strike) => {
      const ceInst = legsForExpiry.find(
        (leg) => leg.strike === strike && leg.instrumentType === "CE",
      );
      const peInst = legsForExpiry.find(
        (leg) => leg.strike === strike && leg.instrumentType === "PE",
      );

      return {
        strike,
        isAtm: strike === atmStrike,
        ce: ceInst ? instrumentToLeg(ceInst, selectedExpiry) : null,
        pe: peInst ? instrumentToLeg(peInst, selectedExpiry) : null,
      };
    })
    .filter((row) => row.ce || row.pe);

  if (chain.length === 0) {
    return null;
  }

  const lotSize = legsForExpiry[0]?.lotSize ?? config.lotSize;

  return {
    symbol,
    label: config.label,
    spotPrice: spot,
    spotChange: 0,
    spotChangePct: 0,
    lotSize,
    expiry: selectedExpiry,
    expiries,
    chain,
    summary: computeSummaryFromChain(chain, spot),
  };
}

const INDEX_INSTRUMENT_KEYS: Record<IndexSymbol, { exchange: string; tradingsymbol: string }> = {
  NIFTY: { exchange: "NSE", tradingsymbol: "NIFTY 50" },
  BANKNIFTY: { exchange: "NSE", tradingsymbol: "NIFTY BANK" },
  SENSEX: { exchange: "BSE", tradingsymbol: "SENSEX" },
};

/** Kite instrument tokens for index underlyings (fallback if master fetch is slow/fails). */
export const INDEX_INSTRUMENT_TOKEN_FALLBACK: Record<IndexSymbol, number> = {
  NIFTY: 256265,
  BANKNIFTY: 260105,
  SENSEX: 265,
};

let indexTokenCache: Partial<Record<IndexSymbol, number>> | null = null;
let tradingsymbolTokenCache: Map<string, number> | null = null;

async function ensureInstrumentTokenIndexes(): Promise<void> {
  if (indexTokenCache && tradingsymbolTokenCache) {
    return;
  }

  indexTokenCache = {};
  tradingsymbolTokenCache = new Map();

  const text = await fetchKiteInstrumentsCsv();
  const lines = text.trim().split("\n");

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const instrumentToken = Number(cols[0]);
    const tradingsymbol = cols[2]?.trim();
    const exchange = cols[11]?.trim();
    if (!Number.isFinite(instrumentToken) || instrumentToken <= 0 || !tradingsymbol || !exchange) {
      continue;
    }

    tradingsymbolTokenCache.set(`${exchange}:${tradingsymbol}`, instrumentToken);

    for (const symbol of Object.keys(INDEX_INSTRUMENT_KEYS) as IndexSymbol[]) {
      const key = INDEX_INSTRUMENT_KEYS[symbol];
      if (key.exchange === exchange && key.tradingsymbol === tradingsymbol) {
        indexTokenCache[symbol] = instrumentToken;
      }
    }
  }
}

export async function getIndexInstrumentTokens(): Promise<Partial<Record<IndexSymbol, number>>> {
  await ensureInstrumentTokenIndexes();
  return indexTokenCache ?? {};
}

export async function getAllIndexInstrumentTokens(): Promise<number[]> {
  const tokens = await getIndexInstrumentTokens();
  return Object.values(tokens).filter((token): token is number => token != null && token > 0);
}

export async function lookupInstrumentToken(
  exchange: string,
  tradingsymbol: string,
): Promise<number | undefined> {
  await ensureInstrumentTokenIndexes();
  const direct = tradingsymbolTokenCache?.get(`${exchange}:${tradingsymbol}`);
  if (direct) {
    return direct;
  }

  const instruments = await loadKiteInstruments();
  const match = instruments.find(
    (inst) => inst.tradingsymbol === tradingsymbol && inst.exchange === exchange,
  );
  return match?.instrumentToken;
}

export async function lookupInstrumentByToken(
  instrumentToken: number,
): Promise<CachedInstrument | undefined> {
  const instruments = await loadKiteInstruments();
  return instruments.find((inst) => inst.instrumentToken === instrumentToken);
}

export async function lookupInstrumentLoose(
  tradingsymbol: string,
  preferredExchange?: string,
): Promise<CachedInstrument | undefined> {
  const instruments = await loadKiteInstruments();
  const matches = instruments.filter((inst) => inst.tradingsymbol === tradingsymbol);
  if (matches.length === 0) {
    return undefined;
  }
  if (preferredExchange) {
    const preferred = matches.find((inst) => inst.exchange === preferredExchange);
    if (preferred) {
      return preferred;
    }
  }
  return matches[0];
}

export function lookupLotSizeFromCache(tradingsymbol: string): number | undefined {
  const row = cache?.instruments.find((i) => i.tradingsymbol === tradingsymbol);
  if (row?.lotSize != null && row.lotSize > 1) {
    return row.lotSize;
  }
  return undefined;
}

export function invalidateInstrumentCache() {
  cache = null;
  indexTokenCache = null;
  tradingsymbolTokenCache = null;
  masterSearchCache = null;
}

export interface KiteInstrumentSearchHit {
  instrumentToken: number;
  tradingsymbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrumentType: string;
}

let masterSearchCache: { loadedAt: number; rows: KiteInstrumentSearchHit[] } | null = null;

export async function loadKiteInstrumentMaster(): Promise<KiteInstrumentSearchHit[]> {
  if (masterSearchCache && Date.now() - masterSearchCache.loadedAt < CACHE_TTL_MS) {
    return masterSearchCache.rows;
  }

  const text = await fetchKiteInstrumentsCsv();
  const lines = text.trim().split("\n");
  const rows: KiteInstrumentSearchHit[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const instrumentToken = Number(cols[0]);
    const tradingsymbol = cols[2]?.trim();
    const name = cols[3]?.trim() ?? "";
    const instrumentType = cols[9]?.trim() ?? "";
    const segment = cols[10]?.trim() ?? "";
    const exchange = cols[11]?.trim() ?? "";
    if (!Number.isFinite(instrumentToken) || instrumentToken <= 0 || !tradingsymbol || !exchange) {
      continue;
    }
    rows.push({
      instrumentToken,
      tradingsymbol,
      name,
      exchange,
      segment,
      instrumentType,
    });
  }

  masterSearchCache = { loadedAt: Date.now(), rows };
  return rows;
}

export async function lookupMasterInstrumentByToken(
  instrumentToken: number,
): Promise<KiteInstrumentSearchHit | undefined> {
  const master = await loadKiteInstrumentMaster();
  return master.find((row) => row.instrumentToken === instrumentToken);
}

export async function lookupMasterInstrument(
  tradingsymbol: string,
  exchange?: string,
): Promise<KiteInstrumentSearchHit | undefined> {
  const master = await loadKiteInstrumentMaster();
  const matches = master.filter((row) => row.tradingsymbol === tradingsymbol);
  if (matches.length === 0) {
    return undefined;
  }
  if (exchange) {
    return matches.find((row) => row.exchange === exchange) ?? matches[0];
  }
  return matches[0];
}

/** Nearest (front-month) futures contract for a symbol prefix on an exchange. */
export async function lookupNearestFuture(
  exchange: string,
  symbolPrefix: string,
): Promise<KiteInstrumentSearchHit | null> {
  const master = await loadKiteInstrumentMaster();
  const prefix = symbolPrefix.toUpperCase();
  const candidates = master.filter((row) => {
    if (row.exchange !== exchange || row.instrumentType !== "FUT") {
      return false;
    }
    if (!row.tradingsymbol.startsWith(prefix)) {
      return false;
    }
    if (prefix === "CRUDEOIL" && row.tradingsymbol.startsWith("CRUDEOILM")) {
      return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => a.tradingsymbol.localeCompare(b.tradingsymbol));
  return candidates[0]!;
}

export async function searchKiteInstruments(
  query: string,
  limit = 30,
): Promise<KiteInstrumentSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }

  const master = await loadKiteInstrumentMaster();
  const scored: { hit: KiteInstrumentSearchHit; score: number }[] = [];

  for (const hit of master) {
    const sym = hit.tradingsymbol.toLowerCase();
    const nm = hit.name.toLowerCase();
    let score = 0;
    if (sym === q) {
      score = 100;
    } else if (sym.startsWith(q)) {
      score = 80;
    } else if (sym.includes(q)) {
      score = 60;
    } else if (nm.includes(q)) {
      score = 40;
    } else {
      continue;
    }
    scored.push({ hit, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.hit.tradingsymbol.localeCompare(b.hit.tradingsymbol) ||
      a.hit.exchange.localeCompare(b.hit.exchange),
  );

  const seen = new Set<string>();
  const out: KiteInstrumentSearchHit[] = [];
  for (const { hit } of scored) {
    const key = `${hit.exchange}:${hit.tradingsymbol}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}
