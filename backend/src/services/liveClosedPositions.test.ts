import type { Order, Trade } from "kiteconnect";
import type { Position as KitePosition } from "kiteconnect";
import {
  applyKiteRealisedGross,
  buildClosedPositionsFromKiteDayBook,
  buildClosedPositionsFromTrades,
  buildSellExecutionClusterMap,
} from "./liveClosedPositions.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function kiteOrder(partial: Partial<Order> & Pick<Order, "order_id" | "transaction_type">): Order {
  return {
    order_id: partial.order_id,
    parent_order_id: partial.parent_order_id ?? null,
    exchange_order_id: partial.exchange_order_id ?? "1",
    placed_by: "user",
    variety: "regular",
    status: partial.status ?? "COMPLETE",
    tradingsymbol: partial.tradingsymbol ?? "NIFTY2560524600CE",
    exchange: partial.exchange ?? "NFO",
    instrument_token: 1,
    transaction_type: partial.transaction_type,
    order_type: "MARKET",
    product: partial.product ?? "NRML",
    validity: "DAY",
    price: 0,
    quantity: partial.quantity ?? 65,
    trigger_price: 0,
    average_price: partial.average_price ?? 100,
    pending_quantity: 0,
    filled_quantity: partial.filled_quantity ?? partial.quantity ?? 65,
    disclosed_quantity: 0,
    order_timestamp: partial.order_timestamp ?? new Date("2026-05-23T06:00:00.000Z"),
    exchange_timestamp: partial.exchange_timestamp ?? new Date("2026-05-23T06:00:00.000Z"),
    exchange_update_timestamp: null,
    status_message: null,
    status_message_raw: null,
    cancelled_quantity: 0,
    meta: partial.meta ?? {},
    tag: null,
    guid: partial.guid ?? "guid-1",
    market_protection: 0,
  };
}

function trade(partial: Partial<Trade> & Pick<Trade, "transaction_type">): Trade {
  return {
    trade_id: partial.trade_id ?? "1",
    order_id: partial.order_id ?? "order-1",
    exchange_order_id: null,
    tradingsymbol: partial.tradingsymbol ?? "NIFTY2560524600CE",
    exchange: partial.exchange ?? "NFO",
    instrument_token: 1,
    transaction_type: partial.transaction_type,
    product: partial.product ?? "NRML",
    average_price: partial.average_price ?? 100,
    filled: partial.filled ?? partial.quantity ?? 65,
    quantity: partial.quantity ?? 65,
    fill_timestamp: partial.fill_timestamp ?? new Date("2026-05-23T04:30:00.000Z"),
    order_timestamp: partial.order_timestamp ?? new Date("2026-05-23T04:30:00.000Z"),
    exchange_timestamp: partial.exchange_timestamp ?? new Date("2026-05-23T04:30:00.000Z"),
  };
}

const symbol = "NIFTY2560524600CE";

const roundTrip = buildClosedPositionsFromTrades([
  trade({
    trade_id: "buy-1",
    order_id: "buy-order-1",
    transaction_type: "BUY",
    average_price: 100,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T04:30:00.000Z"),
  }),
  trade({
    trade_id: "sell-1",
    order_id: "sell-order-1",
    transaction_type: "SELL",
    average_price: 110,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T05:00:00.000Z"),
  }),
]);

assert(roundTrip.length === 1, "Expected one closed leg for full round trip");
assert(roundTrip[0].buyPrice === 100, "Buy price should match first fill");
assert(roundTrip[0].exitPrice === 110, "Exit price should match sell fill");
assert(roundTrip[0].quantity === 65, "Quantity should match lot");

const partial = buildClosedPositionsFromTrades([
  trade({
    trade_id: "buy-2",
    order_id: "buy-order-2",
    transaction_type: "BUY",
    average_price: 90,
    quantity: 130,
    fill_timestamp: new Date("2026-05-23T04:00:00.000Z"),
  }),
  trade({
    trade_id: "sell-2",
    order_id: "sell-order-2",
    transaction_type: "SELL",
    average_price: 95,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T04:15:00.000Z"),
  }),
]);

assert(partial.length === 1, "Expected one partial close");
assert(partial[0].quantity === 65, "Partial close quantity should be 65");

const multiBuyOneSell = buildClosedPositionsFromTrades([
  trade({
    trade_id: "buy-a",
    order_id: "buy-a",
    transaction_type: "BUY",
    average_price: 100,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T03:00:00.000Z"),
  }),
  trade({
    trade_id: "buy-b",
    order_id: "buy-b",
    transaction_type: "BUY",
    average_price: 102,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T03:30:00.000Z"),
  }),
  trade({
    trade_id: "sell-all",
    order_id: "sell-order-7lots",
    transaction_type: "SELL",
    average_price: 110,
    quantity: 130,
    fill_timestamp: new Date("2026-05-23T05:00:00.000Z"),
  }),
]);

assert(multiBuyOneSell.length === 1, "One sell order should produce one closed row");
assert(multiBuyOneSell[0].quantity === 130, "Closed qty should match sell order");
assert(multiBuyOneSell[0].buyPrice === 101, "Buy price should be qty-weighted across FIFO matches");

/** Same Zerodha sell order, multiple partial fills (e.g. 65+65+65+130+130 = 455). */
const partialFillsOneOrder = buildClosedPositionsFromTrades([
  trade({
    trade_id: "buy-x",
    order_id: "buy-x",
    transaction_type: "BUY",
    average_price: 100,
    quantity: 500,
    fill_timestamp: new Date("2026-05-23T02:00:00.000Z"),
  }),
  trade({
    trade_id: "fill-1",
    order_id: "exit-455",
    transaction_type: "SELL",
    average_price: 110,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T06:00:00.000Z"),
  }),
  trade({
    trade_id: "fill-2",
    order_id: "exit-455",
    transaction_type: "SELL",
    average_price: 110,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T06:00:01.000Z"),
  }),
  trade({
    trade_id: "fill-3",
    order_id: "exit-455",
    transaction_type: "SELL",
    average_price: 110,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T06:00:02.000Z"),
  }),
  trade({
    trade_id: "fill-4",
    order_id: "exit-455",
    transaction_type: "SELL",
    average_price: 111,
    quantity: 130,
    fill_timestamp: new Date("2026-05-23T06:00:03.000Z"),
  }),
  trade({
    trade_id: "fill-5",
    order_id: "exit-455",
    transaction_type: "SELL",
    average_price: 112,
    quantity: 130,
    fill_timestamp: new Date("2026-05-23T06:00:04.000Z"),
  }),
]);

assert(partialFillsOneOrder.length === 1, "Five partial fills on one order_id → one closed row");
assert(partialFillsOneOrder[0].quantity === 455, "Total qty should be sum of partial fills");
assert(partialFillsOneOrder[0].exitOrderId === "exit-455", "Should retain Kite order id");
assert(partialFillsOneOrder[0].exitBrokerageOrders === 1, "One order_id → one exit brokerage");

/** Autoslice: multiple order_ids registered at the same instant → one closed row, multi exit brokerage. */
const autosliceOrders = [
  kiteOrder({
    order_id: "slice-1",
    transaction_type: "SELL",
    quantity: 65,
    filled_quantity: 65,
    order_timestamp: new Date("2026-05-23T06:00:00.000Z"),
  }),
  kiteOrder({
    order_id: "slice-2",
    transaction_type: "SELL",
    quantity: 65,
    filled_quantity: 65,
    order_timestamp: new Date("2026-05-23T06:00:00.000Z"),
  }),
  kiteOrder({
    order_id: "slice-3",
    transaction_type: "SELL",
    quantity: 65,
    filled_quantity: 65,
    order_timestamp: new Date("2026-05-23T06:00:00.000Z"),
  }),
];
const autosliceCluster = buildSellExecutionClusterMap(autosliceOrders);
assert(
  autosliceCluster.get("slice-1") === autosliceCluster.get("slice-2"),
  "Same-timestamp sells should share execution cluster",
);

const autosliceClose = buildClosedPositionsFromTrades(
  [
    trade({
      trade_id: "buy-z",
      order_id: "buy-z",
      transaction_type: "BUY",
      average_price: 100,
      quantity: 500,
      fill_timestamp: new Date("2026-05-23T02:00:00.000Z"),
    }),
    trade({
      trade_id: "f1",
      order_id: "slice-1",
      transaction_type: "SELL",
      average_price: 110,
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T06:00:00.000Z"),
    }),
    trade({
      trade_id: "f2",
      order_id: "slice-2",
      transaction_type: "SELL",
      average_price: 110,
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T06:00:08.000Z"),
    }),
    trade({
      trade_id: "f3",
      order_id: "slice-3",
      transaction_type: "SELL",
      average_price: 110,
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T06:00:12.000Z"),
    }),
  ],
  [],
  [
    ...autosliceOrders,
    kiteOrder({
      order_id: "slice-2",
      transaction_type: "SELL",
      quantity: 65,
      filled_quantity: 65,
      order_timestamp: new Date("2026-05-23T06:00:08.000Z"),
    }),
    kiteOrder({
      order_id: "slice-3",
      transaction_type: "SELL",
      quantity: 65,
      filled_quantity: 65,
      order_timestamp: new Date("2026-05-23T06:00:12.000Z"),
    }),
  ],
);

assert(autosliceClose.length === 1, "Autoslice batch → one closed row");
assert(autosliceClose[0].quantity === 195, "Autoslice qty should sum all slices");
assert(autosliceClose[0].exitBrokerageOrders === 3, "Three slice orders → three exit brokerages");

const twoSellOrders = buildClosedPositionsFromTrades([
  trade({
    trade_id: "buy-y",
    order_id: "buy-y",
    transaction_type: "BUY",
    average_price: 100,
    quantity: 200,
    fill_timestamp: new Date("2026-05-23T01:00:00.000Z"),
  }),
  trade({
    trade_id: "sell-a",
    order_id: "order-a",
    transaction_type: "SELL",
    average_price: 105,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T07:00:00.000Z"),
  }),
  trade({
    trade_id: "sell-b",
    order_id: "order-b",
    transaction_type: "SELL",
    average_price: 106,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T08:00:00.000Z"),
  }),
]);

assert(twoSellOrders.length === 2, "Two distinct sell orders → two closed rows");
assert(
  new Date(twoSellOrders[0].closedAt).getTime() >= new Date(twoSellOrders[1].closedAt).getTime(),
  "Closed positions should be sorted newest first",
);

const carryClose = buildClosedPositionsFromTrades(
  [
    trade({
      trade_id: "sell-carry",
      order_id: "carry-order",
      transaction_type: "SELL",
      average_price: 105,
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T06:00:00.000Z"),
    }),
  ],
  [
    {
      tradingsymbol: symbol,
      exchange: "NFO",
      product: "NRML",
      quantity: 0,
      buy_price: 88,
      day_buy_quantity: 0,
      day_buy_price: 0,
      day_sell_quantity: 65,
      day_sell_price: 105,
      sell_price: 105,
      average_price: 88,
    } as never,
  ],
);

assert(carryClose.length === 1, "Expected carry exit closed leg");
assert(carryClose[0].buyPrice === 88, "Carry exit should use day-book entry price");

const realisedDay = [
  {
    tradingsymbol: symbol,
    exchange: "NFO",
    product: "NRML",
    quantity: 0,
    realised: 1105,
    day_sell_quantity: 65,
  } as never,
];
applyKiteRealisedGross(carryClose, realisedDay);
assert(carryClose[0].kiteGrossPnL === 1105, "Closed gross should match Kite day realised");

function dayRow(partial: Partial<KitePosition> & Pick<KitePosition, "tradingsymbol">): KitePosition {
  return {
    tradingsymbol: partial.tradingsymbol,
    exchange: partial.exchange ?? "NFO",
    instrument_token: 1,
    product: partial.product ?? "NRML",
    quantity: partial.quantity ?? 0,
    overnight_quantity: 0,
    multiplier: partial.multiplier ?? 65,
    average_price: partial.average_price ?? 100,
    close_price: 0,
    last_price: partial.last_price ?? 110,
    value: 0,
    pnl: partial.pnl ?? 0,
    realised: partial.realised ?? 0,
    m2m: 0,
    unrealised: 0,
    buy_quantity: partial.buy_quantity ?? 0,
    buy_price: partial.buy_price ?? 0,
    buy_value: 0,
    buy_m2m: 0,
    day_buy_quantity: partial.day_buy_quantity ?? 0,
    day_buy_price: partial.day_buy_price ?? 0,
    day_buy_value: 0,
    sell_quantity: partial.sell_quantity ?? 0,
    sell_price: partial.sell_price ?? 0,
    sell_value: 0,
    sell_m2m: 0,
    day_sell_quantity: partial.day_sell_quantity ?? 0,
    day_sell_price: partial.day_sell_price ?? 0,
    day_sell_value: 0,
  };
}

/** Two round trips same strike → one Kite-style row with cumulative realised. */
const reentryTrades = buildClosedPositionsFromTrades([
  trade({
    trade_id: "b1",
    order_id: "buy-1",
    transaction_type: "BUY",
    average_price: 100,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T03:00:00.000Z"),
  }),
  trade({
    trade_id: "s1",
    order_id: "sell-1",
    transaction_type: "SELL",
    average_price: 110,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T04:00:00.000Z"),
  }),
  trade({
    trade_id: "b2",
    order_id: "buy-2",
    transaction_type: "BUY",
    average_price: 105,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T05:00:00.000Z"),
  }),
  trade({
    trade_id: "s2",
    order_id: "sell-2",
    transaction_type: "SELL",
    average_price: 115,
    quantity: 65,
    fill_timestamp: new Date("2026-05-23T06:00:00.000Z"),
  }),
]);
assert(reentryTrades.length === 2, "Trade-based builder still splits per exit");

const kiteStyle = buildClosedPositionsFromKiteDayBook(
  [
    dayRow({
      tradingsymbol: symbol,
      realised: 0,
      pnl: 1105,
      day_buy_quantity: 130,
      day_buy_price: 102.5,
      day_sell_quantity: 130,
      day_sell_price: 112.5,
    }),
  ],
  [dayRow({ tradingsymbol: symbol, quantity: 0 })],
  [
    trade({
      trade_id: "b1",
      order_id: "buy-1",
      transaction_type: "BUY",
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T03:00:00.000Z"),
    }),
    trade({
      trade_id: "s1",
      order_id: "sell-1",
      transaction_type: "SELL",
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T04:00:00.000Z"),
    }),
    trade({
      trade_id: "b2",
      order_id: "buy-2",
      transaction_type: "BUY",
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T05:00:00.000Z"),
    }),
    trade({
      trade_id: "s2",
      order_id: "sell-2",
      transaction_type: "SELL",
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T06:00:00.000Z"),
    }),
  ],
);
assert(kiteStyle.length === 1, "Kite day book → one row per flat contract");
assert(kiteStyle[0].kiteGrossPnL === 1105, "Gross should be Kite day realised total");
assert(kiteStyle[0].entryBrokerageOrders === 2, "Two buy orders on same contract");
assert(kiteStyle[0].exitBrokerageOrders === 2, "Two sell orders on same contract");
assert(kiteStyle[0].id === `${symbol}:NRML`, "Stable id per contract (re-entry does not spawn new row)");

/** Short writer: sell to open, buy to cover — one Kite day row. */
const shortDay = buildClosedPositionsFromKiteDayBook(
  [
    dayRow({
      tradingsymbol: symbol,
      pnl: 650,
      day_sell_quantity: 65,
      day_sell_price: 120,
      day_buy_quantity: 65,
      day_buy_price: 110,
      day_sell_value: 7800,
      day_buy_value: 7150,
    }),
  ],
  [dayRow({ tradingsymbol: symbol, quantity: 0 })],
  [
    trade({
      trade_id: "short-open",
      order_id: "sell-open",
      transaction_type: "SELL",
      average_price: 120,
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T04:00:00.000Z"),
    }),
    trade({
      trade_id: "short-cover",
      order_id: "buy-cover",
      transaction_type: "BUY",
      average_price: 110,
      quantity: 65,
      fill_timestamp: new Date("2026-05-23T05:00:00.000Z"),
    }),
  ],
);
assert(shortDay.length === 1, "Short round trip → one closed row");
assert(shortDay[0].side === "short", "Should infer short from first SELL fill");
assert(shortDay[0].buyPrice === 120, "Entry should be sell-to-open price");
assert(shortDay[0].exitPrice === 110, "Exit should be buy-to-cover price");
assert(shortDay[0].kiteGrossPnL === 650, "Gross should match Kite pnl");
assert(shortDay[0].entryBrokerageOrders === 1, "One sell order at entry");
assert(shortDay[0].exitBrokerageOrders === 1, "One buy order at cover");

console.log("liveClosedPositions.test.ts: all assertions passed");
