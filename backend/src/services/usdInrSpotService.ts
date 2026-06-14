const YAHOO_USDINR_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/INR=X?interval=1m&range=1d";
const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=USD&to=INR";
const MORNINGSTAR_CURRENCIES_URL = "https://www.morningstar.com/markets/currencies";
const CACHE_MS = 5_000;

export type UsdInrSpotSource = "kite" | "yahoo" | "frankfurter" | "morningstar";

export interface UsdInrSpotQuote {
  lastPrice: number;
  change: number;
  changePct: number;
  asOf: string;
  source: UsdInrSpotSource;
}

let cache: { quote: UsdInrSpotQuote; fetchedAt: number } | null = null;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function changePct(last: number, change: number): number {
  const prev = last - change;
  if (!Number.isFinite(prev) || prev <= 0) {
    return 0;
  }
  return round2((change / prev) * 100);
}

function storeQuote(quote: UsdInrSpotQuote): UsdInrSpotQuote {
  cache = { quote, fetchedAt: Date.now() };
  return quote;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChange?: number;
        regularMarketChangePercent?: number;
      };
    }>;
  };
}

async function fetchYahooUsdInr(): Promise<UsdInrSpotQuote | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(YAHOO_USDINR_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return null;
    }

    const body = (await res.json()) as YahooChartResponse;
    const meta = body.chart?.result?.[0]?.meta;
    const lastPrice = Number(meta?.regularMarketPrice ?? 0);
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
      return null;
    }

    const prevClose = Number(
      meta?.chartPreviousClose ?? meta?.previousClose ?? 0,
    );
    let change = Number(meta?.regularMarketChange ?? 0);
    if (!Number.isFinite(change) || change === 0) {
      if (Number.isFinite(prevClose) && prevClose > 0) {
        change = round2(lastPrice - prevClose);
      }
    } else {
      change = round2(change);
    }

    let changePctValue = Number(meta?.regularMarketChangePercent ?? 0);
    if (!Number.isFinite(changePctValue) || changePctValue === 0) {
      changePctValue = changePct(lastPrice, change);
    } else {
      changePctValue = round2(changePctValue);
    }

    return {
      lastPrice: round2(lastPrice),
      change,
      changePct: changePctValue,
      asOf: new Date().toISOString(),
      source: "yahoo",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFrankfurterUsdInr(): Promise<UsdInrSpotQuote | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(FRANKFURTER_URL, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { rates?: { INR?: number } };
    const lastPrice = Number(body.rates?.INR ?? 0);
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
      return null;
    }

    const prev = cache?.quote;
    const change =
      prev && prev.lastPrice > 0 ? round2(lastPrice - prev.lastPrice) : 0;

    return {
      lastPrice: round2(lastPrice),
      change,
      changePct: changePct(lastPrice, change),
      asOf: new Date().toISOString(),
      source: "frankfurter",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSignedNumber(raw: string): number {
  const normalized = raw.replace(/\u2212/g, "-").replace(/,/g, "").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseMorningstarUsdInr(html: string): UsdInrSpotQuote | null {
  const marker = "USD-INR";
  const rowIdx = html.indexOf(marker);
  if (rowIdx < 0) {
    return null;
  }

  const chunk = html.slice(rowIdx, rowIdx + 2800);
  const priceMatch = chunk.match(
    /mdc-number">([0-9.]+)<\/span><\/div>\s*<div><span class="mdc-performance-text/,
  );
  if (!priceMatch) {
    return null;
  }

  const lastPrice = Number(priceMatch[1]);
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
    return null;
  }

  const changeMatch = chunk.match(
    /mdc-performance-text[^>]*>[\s\S]*?mdc-number">([^<]+)<\/span>/,
  );
  const change = changeMatch ? parseSignedNumber(changeMatch[1]) : 0;

  const pctMatch = chunk.match(/mdc-percent">([0-9.]+)%/);
  let changePctValue = 0;
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct)) {
      changePctValue = change < 0 ? -pct : change > 0 ? pct : pct;
    }
  } else if (lastPrice > 0 && change !== 0) {
    changePctValue = changePct(lastPrice, change);
  }

  return {
    lastPrice: round2(lastPrice),
    change: round2(change),
    changePct: round2(changePctValue),
    asOf: new Date().toISOString(),
    source: "morningstar",
  };
}

async function fetchMorningstarUsdInr(): Promise<UsdInrSpotQuote | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(MORNINGSTAR_CURRENCIES_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!res.ok || res.status !== 200) {
      return null;
    }
    const html = await res.text();
    return parseMorningstarUsdInr(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** USD/INR — Morningstar (Google-aligned) first; Yahoo / Frankfurter fallbacks. */
export async function fetchUsdInrSpot(): Promise<UsdInrSpotQuote | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.quote;
  }

  const morningstar = await fetchMorningstarUsdInr();
  if (morningstar) {
    return storeQuote(morningstar);
  }

  const yahoo = await fetchYahooUsdInr();
  if (yahoo) {
    return storeQuote(yahoo);
  }

  const frankfurter = await fetchFrankfurterUsdInr();
  if (frankfurter) {
    return storeQuote(frankfurter);
  }

  return cache?.quote ?? null;
}
