import type { OptionChainResponse, OptionLeg } from "../types.js";
import { impliedVolatilityPercent, yearsToExpiry } from "./impliedVol.js";
import { computeSummaryFromChain } from "./optionChainSummary.js";

function legIv(
  leg: OptionLeg,
  spot: number,
  timeYears: number,
): number {
  const computed = impliedVolatilityPercent(
    spot,
    leg.strike,
    leg.ltp,
    timeYears,
    leg.instrumentType === "CE",
  );
  return computed ?? leg.iv ?? 0;
}

export function enrichChainWithIv(chain: OptionChainResponse): OptionChainResponse {
  const timeYears = yearsToExpiry(chain.expiry);
  const spot = chain.spotPrice;

  const updatedChain = chain.chain.map((row) => ({
    ...row,
    ce: row.ce ? { ...row.ce, iv: legIv(row.ce, spot, timeYears) } : null,
    pe: row.pe ? { ...row.pe, iv: legIv(row.pe, spot, timeYears) } : null,
  }));

  return {
    ...chain,
    chain: updatedChain,
    summary: computeSummaryFromChain(updatedChain, spot),
  };
}

export function collectChainIvs(chain: OptionChainResponse): number[] {
  const ivs: number[] = [];
  for (const row of chain.chain) {
    if (row.ce?.iv && row.ce.iv > 0) {
      ivs.push(row.ce.iv);
    }
    if (row.pe?.iv && row.pe.iv > 0) {
      ivs.push(row.pe.iv);
    }
  }
  return ivs;
}
