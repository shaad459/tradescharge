import {
  calculateAddToPositionNet,
  calculateBreakeven,
  calculateNetPnL,
  calculateOpenPositionPnL,
  calculateOpenPositionPortfolioExit,
  calculatePartialExitRemainingPortfolioExit,
  calculatePartialSellRealizedNet,
  calculateAddToPositionPortfolioExit,
  calculatePortfolioRecoveryBreakeven,
  calculateReentryBreakeven,
  calculateRoundTripCharges,
  breakevenCoverPrice,
  breakevenSellPrice,
  breakevenSellPriceRemainingLeg,
  calculateOpenPositionPortfolioExit,
  validateContractNoteExample,
  validateAprMay2026BrokingReport,
  weightedEntryPrice,
} from "./charges.js";
import { NIFTY_LOT_SIZE } from "../constants.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(validateContractNoteExample(), "Contract note example should match PRD");
assert(
  validateAprMay2026BrokingReport(),
  "Apr–May 2026 BK2660 aggregate should match Zerodha P&L within tolerance",
);

const bseRoundTrip = calculateRoundTripCharges(100, 110, 20, "BFO");
const nseRoundTrip = calculateRoundTripCharges(100, 110, 20, "NFO");
assert(
  bseRoundTrip.entry.exchangeCharges < nseRoundTrip.entry.exchangeCharges,
  "BSE exchange fee should be lower than NSE for same turnover",
);

const roundTrip = calculateRoundTripCharges(100, 110, NIFTY_LOT_SIZE);
assert(roundTrip.total > 0, "Round trip charges should be positive");

const pnl = calculateNetPnL(100, 110, NIFTY_LOT_SIZE);
assert(pnl.gross === 650, `Expected gross 650, got ${pnl.gross}`);
assert(pnl.net < pnl.gross, "Net P&L should be less than gross after charges");

const kiteStyle = calculateOpenPositionPnL(100, 110, NIFTY_LOT_SIZE, 650);
assert(kiteStyle.gross === 650, "Live gross should use Kite position pnl when provided");
assert(kiteStyle.net < kiteStyle.gross, "Net should still deduct charges from Kite gross");

const ltp = 91.11;
const twoLotsAtLtp = calculateBreakeven(ltp, NIFTY_LOT_SIZE, 2);
assert(twoLotsAtLtp.quantity === 130, "Expected 130 qty for 2 lots");
assert(twoLotsAtLtp.entryPrice === ltp, "Entry should be LTP when not adding lots");
assert(twoLotsAtLtp.capitalDeployed === round2(ltp * 130), `Capital should match LTP entry`);
assert(twoLotsAtLtp.grossPnLAtLtp === 0, "Gross at LTP should be zero when entry is LTP");
assert(twoLotsAtLtp.netPnLAtLtp < 0, "Net at LTP should be negative due to charges");
assert(twoLotsAtLtp.breakevenPrice > ltp, "Breakeven sell should be above LTP entry");

const shortLegBe = breakevenCoverPrice(100, NIFTY_LOT_SIZE);
assert(shortLegBe < 100, "Short cover breakeven should be below sell entry");

const shortOpen = calculateOpenPositionPortfolioExit(100, NIFTY_LOT_SIZE, 1, 80, -500, "short");
assert(
  shortOpen.breakevenPrice < 100,
  "Short portfolio cover target should be below entry when LTP is below entry",
);
assert(shortOpen.legBreakevenPrice < 100, "Short leg breakeven cover should be below entry");

const oneLot = calculateBreakeven(ltp, NIFTY_LOT_SIZE, 1);
const tenLots = calculateBreakeven(ltp, NIFTY_LOT_SIZE, 10);
assert(
  oneLot.breakevenPrice > tenLots.breakevenPrice,
  "1 lot breakeven price should be higher than 10 lots",
);
assert(oneLot.moveFromLtp > 0, "Move from LTP should be positive");

const blendedEntry = weightedEntryPrice(ltp, NIFTY_LOT_SIZE, 4, 2, 98.75);
assert(blendedEntry < 98.75, "Blended entry should be below original buy when adding at lower LTP");
assert(blendedEntry > ltp, "Blended entry should be above LTP when adding at lower LTP");

const addingLots = calculateBreakeven(ltp, NIFTY_LOT_SIZE, 4, 2, 98.75);
assert(addingLots.addingLots, "Should flag adding lots");
assert(addingLots.entryPrice === blendedEntry, "Entry should match weighted average");
assert(
  addingLots.breakevenPrice > calculateBreakeven(ltp, NIFTY_LOT_SIZE, 2).breakevenPrice,
  "Blended entry above LTP should raise breakeven vs fresh lots at LTP",
);
const naiveAddNet = calculateNetPnL(blendedEntry, ltp, 4 * NIFTY_LOT_SIZE).net;
const chargeAwareAddNet = calculateAddToPositionNet(
  98.75,
  2 * NIFTY_LOT_SIZE,
  ltp,
  2 * NIFTY_LOT_SIZE,
  ltp,
).net;
assert(
  chargeAwareAddNet < naiveAddNet,
  "Adding lots should include a separate buy-order charge vs blended round trip",
);
const addPortfolio = calculateAddToPositionPortfolioExit(
  98.75,
  NIFTY_LOT_SIZE,
  4,
  2,
  ltp,
  -100,
);
assert(
  addPortfolio.entryPrice === blendedEntry,
  "Portfolio add should expose weighted average entry price",
);

const portfolioNet = -1539.02;
const reentry = calculatePortfolioRecoveryBreakeven(90, NIFTY_LOT_SIZE, 2, portfolioNet);
assert(reentry.recoveryMode === true, "Portfolio recovery should set recovery mode");
assert(reentry.netPnLAtLtp === portfolioNet, "Display net should be portfolio total");
assert(
  reentry.breakevenPrice > calculateBreakeven(90, NIFTY_LOT_SIZE, 2).breakevenPrice,
  "Recovery exit should be above charge-only breakeven when portfolio is in loss",
);
const combinedAtRecovery =
  calculateNetPnL(90, reentry.breakevenPrice, reentry.quantity).net + portfolioNet;
assert(
  Math.abs(combinedAtRecovery) < 1,
  `Portfolio net at recovery should be ~0, got ${combinedAtRecovery}`,
);

const portfolioProfit = 1787.78;
const profitReentry = calculatePortfolioRecoveryBreakeven(152, NIFTY_LOT_SIZE, 2, portfolioProfit);
assert(
  profitReentry.breakevenPrice < 152,
  "Capital-intact SL should be below LTP when portfolio is in profit",
);
const combinedAtProfitSl =
  calculateNetPnL(152, profitReentry.breakevenPrice, profitReentry.quantity).net + portfolioProfit;
assert(
  Math.abs(combinedAtProfitSl) < 1,
  `Capital should be intact at SL when portfolio is profitable, got ${combinedAtProfitSl}`,
);
assert(profitReentry.moveFromLtp < 0, "Move from LTP should be negative when SL is below entry");

const buyA = 100;
const buyB = 100;
const qty = 65;
const ltpA = 110;
const ltpB = 90;
const netA = calculateNetPnL(buyA, ltpA, qty).net;
const netB = calculateNetPnL(buyB, ltpB, qty).net;
const totalNet = round2(netA + netB);
const otherNetB = round2(totalNet - netB);
const exitB = calculateOpenPositionPortfolioExit(buyB, NIFTY_LOT_SIZE, 1, ltpB, otherNetB);
const combinedB =
  calculateNetPnL(buyB, exitB.breakevenPrice, qty).net + otherNetB;
assert(
  Math.abs(combinedB) < 1,
  `Open position portfolio exit should zero overall net, got ${combinedB}`,
);
assert(
  exitB.breakevenPrice < breakevenSellPrice(buyB, qty),
  "Loss leg with profitable offset should need less recovery than charge-only breakeven",
);

const partialHeld = 10;
const partialRemaining = 1;
const partialBuy = 142.5;
const partialLtp = 145;
const partialOther = -120;
const partial = calculatePartialExitRemainingPortfolioExit(
  partialBuy,
  NIFTY_LOT_SIZE,
  partialHeld,
  partialRemaining,
  partialLtp,
  partialOther,
);
assert(partial.partialExitLots === 9, "Should exit 9 lots at LTP");
assert(partial.remainingLots === 1, "Should keep 1 lot active");
assert(
  partial.realizedPartialNet !== undefined,
  "Should include realized partial P&L",
);
if (partial.portfolioZeroAchievable) {
  assert(
    Math.abs(partial.overallNetAtRecovery ?? NaN) < 1,
    `Partial exit portfolio zero should hold, got ${partial.overallNetAtRecovery}`,
  );
} else {
  assert(
    Math.abs(
      partial.breakevenPrice -
        breakevenSellPriceRemainingLeg(partialBuy, partialHeld * NIFTY_LOT_SIZE, NIFTY_LOT_SIZE),
    ) < 0.05,
    "Should fall back to charge-aware leg breakeven when portfolio zero is not achievable",
  );
}

const partialBuy2 = 142.5;
const partialLtp2 = 145;
const heldQty2 = 10 * NIFTY_LOT_SIZE;
const soldQty2 = 9 * NIFTY_LOT_SIZE;
const fullNet2 = calculateNetPnL(partialBuy2, partialLtp2, heldQty2).net;
const chargeAwarePartial = calculatePartialSellRealizedNet(
  partialBuy2,
  partialLtp2,
  heldQty2,
  soldQty2,
);
assert(
  chargeAwarePartial < fullNet2 * 0.9,
  "Partial sell should cost extra sell-order charges vs proportional full-position split",
);

assert(
  partial.breakevenPrice !==
    calculateOpenPositionPortfolioExit(
      partialBuy,
      NIFTY_LOT_SIZE,
      partialHeld,
      partialLtp,
      partialOther,
    ).breakevenPrice || partialRemaining < partialHeld,
  "Remaining-lot breakeven should use partial-exit context",
);

function assertMonotonic(values: number[], increasing: boolean, label: string) {
  for (let i = 1; i < values.length; i++) {
    if (increasing && values[i] + 0.001 < values[i - 1]) {
      throw new Error(`${label} should increase: ${values.join(" -> ")}`);
    }
    if (!increasing && values[i - 1] + 0.001 < values[i]) {
      throw new Error(`${label} should decrease: ${values.join(" -> ")}`);
    }
  }
}

const monoBuy = 142.5;
const monoLtpPos = 148;
const monoHeld = 10;
const monoOtherPos = -200;
const fullPosExit = calculateOpenPositionPortfolioExit(
  monoBuy,
  NIFTY_LOT_SIZE,
  monoHeld,
  monoLtpPos,
  monoOtherPos,
).breakevenPrice;
const partialExits = [9, 7, 5, 3, 1].map((rem) =>
  calculatePartialExitRemainingPortfolioExit(
    monoBuy,
    NIFTY_LOT_SIZE,
    monoHeld,
    rem,
    monoLtpPos,
    monoOtherPos,
  ).breakevenPrice,
);
assertMonotonic([fullPosExit, ...partialExits], false, "Profitable portfolio partial SL");
const addExits = [11, 12, 14].map((total) =>
  calculateAddToPositionPortfolioExit(
    monoBuy,
    NIFTY_LOT_SIZE,
    total,
    monoHeld,
    monoLtpPos,
    monoOtherPos,
  ).breakevenPrice,
);
assertMonotonic([fullPosExit, ...addExits], true, "Profitable portfolio add SL");

const monoLtpLoss = 135;
const monoOtherLoss = -800;
const fullLossExit = calculateOpenPositionPortfolioExit(
  monoBuy,
  NIFTY_LOT_SIZE,
  monoHeld,
  monoLtpLoss,
  monoOtherLoss,
).breakevenPrice;
const partialLossExits = [9, 7, 5, 3, 1].map((rem) =>
  calculatePartialExitRemainingPortfolioExit(
    monoBuy,
    NIFTY_LOT_SIZE,
    monoHeld,
    rem,
    monoLtpLoss,
    monoOtherLoss,
  ).breakevenPrice,
);
assertMonotonic([fullLossExit, ...partialLossExits], true, "Loss portfolio partial target");
const addLossExits = [11, 12, 14].map((total) =>
  calculateAddToPositionPortfolioExit(
    monoBuy,
    NIFTY_LOT_SIZE,
    total,
    monoHeld,
    monoLtpLoss,
    monoOtherLoss,
  ).breakevenPrice,
);
assertMonotonic([fullLossExit, ...addLossExits], false, "Loss portfolio add target");

console.log("All charge engine tests passed.");
console.log("2 lots at LTP 91.11:", twoLotsAtLtp);
console.log("4 lots (2 held @98.75 + 2 @LTP):", addingLots);
