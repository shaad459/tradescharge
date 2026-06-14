/** Black–Scholes implied volatility for index options (European approximation). */

const RISK_FREE_RATE = 0.07;

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - prob : prob;
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bsPrice(
  spot: number,
  strike: number,
  timeYears: number,
  vol: number,
  isCall: boolean,
  rate = RISK_FREE_RATE,
): number {
  if (timeYears <= 0 || vol <= 0) {
    const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    return intrinsic;
  }

  const sqrtT = Math.sqrt(timeYears);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * timeYears) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  if (isCall) {
    return spot * normCdf(d1) - strike * Math.exp(-rate * timeYears) * normCdf(d2);
  }
  return strike * Math.exp(-rate * timeYears) * normCdf(-d2) - spot * normCdf(-d1);
}

function bsVega(spot: number, strike: number, timeYears: number, vol: number, rate = RISK_FREE_RATE): number {
  if (timeYears <= 0 || vol <= 0) {
    return 0;
  }
  const sqrtT = Math.sqrt(timeYears);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * timeYears) / (vol * sqrtT);
  return spot * normPdf(d1) * sqrtT;
}

/** Years to expiry (expiry day 3:30 PM IST). */
export function yearsToExpiry(expiryIso: string, now = new Date()): number {
  const expiryClose = new Date(`${expiryIso}T15:30:00+05:30`);
  const ms = Math.max(0, expiryClose.getTime() - now.getTime());
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

/** Implied vol in percent (e.g. 14.2). Returns null if not solvable. */
export function impliedVolatilityPercent(
  spot: number,
  strike: number,
  optionPrice: number,
  timeYears: number,
  isCall: boolean,
): number | null {
  if (optionPrice <= 0 || spot <= 0 || strike <= 0 || timeYears <= 0) {
    return null;
  }

  const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (optionPrice <= intrinsic + 0.05) {
    return null;
  }

  let vol = 0.25;
  for (let i = 0; i < 60; i++) {
    const model = bsPrice(spot, strike, timeYears, vol, isCall);
    const diff = model - optionPrice;
    if (Math.abs(diff) < 0.01) {
      return Math.round(vol * 1000) / 10;
    }
    const vega = bsVega(spot, strike, timeYears, vol);
    if (vega < 1e-8) {
      break;
    }
    vol -= diff / vega;
    vol = Math.max(0.001, Math.min(3, vol));
  }

  return null;
}
