import type { PlaceOrderRequest } from "../types";

export type OrderType = PlaceOrderRequest["orderType"];

export const OPTION_TICK_SIZE = 0.05;

/** Snap to NSE/BFO option tick (₹0.05). */
export function roundToTick(
  price: number,
  mode: "nearest" | "up" | "down" = "nearest",
): number {
  if (!Number.isFinite(price) || price <= 0) {
    return price;
  }
  const ticks = price / OPTION_TICK_SIZE;
  const roundedTicks =
    mode === "up"
      ? Math.ceil(ticks - 1e-9)
      : mode === "down"
        ? Math.floor(ticks + 1e-9)
        : Math.round(ticks);
  return Math.round(roundedTicks * OPTION_TICK_SIZE * 100) / 100;
}

export function isTickMultiple(value: number): boolean {
  return Math.abs(value / OPTION_TICK_SIZE - Math.round(value / OPTION_TICK_SIZE)) < 1e-6;
}

/** Entry or exit fill price implied by the order type (limit / SL / SL-M). */
export function resolveOrderEntryPrice(
  orderType: OrderType,
  ltp: number,
  priceInput?: string | number,
  triggerInput?: string | number,
): number {
  if (orderType === "LIMIT" || orderType === "SL") {
    const p = Number(priceInput);
    return Number.isFinite(p) && p > 0 ? p : ltp;
  }
  if (orderType === "SL-M") {
    const t = Number(triggerInput);
    return Number.isFinite(t) && t > 0 ? t : ltp;
  }
  return ltp;
}

export function orderEntryLabel(orderType: OrderType): string {
  switch (orderType) {
    case "LIMIT":
      return "limit price";
    case "SL":
      return "SL limit price";
    case "SL-M":
      return "SL trigger";
    default:
      return "LTP";
  }
}

/** Kite sell SL: trigger must be ≤ limit. Snap to valid tick. */
export function suggestedSellSlPrices(exitPrice: number): { trigger: number; limit: number } {
  const rounded = roundToTick(exitPrice, "down");
  return { trigger: rounded, limit: rounded };
}

/** Kite buy SL: trigger must be ≤ limit. */
export function suggestedBuySlPrices(entryPrice: number): { trigger: number; limit: number } {
  const rounded = roundToTick(entryPrice, "up");
  return { trigger: rounded, limit: rounded };
}

export function suggestedLimitPrice(price: number): number {
  return roundToTick(price, "nearest");
}
