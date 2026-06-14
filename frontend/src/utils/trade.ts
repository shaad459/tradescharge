import type { EnrichedClosedPosition, EnrichedPosition, IndexSymbol, TradeSelection } from "../types";
import { addSideForPosition, exitSideForPosition } from "./positionSide";
import { fetchInstrumentQuote, fetchOptionChain } from "../api/client";

const INDEX_LABELS: Record<IndexSymbol, string> = {
  NIFTY: "Nifty 50",
  BANKNIFTY: "Bank Nifty",
  SENSEX: "Sensex",
};

const INDEX_EXCHANGE: Record<IndexSymbol, "NFO" | "BFO"> = {
  NIFTY: "NFO",
  BANKNIFTY: "NFO",
  SENSEX: "BFO",
};

function buildTradingsymbol(
  symbol: string,
  expiry: string,
  strike: number,
  type: "CE" | "PE",
): string {
  const d = new Date(expiry);
  const yy = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${symbol}${yy}${m}${dd}${strike}${type}`;
}

export function positionToTradeSelection(
  position: EnrichedPosition,
  side: "BUY" | "SELL",
  otherPortfolioNet?: number,
): TradeSelection {
  const symbol = position.symbol as IndexSymbol;
  const heldLots = Math.max(1, Math.round(position.quantity / position.lotSize));

  return {
    symbol,
    label: INDEX_LABELS[symbol] ?? symbol,
    instrumentType: position.instrumentType,
    strike: position.strike,
    expiry: position.expiry,
    ltp: position.ltp,
    tradingsymbol: buildTradingsymbol(
      symbol,
      position.expiry,
      position.strike,
      position.instrumentType,
    ),
    lotSize: position.lotSize,
    exchange: INDEX_EXCHANGE[symbol] ?? "NFO",
    initialSide: side,
    positionSide: position.side ?? "long",
    heldLots,
    existingBuyPrice: position.buyPrice,
    positionId: position.id,
    otherPortfolioNet,
  };
}

/** Open position → order pad with correct exit (cover) or add side. */
export function positionTradeSelection(
  position: EnrichedPosition,
  action: "exit" | "add",
  otherPortfolioNet?: number,
): TradeSelection {
  const side = action === "exit" ? exitSideForPosition(position.side) : addSideForPosition(position.side);
  return positionToTradeSelection(position, side, otherPortfolioNet);
}

function closedPositionLots(position: EnrichedClosedPosition): number {
  return Math.max(1, Math.round(position.quantity / position.lotSize));
}

function buildSelectionFromClosed(
  position: EnrichedClosedPosition,
  side: "BUY" | "SELL",
  ltp: number,
  tradingsymbol: string,
): TradeSelection {
  const symbol = position.symbol as IndexSymbol;

  return {
    symbol,
    label: INDEX_LABELS[symbol] ?? symbol,
    instrumentType: position.instrumentType,
    strike: position.strike,
    expiry: position.expiry,
    ltp,
    tradingsymbol,
    lotSize: position.lotSize,
    exchange: INDEX_EXCHANGE[symbol] ?? "NFO",
    initialSide: side,
    defaultLots: closedPositionLots(position),
    reentryFromClosed: true,
  };
}

function positiveLtp(...candidates: Array<number | undefined>): number {
  for (const value of candidates) {
    if (value != null && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function legFromChain(
  chain: Awaited<ReturnType<typeof fetchOptionChain>>,
  strike: number,
  instrumentType: "CE" | "PE",
) {
  const row = chain.chain.find((r) => r.strike === strike);
  return instrumentType === "CE" ? row?.ce : row?.pe;
}

export async function closedPositionToTradeSelection(
  position: EnrichedClosedPosition,
  side: "BUY" | "SELL",
): Promise<TradeSelection> {
  const symbol = position.symbol as IndexSymbol;
  const exchange = INDEX_EXCHANGE[symbol] ?? "NFO";
  const tradingsymbol = buildTradingsymbol(
    symbol,
    position.expiry,
    position.strike,
    position.instrumentType,
  );

  let ltp = 0;

  try {
    const chain = await fetchOptionChain(symbol, position.expiry);
    let leg = legFromChain(chain, position.strike, position.instrumentType);
    ltp = positiveLtp(leg?.ltp, position.exitPrice);

    if (ltp <= 0) {
      const fallbackChain = await fetchOptionChain(symbol);
      leg = legFromChain(fallbackChain, position.strike, position.instrumentType);
      ltp = positiveLtp(leg?.ltp, position.exitPrice);
    }

    const resolvedSymbol = leg?.tradingsymbol ?? tradingsymbol;

    if (ltp <= 0) {
      const quote = await fetchInstrumentQuote(resolvedSymbol, exchange);
      ltp = positiveLtp(quote.ltp, position.exitPrice);
    }

    return buildSelectionFromClosed(
      position,
      side,
      ltp > 0 ? ltp : position.exitPrice,
      resolvedSymbol,
    );
  } catch {
    try {
      const quote = await fetchInstrumentQuote(tradingsymbol, exchange);
      const resolvedLtp = positiveLtp(quote.ltp, position.exitPrice);
      return buildSelectionFromClosed(
        position,
        side,
        resolvedLtp > 0 ? resolvedLtp : position.exitPrice,
        tradingsymbol,
      );
    } catch {
      return buildSelectionFromClosed(
        position,
        side,
        position.exitPrice,
        tradingsymbol,
      );
    }
  }
}
