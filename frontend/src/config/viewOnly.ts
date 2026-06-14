/** Read-only by default. Set VITE_ENABLE_TRADING=true for the trading build. */
export const VIEW_ONLY = import.meta.env.VITE_ENABLE_TRADING !== "true";
