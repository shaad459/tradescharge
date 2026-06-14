import type { OhlcBar } from "./technicalIndicators.js";
import { smaSeries } from "./technicalIndicators.js";

export type PriceActionBias = "bullish" | "bearish" | "neutral";

export interface PriceActionInsight {
  label: string;
  bias: PriceActionBias;
}

export interface PriceActionAnalysis {
  headline: string;
  insights: PriceActionInsight[];
}

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartLinePoint {
  time: number;
  value: number;
}

export function barTimeUnix(bar: OhlcBar): number {
  if (!bar.date) {
    return 0;
  }
  return Math.floor(bar.date.getTime() / 1000);
}

export function barsToChartCandles(bars: OhlcBar[], maxBars = 120): ChartCandle[] {
  return bars
    .slice(-maxBars)
    .map((bar) => ({
      time: barTimeUnix(bar),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? 0,
    }))
    .filter((c) => c.time > 0 && c.close > 0);
}

export function smaLineForBars(bars: OhlcBar[], period: number): ChartLinePoint[] {
  if (bars.length < period) {
    return [];
  }
  const closes = bars.map((b) => b.close);
  const series = smaSeries(closes, period);
  const pad = bars.length - series.length;
  return series
    .map((value, i) => ({
      time: barTimeUnix(bars[pad + i]!),
      value: Math.round(value * 100) / 100,
    }))
    .filter((p) => p.time > 0);
}

function bodySize(bar: OhlcBar): number {
  return Math.abs(bar.close - bar.open);
}

function upperWick(bar: OhlcBar): number {
  return bar.high - Math.max(bar.open, bar.close);
}

function lowerWick(bar: OhlcBar): number {
  return Math.min(bar.open, bar.close) - bar.low;
}

function isBullish(bar: OhlcBar): boolean {
  return bar.close > bar.open;
}

function isBearish(bar: OhlcBar): boolean {
  return bar.close < bar.open;
}

export function analyzePriceAction(
  bars: OhlcBar[],
  ctx: {
    vwap: number | null;
    ma20: number | null;
    ma50: number | null;
    previousDayClose: number | null;
    previousDayHigh: number | null;
    previousDayLow: number | null;
  },
): PriceActionAnalysis {
  const insights: PriceActionInsight[] = [];
  if (bars.length < 3) {
    return { headline: "Not enough candles", insights: [] };
  }

  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2]!;
  const close = last.close;

  if (isBullish(last)) {
    insights.push({ label: "Last candle bullish", bias: "bullish" });
  } else if (isBearish(last)) {
    insights.push({ label: "Last candle bearish", bias: "bearish" });
  } else {
    insights.push({ label: "Last candle doji / flat", bias: "neutral" });
  }

  const body = bodySize(last);
  const range = last.high - last.low;
  if (range > 0 && body / range < 0.15) {
    insights.push({ label: "Indecision (small body)", bias: "neutral" });
  }

  if (isBullish(last) && isBearish(prev) && last.close > prev.open && last.open < prev.close) {
    insights.push({ label: "Bullish engulfing", bias: "bullish" });
  }
  if (isBearish(last) && isBullish(prev) && last.close < prev.open && last.open > prev.close) {
    insights.push({ label: "Bearish engulfing", bias: "bearish" });
  }

  if (body > 0 && lowerWick(last) > body * 2 && upperWick(last) < body) {
    insights.push({ label: "Hammer / lower rejection", bias: "bullish" });
  }
  if (body > 0 && upperWick(last) > body * 2 && lowerWick(last) < body) {
    insights.push({ label: "Shooting star / upper rejection", bias: "bearish" });
  }

  const lookback = bars.slice(-6);
  const highs = lookback.map((b) => b.high);
  const lows = lookback.map((b) => b.low);
  const hh =
    highs.length >= 3 &&
    highs[highs.length - 1]! > highs[highs.length - 2]! &&
    highs[highs.length - 2]! > highs[highs.length - 3]!;
  const hl =
    lows.length >= 3 &&
    lows[lows.length - 1]! > lows[lows.length - 2]! &&
    lows[lows.length - 2]! > lows[lows.length - 3]!;
  const lh =
    highs.length >= 3 &&
    highs[highs.length - 1]! < highs[highs.length - 2]! &&
    highs[highs.length - 2]! < highs[highs.length - 3]!;
  const ll =
    lows.length >= 3 &&
    lows[lows.length - 1]! < lows[lows.length - 2]! &&
    lows[lows.length - 2]! < lows[lows.length - 3]!;

  if (hh && hl) {
    insights.push({ label: "Short-term uptrend (HH + HL)", bias: "bullish" });
  } else if (lh && ll) {
    insights.push({ label: "Short-term downtrend (LH + LL)", bias: "bearish" });
  }

  const greenCount = lookback.filter(isBullish).length;
  if (greenCount >= 5) {
    insights.push({ label: `${greenCount}/6 bars bullish`, bias: "bullish" });
  } else if (greenCount <= 1) {
    insights.push({ label: `${6 - greenCount}/6 bars bearish`, bias: "bearish" });
  }

  if (ctx.vwap != null && ctx.vwap > 0) {
    if (close > ctx.vwap * 1.001) {
      insights.push({ label: "Above VWAP", bias: "bullish" });
    } else if (close < ctx.vwap * 0.999) {
      insights.push({ label: "Below VWAP", bias: "bearish" });
    } else {
      insights.push({ label: "At VWAP", bias: "neutral" });
    }
  }

  if (ctx.ma20 != null && ctx.ma50 != null) {
    if (close > ctx.ma20 && ctx.ma20 > ctx.ma50) {
      insights.push({ label: "Above MA20 > MA50", bias: "bullish" });
    } else if (close < ctx.ma20 && ctx.ma20 < ctx.ma50) {
      insights.push({ label: "Below MA20 < MA50", bias: "bearish" });
    }
  }

  if (ctx.previousDayHigh != null && close > ctx.previousDayHigh) {
    insights.push({ label: "Above prev day high", bias: "bullish" });
  } else if (
    ctx.previousDayHigh != null &&
    last.high >= ctx.previousDayHigh * 0.998 &&
    close < ctx.previousDayHigh
  ) {
    insights.push({ label: "Rejected prev day high", bias: "bearish" });
  }

  if (ctx.previousDayLow != null && close < ctx.previousDayLow) {
    insights.push({ label: "Below prev day low", bias: "bearish" });
  } else if (
    ctx.previousDayLow != null &&
    last.low <= ctx.previousDayLow * 1.002 &&
    close > ctx.previousDayLow
  ) {
    insights.push({ label: "Held prev day low", bias: "bullish" });
  }

  if (ctx.previousDayClose != null) {
    const chg = close - ctx.previousDayClose;
    const pct = (chg / ctx.previousDayClose) * 100;
    if (pct > 0.35) {
      insights.push({ label: `Up ${pct.toFixed(2)}% vs prev close`, bias: "bullish" });
    } else if (pct < -0.35) {
      insights.push({ label: `Down ${Math.abs(pct).toFixed(2)}% vs prev close`, bias: "bearish" });
    }
  }

  const bull = insights.filter((i) => i.bias === "bullish").length;
  const bear = insights.filter((i) => i.bias === "bearish").length;
  let headline = "Mixed price action";
  if (bull > bear + 1) {
    headline = "Bullish bias on this timeframe";
  } else if (bear > bull + 1) {
    headline = "Bearish bias on this timeframe";
  }

  return { headline, insights: insights.slice(0, 10) };
}
