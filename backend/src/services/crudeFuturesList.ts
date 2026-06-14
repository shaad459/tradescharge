import {
  CRUDE_EXCHANGE,
  crudeFutDisplayLabel,
  formatQuoteKey,
  isValidCrudeFutSymbol,
} from "../constants/crudeFuture.js";
import { loadKiteInstrumentMaster } from "./kiteInstruments.js";

export interface CrudeFutureOption {
  monthCode: string;
  label: string;
  quoteKey: string;
  exchange: string;
  tradingsymbol: string;
}

const MONTH_ORDER = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

let cache: { options: CrudeFutureOption[]; loadedAt: number } | null = null;
const CACHE_MS = 4 * 60 * 60 * 1000;

function monthCodeFromSymbol(tradingsymbol: string): string | null {
  const match = tradingsymbol.match(/^CRUDEOIL\d{2}([A-Z]{3})FUT$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function monthSortIndex(code: string): number {
  const idx = MONTH_ORDER.indexOf(code as (typeof MONTH_ORDER)[number]);
  return idx >= 0 ? idx : 99;
}

export async function listCrudeOilFutures(): Promise<CrudeFutureOption[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) {
    return cache.options;
  }

  const master = await loadKiteInstrumentMaster();
  const candidates = master.filter(
    (row) =>
      row.exchange === CRUDE_EXCHANGE &&
      row.instrumentType === "FUT" &&
      isValidCrudeFutSymbol(row.tradingsymbol),
  );

  const byMonth = new Map<string, (typeof candidates)[number]>();
  for (const row of candidates) {
    const monthCode = monthCodeFromSymbol(row.tradingsymbol);
    if (!monthCode || byMonth.has(monthCode)) {
      continue;
    }
    byMonth.set(monthCode, row);
  }

  const options: CrudeFutureOption[] = [...byMonth.entries()]
    .sort((a, b) => monthSortIndex(a[0]) - monthSortIndex(b[0]))
    .map(([monthCode, row]) => {
      const label = crudeFutDisplayLabel(row.tradingsymbol)
        .replace(/^Crude /, "")
        .replace(/ FUT \(MCX\)$/, "")
        .replace(/ FUT$/, "");
      return {
        monthCode,
        label,
        quoteKey: formatQuoteKey(row.exchange, row.tradingsymbol),
        exchange: row.exchange,
        tradingsymbol: row.tradingsymbol,
      };
    });

  cache = { options, loadedAt: Date.now() };
  return options;
}
