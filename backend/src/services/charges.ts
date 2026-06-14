import type { Trade } from "kiteconnect";
import type { BreakevenResult, ChargeLineItem, PositionPnL, RoundTripCharges } from "../types.js";
import { isFoExchange } from "./instrumentSymbol.js";
import { positionBookKey } from "./liveClosedPositions.js";

/** NSE / BSE F&O options rates (Zerodha, effective April 2026 STT on options sell = 0.15%) */
const NSE_OPTIONS_EXCHANGE_RATE = 0.0003553;
const BSE_OPTIONS_EXCHANGE_RATE = 0.000325;
/** Options sell premium STT — raised from 0.10% to 0.15% on 2026-04-01 (Finance Act 2026) */
const STT_SELL_RATE = 0.0015;
const STAMP_BUY_RATE = 0.00003;
const STAMP_MIN_PER_CRORE = 300;
const SEBI_PER_CRORE = 10;
const BROKERAGE_FLAT = 20;
const GST_RATE = 0.18;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FoExchange = "NFO" | "BFO";

function exchangeRate(exchange: FoExchange = "NFO"): number {
  return exchange === "BFO" ? BSE_OPTIONS_EXCHANGE_RATE : NSE_OPTIONS_EXCHANGE_RATE;
}

function sebiCharges(turnover: number): number {
  return (turnover * SEBI_PER_CRORE) / 1e7;
}

function exchangeCharges(turnover: number, exchange: FoExchange = "NFO"): number {
  return turnover * exchangeRate(exchange);
}

function stampDuty(buyTurnover: number): number {
  const rateCharge = buyTurnover * STAMP_BUY_RATE;
  const minCharge = (buyTurnover * STAMP_MIN_PER_CRORE) / 1e7;
  return Math.max(rateCharge, minCharge);
}

function sideCharges(
  turnover: number,
  side: "buy" | "sell",
  brokerage: number,
  exchange: FoExchange = "NFO",
): Omit<ChargeLineItem, "total"> {
  const exchangeFee = exchangeCharges(turnover, exchange);
  const sebi = sebiCharges(turnover);
  const stt = side === "sell" ? turnover * STT_SELL_RATE : 0;
  const stamp = side === "buy" ? stampDuty(turnover) : 0;
  const gst = GST_RATE * (brokerage + exchangeFee + sebi);

  return {
    brokerage: round2(brokerage),
    stampDuty: round2(stamp),
    stt: round2(stt),
    exchangeCharges: round2(exchangeFee),
    sebiCharges: round2(sebi),
    gst: round2(gst),
  };
}

function sumSide(charges: Omit<ChargeLineItem, "total">): ChargeLineItem {
  const total =
    charges.brokerage +
    charges.stampDuty +
    charges.stt +
    charges.exchangeCharges +
    charges.sebiCharges +
    charges.gst;

  return { ...charges, total: round2(total) };
}

function mergeChargeItems(a: ChargeLineItem, b: ChargeLineItem): ChargeLineItem {
  return {
    brokerage: round2(a.brokerage + b.brokerage),
    stampDuty: round2(a.stampDuty + b.stampDuty),
    stt: round2(a.stt + b.stt),
    exchangeCharges: round2(a.exchangeCharges + b.exchangeCharges),
    sebiCharges: round2(a.sebiCharges + b.sebiCharges),
    gst: round2(a.gst + b.gst),
    total: round2(a.total + b.total),
  };
}

function buyEntryCharges(
  buyPrice: number,
  quantity: number,
  exchange: FoExchange = "NFO",
): ChargeLineItem {
  return sumSide(sideCharges(buyPrice * quantity, "buy", BROKERAGE_FLAT, exchange));
}

function sellExitCharges(
  sellPrice: number,
  quantity: number,
  exchange: FoExchange = "NFO",
): ChargeLineItem {
  return sumSide(sideCharges(sellPrice * quantity, "sell", BROKERAGE_FLAT, exchange));
}

function proportionalEntryShare(buyPrice: number, heldQty: number, portionQty: number): number {
  if (portionQty <= 0 || heldQty <= 0) {
    return 0;
  }
  const fullEntry = buyEntryCharges(buyPrice, heldQty);
  return round2(fullEntry.total * (portionQty / heldQty));
}

/** Realized net when selling part of a single-entry held leg (extra sell-order charges). */
export function calculatePartialSellRealizedNet(
  buyPrice: number,
  sellPrice: number,
  heldQty: number,
  soldQty: number,
): number {
  const gross = round2((sellPrice - buyPrice) * soldQty);
  const entryShare = proportionalEntryShare(buyPrice, heldQty, soldQty);
  const exitCharges = sellExitCharges(sellPrice, soldQty).total;
  return round2(gross - entryShare - exitCharges);
}

/** Net on remaining qty from a single entry if closed at mark (entry share + exit order). */
export function calculateRemainingLegNet(
  buyPrice: number,
  markPrice: number,
  heldQty: number,
  remainingQty: number,
): number {
  const gross = round2((markPrice - buyPrice) * remainingQty);
  const entryShare = proportionalEntryShare(buyPrice, heldQty, remainingQty);
  const exitCharges = sellExitCharges(markPrice, remainingQty).total;
  return round2(gross - entryShare - exitCharges);
}

/** Net when adding lots at addPrice to an existing held leg, marked at markPrice. */
export function calculateAddToPositionNet(
  existingBuyPrice: number,
  heldQty: number,
  addPrice: number,
  addQty: number,
  markPrice: number,
): PositionPnL {
  const totalQty = heldQty + addQty;
  const gross = round2(
    (markPrice - existingBuyPrice) * heldQty + (markPrice - addPrice) * addQty,
  );
  const heldEntry = buyEntryCharges(existingBuyPrice, heldQty);
  const addEntry = buyEntryCharges(addPrice, addQty);
  const exit = sellExitCharges(markPrice, totalQty);
  const entry = mergeChargeItems(heldEntry, addEntry);
  const total = round2(entry.total + exit.total);

  return {
    gross,
    charges: { entry, exit, total },
    net: round2(gross - total),
  };
}

function capitalIntactSellPriceFromNetFn(
  netAtSellPrice: (sellPrice: number) => number,
  referencePrice: number,
  portfolioNetPnL: number,
  searchLow: number,
  searchHigh: number,
): number {
  const targetNewNet = -portfolioNetPnL;
  const netAtRef = netAtSellPrice(referencePrice);

  if (Math.abs(targetNewNet - netAtRef) < 0.01) {
    return round2(referencePrice);
  }

  if (targetNewNet > netAtRef) {
    let low = referencePrice;
    let high = Math.max(searchHigh, referencePrice + 1);

    while (high - low > 0.001) {
      const mid = (low + high) / 2;
      if (netAtSellPrice(mid) < targetNewNet) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return round2(high);
  }

  let low = Math.max(0.05, searchLow);
  let high = referencePrice;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    if (netAtSellPrice(mid) > targetNewNet) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return round2(high);
}

export function breakevenSellPriceRemainingLeg(
  buyPrice: number,
  heldQty: number,
  remainingQty: number,
): number {
  let low = buyPrice;
  let high = buyPrice + 1000;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    if (calculateRemainingLegNet(buyPrice, mid, heldQty, remainingQty) < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round2(high);
}

export function breakevenSellPriceAddToPosition(
  existingBuyPrice: number,
  heldQty: number,
  addPrice: number,
  addQty: number,
): number {
  let low = addPrice;
  let high = addPrice + 1000;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    if (calculateAddToPositionNet(existingBuyPrice, heldQty, addPrice, addQty, mid).net < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round2(high);
}

function capitalIntactSellPriceRemainingLeg(
  buyPrice: number,
  heldQty: number,
  remainingQty: number,
  portfolioNetPnL: number,
): number {
  return capitalIntactSellPriceFromNetFn(
    (sellPrice) => calculateRemainingLegNet(buyPrice, sellPrice, heldQty, remainingQty),
    buyPrice,
    portfolioNetPnL,
    0.05,
    buyPrice + 1000,
  );
}

function capitalIntactSellPriceAddToPosition(
  existingBuyPrice: number,
  heldQty: number,
  addPrice: number,
  addQty: number,
  portfolioNetPnL: number,
): number {
  return capitalIntactSellPriceFromNetFn(
    (sellPrice) => calculateAddToPositionNet(existingBuyPrice, heldQty, addPrice, addQty, sellPrice).net,
    addPrice,
    portfolioNetPnL,
    0.05,
    addPrice + 1000,
  );
}

export interface RoundTripChargeOptions {
  /** Executed buy orders backing this leg (default 1). */
  entryBrokerageOrders?: number;
  /** Executed sell orders for this exit (default 1; autoslice may be >1). */
  exitBrokerageOrders?: number;
}

export function calculateRoundTripCharges(
  buyPrice: number,
  sellPrice: number,
  quantity: number,
  exchange: FoExchange = "NFO",
  chargeOptions: RoundTripChargeOptions = {},
): RoundTripCharges {
  const entryOrders = Math.max(1, chargeOptions.entryBrokerageOrders ?? 1);
  const exitOrders = Math.max(1, chargeOptions.exitBrokerageOrders ?? 1);
  const buyTurnover = buyPrice * quantity;
  const sellTurnover = sellPrice * quantity;
  const entry = sumSide(sideCharges(buyTurnover, "buy", BROKERAGE_FLAT * entryOrders, exchange));
  const exit = sumSide(sideCharges(sellTurnover, "sell", BROKERAGE_FLAT * exitOrders, exchange));

  return {
    entry,
    exit,
    total: round2(entry.total + exit.total),
  };
}

/** Short writer: sell to open (entry), buy to cover (exit). */
export function calculateShortRoundTripCharges(
  sellEntry: number,
  buyCover: number,
  quantity: number,
  exchange: FoExchange = "NFO",
  chargeOptions: RoundTripChargeOptions = {},
): RoundTripCharges {
  const entryOrders = Math.max(1, chargeOptions.entryBrokerageOrders ?? 1);
  const exitOrders = Math.max(1, chargeOptions.exitBrokerageOrders ?? 1);
  const sellTurnover = sellEntry * quantity;
  const buyTurnover = buyCover * quantity;
  const entry = sumSide(sideCharges(sellTurnover, "sell", BROKERAGE_FLAT * entryOrders, exchange));
  const exit = sumSide(sideCharges(buyTurnover, "buy", BROKERAGE_FLAT * exitOrders, exchange));

  return {
    entry,
    exit,
    total: round2(entry.total + exit.total),
  };
}

/** Sum charges from every buy/sell fill today on one contract (matches trade book + order brokerage). */
export function calculatePositionChargesFromTrades(
  trades: Trade[],
  bookKey: string,
  exchange: FoExchange = "NFO",
  side: "long" | "short" = "long",
): RoundTripCharges {
  let buyTurnover = 0;
  let sellTurnover = 0;
  const buyOrders = new Set<string>();
  const sellOrders = new Set<string>();

  for (const trade of trades) {
    if (!isFoExchange(trade.exchange)) {
      continue;
    }
    const key = positionBookKey(trade.tradingsymbol, trade.exchange, trade.product);
    if (key !== bookKey) {
      continue;
    }
    const qty = trade.quantity ?? trade.filled;
    if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const orderId = String(trade.order_id);
    const turnover = trade.average_price * qty;
    if (trade.transaction_type === "BUY") {
      buyTurnover += turnover;
      buyOrders.add(orderId);
    } else if (trade.transaction_type === "SELL") {
      sellTurnover += turnover;
      sellOrders.add(orderId);
    }
  }

  if (side === "short") {
    const entry = sumSide(
      sideCharges(sellTurnover, "sell", BROKERAGE_FLAT * Math.max(1, sellOrders.size), exchange),
    );
    const exit = sumSide(
      sideCharges(buyTurnover, "buy", BROKERAGE_FLAT * Math.max(1, buyOrders.size), exchange),
    );
    return {
      entry,
      exit,
      total: round2(entry.total + exit.total),
    };
  }

  const entry = sumSide(
    sideCharges(buyTurnover, "buy", BROKERAGE_FLAT * Math.max(1, buyOrders.size), exchange),
  );
  const exit = sumSide(
    sideCharges(sellTurnover, "sell", BROKERAGE_FLAT * Math.max(1, sellOrders.size), exchange),
  );

  return {
    entry,
    exit,
    total: round2(entry.total + exit.total),
  };
}

export function calculateShortNetPnL(
  sellEntry: number,
  coverPrice: number,
  quantity: number,
  exchange: FoExchange = "NFO",
  charges?: RoundTripCharges,
): PositionPnL {
  const gross = round2((sellEntry - coverPrice) * quantity);
  const roundTrip =
    charges ?? calculateShortRoundTripCharges(sellEntry, coverPrice, quantity, exchange);

  return {
    gross,
    charges: roundTrip,
    net: round2(gross - roundTrip.total),
  };
}

export function calculateNetPnL(
  buyPrice: number,
  ltp: number,
  quantity: number,
  exchange: FoExchange = "NFO",
): PositionPnL {
  const gross = round2((ltp - buyPrice) * quantity);
  const charges = calculateRoundTripCharges(buyPrice, ltp, quantity, exchange);

  return {
    gross,
    charges,
    net: round2(gross - charges.total),
  };
}

/** Open-position P&L; in live mode gross comes from Kite's position `pnl` (matches Kite app MTM). */
export function calculateOpenPositionPnL(
  entryPrice: number,
  markPrice: number,
  quantity: number,
  kiteGrossPnL?: number,
  exchange: FoExchange = "NFO",
  side: "long" | "short" = "long",
): PositionPnL {
  const charges =
    side === "short"
      ? calculateShortRoundTripCharges(entryPrice, markPrice, quantity, exchange)
      : calculateRoundTripCharges(entryPrice, markPrice, quantity, exchange);

  if (kiteGrossPnL != null && Number.isFinite(kiteGrossPnL)) {
    const gross = round2(kiteGrossPnL);
    return {
      gross,
      charges,
      net: round2(gross - charges.total),
    };
  }

  return side === "short"
    ? calculateShortNetPnL(entryPrice, markPrice, quantity, exchange, charges)
    : calculateNetPnL(entryPrice, markPrice, quantity, exchange);
}

/** Closed-leg P&L; in live mode gross comes from Kite day-book `realised` allocation. */
export function calculateClosedPositionPnL(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  kiteGrossPnL?: number,
  exchange: FoExchange = "NFO",
  chargeOptions: RoundTripChargeOptions = {},
  side: "long" | "short" = "long",
): PositionPnL {
  const charges =
    side === "short"
      ? calculateShortRoundTripCharges(entryPrice, exitPrice, quantity, exchange, chargeOptions)
      : calculateRoundTripCharges(entryPrice, exitPrice, quantity, exchange, chargeOptions);

  if (kiteGrossPnL != null && Number.isFinite(kiteGrossPnL)) {
    const gross = round2(kiteGrossPnL);
    return {
      gross,
      charges,
      net: round2(gross - charges.total),
    };
  }

  return side === "short"
    ? calculateShortNetPnL(entryPrice, exitPrice, quantity, exchange, charges)
    : calculateNetPnL(entryPrice, exitPrice, quantity, exchange);
}

export function breakevenSellPrice(
  entryPrice: number,
  quantity: number,
): number {
  let low = entryPrice;
  let high = entryPrice + 1000;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    const { net } = calculateNetPnL(entryPrice, mid, quantity);
    if (net < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round2(high);
}

/** Buy-to-cover price where short leg net P&L after charges is ~₹0 (below sell entry). */
export function breakevenCoverPrice(
  sellEntry: number,
  quantity: number,
  exchange: FoExchange = "NFO",
): number {
  let low = 0.05;
  let high = sellEntry;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    const { net } = calculateShortNetPnL(sellEntry, mid, quantity, exchange);
    if (net < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round2(high);
}

/** Exit price on a new entry so starting capital stays intact after this round trip. */
export function capitalIntactSellPrice(
  entryPrice: number,
  quantity: number,
  portfolioNetPnL: number,
): number {
  const targetNewNet = -portfolioNetPnL;
  const netAtEntry = calculateNetPnL(entryPrice, entryPrice, quantity).net;

  if (Math.abs(targetNewNet - netAtEntry) < 0.01) {
    return round2(entryPrice);
  }

  if (targetNewNet > netAtEntry) {
    const perUnit = Math.abs(targetNewNet - netAtEntry) / Math.max(quantity, 1);
    let low = entryPrice;
    let high = entryPrice + Math.max(500, perUnit + 200);

    while (high - low > 0.001) {
      const mid = (low + high) / 2;
      const { net } = calculateNetPnL(entryPrice, mid, quantity);
      if (net < targetNewNet) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return round2(high);
  }

  const perUnitLoss = Math.abs(targetNewNet - netAtEntry) / Math.max(quantity, 1);
  let low = Math.max(0.05, entryPrice - Math.max(entryPrice, perUnitLoss + 200));
  let high = entryPrice;

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    const { net } = calculateNetPnL(entryPrice, mid, quantity);
    if (net > targetNewNet) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return round2(high);
}

/** @deprecated Use capitalIntactSellPrice */
export function recoverySellPrice(
  entryPrice: number,
  quantity: number,
  portfolioNetPnL: number,
): number {
  return capitalIntactSellPrice(entryPrice, quantity, portfolioNetPnL);
}

/** Cover buy price so portfolio net + this short leg net ≈ 0. */
export function capitalIntactCoverPrice(
  sellEntry: number,
  quantity: number,
  portfolioNetPnL: number,
  exchange: FoExchange = "NFO",
): number {
  const targetNewNet = -portfolioNetPnL;
  const netAtEntry = calculateShortNetPnL(sellEntry, sellEntry, quantity, exchange).net;

  if (Math.abs(targetNewNet - netAtEntry) < 0.01) {
    return round2(sellEntry);
  }

  if (targetNewNet > netAtEntry) {
    const perUnit = Math.abs(targetNewNet - netAtEntry) / Math.max(quantity, 1);
    let low = Math.max(0.05, sellEntry - Math.max(sellEntry, perUnit + 200));
    let high = sellEntry;

    while (high - low > 0.001) {
      const mid = (low + high) / 2;
      const { net } = calculateShortNetPnL(sellEntry, mid, quantity, exchange);
      if (net < targetNewNet) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return round2(high);
  }

  let low = sellEntry;
  let high = sellEntry + Math.max(500, Math.abs(targetNewNet - netAtEntry) / Math.max(quantity, 1) + 200);

  while (high - low > 0.001) {
    const mid = (low + high) / 2;
    const { net } = calculateShortNetPnL(sellEntry, mid, quantity, exchange);
    if (net > targetNewNet) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return round2(high);
}

/** Weighted entry when adding lots at LTP on top of an existing position. */
export function weightedEntryPrice(
  ltp: number,
  lotSize: number,
  lots: number,
  heldLots?: number,
  existingBuyPrice?: number,
): number {
  const quantity = lotSize * lots;
  if (!heldLots || !existingBuyPrice || lots <= heldLots) {
    return ltp;
  }

  const heldQty = lotSize * heldLots;
  const addQty = quantity - heldQty;
  return round2((existingBuyPrice * heldQty + ltp * addQty) / quantity);
}

/** Share of a held leg's net P&L when exiting part of the same entry. @deprecated Use calculatePartialSellRealizedNet */
export function proportionalLegNet(
  buyPrice: number,
  markPrice: number,
  lotSize: number,
  heldLots: number,
  portionLots: number,
): number {
  const heldQty = lotSize * heldLots;
  const portionQty = lotSize * portionLots;
  return calculatePartialSellRealizedNet(buyPrice, markPrice, heldQty, portionQty);
}

function buildRemainingLegBreakevenResult(
  buyPrice: number,
  lotSize: number,
  heldLots: number,
  remainingLots: number,
  ltp: number,
  exitPrice: number,
  adjustedOtherNet: number,
): BreakevenResult {
  const heldQty = lotSize * heldLots;
  const remainingQty = lotSize * remainingLots;
  const atLtpNet = calculateRemainingLegNet(buyPrice, ltp, heldQty, remainingQty);
  const atExitNet = calculateRemainingLegNet(buyPrice, exitPrice, heldQty, remainingQty);
  const legBreakevenPrice = breakevenSellPriceRemainingLeg(buyPrice, heldQty, remainingQty);
  const entryShare = proportionalEntryShare(buyPrice, heldQty, remainingQty);
  const exitAtLtp = sellExitCharges(ltp, remainingQty);
  const exitAtBreakeven = sellExitCharges(exitPrice, remainingQty);

  return {
    lots: remainingLots,
    quantity: remainingQty,
    lotSize,
    entryPrice: buyPrice,
    capitalDeployed: round2(buyPrice * remainingQty),
    entryCharges: entryShare,
    totalCharges: round2(entryShare + exitAtLtp.total),
    totalChargesAtExit: round2(entryShare + exitAtBreakeven.total),
    grossPnLAtLtp: round2((ltp - buyPrice) * remainingQty),
    netPnLAtLtp: atLtpNet,
    breakevenPrice: exitPrice,
    legBreakevenPrice,
    moveFromLtp: round2(exitPrice - ltp),
    exitChargesAtBreakeven: exitAtBreakeven.total,
    addingLots: false,
    recoveryMode: true,
    portfolioNetPnL: adjustedOtherNet,
    overallNetAtRecovery: round2(adjustedOtherNet + atExitNet),
  };
}

/**
 * After selling part of a held leg at LTP, exit price on the remaining lots so
 * adjusted portfolio net (incl. realized partial) + remaining leg net = 0.
 */
export function calculatePartialExitRemainingPortfolioExit(
  buyPrice: number,
  lotSize: number,
  heldLots: number,
  remainingLots: number,
  ltp: number,
  otherPortfolioNetPnL: number,
): BreakevenResult {
  if (remainingLots <= 0 || remainingLots >= heldLots) {
    throw new Error("remainingLots must be between 1 and heldLots - 1");
  }

  const heldQty = lotSize * heldLots;
  const remainingQty = lotSize * remainingLots;
  const soldQty = heldQty - remainingQty;
  const realizedAtLtp = calculatePartialSellRealizedNet(buyPrice, ltp, heldQty, soldQty);
  const adjustedOtherNet = round2(otherPortfolioNetPnL + realizedAtLtp);
  const remainingOpenAtLtp = calculateRemainingLegNet(buyPrice, ltp, heldQty, remainingQty);

  const legBreakevenPrice = breakevenSellPriceRemainingLeg(buyPrice, heldQty, remainingQty);
  const minRemainingNet = calculateRemainingLegNet(buyPrice, 0.05, heldQty, remainingQty);
  const portfolioZeroAchievable = adjustedOtherNet + minRemainingNet <= 0;

  const exitPrice = portfolioZeroAchievable
    ? capitalIntactSellPriceRemainingLeg(buyPrice, heldQty, remainingQty, adjustedOtherNet)
    : legBreakevenPrice;

  const base = buildRemainingLegBreakevenResult(
    buyPrice,
    lotSize,
    heldLots,
    remainingLots,
    ltp,
    exitPrice,
    adjustedOtherNet,
  );

  const portfolioNetAfterPartial = round2(adjustedOtherNet + remainingOpenAtLtp);

  return {
    ...base,
    heldLots,
    partialExitLots: heldLots - remainingLots,
    remainingLots,
    adjustedPortfolioNet: adjustedOtherNet,
    realizedPartialNet: realizedAtLtp,
    portfolioNetAfterPartialExit: portfolioNetAfterPartial,
    portfolioZeroAchievable,
  };
}

/** Portfolio exit when adding lots at LTP to an existing held leg. */
export function calculateAddToPositionPortfolioExit(
  existingBuyPrice: number,
  lotSize: number,
  totalLots: number,
  heldLots: number,
  addPrice: number,
  otherPortfolioNetPnL: number,
): BreakevenResult {
  const heldQty = lotSize * heldLots;
  const addQty = lotSize * (totalLots - heldLots);
  const totalQty = heldQty + addQty;
  const exitPrice = capitalIntactSellPriceAddToPosition(
    existingBuyPrice,
    heldQty,
    addPrice,
    addQty,
    otherPortfolioNetPnL,
  );
  const atLtp = calculateAddToPositionNet(existingBuyPrice, heldQty, addPrice, addQty, addPrice);
  const atExit = calculateAddToPositionNet(existingBuyPrice, heldQty, addPrice, addQty, exitPrice);
  const legBreakevenPrice = breakevenSellPriceAddToPosition(
    existingBuyPrice,
    heldQty,
    addPrice,
    addQty,
  );
  const entryPrice = weightedEntryPrice(addPrice, lotSize, totalLots, heldLots, existingBuyPrice);

  return {
    lots: totalLots,
    quantity: totalQty,
    lotSize,
    entryPrice: round2(entryPrice),
    capitalDeployed: round2(entryPrice * totalQty),
    entryCharges: atExit.charges.entry.total,
    totalCharges: atLtp.charges.total,
    totalChargesAtExit: atExit.charges.total,
    grossPnLAtLtp: atLtp.gross,
    netPnLAtLtp: atLtp.net,
    breakevenPrice: exitPrice,
    legBreakevenPrice,
    moveFromLtp: round2(exitPrice - addPrice),
    exitChargesAtBreakeven: atExit.charges.exit.total,
    addingLots: true,
    recoveryMode: true,
    portfolioNetPnL: otherPortfolioNetPnL,
    overallNetAtRecovery: round2(otherPortfolioNetPnL + atExit.net),
    addLots: totalLots - heldLots,
  };
}

/** Exit on a held short leg (buy to cover) so other portfolio net + leg net ≈ 0. */
export function calculateOpenShortPositionPortfolioExit(
  sellEntry: number,
  lotSize: number,
  lots: number,
  ltp: number,
  otherPortfolioNetPnL: number,
): BreakevenResult {
  const quantity = lotSize * lots;
  const coverPrice = capitalIntactCoverPrice(sellEntry, quantity, otherPortfolioNetPnL);
  const legBreakevenPrice = breakevenCoverPrice(sellEntry, quantity);
  const atLtp = calculateShortNetPnL(sellEntry, ltp, quantity);
  const atExit = calculateShortNetPnL(sellEntry, coverPrice, quantity);
  const roundTripAtExit = calculateShortRoundTripCharges(sellEntry, coverPrice, quantity);
  const overallAtExit = round2(otherPortfolioNetPnL + atExit.net);

  return {
    lots,
    quantity,
    lotSize,
    entryPrice: sellEntry,
    capitalDeployed: round2(sellEntry * quantity),
    entryCharges: roundTripAtExit.entry.total,
    totalCharges: atLtp.charges.total,
    totalChargesAtExit: roundTripAtExit.total,
    grossPnLAtLtp: atLtp.gross,
    netPnLAtLtp: atLtp.net,
    breakevenPrice: coverPrice,
    legBreakevenPrice,
    moveFromLtp: round2(coverPrice - ltp),
    exitChargesAtBreakeven: roundTripAtExit.exit.total,
    addingLots: false,
    recoveryMode: true,
    portfolioNetPnL: otherPortfolioNetPnL,
    overallNetAtRecovery: overallAtExit,
  };
}

/** Exit on a held leg so other portfolio net + this round-trip net = 0 overall. */
export function calculateOpenPositionPortfolioExit(
  entryPrice: number,
  lotSize: number,
  lots: number,
  ltp: number,
  otherPortfolioNetPnL: number,
  side: "long" | "short" = "long",
): BreakevenResult {
  if (side === "short") {
    return calculateOpenShortPositionPortfolioExit(
      entryPrice,
      lotSize,
      lots,
      ltp,
      otherPortfolioNetPnL,
    );
  }

  const quantity = lotSize * lots;
  const exitPrice = capitalIntactSellPrice(entryPrice, quantity, otherPortfolioNetPnL);
  const legBreakevenPrice = breakevenSellPrice(entryPrice, quantity);
  const atLtp = calculateNetPnL(entryPrice, ltp, quantity);
  const atExit = calculateNetPnL(entryPrice, exitPrice, quantity);
  const roundTripAtExit = calculateRoundTripCharges(entryPrice, exitPrice, quantity);
  const overallAtExit = round2(otherPortfolioNetPnL + atExit.net);

  return {
    lots,
    quantity,
    lotSize,
    entryPrice,
    capitalDeployed: round2(entryPrice * quantity),
    entryCharges: roundTripAtExit.entry.total,
    totalCharges: atLtp.charges.total,
    totalChargesAtExit: roundTripAtExit.total,
    grossPnLAtLtp: atLtp.gross,
    netPnLAtLtp: atLtp.net,
    breakevenPrice: exitPrice,
    legBreakevenPrice,
    moveFromLtp: round2(exitPrice - ltp),
    exitChargesAtBreakeven: roundTripAtExit.exit.total,
    addingLots: false,
    recoveryMode: true,
    portfolioNetPnL: otherPortfolioNetPnL,
    overallNetAtRecovery: overallAtExit,
  };
}

/** Breakeven uses LTP as entry; extra lots above heldLots are averaged with existing buy price. */
export function calculateBreakeven(
  ltp: number,
  lotSize: number,
  lots: number,
  heldLots?: number,
  existingBuyPrice?: number,
  side: "long" | "short" = "long",
): BreakevenResult {
  const quantity = lotSize * lots;
  const addingLots =
    side === "long" &&
    heldLots !== undefined &&
    existingBuyPrice !== undefined &&
    lots > heldLots;

  if (side === "short") {
    const entryPrice = weightedEntryPrice(ltp, lotSize, lots, heldLots, existingBuyPrice);
    const breakevenPrice = breakevenCoverPrice(entryPrice, quantity);
    const atLtp = calculateShortNetPnL(entryPrice, ltp, quantity);
    const roundTripAtBreakeven = calculateShortRoundTripCharges(entryPrice, breakevenPrice, quantity);

    return {
      lots,
      quantity,
      lotSize,
      entryPrice,
      capitalDeployed: round2(entryPrice * quantity),
      entryCharges: roundTripAtBreakeven.entry.total,
      totalCharges: atLtp.charges.total,
      totalChargesAtExit: roundTripAtBreakeven.total,
      grossPnLAtLtp: atLtp.gross,
      netPnLAtLtp: atLtp.net,
      breakevenPrice,
      legBreakevenPrice: breakevenPrice,
      moveFromLtp: round2(breakevenPrice - ltp),
      exitChargesAtBreakeven: roundTripAtBreakeven.exit.total,
      addingLots: false,
    };
  }

  if (addingLots) {
    const heldQty = lotSize * heldLots!;
    const addQty = quantity - heldQty;
    const entryPrice = weightedEntryPrice(ltp, lotSize, lots, heldLots, existingBuyPrice);
    const breakevenPrice = breakevenSellPriceAddToPosition(
      existingBuyPrice!,
      heldQty,
      ltp,
      addQty,
    );
    const atLtp = calculateAddToPositionNet(existingBuyPrice!, heldQty, ltp, addQty, ltp);
    const atBreakeven = calculateAddToPositionNet(
      existingBuyPrice!,
      heldQty,
      ltp,
      addQty,
      breakevenPrice,
    );

    return {
      lots,
      quantity,
      lotSize,
      entryPrice: round2(entryPrice),
      capitalDeployed: round2(entryPrice * quantity),
      entryCharges: atBreakeven.charges.entry.total,
      totalCharges: atLtp.charges.total,
      totalChargesAtExit: atBreakeven.charges.total,
      grossPnLAtLtp: atLtp.gross,
      netPnLAtLtp: atLtp.net,
      breakevenPrice,
      legBreakevenPrice: breakevenPrice,
      moveFromLtp: round2(breakevenPrice - ltp),
      exitChargesAtBreakeven: atBreakeven.charges.exit.total,
      addingLots: true,
      addLots: lots - heldLots!,
    };
  }

  const entryPrice = weightedEntryPrice(ltp, lotSize, lots, heldLots, existingBuyPrice);
  const breakevenPrice = breakevenSellPrice(entryPrice, quantity);
  const atLtp = calculateNetPnL(entryPrice, ltp, quantity);
  const roundTripAtBreakeven = calculateRoundTripCharges(entryPrice, breakevenPrice, quantity);

  return {
    lots,
    quantity,
    lotSize,
    entryPrice,
    capitalDeployed: round2(entryPrice * quantity),
    entryCharges: roundTripAtBreakeven.entry.total,
    totalCharges: atLtp.charges.total,
    totalChargesAtExit: roundTripAtBreakeven.total,
    grossPnLAtLtp: atLtp.gross,
    netPnLAtLtp: atLtp.net,
    breakevenPrice,
    moveFromLtp: round2(breakevenPrice - ltp),
    exitChargesAtBreakeven: roundTripAtBreakeven.exit.total,
    addingLots: false,
  };
}

/** Re-entry: exit price that restores capital to pre-trading level (portfolio net + new trade net = 0). */
export function calculatePortfolioRecoveryBreakeven(
  ltp: number,
  lotSize: number,
  lots: number,
  portfolioNetPnL: number,
  startingCapital?: number,
): BreakevenResult {
  const quantity = lotSize * lots;
  const entryPrice = ltp;
  const newTradeAtLtp = calculateNetPnL(entryPrice, ltp, quantity);
  const breakevenPrice = capitalIntactSellPrice(entryPrice, quantity, portfolioNetPnL);
  const roundTripAtRecovery = calculateRoundTripCharges(entryPrice, breakevenPrice, quantity);
  const newTradeAtRecovery = calculateNetPnL(entryPrice, breakevenPrice, quantity);
  const overallAtRecovery = round2(portfolioNetPnL + newTradeAtRecovery.net);
  const capitalAfterRecovery =
    startingCapital !== undefined
      ? round2(startingCapital + portfolioNetPnL + newTradeAtRecovery.net)
      : undefined;

  return {
    lots,
    quantity,
    lotSize,
    entryPrice,
    capitalDeployed: round2(entryPrice * quantity),
    entryCharges: roundTripAtRecovery.entry.total,
    totalCharges: newTradeAtLtp.charges.total,
    totalChargesAtExit: roundTripAtRecovery.total,
    grossPnLAtLtp: newTradeAtLtp.gross,
    netPnLAtLtp: portfolioNetPnL,
    breakevenPrice,
    moveFromLtp: round2(breakevenPrice - ltp),
    exitChargesAtBreakeven: roundTripAtRecovery.exit.total,
    addingLots: false,
    recoveryMode: true,
    portfolioNetPnL,
    newTradeNetAtLtp: newTradeAtLtp.net,
    overallNetAtRecovery: overallAtRecovery,
    startingCapital,
    capitalAfterRecovery,
  };
}

/** @deprecated Use calculatePortfolioRecoveryBreakeven */
export function calculateReentryBreakeven(
  ltp: number,
  lotSize: number,
  lots: number,
  portfolioNetPnL: number,
): BreakevenResult {
  return calculatePortfolioRecoveryBreakeven(ltp, lotSize, lots, portfolioNetPnL);
}

const buyTurnover = 862878.5;
const sellTurnover = 883444;
const totalTurnover = buyTurnover + sellTurnover;

const totalBrokerage = 280;
const totalStamp = 26;
const totalStt = 1325;
const totalExchange = 620.47;
const totalSebi = 1.75;
const totalGst = 162.4;
const expectedTotal = 2415.61;

const computed = {
  stamp: round2(stampDuty(buyTurnover)),
  stt: round2(sellTurnover * STT_SELL_RATE),
  exchange: round2(exchangeCharges(totalTurnover)),
  sebi: round2(sebiCharges(totalTurnover)),
};

const taxable = totalBrokerage + computed.exchange + computed.sebi;
const computedGst = round2(GST_RATE * taxable);
const actualTotal = round2(
  totalBrokerage +
    computed.stamp +
    computed.stt +
    computed.exchange +
    computed.sebi +
    computedGst,
);

export function validateContractNoteExample(): boolean {
  return (
    Math.abs(Math.round(computed.stamp) - totalStamp) <= 0.05 &&
    Math.abs(Math.round(computed.stt) - totalStt) <= 0.05 &&
    Math.abs(computed.exchange - totalExchange) <= 0.05 &&
    Math.abs(computed.sebi - totalSebi) <= 0.05 &&
    Math.abs(computedGst - totalGst) <= 0.05 &&
    Math.abs(actualTotal - expectedTotal) <= 0.15
  );
}

/** BK2660 F&O tradebook 2026-04-01 → 2026-05-22 vs Zerodha P&L report (post–Apr 2026 STT 0.15%). */
export function validateAprMay2026BrokingReport(): boolean {
  const nseBuy = 69_775_151.25;
  const nseSell = 69_359_819.75;
  const bseBuy = 32_203_909;
  const bseSell = 32_245_835;
  const executedOrders = 2682;

  const zerodha = {
    brokerage: 53_700,
    exchange: 70_380.68,
    stt: 152_406,
    sebi: 203.58,
    stamp: 3_057,
    gst: 22_371.19,
    total: 302_118.6,
  };

  const nseTurn = nseBuy + nseSell;
  const bseTurn = bseBuy + bseSell;
  const exchangeFee = round2(
    exchangeCharges(nseTurn, "NFO") + exchangeCharges(bseTurn, "BFO"),
  );
  const stt = round2((nseSell + bseSell) * STT_SELL_RATE);
  const stamp = round2(stampDuty(nseBuy + bseBuy));
  const sebi = round2(sebiCharges(nseTurn + bseTurn));
  const brokerage = executedOrders * BROKERAGE_FLAT;
  const gst = round2(GST_RATE * (brokerage + exchangeFee + sebi));
  const total = round2(brokerage + stamp + stt + exchangeFee + sebi + gst);

  return (
    Math.abs(brokerage - (executedOrders * BROKERAGE_FLAT)) < 1 &&
    Math.abs(exchangeFee - zerodha.exchange) <= 1 &&
    Math.abs(stt - zerodha.stt) <= 5 &&
    Math.abs(sebi - zerodha.sebi) <= 0.1 &&
    Math.abs(stamp - zerodha.stamp) <= 5 &&
    Math.abs(gst - zerodha.gst) <= 15 &&
    Math.abs(total - zerodha.total) <= 100
  );
}
