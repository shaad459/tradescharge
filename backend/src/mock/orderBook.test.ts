import assert from "node:assert/strict";
import {
  cancelOpenOrder,
  clearOrderBook,
  getOpenOrders,
  getExecutedOrders,
  getOrderHistory,
  placeDemoOrder,
  processPendingOrders,
} from "./orderBook.js";
import {
  getMockPositions,
  mergeOrAddMockPosition,
  setMockPositionLtp,
} from "./positionStore.js";

async function runTests() {
  clearOrderBook();

  const expiry = "2099-12-31";
  mergeOrAddMockPosition("NIFTY", "PE", 99999, expiry, "long", 100, 65, 65);
  const pos = getMockPositions().find(
    (p) => p.symbol === "NIFTY" && p.strike === 99999 && p.expiry === expiry,
  )!;
  setMockPositionLtp(pos.id, 105);

  const slBody = {
    symbol: "NIFTY",
    tradingsymbol: "NIFTY99123199999PE",
    instrumentType: "PE" as const,
    strike: 99999,
    expiry,
    orderType: "SL" as const,
    side: "SELL" as const,
    lots: 1,
    lotSize: 65,
    ltp: 105,
    price: 100,
    triggerPrice: 100,
    product: "NRML" as const,
    validity: "DAY" as const,
  };

  const slResult = placeDemoOrder(slBody, 65, 65, 1, 105);
  assert(slResult.queued, "SL above LTP should queue");
  assert(getMockPositions().some((p) => p.id === pos.id), "SL above LTP should keep position open");
  assert(getOpenOrders().length === 1, "Pending SL should be registered");

  assert((await processPendingOrders()).executedCount === 0, "Should not trigger while LTP is above trigger");
  assert(getMockPositions().some((p) => p.id === pos.id), "Position should remain after tick above trigger");

  setMockPositionLtp(pos.id, 99);
  assert((await processPendingOrders()).executedCount === 1, "Should trigger when LTP falls to trigger");
  assert(!getMockPositions().some((p) => p.id === pos.id), "Position should close after SL triggers");
  assert(getOpenOrders().length === 0, "Pending order should clear after execution");
  assert(getOrderHistory()[0]?.status === "EXECUTED", "Executed SL should appear in history");

  clearOrderBook();
  mergeOrAddMockPosition("NIFTY", "CE", 88888, expiry, "long", 50, 65, 65);

  const limitBuyBody = {
    symbol: "NIFTY",
    tradingsymbol: "NIFTY9912388888CE",
    instrumentType: "CE" as const,
    strike: 88888,
    expiry,
    orderType: "LIMIT" as const,
    side: "BUY" as const,
    lots: 1,
    lotSize: 65,
    ltp: 60,
    price: 55,
    product: "NRML" as const,
    validity: "DAY" as const,
  };

  const buyResult = placeDemoOrder(limitBuyBody, 65, 65, 1, 60);
  assert(buyResult.queued, "Limit buy above market should queue");
  assert(getOpenOrders().length === 1, "Limit buy should appear in open orders");

  const cancelled = cancelOpenOrder(buyResult.order.id);
  assert(cancelled?.status === "CANCELLED", "Cancel should mark order cancelled");
  assert(getOpenOrders().length === 0, "Cancelled order should leave open book");
  assert(getOrderHistory()[0]?.status === "CANCELLED", "Cancelled order should stay in history");
  assert(getExecutedOrders().length === 0, "Cancelled order should not appear in executed list");

  console.log("orderBook.test.ts: all assertions passed");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
