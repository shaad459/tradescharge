import type { OptionChainRow, OptionChainSummary } from "../types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSummaryFromChain(chain: OptionChainRow[], spot: number): OptionChainSummary {
  if (chain.length === 0) {
    return { pcr: 0, maxPain: spot, atmIv: 0, ivPercentile: 0 };
  }

  let callOi = 0;
  let putOi = 0;
  for (const row of chain) {
    callOi += row.ce?.oi ?? 0;
    putOi += row.pe?.oi ?? 0;
  }

  let minPain = Number.POSITIVE_INFINITY;
  let maxPain = spot;
  for (const candidate of chain) {
    let pain = 0;
    for (const row of chain) {
      if (row.ce) {
        pain += row.ce.oi * Math.max(0, candidate.strike - row.strike);
      }
      if (row.pe) {
        pain += row.pe.oi * Math.max(0, row.strike - candidate.strike);
      }
    }
    if (pain < minPain) {
      minPain = pain;
      maxPain = candidate.strike;
    }
  }

  const atmRow =
    chain.find((row) => row.isAtm) ??
    chain.reduce((best, row) =>
      Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best,
    chain[0]);

  const atmCeIv = atmRow?.ce?.iv ?? 0;
  const atmPeIv = atmRow?.pe?.iv ?? 0;
  const atmIv =
    atmCeIv > 0 && atmPeIv > 0
      ? round2((atmCeIv + atmPeIv) / 2)
      : round2(Math.max(atmCeIv, atmPeIv));

  return {
    pcr: callOi > 0 ? round2(putOi / callOi) : 0,
    maxPain,
    atmIv,
    ivPercentile: 0,
  };
}

export function withIvPercentile(
  summary: OptionChainSummary,
  ivPercentile: number,
): OptionChainSummary {
  return { ...summary, ivPercentile };
}
