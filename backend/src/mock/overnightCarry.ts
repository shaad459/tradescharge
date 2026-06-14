import type { OvernightCarry, Position } from "../types.js";
import { istDateKey } from "../utils/istDate.js";

export function getOvernightCarryItems(positions: Position[]): OvernightCarry[] {
  const today = istDateKey();

  return positions
    .filter(
      (position) =>
        position.side === "long" &&
        (position.product ?? "NRML") === "NRML" &&
        position.openedAt != null &&
        istDateKey(position.openedAt) < today,
    )
    .map((position) => ({
      positionId: position.id,
      symbol: position.symbol,
      instrumentType: position.instrumentType,
      strike: position.strike,
      expiry: position.expiry,
      quantity: position.quantity,
      lotSize: position.lotSize,
      lots: Math.max(1, Math.round(position.quantity / position.lotSize)),
      product: position.product ?? "NRML",
      buyPrice: position.buyPrice,
      ltp: position.ltp,
      openedAt: position.openedAt!,
    }));
}
