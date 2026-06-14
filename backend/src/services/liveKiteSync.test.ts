import type { Order as KiteOrder } from "kiteconnect";
import { partitionKiteOrders } from "./liveKiteSync.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const symbol = "NIFTY2560524600CE";
const ltpMap = new Map([[symbol, 120]]);

function kiteOrder(partial: Partial<KiteOrder> & Pick<KiteOrder, "status">): KiteOrder {
  return {
    order_id: partial.order_id ?? "1",
    parent_order_id: null,
    exchange_order_id: "1",
    placed_by: "user",
    variety: partial.variety ?? "regular",
    status: partial.status,
    tradingsymbol: partial.tradingsymbol ?? symbol,
    exchange: partial.exchange ?? "NFO",
    instrument_token: 1,
    transaction_type: partial.transaction_type ?? "BUY",
    order_type: partial.order_type ?? "LIMIT",
    product: partial.product ?? "NRML",
    validity: "DAY",
    price: partial.price ?? 100,
    quantity: partial.quantity ?? 65,
    trigger_price: partial.trigger_price ?? 0,
    average_price: partial.average_price ?? 0,
    pending_quantity: partial.pending_quantity ?? 65,
    filled_quantity: partial.filled_quantity ?? 0,
    disclosed_quantity: 0,
    order_timestamp: partial.order_timestamp ?? new Date("2026-05-23T04:00:00.000Z"),
    exchange_timestamp: null,
    exchange_update_timestamp: null,
    status_message: null,
    status_message_raw: null,
    cancelled_quantity: 0,
    meta: {},
    tag: null,
  };
}

const { openOrders, orderHistory } = partitionKiteOrders(
  [
    kiteOrder({ order_id: "open-1", status: "OPEN", pending_quantity: 65 }),
    kiteOrder({
      order_id: "done-1",
      status: "COMPLETE",
      pending_quantity: 0,
      filled_quantity: 65,
      average_price: 98.5,
    }),
    kiteOrder({ order_id: "cancel-1", status: "CANCELLED", pending_quantity: 0 }),
  ],
  ltpMap,
);

assert(openOrders.length === 1, "Expected one pending Kite order");
assert(openOrders[0].id === "open-1", "Pending order id should match Kite");
assert(orderHistory.length === 2, "Expected executed + cancelled in order history");
assert(orderHistory[0].fillPrice === 98.5, "Fill price should come from Kite average_price");
assert(
  orderHistory.some((order) => order.status === "CANCELLED"),
  "Cancelled orders should appear in executed history",
);

console.log("liveKiteSync.test.ts: all assertions passed");
