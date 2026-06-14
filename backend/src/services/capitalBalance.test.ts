import {
  computeAvailableMargin,
  computeCapitalBalance,
  computeDayChangePct,
  marginSnapshotFromParts,
} from "./capitalBalance.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const enrichedPosition = {
  pnl: {
    gross: 10_000,
    net: 8_000,
    charges: {
      entry: { total: 800 },
      exit: { total: 1_200 },
      total: 2_000,
    },
  },
};
const rawPosition = { kiteGrossPnL: 10_000 };

// Margin disabled: charge-aware equity from opening + open MTM
const cashMargins = marginSnapshotFromParts(450_000, 400_000, 500_000, 0, 10_000, false);
const cashBalance = computeCapitalBalance(cashMargins, [rawPosition], [enrichedPosition as never]);
assert(cashBalance === 508_800, `Expected 508800 capital (margin off), got ${cashBalance}`);

const cashFlat = computeCapitalBalance(
  marginSnapshotFromParts(500_000, 450_000, 500_000, 0, 0, false),
  [],
  [],
);
assert(cashFlat === 500_000, `Expected unchanged equity with no positions, got ${cashFlat}`);

// Margin enabled: use Kite live net (includes premium / day MTM)
const marginOn = marginSnapshotFromParts(194_381.5, 194_381.5, 169_800, 0, 0, true);
const marginBalance = computeCapitalBalance(marginOn, [rawPosition], [enrichedPosition as never], 24_581.5);
assert(marginBalance === 194_381.5, `Expected Kite net when margin on, got ${marginBalance}`);

const marginAvailable = computeAvailableMargin(marginOn, 24_581.5);
assert(marginAvailable === 194_381.5, `Expected Kite available when margin on, got ${marginAvailable}`);

// Margin disabled with portfolio net P&L
const cashWithPnl = marginSnapshotFromParts(169_800, 169_800, 169_800, 0, 0, false);
const adjusted = computeCapitalBalance(cashWithPnl, [], [], 12_500);
assert(adjusted === 182_300, `Expected opening + net P&L, got ${adjusted}`);
const adjustedAvail = computeAvailableMargin(cashWithPnl, 12_500);
assert(adjustedAvail === 182_300, `Expected available = opening + net P&L, got ${adjustedAvail}`);

const dayPct = computeDayChangePct(194_381.5, 169_800);
assert(dayPct === 14.48, `Expected +14.48% day change, got ${dayPct}`);

console.log("capitalBalance.test.ts: all assertions passed");
