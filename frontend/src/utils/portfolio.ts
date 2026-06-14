import type { DashboardData } from "../types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Weighted average entry when adding lots at addPrice on top of an existing held leg. */
export function weightedEntryLots(
  existingBuyPrice: number,
  heldLots: number,
  addPrice: number,
  totalLots: number,
): number {
  if (totalLots <= heldLots) {
    return existingBuyPrice;
  }
  const addLots = totalLots - heldLots;
  return round2((existingBuyPrice * heldLots + addPrice * addLots) / totalLots);
}

/** Sum open + closed legs once (dashboard.portfolio already includes both). */
export function computeAllPositionsTotals(dashboard: DashboardData) {
  const open = dashboard.positions;
  const closed = dashboard.closedPositions ?? [];
  const all = [...open, ...closed];

  let grossPnL = round2(all.reduce((sum, p) => sum + p.pnl.gross, 0));
  const netPnL = round2(all.reduce((sum, p) => sum + p.pnl.net, 0));
  const totalCharges = round2(all.reduce((sum, p) => sum + p.pnl.charges.total, 0));

  if (Math.abs(grossPnL) < 0.01 && dashboard.m2mRealised != null) {
    grossPnL = round2(dashboard.m2mRealised);
  }

  return {
    grossPnL,
    netPnL,
    totalCharges,
    walletDayChange: dashboard.portfolio.walletDayChange,
    kiteM2mRealised: dashboard.portfolio.kiteM2mRealised,
    openCount: open.length,
    closedCount: closed.length,
    positionCount: all.length,
  };
}

/** Capital before any trades in this session (balance minus all position net P&L). */
export function computeStartingCapital(dashboard: DashboardData): number {
  const totals = computeAllPositionsTotals(dashboard);
  return round2(dashboard.balance - totals.netPnL);
}

/** Express an amount as % of capital (e.g. net P&L or charges vs starting capital). */
export function pctOfCapital(amount: number, capital: number): number {
  if (!Number.isFinite(capital) || capital <= 0) {
    return 0;
  }
  return Math.round((amount / capital) * 10000) / 100;
}
