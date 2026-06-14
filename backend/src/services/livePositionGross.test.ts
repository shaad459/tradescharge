import { applyLtpToPosition, applyMarkToPosition, grossPnLFromMark } from "./livePositionGross.js";
import { applyLiveTickUpdates, setLiveStreamCache } from "./liveStreamCache.js";
import type { LiveKiteSnapshot } from "./liveKiteSync.js";
import type { Position } from "../types.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const basePosition: Position = {
  id: "NIFTY2560524600CE:NRML",
  symbol: "NIFTY",
  instrumentType: "CE",
  strike: 24600,
  expiry: "2026-05-29",
  side: "long",
  buyPrice: 100,
  quantity: 65,
  lotSize: 65,
  ltp: 100,
  restLtp: 100,
  instrumentToken: 123456,
  kiteGrossPnL: 0,
  exchange: "NFO",
};

assert(grossPnLFromMark({ ...basePosition, ltp: 110 }) === 650, "Long gross should scale with LTP");

const marked = applyMarkToPosition(basePosition, 110);
assert(marked.ltp === 110, "Marked position should update LTP");
assert(marked.kiteGrossPnL === 650, "Marked position should refresh gross");

const snapshot: LiveKiteSnapshot = {
  positions: [basePosition],
  closedPositions: [],
  openOrders: [],
  orderHistory: [],
  margins: {
    net: 100000,
    available: 80000,
    openingBalance: 100000,
    m2mRealised: 0,
    m2mUnrealised: 0,
    marginEnabled: false,
  },
};

setLiveStreamCache("user-1", snapshot);
const updated = applyLiveTickUpdates("user-1", new Map([[123456, 104]]));
assert(updated?.positions[0].ltp === 104, "Tick update should change LTP");
assert(updated?.positions[0].kiteGrossPnL === 260, "Tick update should refresh gross");

// Kite pnl embeds average_price, not buy_price — delta update must preserve Kite basis.
const kiteSynced: Position = {
  ...basePosition,
  buyPrice: 320,
  ltp: 310,
  restLtp: 310,
  kiteGrossPnL: 3334.5,
};
const ticked = applyLtpToPosition(kiteSynced, 311);
assert(ticked.kiteGrossPnL === 3399.5, `Expected 3399.5, got ${ticked.kiteGrossPnL}`);
const recomputed = grossPnLFromMark({ ...kiteSynced, ltp: 311 });
assert(
  recomputed !== ticked.kiteGrossPnL,
  "buy_price formula should not replace Kite gross when lots were averaged",
);

console.log("livePositionGross.test.ts: all assertions passed");
