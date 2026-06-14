import { dayChangeFromKiteTick, dayChangeFromPreviousClose } from "./indexDayChange.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const niftyExample = {
  tradable: false,
  mode: "full",
  instrument_token: 256265,
  last_price: 23406.85,
  ohlc: { high: 23441.95, low: 23295.95, open: 23344.45, close: 23264.85 },
  change: 0.6103628435171514,
} as const;

const fromClose = dayChangeFromPreviousClose(24023.25, 23719);
assert(fromClose.spotChange === 304.25, `Expected +304.25 points, got ${fromClose.spotChange}`);
assert(fromClose.spotChangePct === 1.28, `Expected +1.28%, got ${fromClose.spotChangePct}`);

const fromTick = dayChangeFromKiteTick(niftyExample);
assert(fromTick?.spotChange === 142, `Expected +142 points from Kite sample tick, got ${fromTick?.spotChange}`);
assert(fromTick?.spotChangePct === 0.61, `Expected +0.61% from Kite sample tick, got ${fromTick?.spotChangePct}`);

const pctOnlyTick = {
  tradable: false,
  mode: "quote",
  instrument_token: 256265,
  last_price: 24023.25,
  change: 1.28,
} as const;

const fromPctOnly = dayChangeFromKiteTick(pctOnlyTick);
assert(
  fromPctOnly != null && Math.abs(fromPctOnly.spotChange - 304.25) < 1,
  `Expected ~304 points from change %, got ${fromPctOnly?.spotChange}`,
);
assert(
  fromPctOnly != null && Math.abs(fromPctOnly.spotChangePct - 1.28) < 0.01,
  `Expected ~1.28% from change %, got ${fromPctOnly?.spotChangePct}`,
);

console.log("indexDayChange.test.ts: all assertions passed");
