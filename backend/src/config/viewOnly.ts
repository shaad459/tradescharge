/** Read-only by default. Set ENABLE_TRADING=true for the trading build. */
export const isViewOnly = (): boolean => process.env.ENABLE_TRADING !== "true";
