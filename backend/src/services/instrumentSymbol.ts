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

  /** Monthly / standard: NIFTY + YYMMDD(6) + strike — e.g. NIFTY25052924600CE */
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

  /** Weekly: NIFTY + YY + M(1–9) + DD(2) + strike — e.g. NIFTY2660223750CE */
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

/** Human-readable label like Kite: "NIFTY 02 Jun 23750 CE" */
export function formatInstrumentLabel(
  parsed: Pick<ReturnType<typeof parseTradingsymbol>, "symbol" | "strike" | "instrumentType" | "expiry">,
): string {
  const expiryPart = parsed.expiry
    ? new Date(`${parsed.expiry}T12:00:00+05:30`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      })
    : "";
  const parts = [parsed.symbol, expiryPart, String(parsed.strike), parsed.instrumentType].filter(Boolean);
  return parts.join(" ");
}

export function isFoExchange(exchange: string): boolean {
  return exchange === "NFO" || exchange === "BFO";
}
