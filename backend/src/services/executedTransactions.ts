import type { Order as KiteOrder } from "kiteconnect";
import type { ExecutedTransaction } from "../types.js";
import { formatInstrumentLabel, isFoExchange, parseTradingsymbol } from "./instrumentSymbol.js";
import { getLotSize } from "../constants.js";
import { positionBookKey } from "./liveClosedPositions.js";

function toIso(value: Date | string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Kite Orders → Executed tab: one row per order (455/455), not per trade-book fill. */
function mapExecutedOrder(order: KiteOrder): ExecutedTransaction {
  const parsed = parseTradingsymbol(order.tradingsymbol);
  const lotSize = getLotSize(parsed.symbol);
  const quantity = order.quantity > 0 ? order.quantity : order.filled_quantity;
  const filledQuantity = order.filled_quantity ?? 0;
  const isCancelled = order.status === "CANCELLED";

  return {
    id: `order-${order.order_id}`,
    type: "order",
    side: order.transaction_type === "SELL" ? "SELL" : "BUY",
    tradingsymbol: order.tradingsymbol,
    instrumentLabel: formatInstrumentLabel(parsed),
    symbol: parsed.symbol,
    instrumentType: parsed.instrumentType,
    strike: parsed.strike,
    expiry: parsed.expiry,
    exchange: order.exchange === "BFO" ? "BFO" : "NFO",
    product: order.product === "MIS" ? "MIS" : "NRML",
    status: isCancelled ? "CANCELLED" : "COMPLETE",
    quantity,
    filledQuantity,
    price: isCancelled
      ? order.price > 0
        ? order.price
        : order.average_price
      : order.average_price > 0
        ? order.average_price
        : order.price,
    orderId: String(order.order_id),
    orderType: order.order_type,
    timestamp: toIso(
      order.exchange_update_timestamp ?? order.exchange_timestamp ?? order.order_timestamp,
    ),
    lotSize,
    lots: lotSize > 0 ? Math.max(1, Math.round(quantity / lotSize)) : 1,
    bookKey: positionBookKey(order.tradingsymbol, order.exchange, order.product),
  };
}

/**
 * Matches Kite app Orders → Executed: completed + cancelled orders (not individual fills).
 */
export function buildExecutedTransactions(orders: KiteOrder[]): ExecutedTransaction[] {
  const rows: ExecutedTransaction[] = [];

  for (const order of orders) {
    if (!isFoExchange(order.exchange)) {
      continue;
    }
    if (order.status === "COMPLETE" && (order.filled_quantity ?? 0) > 0) {
      rows.push(mapExecutedOrder(order));
    } else if (order.status === "CANCELLED") {
      rows.push(mapExecutedOrder(order));
    }
  }

  return rows.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
