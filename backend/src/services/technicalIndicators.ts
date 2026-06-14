export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  date?: Date;
}

export type EmaPosition = "above" | "below";
export type EmaCrossAlignment = "bullish" | "bearish";
export type EmaCrossover = "bullish_cross" | "bearish_cross";

export interface EmaCrossState {
  alignment: EmaCrossAlignment | null;
  crossover: EmaCrossover | null;
}

export function emaSeries(values: number[], period: number): number[] {
  if (values.length < period || period < 1) {
    return [];
  }
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i]!;
  }
  let prev = sum / period;
  const out: number[] = [prev];
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function smaSeries(values: number[], period: number): number[] {
  if (values.length < period || period < 1) {
    return [];
  }
  const out: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j]!;
    }
    out.push(sum / period);
  }
  return out;
}

/** Simple MA — ChartIQ `ma (N, ma, 0)` studies. */
export function latestSma(closes: number[], period: number): number | null {
  if (closes.length < period) {
    return null;
  }
  const series = smaSeries(closes, period);
  return series.length > 0 ? round2(series[series.length - 1]!) : null;
}

export function latestEma(closes: number[], period: number): number | null {
  if (closes.length < period) {
    return null;
  }
  const series = emaSeries(closes, period);
  return series.length > 0 ? round2(series[series.length - 1]!) : null;
}

function smaSeriesPadded(closes: number[], period: number): (number | null)[] {
  const series = smaSeries(closes, period);
  if (series.length === 0) {
    return closes.map(() => null);
  }
  const pad = closes.length - series.length;
  return [...Array(pad).fill(null), ...series];
}

export function emaPosition(close: number, emaValue: number | null): EmaPosition | null {
  if (emaValue == null || !Number.isFinite(emaValue)) {
    return null;
  }
  return close >= emaValue ? "above" : "below";
}

function emaSeriesPadded(closes: number[], period: number): (number | null)[] {
  const series = emaSeries(closes, period);
  if (series.length === 0) {
    return closes.map(() => null);
  }
  const pad = closes.length - series.length;
  return [...Array(pad).fill(null), ...series];
}

function maCrossStateFromSeries(
  closes: number[],
  fast: (number | null)[],
  slow: (number | null)[],
): EmaCrossState {

  const valid: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fast[i] != null && slow[i] != null) {
      valid.push(i);
    }
  }
  if (valid.length === 0) {
    return { alignment: null, crossover: null };
  }

  const last = valid[valid.length - 1]!;
  const fLast = fast[last]!;
  const sLast = slow[last]!;
  const alignment: EmaCrossAlignment = fLast >= sLast ? "bullish" : "bearish";

  if (valid.length < 2) {
    return { alignment, crossover: null };
  }

  const prev = valid[valid.length - 2]!;
  const fPrev = fast[prev]!;
  const sPrev = slow[prev]!;

  if (fPrev < sPrev && fLast >= sLast) {
    return { alignment, crossover: "bullish_cross" };
  }
  if (fPrev > sPrev && fLast < sLast) {
    return { alignment, crossover: "bearish_cross" };
  }

  return { alignment, crossover: null };
}

/** Faster vs slower MA: alignment plus fresh cross on the latest bar (ChartIQ ma studies). */
export function maCrossState(closes: number[], fastPeriod: number, slowPeriod: number): EmaCrossState {
  if (fastPeriod >= slowPeriod || closes.length < slowPeriod) {
    return { alignment: null, crossover: null };
  }
  return maCrossStateFromSeries(
    closes,
    smaSeriesPadded(closes, fastPeriod),
    smaSeriesPadded(closes, slowPeriod),
  );
}

/** Faster EMA vs slower EMA cross. */
export function emaCrossState(closes: number[], fastPeriod: number, slowPeriod: number): EmaCrossState {
  if (fastPeriod >= slowPeriod || closes.length < slowPeriod) {
    return { alignment: null, crossover: null };
  }
  return maCrossStateFromSeries(
    closes,
    emaSeriesPadded(closes, fastPeriod),
    emaSeriesPadded(closes, slowPeriod),
  );
}

/** Wilder RSI — returns full series aligned to closes[period..]. */
export function rsiSeries(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) {
    return [];
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) {
      avgGain += diff;
    } else {
      avgLoss -= diff;
    }
  }
  avgGain /= period;
  avgLoss /= period;

  const out: number[] = [];
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out.push(100 - 100 / (1 + rs0));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

export function latestRsi(closes: number[], period = 14): number | null {
  const series = rsiSeries(closes, period);
  return series.length > 0 ? round2(series[series.length - 1]!) : null;
}

/**
 * Stochastic RSI — matches Kite default (RSI 14, Stoch 14, K smooth 3).
 * Smoothed %K series (%K after 3-period SMA).
 */
export function stochRsiSeries(
  closes: number[],
  rsiPeriod = CHARTIQ_STOCH_RSI_RSI_PERIOD,
  stochPeriod = CHARTIQ_STOCH_RSI_STOCH_PERIOD,
  kSmooth = CHARTIQ_STOCH_RSI_K_SMOOTH,
): number[] {
  const rsi = rsiSeries(closes, rsiPeriod);
  if (rsi.length < stochPeriod) {
    return [];
  }

  const rawStoch: number[] = [];
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const window = rsi.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    const cur = rsi[i]!;
    const stoch = max === min ? 50 : ((cur - min) / (max - min)) * 100;
    rawStoch.push(stoch);
  }

  if (rawStoch.length < kSmooth) {
    return [];
  }

  const smoothed: number[] = [];
  for (let i = kSmooth - 1; i < rawStoch.length; i++) {
    const window = rawStoch.slice(i - kSmooth + 1, i + 1);
    smoothed.push(round2(window.reduce((a, b) => a + b, 0) / kSmooth));
  }
  return smoothed;
}

export function latestStochRsi(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
): number | null {
  const series = stochRsiSeries(closes, rsiPeriod, stochPeriod, kSmooth);
  return series.length > 0 ? series[series.length - 1]! : null;
}

/** Entry bias after oversold touch; exit bias after overbought touch. */
export type StochRsiSignal = "long" | "short" | "neutral";

export type StochRsiDirection = "rising" | "falling" | "flat";

/** ChartIQ StochasticRSI / RSI Divergence reference levels (URef / LRef). */
export const CHARTIQ_OSC_OVERBOUGHT = 80;
export const CHARTIQ_OSC_OVERSOLD = 20;
export const CHARTIQ_RSI_PERIOD = 14;
export const CHARTIQ_WILLIAMS_PERIOD = 14;
export const CHARTIQ_STOCH_RSI_RSI_PERIOD = 14;
export const CHARTIQ_STOCH_RSI_STOCH_PERIOD = 14;
export const CHARTIQ_STOCH_RSI_K_SMOOTH = 3;

const STOCH_RSI_TOUCH_LOOKBACK = 8;

export function stochRsiState(series: number[]): {
  signal: StochRsiSignal | null;
  direction: StochRsiDirection | null;
} {
  if (series.length < 2) {
    return { signal: null, direction: null };
  }

  const curr = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  const direction: StochRsiDirection =
    curr > prev ? "rising" : curr < prev ? "falling" : "flat";

  const window = series.slice(-STOCH_RSI_TOUCH_LOOKBACK);
  const touchedOversold = window.some((v) => v <= CHARTIQ_OSC_OVERSOLD);
  const touchedOverbought = window.some((v) => v >= CHARTIQ_OSC_OVERBOUGHT);

  let signal: StochRsiSignal = "neutral";
  if (touchedOversold && direction === "rising") {
    signal = "long";
  } else if (touchedOverbought && direction === "falling") {
    signal = "short";
  }

  return { signal, direction };
}

export type WilliamsZone = "above_-20" | "below_-80" | "between";

export type RsiSignal = "overbought" | "oversold" | "neutral";

/** Zone vs ChartIQ RSI Divergence bands (80 / 20); value is standard RSI(14). */
export function rsiSignal(rsi: number | null): RsiSignal | null {
  if (rsi == null || !Number.isFinite(rsi)) {
    return null;
  }
  if (rsi >= CHARTIQ_OSC_OVERBOUGHT) {
    return "overbought";
  }
  if (rsi <= CHARTIQ_OSC_OVERSOLD) {
    return "oversold";
  }
  return "neutral";
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Prior completed session OHLC from daily candles (excludes latest bar). */
export function previousDaySessionFromBars(bars: OhlcBar[]): {
  close: number;
  high: number;
  low: number;
} | null {
  if (bars.length < 2) {
    return null;
  }
  const prev = bars[bars.length - 2]!;
  if (!Number.isFinite(prev.close) || prev.close <= 0) {
    return null;
  }
  const close = roundPrice(prev.close);
  const high =
    Number.isFinite(prev.high) && prev.high > 0 ? roundPrice(prev.high) : close;
  const low = Number.isFinite(prev.low) && prev.low > 0 ? roundPrice(prev.low) : close;
  return { close, high, low };
}

/** Prior completed session close from daily candles (excludes latest bar). */
export function previousDayCloseFromBars(bars: OhlcBar[]): number | null {
  return previousDaySessionFromBars(bars)?.close ?? null;
}

/** Williams %R(14) — ChartIQ default; zones −20 / −80. */
export function latestWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = CHARTIQ_WILLIAMS_PERIOD,
): { value: number; zone: WilliamsZone } | null {
  if (highs.length < period || lows.length < period || closes.length < period) {
    return null;
  }
  const end = closes.length - 1;
  const start = end - period + 1;
  let highest = -Infinity;
  let lowest = Infinity;
  for (let i = start; i <= end; i++) {
    highest = Math.max(highest, highs[i]!);
    lowest = Math.min(lowest, lows[i]!);
  }
  const close = closes[end]!;
  const range = highest - lowest;
  const value = range === 0 ? -50 : ((highest - close) / range) * -100;
  const rounded = round2(value);
  let zone: WilliamsZone = "between";
  if (rounded > -20) {
    zone = "above_-20";
  } else if (rounded < -80) {
    zone = "below_-80";
  }
  return { value: rounded, zone };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Session VWAP from intraday bars (typical price × volume / volume). */
export function sessionVwapFromBars(bars: OhlcBar[]): number | null {
  if (bars.length === 0) {
    return null;
  }

  let cumPv = 0;
  let cumVol = 0;
  let sawRealVolume = false;

  for (const bar of bars) {
    const rawVol = bar.volume ?? 0;
    if (rawVol > 0) {
      sawRealVolume = true;
    }
    const vol = rawVol > 0 ? rawVol : 1;
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumPv += tp * vol;
    cumVol += vol;
  }

  if (cumVol <= 0) {
    return null;
  }

  if (!sawRealVolume && bars.length > 0) {
    // Options often report zero volume on candles — equal-weight session VWAP.
  }
  return round2(cumPv / cumVol);
}

/** VWAP for the active session with live price on the forming bar. */
export function sessionVwapForBars(
  bars: OhlcBar[],
  livePrice: number,
  now = new Date(),
): number | null {
  const sessionBars = resolveSessionBars(bars, now);
  if (sessionBars.length === 0) {
    return null;
  }

  let cumPv = 0;
  let cumVol = 0;
  for (let i = 0; i < sessionBars.length; i++) {
    const bar = sessionBars[i]!;
    const isLast = i === sessionBars.length - 1;
    const close = isLast ? livePrice : bar.close;
    const high = isLast ? Math.max(bar.high, livePrice) : bar.high;
    const low = isLast ? Math.min(bar.low, livePrice) : bar.low;
    const vol = bar.volume && bar.volume > 0 ? bar.volume : 1;
    const tp = (high + low + close) / 3;
    cumPv += tp * vol;
    cumVol += vol;
  }
  if (cumVol <= 0) {
    return null;
  }
  return round2(cumPv / cumVol);
}

export function istDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Session date key: today (IST) if present in bars, else the latest dated bar's day. */
export function resolveSessionDateKey(bars: OhlcBar[], now = new Date()): string | null {
  const todayKey = istDateKey(now);
  if (bars.some((bar) => bar.date && istDateKey(bar.date) === todayKey)) {
    return todayKey;
  }
  for (let i = bars.length - 1; i >= 0; i--) {
    const d = bars[i]?.date;
    if (d) {
      return istDateKey(d);
    }
  }
  return bars.length > 0 ? todayKey : null;
}

export function filterBarsForIstDate(bars: OhlcBar[], dateKey: string): OhlcBar[] {
  const dated = bars.filter((bar) => bar.date);
  if (dated.length === 0) {
    return bars;
  }
  return dated.filter((bar) => istDateKey(bar.date!) === dateKey);
}

/** Bars for the active session (today or last trading day in the series). */
export function resolveSessionBars(bars: OhlcBar[], now = new Date()): OhlcBar[] {
  const sessionKey = resolveSessionDateKey(bars, now);
  if (!sessionKey) {
    return [];
  }
  const sessionBars = filterBarsForIstDate(bars, sessionKey);
  return sessionBars.length > 0 ? sessionBars : bars;
}
