import type { EnrichedClosedPosition, EnrichedPosition } from "../types.js";

export interface PortfolioSummary {
  grossPnL: number;
  netPnL: number;
  totalCharges: number;
  openPositions: number;
  walletDayChange?: number;
  kiteM2mRealised?: number;
}

export function computePortfolioSummary(
  open: EnrichedPosition[],
  closed: EnrichedClosedPosition[] = [],
): PortfolioSummary {
  const all = [...open, ...closed];
  const grossPnL = all.reduce((sum, p) => sum + p.pnl.gross, 0);
  const netPnL = all.reduce((sum, p) => sum + p.pnl.net, 0);
  const totalCharges = all.reduce((sum, p) => sum + p.pnl.charges.total, 0);

  return {
    grossPnL: Math.round(grossPnL * 100) / 100,
    netPnL: Math.round(netPnL * 100) / 100,
    totalCharges: Math.round(totalCharges * 100) / 100,
    openPositions: open.length,
  };
}
