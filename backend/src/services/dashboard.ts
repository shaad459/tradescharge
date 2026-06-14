import type { Trade } from "kiteconnect";
import {
  calculateClosedPositionPnL,
  calculateOpenPositionPortfolioExit,
  calculateOpenPositionPnL,
  calculatePositionChargesFromTrades,
} from "./charges.js";
import { positionBookKey } from "./liveClosedPositions.js";
import { computePortfolioSummary } from "./portfolio.js";
import {
  computeAvailableMargin,
  computeCapitalBalance,
  marginSnapshotFromParts,
  type MarginSnapshot,
} from "./capitalBalance.js";
import { buildPortfolioAwareSuggestion } from "./suggestions.js";
import { getExecutedOrders, getOpenOrders } from "../mock/orderBook.js";
import { getOvernightCarryItems } from "../mock/overnightCarry.js";
import type {
  ClosedPosition,
  DashboardData,
  DemoOrder,
  EnrichedClosedPosition,
  EnrichedPosition,
  ExecutedTransaction,
  Position,
} from "../types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function suggestExitLevels(
  side: "long" | "short",
  totalPortfolioNet: number,
  portfolioExitPrice: number,
  legBreakevenPrice: number,
  entryPrice: number,
): { stopLoss?: number; target?: number } {
  if (side === "short") {
    const cover =
      totalPortfolioNet >= 0
        ? Math.min(legBreakevenPrice, portfolioExitPrice)
        : portfolioExitPrice;
    if (totalPortfolioNet >= 0 && cover < entryPrice) {
      return { stopLoss: round2(cover) };
    }
    if (totalPortfolioNet < 0) {
      return { target: round2(portfolioExitPrice) };
    }
    return {};
  }

  const exit =
    totalPortfolioNet >= 0
      ? Math.max(legBreakevenPrice, portfolioExitPrice)
      : portfolioExitPrice;
  if (totalPortfolioNet >= 0) {
    return { stopLoss: round2(exit) };
  }
  return { target: round2(exit) };
}

function closedNetTotal(closed: ClosedPosition[]): number {
  return round2(
    closed.reduce(
      (sum, position) =>
        sum +
        calculateClosedPositionPnL(
          position.buyPrice,
          position.exitPrice,
          position.quantity,
          position.kiteGrossPnL,
          position.exchange ?? "NFO",
          {
            entryBrokerageOrders: position.entryBrokerageOrders,
            exitBrokerageOrders: position.exitBrokerageOrders,
          },
          position.side,
        ).net,
      0,
    ),
  );
}

function bookKeyFor(position: ClosedPosition): string | undefined {
  if (!position.tradingsymbol || !position.exchange) {
    return undefined;
  }
  return positionBookKey(position.tradingsymbol, position.exchange, position.product ?? "NRML");
}

function authoritativeGross(kiteGrossPnL: number | undefined, fallback: number): number {
  if (kiteGrossPnL != null && Number.isFinite(kiteGrossPnL)) {
    return round2(kiteGrossPnL);
  }
  return fallback;
}

export function enrichClosedPositions(
  closed: ClosedPosition[],
  trades: Trade[] = [],
): EnrichedClosedPosition[] {
  return closed.map((position) => {
    const key = bookKeyFor(position);
    const exchange = position.exchange ?? "NFO";
    const chargesFromTrades =
      key && trades.length > 0
        ? calculatePositionChargesFromTrades(trades, key, exchange, position.side)
        : undefined;

    const pnlBase = calculateClosedPositionPnL(
      position.buyPrice,
      position.exitPrice,
      position.quantity,
      position.kiteGrossPnL,
      exchange,
      {
        entryBrokerageOrders: position.entryBrokerageOrders,
        exitBrokerageOrders: position.exitBrokerageOrders,
      },
      position.side,
    );

    const gross = authoritativeGross(position.kiteGrossPnL, pnlBase.gross);

    const pnl =
      chargesFromTrades != null
        ? {
            gross,
            charges: chargesFromTrades,
            net: round2(gross - chargesFromTrades.total),
          }
        : { ...pnlBase, gross };

    return {
      ...position,
      pnl,
      capitalDeployed: round2(position.buyPrice * position.quantity),
    };
  });
}

/** Portfolio-aware SL / target using all other open and closed legs at current marks. */
export function enrichOpenPositions(
  positions: Position[],
  closed: ClosedPosition[] = [],
  trades: Trade[] = [],
): EnrichedPosition[] {
  if (positions.length === 0) {
    return [];
  }

  const closedNet = closedNetTotal(closed);
  const pnls = positions.map((position) => {
    const exchange = position.exchange ?? "NFO";
    const tradingsymbol = position.tradingsymbol ?? position.id.split(":")[0];
    const product = position.product ?? "NRML";
    const key =
      tradingsymbol && position.exchange
        ? positionBookKey(tradingsymbol, position.exchange, product)
        : undefined;
    const chargesFromTrades =
      key && trades.length > 0
        ? calculatePositionChargesFromTrades(trades, key, exchange, position.side)
        : undefined;
    const pnlBase = calculateOpenPositionPnL(
      position.buyPrice,
      position.ltp,
      position.quantity,
      position.kiteGrossPnL,
      exchange,
      position.side,
    );
    const gross = authoritativeGross(position.kiteGrossPnL, pnlBase.gross);
    if (chargesFromTrades == null) {
      return { ...pnlBase, gross };
    }
    return {
      gross,
      charges: chargesFromTrades,
      net: round2(gross - chargesFromTrades.total),
    };
  });
  const openNet = round2(pnls.reduce((sum, pnl) => sum + pnl.net, 0));
  const totalNet = round2(openNet + closedNet);

  return positions.map((position, index) => {
    const pnl = pnls[index];
    const otherNet = round2(totalNet - pnl.net);
    const lots = Math.max(1, Math.round(position.quantity / position.lotSize));
    const portfolioExit = calculateOpenPositionPortfolioExit(
      position.buyPrice,
      position.lotSize,
      lots,
      position.ltp,
      otherNet,
      position.side,
    );

    const exitLevels = suggestExitLevels(
      position.side,
      totalNet,
      portfolioExit.breakevenPrice,
      portfolioExit.legBreakevenPrice,
      position.buyPrice,
    );

    return {
      ...position,
      pnl,
      breakevenPrice: portfolioExit.breakevenPrice,
      legBreakevenPrice: portfolioExit.legBreakevenPrice,
      moveFromLtp: portfolioExit.moveFromLtp,
      capitalDeployed: portfolioExit.capitalDeployed,
      stopLoss: exitLevels.stopLoss,
      target: exitLevels.target,
      suggestion: buildPortfolioAwareSuggestion(
        pnl.net,
        portfolioExit.breakevenPrice,
        totalNet,
        otherNet,
        position.ltp,
        portfolioExit.legBreakevenPrice,
        undefined,
        position.side,
      ),
    };
  });
}

/** @deprecated Use enrichOpenPositions */
export function enrichPositions(positions: Position[], closed: ClosedPosition[] = []): EnrichedPosition[] {
  return enrichOpenPositions(positions, closed);
}

export function buildDashboard(
  positions: Position[],
  balance: number,
  availableMargin: number,
  mode: "demo" | "live",
  authenticated: boolean,
  closed: ClosedPosition[] = [],
  liveMarketData = false,
  liveBook?: {
    openOrders: DemoOrder[];
    orderHistory: DemoOrder[];
    executedTransactions?: ExecutedTransaction[];
  },
  marginMeta?: Pick<
    MarginSnapshot,
    "openingBalance" | "m2mRealised" | "m2mUnrealised" | "marginEnabled"
  >,
  trades: Trade[] = [],
): DashboardData {
  const enrichedClosed = enrichClosedPositions(closed, trades);
  const enriched = enrichOpenPositions(positions, closed, trades);
  const portfolioBase = computePortfolioSummary(enriched, enrichedClosed);
  const margins = marginSnapshotFromParts(
    balance,
    availableMargin,
    marginMeta?.openingBalance,
    marginMeta?.m2mRealised,
    marginMeta?.m2mUnrealised,
    marginMeta?.marginEnabled,
  );

  const walletDayChange =
    margins.openingBalance > 0 && Number.isFinite(margins.net)
      ? Math.round((margins.net - margins.openingBalance) * 100) / 100
      : undefined;

  const portfolio = {
    ...portfolioBase,
    walletDayChange,
    kiteM2mRealised: marginMeta?.m2mRealised,
  };

  return {
    mode,
    authenticated,
    liveMarketData,
    balance: computeCapitalBalance(margins, positions, enriched, portfolio.netPnL),
    availableMargin: computeAvailableMargin(margins, portfolio.netPnL),
    openingBalance: margins.openingBalance,
    m2mRealised: marginMeta?.m2mRealised,
    positions: enriched,
    closedPositions: enrichedClosed,
    openOrders: mode === "live" ? (liveBook?.openOrders ?? []) : getOpenOrders(),
    orderHistory: mode === "live" ? (liveBook?.orderHistory ?? []) : getExecutedOrders(),
    executedTransactions:
      mode === "live" ? (liveBook?.executedTransactions ?? []) : undefined,
    overnightCarry: mode === "live" ? [] : getOvernightCarryItems(positions),
    portfolio,
  };
}
