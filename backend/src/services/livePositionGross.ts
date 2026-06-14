import type { Position } from "../types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** MTM gross from mark price — demo mode or when Kite gross is unavailable. */
export function grossPnLFromMark(
  position: Pick<Position, "side" | "buyPrice" | "quantity" | "ltp">,
): number {
  if (position.side === "long") {
    return round2((position.ltp - position.buyPrice) * position.quantity);
  }
  return round2((position.buyPrice - position.ltp) * position.quantity);
}

/**
 * Update LTP while keeping Kite's cost basis.
 * When kiteGrossPnL is set (from Kite `pnl`), adjust by (ΔLTP × qty) instead of
 * recomputing from buy_price — matches Kite when average ≠ buy_price (e.g. added lots).
 */
export function applyLtpToPosition(position: Position, ltp: number): Position {
  if (ltp === position.ltp) {
    return position;
  }

  const next = { ...position, ltp };

  if (position.kiteGrossPnL != null && Number.isFinite(position.kiteGrossPnL)) {
    const deltaLtp = ltp - position.ltp;
    const grossDelta = position.side === "long" ? deltaLtp * position.quantity : -deltaLtp * position.quantity;
    next.kiteGrossPnL = round2(position.kiteGrossPnL + grossDelta);
    return next;
  }

  next.kiteGrossPnL = grossPnLFromMark(next);
  return next;
}

/** @deprecated Use applyLtpToPosition — kept as alias for call sites. */
export function applyMarkToPosition(position: Position, ltp: number): Position {
  return applyLtpToPosition(position, ltp);
}
