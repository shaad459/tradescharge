import type { TradeSuggestion } from "../types.js";



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

  _partialExitLots?: number,

  side: "long" | "short" = "long",

): TradeSuggestion {

  const legNote =

    positionNet >= 0

      ? `Position P&L at LTP is +₹${fmt(positionNet)}.`

      : `Position P&L at LTP is −₹${fmt(Math.abs(positionNet))}.`;



  const exitVerb = side === "short" ? "cover buy" : "exit sell";

  const legBeNote =

    legBreakevenPrice !== undefined &&

    Math.abs(legBreakevenPrice - exitPrice) > 0.05

      ? ` Position-only zero-net ${exitVerb} (active lots, charges included) is ₹${fmt(legBreakevenPrice)}.`

      : "";



  const portfolioNote =

    totalPortfolioNet >= 0

      ? `Portfolio net is +₹${fmt(totalPortfolioNet)}.`

      : `Portfolio net is −₹${fmt(Math.abs(totalPortfolioNet))}.`;



  return {

    type: totalPortfolioNet >= 0 ? "profit_sl" : "loss_target",

    price: exitPrice,

    label:
      side === "short"
        ? "Portfolio zero-net cover price"
        : "Portfolio zero-net exit price",

    reason: `${portfolioNote} At a ${exitVerb} of ₹${fmt(exitPrice)} on active lots, estimated overall portfolio net after all charges would be ~₹0.${legBeNote} ${legNote}`,

    netAtPrice: 0,

    meta: `Modeled portfolio net at this price: ~₹0 (portfolio net now ₹${fmt(totalPortfolioNet)}). ${CALC_DISCLAIMER}`,

  };

}



/** @deprecated Use buildPortfolioAwareSuggestion */

export function buildTradeSuggestion(

  _buyPrice: number,

  _ltp: number,

  _quantity: number,

  _lotSize: number,

  netPnL: number,

  breakevenPrice: number,

): TradeSuggestion {

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

