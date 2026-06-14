export const DEFAULT_CRUDE_QUOTE_KEY = "MCX:CRUDEOIL26JUNFUT";

/** Common MCX crude presets (user can override with any valid CRUDEOIL FUT). */
export const CRUDE_FUT_PRESETS: { label: string; quoteKey: string }[] = [
  { label: "Jun", quoteKey: "MCX:CRUDEOIL26JUNFUT" },
  { label: "Jul", quoteKey: "MCX:CRUDEOIL26JULFUT" },
  { label: "Aug", quoteKey: "MCX:CRUDEOIL26AUGFUT" },
  { label: "Sep", quoteKey: "MCX:CRUDEOIL26SEPFUT" },
  { label: "Oct", quoteKey: "MCX:CRUDEOIL26OCTFUT" },
  { label: "Nov", quoteKey: "MCX:CRUDEOIL26NOVFUT" },
];

const MONTH_NAMES: Record<string, string> = {
  JAN: "Jan",
  FEB: "Feb",
  MAR: "Mar",
  APR: "Apr",
  MAY: "May",
  JUN: "Jun",
  JUL: "Jul",
  AUG: "Aug",
  SEP: "Sep",
  OCT: "Oct",
  NOV: "Nov",
  DEC: "Dec",
};

export function parseQuoteKey(key: string): { exchange: string; tradingsymbol: string } {
  const sep = key.indexOf(":");
  if (sep <= 0) {
    return { exchange: "MCX", tradingsymbol: key.trim().toUpperCase() };
  }
  return {
    exchange: key.slice(0, sep).trim().toUpperCase(),
    tradingsymbol: key.slice(sep + 1).trim().toUpperCase(),
  };
}

export function formatQuoteKey(exchange: string, tradingsymbol: string): string {
  return `${exchange.toUpperCase()}:${tradingsymbol.toUpperCase()}`;
}

export function isValidCrudeFutSymbol(tradingsymbol: string): boolean {
  const sym = tradingsymbol.toUpperCase();
  return (
    sym.startsWith("CRUDEOIL") &&
    sym.endsWith("FUT") &&
    !sym.startsWith("CRUDEOILM")
  );
}

export const CRUDE_EXCHANGE = "MCX";

export function isValidCrudeExchange(exchange: string): boolean {
  return exchange === CRUDE_EXCHANGE;
}

/** Resolve MCX crude future quote key; ignores NCO and other exchanges. */
export function resolveCrudeQuoteKey(input?: string | null): string {
  const raw = input?.trim();
  if (!raw) {
    return DEFAULT_CRUDE_QUOTE_KEY;
  }

  if (raw.includes(":")) {
    const { tradingsymbol } = parseQuoteKey(raw);
    if (isValidCrudeFutSymbol(tradingsymbol)) {
      return formatQuoteKey(CRUDE_EXCHANGE, tradingsymbol);
    }
    return DEFAULT_CRUDE_QUOTE_KEY;
  }

  const tradingsymbol = raw.toUpperCase();
  if (isValidCrudeFutSymbol(tradingsymbol)) {
    return formatQuoteKey("MCX", tradingsymbol);
  }

  return DEFAULT_CRUDE_QUOTE_KEY;
}

export function crudeFutDisplayLabel(tradingsymbol: string): string {
  const sym = tradingsymbol.toUpperCase();
  const match = sym.match(/^CRUDEOIL\d{2}([A-Z]{3})FUT$/);
  if (match) {
    const month = MONTH_NAMES[match[1]!] ?? match[1]!;
    return `Crude ${month} FUT (MCX)`;
  }
  return `${sym.replace(/FUT$/i, " FUT")} (MCX)`;
}
