import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG, INDEX_SYMBOLS } from "../constants.js";
import { atmStrikeForSpot } from "./kiteInstruments.js";
import type { IndexTicker, OptionChainResponse, OptionLeg } from "../types.js";
import { computeSummaryFromChain } from "./optionChainSummary.js";
import { getCachedMarketTick } from "./kiteTickCache.js";
import { collectChainIvs, enrichChainWithIv } from "./optionChainIv.js";
import { dayChangeFromPreviousClose } from "./indexDayChange.js";
import { computeSessionOiChange } from "./oiSession.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyTickToLeg(userId: string, leg: OptionLeg): OptionLeg {
  const token = leg.instrumentToken;
  if (token == null) {
    return leg;
  }

  const tick = getCachedMarketTick(userId, token);
  if (!tick) {
    return leg;
  }

  const oi = tick.oi ?? leg.oi;
  const oiChange =
    token > 0
      ? computeSessionOiChange(token, oi, tick.oiDayLow ?? 0)
      : leg.oiChange;

  return {
    ...leg,
    ltp: tick.lastPrice,
    ltpChange: tick.netChange ?? leg.ltpChange,
    oi,
    oiChange,
    volume: Math.max(leg.volume, tick.volume ?? 0),
  };
}

export function enrichOptionChainFromTickCache(
  userId: string,
  chain: OptionChainResponse,
  indexToken?: number,
): OptionChainResponse {
  const config = INDEX_CONFIG[chain.symbol as IndexSymbol];
  let spotPrice = chain.spotPrice;
  let spotChange = chain.spotChange;
  let spotChangePct = chain.spotChangePct;

  if (indexToken != null) {
    const indexTick = getCachedMarketTick(userId, indexToken);
    if (indexTick) {
      spotPrice = indexTick.lastPrice;
      spotChange = indexTick.netChange ?? spotChange;
      spotChangePct =
        indexTick.netChangePct ??
        (spotPrice > 0 && spotChange !== 0
          ? dayChangeFromPreviousClose(spotPrice, spotPrice - spotChange).spotChangePct
          : spotChangePct);
    }
  }

  const atmStrike = atmStrikeForSpot(chain.symbol as IndexSymbol, spotPrice);
  const updatedChain = chain.chain.map((row) => ({
    ...row,
    isAtm: row.strike === atmStrike,
    ce: row.ce ? applyTickToLeg(userId, row.ce) : null,
    pe: row.pe ? applyTickToLeg(userId, row.pe) : null,
  }));

  const withIv = enrichChainWithIv({
    ...chain,
    spotPrice,
    spotChange: round2(spotChange),
    spotChangePct,
    chain: updatedChain,
    summary: computeSummaryFromChain(updatedChain, spotPrice),
    liveData: true,
  });

  const summary = {
    pcr: withIv.summary.pcr > 0 ? withIv.summary.pcr : chain.summary.pcr,
    maxPain: withIv.summary.maxPain > 0 ? withIv.summary.maxPain : chain.summary.maxPain,
    atmIv: withIv.summary.atmIv > 0 ? withIv.summary.atmIv : chain.summary.atmIv,
    ivPercentile:
      withIv.summary.ivPercentile > 0 ? withIv.summary.ivPercentile : chain.summary.ivPercentile,
  };

  return { ...withIv, summary };
}

export function buildIndexTickersFromCache(
  userId: string,
  indexTokens: Partial<Record<IndexSymbol, number>>,
): IndexTicker[] {
  return INDEX_SYMBOLS.map((symbol) => {
    const config = INDEX_CONFIG[symbol];
    const token = indexTokens[symbol];
    const tick = token != null ? getCachedMarketTick(userId, token) : undefined;

    if (!tick) {
      return {
        symbol,
        label: config.label,
        spotPrice: config.spotPrice,
        spotChange: 0,
        spotChangePct: 0,
      };
    }

    const spotChange = tick.netChange ?? 0;
    const spotChangePct =
      tick.netChangePct ??
      (tick.lastPrice > 0 && spotChange !== 0
        ? dayChangeFromPreviousClose(tick.lastPrice, tick.lastPrice - spotChange).spotChangePct
        : 0);

    return {
      symbol,
      label: config.label,
      spotPrice: tick.lastPrice,
      spotChange: round2(spotChange),
      spotChangePct,
    };
  });
}
