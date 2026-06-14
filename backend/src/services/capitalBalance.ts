import type { EnrichedPosition, Position } from "../types.js";

export interface MarginSnapshot {
  net: number;
  available: number;
  openingBalance: number;
  m2mRealised: number;
  m2mUnrealised: number;
  /** Kite equity segment `enabled` — margin / collateral trading active */
  marginEnabled: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Matches Kite equity: opening + booked MTM + open MTM (from positions when streaming ticks). */
export function computeLiveEquity(
  margins: MarginSnapshot,
  openPositions: Pick<Position, "kiteGrossPnL">[],
): number {
  const openGross = openPositions.reduce((sum, position) => sum + (position.kiteGrossPnL ?? 0), 0);
  const unrealised = openPositions.length > 0 ? openGross : margins.m2mUnrealised;
  return round2(margins.openingBalance + margins.m2mRealised + unrealised);
}

/**
 * Capital balance shown in the header.
 * - Margin enabled: Kite `net` / live_balance (includes premium, realised MTM, collateral).
 * - Margin disabled: opening cash + charge-aware net P&L from all legs today.
 */
export function computeCapitalBalance(
  margins: MarginSnapshot,
  openPositions: Pick<Position, "kiteGrossPnL">[],
  enrichedOpen: Pick<EnrichedPosition, "pnl">[],
  portfolioNetPnL = 0,
): number {
  if (margins.marginEnabled) {
    return round2(margins.net);
  }

  if (Number.isFinite(portfolioNetPnL) && portfolioNetPnL !== 0) {
    return round2(margins.openingBalance + portfolioNetPnL);
  }

  const equity = computeLiveEquity(margins, openPositions);
  const exitCharges = enrichedOpen.reduce((sum, position) => sum + position.pnl.charges.exit.total, 0);
  return round2(equity - exitCharges);
}

/** Available margin for order pad / sidebar. */
export function computeAvailableMargin(margins: MarginSnapshot, portfolioNetPnL = 0): number {
  if (margins.marginEnabled) {
    return round2(margins.available);
  }
  if (Number.isFinite(portfolioNetPnL) && portfolioNetPnL !== 0) {
    return round2(margins.openingBalance + portfolioNetPnL);
  }
  return round2(margins.available);
}

export function computeDayChangePct(capitalBalance: number, openingBalance: number): number {
  if (!Number.isFinite(capitalBalance) || !Number.isFinite(openingBalance) || openingBalance <= 0) {
    return 0;
  }
  return round2(((capitalBalance - openingBalance) / openingBalance) * 100);
}

export function marginSnapshotFromParts(
  net: number,
  available: number,
  openingBalance?: number,
  m2mRealised = 0,
  m2mUnrealised = 0,
  marginEnabled = false,
): MarginSnapshot {
  return {
    net,
    available,
    openingBalance: openingBalance ?? net,
    m2mRealised,
    m2mUnrealised,
    marginEnabled,
  };
}

/** Reject balance flicker when portfolio P&L did not move with it (stale margin + bad tick). */
export function isPlausibleBalanceUpdate(
  previousBalance: number,
  nextBalance: number,
  previousNetPnL: number,
  nextNetPnL: number,
): boolean {
  if (!Number.isFinite(nextBalance) || nextBalance <= 0) {
    return false;
  }
  if (!Number.isFinite(previousBalance) || previousBalance <= 0) {
    return true;
  }

  const balanceDelta = nextBalance - previousBalance;
  const pnlDelta = nextNetPnL - previousNetPnL;
  const balanceJump = Math.abs(balanceDelta);
  const pnlJump = Math.abs(pnlDelta);

  if (balanceJump < 500) {
    return true;
  }

  if (balanceJump > 25_000 && pnlJump < balanceJump * 0.25) {
    return false;
  }

  return true;
}
