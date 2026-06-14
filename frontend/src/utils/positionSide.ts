export function closedPriceLabels(side: "long" | "short"): {
  entry: string;
  exit: string;
} {
  return side === "short"
    ? { entry: "Sell Price", exit: "Cover Price" }
    : { entry: "Buy Price", exit: "Exit Price" };
}

export function openEntryLabel(side: "long" | "short"): string {
  return side === "short" ? "Avg (Short)" : "Buy Price";
}

export function sideBadge(side: "long" | "short"): string | undefined {
  return side === "short" ? "Short" : undefined;
}

export function exitSideForPosition(side: "long" | "short"): "BUY" | "SELL" {
  return side === "short" ? "BUY" : "SELL";
}

export function addSideForPosition(side: "long" | "short"): "BUY" | "SELL" {
  return side === "short" ? "SELL" : "BUY";
}

export function openStopTargetLabels(side: "long" | "short"): {
  stopLoss: string;
  target: string;
} {
  return side === "short"
    ? { stopLoss: "Cover SL", target: "Cover target" }
    : { stopLoss: "Stop Loss", target: "Target" };
}

/** True when the order pad side closes an open leg (buy cover for short, sell for long). */
export function isExitingOpenLeg(
  positionSide: "long" | "short" | undefined,
  orderSide: "BUY" | "SELL",
  hasHeldLots: boolean,
): boolean {
  if (!hasHeldLots) {
    return false;
  }
  return positionSide === "short" ? orderSide === "BUY" : orderSide === "SELL";
}
