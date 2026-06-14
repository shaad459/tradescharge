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
