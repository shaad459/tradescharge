import { impliedVolatilityPercent, yearsToExpiry } from "./impliedVol.js";

function assert(name: string, condition: boolean) {
  if (!condition) {
    throw new Error(`Assertion failed: ${name}`);
  }
}

const spot = 24500;
const strike = 24500;
const expiry = "2026-05-28";
const t = yearsToExpiry(expiry, new Date("2026-05-23T10:00:00+05:30"));

const callPrice = 180;
const iv = impliedVolatilityPercent(spot, strike, callPrice, t, true);
assert("ATM call IV is computed", iv != null && iv > 5 && iv < 40);

const roundTrip = impliedVolatilityPercent(spot, strike, callPrice, t, true);
assert("IV solver is stable", roundTrip === iv);

assert("yearsToExpiry is positive before expiry", t > 0);

console.log("impliedVol.test.ts: all assertions passed", { iv, t: t.toFixed(4) });
