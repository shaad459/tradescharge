/** NSE cash session (IST), Mon–Fri approximate. */
export function isNseMarketOpen(now = new Date()): boolean {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  if (day === 0 || day === 6) {
    return false;
  }
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function macroContextPollMs(): number {
  return isNseMarketOpen() ? 3_000 : 30_000;
}
