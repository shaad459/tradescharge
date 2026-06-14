export type TradingMode = "demo" | "live";

const STORAGE_KEY = "tradescharge-trading-mode";
const COOKIE_MAX_AGE = 8 * 60 * 60;

export function setTradingMode(mode: TradingMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  document.cookie = `tc_trading_mode=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearTradingMode() {
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = `tc_trading_mode=; path=/; max-age=0; SameSite=Lax`;
}

export function getTradingMode(): TradingMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "demo" || stored === "live") {
    return stored;
  }
  return "demo";
}
