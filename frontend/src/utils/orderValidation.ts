import type { PlaceOrderRequest } from "../types";

export interface OrderValidationContext {
  quantity: number;
  heldQuantity?: number;
  availableMargin?: number;
  isLive: boolean;
  isAuthenticated: boolean;
  now?: Date;
}

export interface OrderValidationResult {
  valid: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"lots" | "price" | "triggerPrice" | "disclosedQuantity", string>>;
}

const TICK_SIZE = 0.05;
const MAX_ORDER_VALUE_INR = 10_00_00_000;

function toIstMinutes(date: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return { day: dayMap[weekday] ?? date.getDay(), minutes: hour * 60 + minute };
}

function isTickMultiple(value: number): boolean {
  return Math.abs(value / TICK_SIZE - Math.round(value / TICK_SIZE)) < 1e-6;
}

function resolveOrderPrice(body: PlaceOrderRequest): number {
  if (body.orderType === "LIMIT" || body.orderType === "SL") {
    return Number(body.price) || 0;
  }
  if (body.orderType === "SL-M") {
    return Number(body.triggerPrice) || 0;
  }
  return Number(body.ltp) || 0;
}

function validateMarketTiming(amo: boolean, now: Date, isLive: boolean): string | null {
  if (!isLive) {
    return null;
  }

  const { day, minutes } = toIstMinutes(now);
  if (day === 0 || day === 6) {
    return amo
      ? null
      : "Markets are closed. You can place an AMO for the next trading session.";
  }

  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;
  const foAmoBlockStart = 9 * 60 + 10;
  const foAmoBlockEnd = 15 * 60 + 45;

  if (amo) {
    if (minutes >= foAmoBlockStart && minutes < foAmoBlockEnd) {
      return "AMO orders cannot be placed between 9:10 AM and 3:45 PM for F&O.";
    }
    return null;
  }

  if (minutes < marketOpen || minutes >= marketClose) {
    return "Markets are closed. You can place an AMO for the next trading session.";
  }

  return null;
}

export function validateOrder(
  body: PlaceOrderRequest,
  ctx: OrderValidationContext,
): OrderValidationResult {
  const fieldErrors: OrderValidationResult["fieldErrors"] = {};
  const lots = Number(body.lots);
  const quantity = ctx.quantity;
  const exchange = body.exchange ?? "NFO";
  const amo = Boolean(body.amo);
  const now = ctx.now ?? new Date();

  if (ctx.isLive && !ctx.isAuthenticated) {
    return { valid: false, error: "Please login to Kite to place live orders." };
  }

  if (!body.tradingsymbol?.trim()) {
    return { valid: false, error: "Tradingsymbol is required." };
  }

  if (!Number.isFinite(lots) || lots <= 0) {
    fieldErrors.lots = "Quantity is required";
  } else if (!Number.isInteger(lots)) {
    fieldErrors.lots = "Quantity must be a whole number of lots.";
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    fieldErrors.lots = fieldErrors.lots ?? "Enter a valid quantity.";
  } else if (!fieldErrors.lots && body.lotSize > 0 && quantity % body.lotSize !== 0) {
    fieldErrors.lots = `Quantity should be in multiples of ${body.lotSize}.`;
  }

  if (body.disclosedQuantity != null && body.disclosedQuantity > 0) {
    return { valid: false, error: "Disclosed quantity is not allowed for F&O orders." };
  }

  const orderType = body.orderType;

  if (orderType === "SL-M") {
    if (exchange === "BFO") {
      return { valid: false, error: "Stoploss Market (SL-M) orders are blocked on BSE." };
    }
  }

  const price = body.price != null ? Number(body.price) : undefined;
  const triggerPrice = body.triggerPrice != null ? Number(body.triggerPrice) : undefined;

  if (body.orderType === "LIMIT" || body.orderType === "SL") {
    if (price == null || !Number.isFinite(price) || price <= 0) {
      fieldErrors.price = "Enter a valid price.";
    } else if (!isTickMultiple(price)) {
      fieldErrors.price = "Price should be in multiples of 0.05.";
    }
  }

  if (orderType === "SL" || orderType === "SL-M") {
    if (triggerPrice == null || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
      fieldErrors.triggerPrice = "Enter a valid trigger price.";
    } else if (!isTickMultiple(triggerPrice)) {
      fieldErrors.triggerPrice = "Trigger price should be in multiples of 0.05.";
    }
  }

  if (orderType === "SL" && price != null && triggerPrice != null) {
    if (body.side === "BUY" && triggerPrice > price) {
      fieldErrors.triggerPrice = "Trigger price can't be higher than price.";
    }
    if (body.side === "SELL" && triggerPrice < price) {
      fieldErrors.triggerPrice = "Trigger price can't be lesser than price.";
    }

    const slGap = Math.abs(price - triggerPrice);
    const maxSlGap = Math.max(30, triggerPrice * 0.6);
    if (slGap > maxSlGap) {
      return {
        valid: false,
        error:
          "The difference between the limit price and trigger price for SL orders is over the exchange permissible range.",
      };
    }
  }

  if (amo && body.orderType === "MARKET") {
    return {
      valid: false,
      error:
        "Market orders using AMO are not allowed for index options. Try placing a LIMIT order.",
    };
  }

  const timingError = validateMarketTiming(amo, now, ctx.isLive);
  if (timingError) {
    return { valid: false, error: timingError };
  }

  if (body.side === "SELL") {
    const held = ctx.heldQuantity ?? 0;
    if (held <= 0) {
      return { valid: false, error: "You don't have sufficient holdings to place a sell order." };
    }
    if (quantity > held) {
      const maxLots = Math.floor(held / body.lotSize);
      fieldErrors.lots = `You can sell maximum ${maxLots} lot${maxLots === 1 ? "" : "s"}.`;
    }
  }

  const orderPrice = resolveOrderPrice(body);
  if (orderPrice > 0 && quantity > 0) {
    const orderValue = orderPrice * quantity;
    if (orderValue > MAX_ORDER_VALUE_INR) {
      return { valid: false, error: "The maximum value allowed per order is ₹10 Crores." };
    }

    if (
      ctx.availableMargin != null &&
      body.side === "BUY" &&
      orderValue > ctx.availableMargin
    ) {
      return { valid: false, error: "Insufficient funds. Required margin is not available." };
    }
  }

  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    const firstError = Object.values(fieldErrors).find(Boolean);
    return { valid: false, error: firstError, fieldErrors };
  }

  return { valid: true };
}
