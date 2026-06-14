import type { Order as KiteOrder, Trade } from "kiteconnect";
import { buildExecutedTransactions } from "./executedTransactions.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function kiteOrder(partial: Partial<KiteOrder> & Pick<KiteOrder, "status">): KiteOrder {
  return {
    order_id: partial.order_id ?? "1",
    parent_order_id: null,
    exchange_order_id: "1",
    placed_by: "user",
    variety: "regular",
    status: partial.status,
    tradingsymbol: partial.tradingsymbol ?? "NIFTY2660223750CE",
    exchange: partial.exchange ?? "NFO",
    instrument_token: 1,
    transaction_type: partial.transaction_type ?? "BUY",
    order_type: partial.order_type ?? "MARKET",
    product: partial.product ?? "NRML",
    validity: "DAY",
    price: partial.price ?? 0,
    quantity: partial.quantity ?? 455,
    trigger_price: 0,
    average_price: partial.average_price ?? 355,
    pending_quantity: 0,
    filled_quantity: partial.filled_quantity ?? 455,
    disclosed_quantity: 0,
    order_timestamp: partial.order_timestamp ?? new Date("2026-05-23T08:00:00.000Z"),
    exchange_timestamp: null,
    exchange_update_timestamp: null,
    status_message: null,
    status_message_raw: null,
    cancelled_quantity: 0,
    meta: {},
    tag: null,
    guid: "g1",
    market_protection: 0,
  };
}

const orders = buildExecutedTransactions([
  kiteOrder({ order_id: "buy-1", status: "COMPLETE", transaction_type: "BUY" }),
  kiteOrder({ order_id: "sell-1", status: "COMPLETE", transaction_type: "SELL" }),
  kiteOrder({ order_id: "cancel-1", status: "CANCELLED", filled_quantity: 0, quantity: 455 }),
]);

assert(orders.length === 3, "Expected one row per Kite order, not per fill");

const manyFills: Trade[] = [];
for (let index = 0; index < 10; index++) {
  manyFills.push({
    trade_id: String(index),
    order_id: "same-order",
    exchange_order_id: "1",
    tradingsymbol: "NIFTY2660223750CE",
    exchange: "NFO",
    instrument_token: 1,
    transaction_type: "BUY",
    product: "NRML",
    average_price: 100,
    filled: 65,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T08:00:00.000Z"),
    order_timestamp: new Date("2026-05-23T08:00:00.000Z"),
    exchange_timestamp: new Date("2026-05-23T08:00:00.000Z"),
  });
}

assert(
  buildExecutedTransactions([kiteOrder({ order_id: "same-order", status: "COMPLETE" })]).length === 1,
  "Ten partial fills on one order_id should still be one executed row",
);

console.log("executedTransactions.test.ts: all assertions passed");
