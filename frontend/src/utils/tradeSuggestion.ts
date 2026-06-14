import type { TradeSuggestion } from "../types";

import { formatCurrency } from "./format";



const CALC_DISCLAIMER =

  "Illustrative calculation from your positions and charge assumptions — not a trade recommendation.";



function fmt(n: number): string {

  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

}



export function buildPortfolioAwareSuggestion(

  positionNet: number,

  exitPrice: number,

  totalPortfolioNet: number,

  _otherNet: number,

  _ltp: number,

  legBreakevenPrice?: number,

  partialExitLots?: number,

  side: "long" | "short" = "long",

): TradeSuggestion {

  const legNote =

    positionNet >= 0

      ? `Position P&L at LTP is +₹${fmt(positionNet)}.`

      : `Position P&L at LTP is −₹${fmt(Math.abs(positionNet))}.`;



  const exitVerb = side === "short" ? "cover buy" : "exit sell";

  const legBeNote =

    legBreakevenPrice !== undefined && Math.abs(legBreakevenPrice - exitPrice) > 0.05

      ? ` Position-only zero-net ${exitVerb} (active lots, charges included) is ₹${fmt(legBreakevenPrice)}.`

      : "";



  const partialNote =

    partialExitLots !== undefined && partialExitLots > 0

      ? ` Assumes ${partialExitLots} lot${partialExitLots > 1 ? "s" : ""} exited at LTP in the model.`

      : "";



  const portfolioNote =

    totalPortfolioNet >= 0

      ? `Portfolio net is +₹${fmt(totalPortfolioNet)}.`

      : `Portfolio net is −₹${fmt(Math.abs(totalPortfolioNet))}.`;



  return {

    type: totalPortfolioNet >= 0 ? "profit_sl" : "loss_target",

    price: exitPrice,

    label: partialExitLots

      ? side === "short"

        ? "Portfolio zero-net cover (remaining lots)"

        : "Portfolio zero-net exit price (remaining lots)"

      : side === "short"

        ? "Portfolio zero-net cover price"

        : "Portfolio zero-net exit price",

    reason: `${portfolioNote} At a ${exitVerb} of ₹${fmt(exitPrice)} on active lots, estimated overall portfolio net after all charges would be ~₹0.${partialNote}${legBeNote} ${legNote}`,

    netAtPrice: 0,

    meta: `Modeled portfolio net at this price: ~₹0 (portfolio net now ₹${fmt(totalPortfolioNet)}). ${CALC_DISCLAIMER}`,

  };

}



export function buildTradeSuggestion(netPnL: number, breakevenPrice: number): TradeSuggestion {

  if (netPnL >= 0) {

    return {

      type: "profit_sl",

      price: breakevenPrice,

      label: "Zero-net exit price (this leg)",

      reason:

        "At LTP entry, this is the modeled exit where net P&L on this leg after round-trip charges would be ~₹0.",

      netAtPrice: 0,

      meta: CALC_DISCLAIMER,

    };

  }



  return {

    type: "loss_target",

    price: breakevenPrice,

    label: "Zero-net exit price (this leg)",

    reason:

      "At LTP entry, this is the modeled exit where net P&L on this leg after round-trip charges would be ~₹0.",

    netAtPrice: 0,

    meta: CALC_DISCLAIMER,

  };

}



export function buildPortfolioRecoverySuggestion(

  portfolioNetPnL: number,

  recoveryPrice: number,

  startingCapital?: number,

): TradeSuggestion {

  const capitalLabel =

    startingCapital !== undefined ? formatCurrency(startingCapital) : "your pre-trading capital";



  const label = "Capital-intact zero-net exit price";



  if (portfolioNetPnL >= 0) {

    return {

      type: "profit_sl",

      price: recoveryPrice,

      label,

      reason: `Modeled exit at ₹${fmt(recoveryPrice)} where capital would return to ${capitalLabel}, absorbing portfolio profit and round-trip charges on this leg.`,

      netAtPrice: 0,

      meta: `Modeled capital after exit: ${capitalLabel}. ${CALC_DISCLAIMER}`,

    };

  }



  return {

    type: "loss_target",

    price: recoveryPrice,

    label,

    reason: `Modeled exit at ₹${fmt(recoveryPrice)} where capital would return to ${capitalLabel}, recovering portfolio loss and round-trip charges on this leg.`,

    netAtPrice: 0,

    meta: `Modeled capital after exit: ${capitalLabel}. ${CALC_DISCLAIMER}`,

  };

}



/** @deprecated Use buildPortfolioRecoverySuggestion */

export function buildReentryTradeSuggestion(

  portfolioNetPnL: number,

  recoveryPrice: number,

): TradeSuggestion {

  return buildPortfolioRecoverySuggestion(portfolioNetPnL, recoveryPrice);

}

