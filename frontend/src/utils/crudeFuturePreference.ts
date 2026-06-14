const STORAGE_KEY = "tradescharge.crudeQuoteKey";
export const DEFAULT_CRUDE_QUOTE_KEY = "MCX:CRUDEOIL26JUNFUT";

export function getCrudeQuoteKey(): string {
  if (typeof localStorage === "undefined") {
    return DEFAULT_CRUDE_QUOTE_KEY;
  }
  const saved = localStorage.getItem(STORAGE_KEY)?.trim();
  if (!saved) {
    return DEFAULT_CRUDE_QUOTE_KEY;
  }
  const normalized = normalizeCrudeInput(saved);
  if (normalized !== saved) {
    localStorage.setItem(STORAGE_KEY, normalized);
  }
  return normalized;
}

export function setCrudeQuoteKey(quoteKey: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, normalizeCrudeInput(quoteKey));
}

export function parseCrudeQuoteKey(key: string): { exchange: string; tradingsymbol: string } {
  const sep = key.indexOf(":");
  if (sep <= 0) {
    return { exchange: "MCX", tradingsymbol: key.trim().toUpperCase() };
  }
  return {
    exchange: key.slice(0, sep).trim().toUpperCase(),
    tradingsymbol: key.slice(sep + 1).trim().toUpperCase(),
  };
}

export function formatCrudeQuoteKey(exchange: string, tradingsymbol: string): string {
  return `${exchange.toUpperCase()}:${tradingsymbol.toUpperCase()}`;
}

/** Build MCX quote key from user input (symbol only; NCO/other exchanges are ignored). */
export function normalizeCrudeInput(input: string): string {
  const raw = input.trim().toUpperCase();
  if (!raw) {
    return DEFAULT_CRUDE_QUOTE_KEY;
  }
  const sym = raw.includes(":") ? raw.split(":").pop()!.trim() : raw;
  if (!sym.startsWith("CRUDEOIL") || !sym.endsWith("FUT") || sym.startsWith("CRUDEOILM")) {
    return DEFAULT_CRUDE_QUOTE_KEY;
  }
  return formatCrudeQuoteKey("MCX", sym);
}
