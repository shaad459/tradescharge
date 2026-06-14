import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG, INDEX_SYMBOLS } from "../constants.js";
import {
  isTechnicalWatchKey,
  TECHNICAL_WATCH_KEYS,
  TECHNICAL_WATCHLIST,
  type TechnicalWatchKey,
} from "../constants/technicalsWatchlist.js";
import type {
  EmaCrossAlignment,
  EmaCrossover,
  EmaPosition,
  RsiSignal,
  StochRsiDirection,
  StochRsiSignal,
  WilliamsZone,
} from "./technicalIndicators.js";
import {
  emaPosition,
  latestSma,
  maCrossState,
  filterBarsForIstDate,
  istDateKey,
  CHARTIQ_RSI_PERIOD,
  latestRsi,
  latestWilliamsR,
  stochRsiSeries,
  stochRsiState,
  previousDayCloseFromBars,
  previousDaySessionFromBars,
  resolveSessionBars,
  rsiSignal,
  sessionVwapForBars,
  sessionVwapFromBars,
  type OhlcBar,
} from "./technicalIndicators.js";
import {
  getIndexInstrumentTokens,
  lookupInstrumentByToken,
  loadKiteInstruments,
  loadKiteInstrumentMaster,
  lookupInstrumentLoose,
  lookupMasterInstrument,
  lookupMasterInstrumentByToken,
  lookupInstrumentToken,
  searchKiteInstruments,
  type KiteInstrumentSearchHit,
} from "./kiteInstruments.js";
import { kiteClient } from "./kite.js";

export const TECHNICAL_TIMEFRAMES = [
  { id: "1m", label: "1m", kiteInterval: "minute", lookbackDays: 5 },
  { id: "3m", label: "3m", kiteInterval: "3minute", lookbackDays: 10 },
  { id: "5m", label: "5m", kiteInterval: "5minute", lookbackDays: 15 },
  { id: "15m", label: "15m", kiteInterval: "15minute", lookbackDays: 30 },
  { id: "30m", label: "30m", kiteInterval: "30minute", lookbackDays: 120 },
  { id: "1h", label: "1h", kiteInterval: "60minute", lookbackDays: 180 },
  { id: "1D", label: "1D", kiteInterval: "day", lookbackDays: 400 },
] as const;

export type TechnicalTimeframeId = (typeof TECHNICAL_TIMEFRAMES)[number]["id"];

export interface TechnicalTimeframeRow {
  timeframe: TechnicalTimeframeId;
  label: string;
  lastClose: number;
  previousDayClose: number | null;
  rsi14: number | null;
  rsiSignal: RsiSignal | null;
  stochRsi: number | null;
  stochRsiSignal: StochRsiSignal | null;
  stochRsiDirection: StochRsiDirection | null;
  williamsR14: number | null;
  williamsZone: WilliamsZone | null;
  ema20: EmaPosition | null;
  ema50: EmaPosition | null;
  ema100: EmaPosition | null;
  ema200: EmaPosition | null;
  ema20Value: number | null;
  ema50Value: number | null;
  ema100Value: number | null;
  ema200Value: number | null;
  emaCross2050Alignment: EmaCrossAlignment | null;
  emaCross2050Crossover: EmaCrossover | null;
  emaCross50100Alignment: EmaCrossAlignment | null;
  emaCross50100Crossover: EmaCrossover | null;
  emaCross50200Alignment: EmaCrossAlignment | null;
  emaCross50200Crossover: EmaCrossover | null;
  sessionVwap: number | null;
  vwapPosition: EmaPosition | null;
  barsUsed: number;
}

export interface TechnicalsResponse {
  kind: "index" | "option" | "custom";
  indexSymbol?: IndexSymbol;
  watchKey?: TechnicalWatchKey;
  label: string;
  exchange: string;
  tradingsymbol: string;
  instrumentToken: number;
  lastPrice: number;
  previousDayClose: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  sessionVwap: number | null;
  asOf: string;
  timeframes: TechnicalTimeframeRow[];
}

export type { KiteInstrumentSearchHit };
export { searchKiteInstruments };

import { fetchCandlesForTechnicals } from "./technicalsCandles.js";
import {
  analyzePriceAction,
  barsToChartCandles,
  smaLineForBars,
  type ChartCandle,
  type ChartLinePoint,
  type PriceActionAnalysis,
} from "./priceAction.js";

export const TECHNICAL_TIMEFRAME_ORDER: TechnicalTimeframeId[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "1D",
];

async function lookupNearestIndexFutureToken(
  watchKey: TechnicalWatchKey | IndexSymbol | undefined,
): Promise<number | null> {
  if (!watchKey || (watchKey !== "NIFTY" && watchKey !== "BANKNIFTY" && watchKey !== "SENSEX")) {
    return null;
  }
  const prefix = watchKey === "SENSEX" ? "SENSEX" : watchKey;
  const exchange = watchKey === "SENSEX" ? "BFO" : "NFO";
  const master = await loadKiteInstrumentMaster();
  const withExpiry = master.filter(
    (row) =>
      row.exchange === exchange &&
      row.instrumentType === "FUT" &&
      row.tradingsymbol.startsWith(prefix) &&
      row.tradingsymbol.endsWith("FUT"),
  );

  if (withExpiry.length === 0) {
    return null;
  }

  withExpiry.sort((a, b) => a.tradingsymbol.localeCompare(b.tradingsymbol));
  return withExpiry[0]!.instrumentToken;
}

function usesIndexFutureVwapFallback(target: InstrumentTarget): boolean {
  if (target.kind === "option") {
    return false;
  }
  const key = target.watchKey ?? target.indexSymbol;
  return key === "NIFTY" || key === "BANKNIFTY" || key === "SENSEX";
}

export function vwapFromTimeframeBars(bars: OhlcBar[], livePrice?: number): number | null {
  if (bars.length === 0) {
    return null;
  }
  const price = livePrice != null && livePrice > 0 ? livePrice : (bars[bars.length - 1]?.close ?? 0);
  if (price <= 0) {
    return null;
  }
  const now = new Date();
  return (
    sessionVwapForBars(bars, price, now) ??
    sessionVwapFromBars(resolveSessionBars(bars, now))
  );
}

export async function resolveTimeframeVwap(
  accessToken: string,
  target: InstrumentTarget,
  interval: string,
  lookbackDays: number,
  bars: OhlcBar[],
): Promise<number | null> {
  let vwap = vwapFromTimeframeBars(bars);
  if (vwap != null) {
    return vwap;
  }
  if (!usesIndexFutureVwapFallback(target)) {
    return null;
  }
  const futToken = await lookupNearestIndexFutureToken(target.watchKey ?? target.indexSymbol);
  if (!futToken || futToken === target.instrumentToken) {
    return null;
  }
  const futBars = await fetchCandlesForTechnicals(accessToken, futToken, interval, lookbackDays);
  return vwapFromTimeframeBars(futBars);
}

export function computeTimeframeRow(
  tf: (typeof TECHNICAL_TIMEFRAMES)[number],
  bars: OhlcBar[],
  previousDayClose: number | null,
  sessionVwap: number | null,
): TechnicalTimeframeRow {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const lastClose = closes[closes.length - 1] ?? 0;
  const rsi14 = latestRsi(closes, CHARTIQ_RSI_PERIOD);

  const williams = latestWilliamsR(highs, lows, closes);

  const ema20Val = latestSma(closes, 20);
  const ema50Val = latestSma(closes, 50);
  const ema100Val = latestSma(closes, 100);
  const ema200Val = latestSma(closes, 200);
  const cross2050 = maCrossState(closes, 20, 50);
  const cross50100 = maCrossState(closes, 50, 100);
  const cross50200 = maCrossState(closes, 50, 200);
  const stochSeries = stochRsiSeries(closes);
  const stochState = stochRsiState(stochSeries);

  const roundEma = (v: number | null) =>
    v != null && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;

  return {
    timeframe: tf.id,
    label: tf.label,
    lastClose,
    previousDayClose,
    rsi14,
    rsiSignal: rsiSignal(rsi14),
    stochRsi: stochSeries.length > 0 ? stochSeries[stochSeries.length - 1]! : null,
    stochRsiSignal: stochState.signal,
    stochRsiDirection: stochState.direction,
    williamsR14: williams?.value ?? null,
    williamsZone: williams?.zone ?? null,
    ema20: emaPosition(lastClose, ema20Val),
    ema50: emaPosition(lastClose, ema50Val),
    ema100: emaPosition(lastClose, ema100Val),
    ema200: emaPosition(lastClose, ema200Val),
    ema20Value: roundEma(ema20Val),
    ema50Value: roundEma(ema50Val),
    ema100Value: roundEma(ema100Val),
    ema200Value: roundEma(ema200Val),
    emaCross2050Alignment: cross2050.alignment,
    emaCross2050Crossover: cross2050.crossover,
    emaCross50100Alignment: cross50100.alignment,
    emaCross50100Crossover: cross50100.crossover,
    emaCross50200Alignment: cross50200.alignment,
    emaCross50200Crossover: cross50200.crossover,
    sessionVwap,
    vwapPosition: emaPosition(lastClose, sessionVwap),
    barsUsed: bars.length,
  };
}

export interface InstrumentTarget {
  kind: "index" | "option" | "custom";
  indexSymbol?: IndexSymbol;
  watchKey?: TechnicalWatchKey;
  label: string;
  exchange: string;
  tradingsymbol: string;
  instrumentToken: number;
}

export async function resolveTechnicalsTarget(
  params: {
    index?: string;
    exchange?: string;
    tradingsymbol?: string;
    instrumentToken?: string | number;
  },
): Promise<InstrumentTarget | null> {
  const tokenParam = Number(params.instrumentToken);
  if (Number.isFinite(tokenParam) && tokenParam > 0) {
    for (const key of TECHNICAL_WATCH_KEYS) {
      const meta = TECHNICAL_WATCHLIST[key];
      if (meta.instrumentToken === tokenParam) {
        return {
          kind: "index",
          indexSymbol: meta.hasOptionChain ? (key as IndexSymbol) : undefined,
          watchKey: key,
          label: meta.label,
          exchange: meta.exchange,
          tradingsymbol: meta.tradingsymbol,
          instrumentToken: tokenParam,
        };
      }
    }

    const optionRow = await lookupInstrumentByToken(tokenParam);
    if (optionRow) {
      for (const key of TECHNICAL_WATCH_KEYS) {
        const meta = TECHNICAL_WATCHLIST[key];
        if (meta.tradingsymbol === optionRow.tradingsymbol && meta.exchange === optionRow.exchange) {
          return {
            kind: "index",
            indexSymbol: meta.hasOptionChain ? (key as IndexSymbol) : undefined,
            watchKey: key,
            label: meta.label,
            exchange: optionRow.exchange,
            tradingsymbol: optionRow.tradingsymbol,
            instrumentToken: optionRow.instrumentToken,
          };
        }
      }

      let indexSymbol: IndexSymbol | undefined;
      for (const sym of ["NIFTY", "BANKNIFTY", "SENSEX"] as IndexSymbol[]) {
        if (optionRow.tradingsymbol.startsWith(sym)) {
          indexSymbol = sym;
          break;
        }
      }

      return {
        kind: "option",
        indexSymbol,
        label: optionRow.tradingsymbol,
        exchange: optionRow.exchange,
        tradingsymbol: optionRow.tradingsymbol,
        instrumentToken: optionRow.instrumentToken,
      };
    }

    const masterRow = await lookupMasterInstrumentByToken(tokenParam);
    if (masterRow) {
      for (const key of TECHNICAL_WATCH_KEYS) {
        const meta = TECHNICAL_WATCHLIST[key];
        if (meta.tradingsymbol === masterRow.tradingsymbol && meta.exchange === masterRow.exchange) {
          return {
            kind: "index",
            indexSymbol: meta.hasOptionChain ? (key as IndexSymbol) : undefined,
            watchKey: key,
            label: meta.label,
            exchange: masterRow.exchange,
            tradingsymbol: masterRow.tradingsymbol,
            instrumentToken: masterRow.instrumentToken,
          };
        }
      }

      const label = masterRow.name
        ? `${masterRow.tradingsymbol} · ${masterRow.name}`
        : masterRow.tradingsymbol;
      const isOption = masterRow.instrumentType === "CE" || masterRow.instrumentType === "PE";
      return {
        kind: isOption ? "option" : "custom",
        label,
        exchange: masterRow.exchange,
        tradingsymbol: masterRow.tradingsymbol,
        instrumentToken: masterRow.instrumentToken,
      };
    }
  }

  const indexKey = params.index?.toUpperCase();
  if (indexKey && isTechnicalWatchKey(indexKey)) {
    const meta = TECHNICAL_WATCHLIST[indexKey];
    const tokens = await getIndexInstrumentTokens();
    const token =
      meta.hasOptionChain && (indexKey === "NIFTY" || indexKey === "BANKNIFTY" || indexKey === "SENSEX")
        ? (tokens[indexKey] ?? meta.instrumentToken)
        : meta.instrumentToken;
    if (!token) {
      return null;
    }
    return {
      kind: "index",
      indexSymbol: meta.hasOptionChain ? (indexKey as IndexSymbol) : undefined,
      watchKey: indexKey,
      label: meta.label,
      exchange: meta.exchange,
      tradingsymbol: meta.tradingsymbol,
      instrumentToken: token,
    };
  }

  const tradingsymbol = params.tradingsymbol?.trim();
  if (!tradingsymbol) {
    return null;
  }

  const exchange = (params.exchange?.trim() ?? "NFO").toUpperCase();
  let token = await lookupInstrumentToken(exchange, tradingsymbol);
  let resolvedExchange = exchange;

  if (!token) {
    const loose = await lookupInstrumentLoose(tradingsymbol, exchange);
    if (loose) {
      token = loose.instrumentToken;
      resolvedExchange = loose.exchange;
    } else {
      const master = await lookupMasterInstrument(tradingsymbol, exchange);
      if (master) {
        token = master.instrumentToken;
        resolvedExchange = master.exchange;
      }
    }
  }

  if (!token) {
    return null;
  }

  let indexSymbol: IndexSymbol | undefined;
  for (const sym of INDEX_SYMBOLS) {
    if (tradingsymbol.startsWith(sym)) {
      indexSymbol = sym;
      break;
    }
  }

  const master = await lookupMasterInstrument(tradingsymbol, resolvedExchange);
  const isOption =
    master?.instrumentType === "CE" ||
    master?.instrumentType === "PE" ||
    tradingsymbol.endsWith("CE") ||
    tradingsymbol.endsWith("PE");

  return {
    kind: isOption ? "option" : "custom",
    indexSymbol,
    label: master?.name ? `${tradingsymbol} · ${master.name}` : tradingsymbol,
    exchange: resolvedExchange,
    tradingsymbol,
    instrumentToken: token,
  };
}

export function findTechnicalTimeframe(id: string) {
  return TECHNICAL_TIMEFRAMES.find((tf) => tf.id === id);
}

export async function resolvePreviousDaySession(
  accessToken: string,
  instrumentToken: number,
): Promise<{ close: number | null; high: number | null; low: number | null }> {
  const dayBars = await fetchCandlesForTechnicals(accessToken, instrumentToken, "day", 30);
  const session = previousDaySessionFromBars(dayBars);
  return session
    ? { close: session.close, high: session.high, low: session.low }
    : { close: null, high: null, low: null };
}

export async function resolvePreviousDayClose(
  accessToken: string,
  instrumentToken: number,
): Promise<number | null> {
  const { close } = await resolvePreviousDaySession(accessToken, instrumentToken);
  return close;
}

export type TechnicalChartTimeframeId = TechnicalTimeframeId;

export interface TechnicalsChartResponse {
  label: string;
  tradingsymbol: string;
  timeframe: TechnicalChartTimeframeId;
  timeframeLabel: string;
  lastPrice: number;
  previousDayClose: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  sessionVwap: number | null;
  candles: ChartCandle[];
  ma20Line: ChartLinePoint[];
  ma50Line: ChartLinePoint[];
  vwapLine: ChartLinePoint[];
  priceAction: PriceActionAnalysis;
  asOf: string;
}

export async function fetchTechnicalsChart(
  accessToken: string,
  target: InstrumentTarget,
  timeframeId: TechnicalChartTimeframeId = "15m",
): Promise<TechnicalsChartResponse> {
  const tf = findTechnicalTimeframe(timeframeId) ?? findTechnicalTimeframe("15m")!;
  const { close: previousDayClose, high: previousDayHigh, low: previousDayLow } =
    await resolvePreviousDaySession(accessToken, target.instrumentToken);

  const bars = await fetchCandlesForTechnicals(
    accessToken,
    target.instrumentToken,
    tf.kiteInterval,
    tf.lookbackDays,
  );

  const row = computeTimeframeRow(tf, bars, previousDayClose, null);
  const timeframeVwap = await resolveTimeframeVwap(
    accessToken,
    target,
    tf.kiteInterval,
    tf.lookbackDays,
    bars,
  );

  const candles = barsToChartCandles(bars, 120);
  const ma20Line = smaLineForBars(bars, 20);
  const ma50Line = smaLineForBars(bars, 50);

  let vwapLine: ChartLinePoint[] = [];
  const vwap = timeframeVwap ?? row.sessionVwap;
  if (vwap != null && vwap > 0 && candles.length >= 2) {
    vwapLine = [
      { time: candles[0]!.time, value: vwap },
      { time: candles[candles.length - 1]!.time, value: vwap },
    ];
  }

  const priceAction = analyzePriceAction(bars, {
    vwap,
    ma20: row.ema20Value,
    ma50: row.ema50Value,
    previousDayClose,
    previousDayHigh,
    previousDayLow,
  });

  return {
    label: target.label,
    tradingsymbol: target.tradingsymbol,
    timeframe: tf.id,
    timeframeLabel: tf.label,
    lastPrice: row.lastClose,
    previousDayClose,
    previousDayHigh,
    previousDayLow,
    sessionVwap: vwap,
    candles,
    ma20Line,
    ma50Line,
    vwapLine,
    priceAction,
    asOf: new Date().toISOString(),
  };
}

export async function fetchTechnicalsTimeframe(
  accessToken: string,
  target: InstrumentTarget,
  timeframeId: TechnicalTimeframeId,
  previousDayClose: number | null,
): Promise<TechnicalTimeframeRow> {
  const tf = findTechnicalTimeframe(timeframeId);
  if (!tf) {
    throw new Error(`Unknown timeframe: ${timeframeId}`);
  }
  const bars = await fetchCandlesForTechnicals(
    accessToken,
    target.instrumentToken,
    tf.kiteInterval,
    tf.lookbackDays,
  );
  const timeframeVwap = await resolveTimeframeVwap(
    accessToken,
    target,
    tf.kiteInterval,
    tf.lookbackDays,
    bars,
  );
  return computeTimeframeRow(tf, bars, previousDayClose, timeframeVwap);
}

export async function fetchTechnicals(
  accessToken: string,
  target: InstrumentTarget,
): Promise<TechnicalsResponse> {
  const { close: previousDayClose, high: previousDayHigh, low: previousDayLow } =
    await resolvePreviousDaySession(accessToken, target.instrumentToken);

  const timeframes = await Promise.all(
    TECHNICAL_TIMEFRAME_ORDER.map((id) =>
      fetchTechnicalsTimeframe(accessToken, target, id, previousDayClose),
    ),
  );

  const lastPrice = timeframes[timeframes.length - 1]?.lastClose ?? 0;
  const sessionVwap = timeframes.find((row) => row.timeframe === "1m")?.sessionVwap ?? null;

  return {
    kind: target.kind,
    indexSymbol: target.indexSymbol,
    watchKey: target.watchKey,
    label: target.label,
    exchange: target.exchange,
    tradingsymbol: target.tradingsymbol,
    instrumentToken: target.instrumentToken,
    lastPrice,
    previousDayClose,
    previousDayHigh,
    previousDayLow,
    sessionVwap,
    asOf: new Date().toISOString(),
    timeframes,
  };
}

export interface StrikeSearchResult {
  tradingsymbol: string;
  exchange: string;
  strike: number;
  instrumentType: "CE" | "PE";
  expiry: string;
  instrumentToken: number;
}

export async function searchStrikeInstruments(
  symbol: IndexSymbol,
  query: string,
  expiry?: string,
  limit = 24,
): Promise<StrikeSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const instruments = await loadKiteInstruments();
  const exchange = symbol === "SENSEX" ? "BFO" : "NFO";

  const matches = instruments.filter((inst) => {
    if (inst.exchange !== exchange) {
      return false;
    }
    if (symbol === "NIFTY") {
      if (!inst.tradingsymbol.startsWith("NIFTY") || inst.tradingsymbol.startsWith("NIFTYNXT")) {
        return false;
      }
    } else if (!inst.tradingsymbol.startsWith(symbol)) {
      return false;
    }
    if (expiry && inst.expiry !== expiry) {
      return false;
    }
    const strikeStr = String(inst.strike);
    return (
      strikeStr.includes(q) ||
      inst.tradingsymbol.toLowerCase().includes(q) ||
      `${inst.strike}${inst.instrumentType}`.toLowerCase().includes(q.replace(/\s/g, ""))
    );
  });

  matches.sort((a, b) => a.strike - b.strike || a.tradingsymbol.localeCompare(b.tradingsymbol));

  return matches.slice(0, limit).map((inst) => ({
    tradingsymbol: inst.tradingsymbol,
    exchange: inst.exchange,
    strike: inst.strike,
    instrumentType: inst.instrumentType,
    expiry: inst.expiry,
    instrumentToken: inst.instrumentToken,
  }));
}

export function indexLabel(symbol: IndexSymbol): string {
  return TECHNICAL_WATCHLIST[symbol]?.label ?? INDEX_CONFIG[symbol].label;
}
