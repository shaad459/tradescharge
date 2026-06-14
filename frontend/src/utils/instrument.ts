/** Mirror backend instrumentSymbol.ts for display labels in the UI. */

export function parseSymbol(tradingsymbol: string): string {
  if (tradingsymbol.startsWith("BANKNIFTY")) return "BANKNIFTY";
  if (tradingsymbol.startsWith("SENSEX")) return "SENSEX";
  if (tradingsymbol.startsWith("NIFTY")) return "NIFTY";
  return tradingsymbol.split(/\d/)[0] || "NIFTY";
}

export function parseTradingsymbol(tradingsymbol: string): {
  symbol: string;
  strike: number;
  instrumentType: "CE" | "PE";
  expiry: string;
} {
  const instrumentType = tradingsymbol.endsWith("PE") ? "PE" : "CE";
  const symbol = parseSymbol(tradingsymbol);
  const body = tradingsymbol.slice(symbol.length, tradingsymbol.length - 2);

  const monthly = body.match(/^(\d{2})(\d{2})(\d{2})(\d{4,6})$/);
  if (monthly) {
    const yy = monthly[1];
    const mm = monthly[2];
    const dd = monthly[3];
    const monthNum = Number(mm);
    const dayNum = Number(dd);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return {
        symbol,
        strike: Number(monthly[4]),
        instrumentType,
        expiry: `20${yy}-${mm}-${dd}`,
      };
    }
  }

  const weekly = body.match(/^(\d{2})([1-9])(\d{2})(\d{4,6})$/);
  if (weekly) {
    const yy = weekly[1];
    const mm = weekly[2].padStart(2, "0");
    const dd = weekly[3];
    return {
      symbol,
      strike: Number(weekly[4]),
      instrumentType,
      expiry: `20${yy}-${mm}-${dd}`,
    };
  }

  const fallback = tradingsymbol.match(/(\d{4,6})(CE|PE)$/);
  return {
    symbol,
    strike: Number(fallback?.[1] ?? 0),
    instrumentType,
    expiry: "",
  };
}

export function formatInstrumentLabel(parts: {
  symbol: string;
  strike: number;
  instrumentType: "CE" | "PE";
  expiry?: string;
}): string {
  const expiryPart = parts.expiry
    ? new Date(`${parts.expiry}T12:00:00+05:30`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      })
    : "";
  return [parts.symbol, expiryPart, String(parts.strike), parts.instrumentType]
    .filter(Boolean)
    .join(" ");
}

export function formatPositionTitle(position: {
  symbol: string;
  strike: number;
  instrumentType: "CE" | "PE";
  expiry?: string;
}): string {
  return formatInstrumentLabel(position);
}

/** Open lots from Kite net quantity (not day turnover). */
export function positionLots(quantity: number, lotSize: number): number {
  if (!Number.isFinite(lotSize) || lotSize <= 0) {
    return 1;
  }
  const q = Math.abs(quantity);
  if (q === 0) {
    return 0;
  }
  const lots = q / lotSize;
  if (Math.abs(lots - Math.round(lots)) < 0.001) {
    return Math.max(1, Math.round(lots));
  }
  return Math.max(1, Math.round(lots));
}
