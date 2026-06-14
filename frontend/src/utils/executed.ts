import type { ExecutedTransaction } from "../types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Older API builds returned one row per trade-book fill (type "trade", status "FILLED").
 * Collapse to one row per Kite order_id so the UI matches Kite Orders → Executed.
 */
export function normalizeExecutedForDisplay(rows: ExecutedTransaction[]): ExecutedTransaction[] {
  if (rows.length === 0) {
    return rows;
  }

  const looksLikeFills =
    rows.some((row) => row.type === "trade" || row.status === "FILLED" || row.orderType === "FILL");
  if (!looksLikeFills) {
    return rows;
  }

  const cancelled = rows.filter((row) => row.status === "CANCELLED");
  const fills = rows.filter((row) => row.status !== "CANCELLED");

  const byOrder = new Map<
    string,
    ExecutedTransaction & { turnover: number; quantityHint: number }
  >();

  for (const row of fills) {
    const key = `${row.orderId}|${row.side}|${row.bookKey}`;
    const qty = row.filledQuantity > 0 ? row.filledQuantity : row.quantity;
    const existing = byOrder.get(key);
    if (!existing) {
      byOrder.set(key, {
        ...row,
        id: `order-${row.orderId}`,
        type: "order",
        status: "COMPLETE",
        orderType: row.orderType === "FILL" ? "MARKET" : row.orderType,
        quantity: Math.max(row.quantity, qty),
        filledQuantity: qty,
        turnover: row.price * qty,
        quantityHint: qty,
      });
      continue;
    }

    existing.turnover += row.price * qty;
    existing.filledQuantity += qty;
    existing.quantity = Math.max(existing.quantity, row.quantity, existing.filledQuantity);
    existing.quantityHint = existing.filledQuantity;
    existing.lots =
      existing.lotSize > 0
        ? Math.max(1, Math.round(existing.filledQuantity / existing.lotSize))
        : existing.lots;
    if (new Date(row.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
      existing.timestamp = row.timestamp;
    }
  }

  const merged = [...byOrder.values()].map(({ turnover, quantityHint, ...row }) => ({
    ...row,
    price: quantityHint > 0 ? round2(turnover / quantityHint) : row.price,
  }));

  return [...merged, ...cancelled].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
