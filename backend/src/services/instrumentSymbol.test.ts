import {
  BANKNIFTY_LOT_SIZE,
  getLotSize,
  NIFTY_LOT_SIZE,
  resolveFoLotSize,
  SENSEX_LOT_SIZE,
} from "../constants.js";
import { formatInstrumentLabel, parseTradingsymbol } from "./instrumentSymbol.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const weekly = parseTradingsymbol("NIFTY2660223750CE");
assert(weekly.strike === 23750, `Weekly strike should be 23750, got ${weekly.strike}`);
assert(weekly.expiry === "2026-06-02", `Weekly expiry should be 2026-06-02, got ${weekly.expiry}`);

const monthly = parseTradingsymbol("NIFTY25052924600CE");
assert(monthly.strike === 24600, `Monthly strike should be 24600, got ${monthly.strike}`);
assert(monthly.expiry === "2025-05-29", `Monthly expiry should be 2025-05-29, got ${monthly.expiry}`);

const label = formatInstrumentLabel(weekly);
assert(label.includes("23750"), `Label should include strike: ${label}`);
assert(label.includes("NIFTY"), `Label should include symbol: ${label}`);

assert(getLotSize("NIFTY") === NIFTY_LOT_SIZE && NIFTY_LOT_SIZE === 65, "NIFTY lot 65");
assert(getLotSize("BANKNIFTY") === BANKNIFTY_LOT_SIZE && BANKNIFTY_LOT_SIZE === 30, "Bank Nifty lot 30");
assert(getLotSize("SENSEX") === SENSEX_LOT_SIZE && SENSEX_LOT_SIZE === 20, "Sensex lot 20");

assert(
  resolveFoLotSize(1, "SENSEX") === 20,
  "Kite multiplier=1 should not override Sensex lot 20",
);
assert(
  resolveFoLotSize(1, "NIFTY") === 65,
  "Kite multiplier=1 should not override Nifty lot 65",
);
assert(resolveFoLotSize(65, "NIFTY") === 65, "Kite multiplier=65 is valid lot size");

console.log("instrumentSymbol.test.ts: all assertions passed");
