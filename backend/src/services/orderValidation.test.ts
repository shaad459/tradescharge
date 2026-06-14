import type { PlaceOrderRequest } from "../types.js";
import { validateOrder } from "./orderValidation.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function baseOrder(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    symbol: "NIFTY",
    tradingsymbol: "NIFTY2560524500CE",
    instrumentType: "CE",
    strike: 24500,
    expiry: "2026-05-28",
    side: "BUY",
    lots: 1,
    lotSize: 65,
    ltp: 120,
    orderType: "MARKET",
    product: "NRML",
    validity: "DAY",
    exchange: "NFO",
    mode: "demo",
    ...overrides,
  };
}

const ok = validateOrder(baseOrder(), {
  quantity: 65,
  availableMargin: 100000,
  isLive: false,
  isAuthenticated: false,
});
assert(ok.valid, "Valid market buy should pass in demo");

const qtyError = validateOrder(baseOrder({ lots: 1.5 }), {
  quantity: 97.5,
  availableMargin: 100000,
  isLive: false,
  isAuthenticated: false,
});
assert(!qtyError.valid, "Fractional lots should fail");
assert(
  qtyError.fieldErrors?.lots === "Quantity must be a whole number of lots.",
  "Fractional lots message should match Kite-style wording",
);

const tickError = validateOrder(
  baseOrder({ orderType: "LIMIT", price: 120.03 }),
  { quantity: 65, availableMargin: 100000, isLive: false, isAuthenticated: false },
);
assert(!tickError.valid, "Invalid tick price should fail");
assert(
  tickError.fieldErrors?.price === "Price should be in multiples of 0.05.",
  "Tick size message should match Kite",
);

const slBuyError = validateOrder(
  baseOrder({
    orderType: "SL",
    side: "BUY",
    price: 100,
    triggerPrice: 105,
  }),
  { quantity: 65, availableMargin: 100000, isLive: false, isAuthenticated: false },
);
assert(!slBuyError.valid, "Buy SL with trigger above price should fail");
assert(
  slBuyError.fieldErrors?.triggerPrice === "Trigger price can't be higher than price.",
  "Buy SL trigger message should match Kite",
);

const slSellError = validateOrder(
  baseOrder({
    orderType: "SL",
    side: "SELL",
    price: 100,
    triggerPrice: 95,
    lots: 1,
  }),
  {
    quantity: 65,
    heldQuantity: 65,
    availableMargin: 100000,
    isLive: false,
    isAuthenticated: false,
  },
);
assert(!slSellError.valid, "Sell SL with trigger below price should fail");
assert(
  slSellError.fieldErrors?.triggerPrice === "Trigger price can't be lesser than price.",
  "Sell SL trigger message should match Kite",
);

const slmOk = validateOrder(baseOrder({ orderType: "SL-M", triggerPrice: 120 }), {
  quantity: 65,
  availableMargin: 100000,
  isLive: false,
  isAuthenticated: false,
});
assert(slmOk.valid, "SL-M should be allowed for NFO options");

const slmBfoError = validateOrder(
  baseOrder({ orderType: "SL-M", triggerPrice: 120, exchange: "BFO" }),
  {
    quantity: 65,
    availableMargin: 100000,
    isLive: false,
    isAuthenticated: false,
  },
);
assert(!slmBfoError.valid, "SL-M should be blocked on BFO");
assert(
  slmBfoError.error === "Stoploss Market (SL-M) orders are blocked on BSE.",
  "SL-M BFO message should match Kite",
);

const disclosedError = validateOrder(baseOrder({ disclosedQuantity: 10 }), {
  quantity: 65,
  availableMargin: 100000,
  isLive: false,
  isAuthenticated: false,
});
assert(!disclosedError.valid, "Disclosed quantity should fail for F&O");
assert(
  disclosedError.error === "Disclosed quantity is not allowed for F&O orders.",
  "Disclosed quantity message should match F&O rule",
);

const sellError = validateOrder(baseOrder({ side: "SELL" }), {
  quantity: 65,
  heldQuantity: 0,
  availableMargin: 100000,
  isLive: false,
  isAuthenticated: false,
});
assert(!sellError.valid, "Sell without holdings should fail");
assert(
  sellError.error === "You don't have sufficient holdings to place a sell order.",
  "Insufficient holdings message should match Kite",
);

const marginError = validateOrder(baseOrder({ lots: 100, ltp: 500 }), {
  quantity: 6500,
  availableMargin: 1000,
  isLive: false,
  isAuthenticated: false,
});
assert(!marginError.valid, "Insufficient margin should fail");
assert(
  marginError.error === "Insufficient funds. Required margin is not available.",
  "Margin message should match Kite",
);

console.log("orderValidation.test.ts: all assertions passed");
