export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatIndexPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Option premium / strike-style price in points (no currency symbol). */
export function formatOptionPrice(value: number): string {
  return formatIndexPrice(value);
}

/** Signed point move, e.g. +2.50 or -1.25 */
export function formatPointMove(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatOptionPrice(value)}`;
}

export function formatPercentChange(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function pctChange(current: number, delta: number): number {
  const previous = current - delta;
  if (previous === 0) {
    return 0;
  }
  return (delta / previous) * 100;
}

export function oiInLakhs(oi: number): string {
  return (oi / 100_000).toFixed(2);
}

export function formatIndianCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) {
    return `${sign}${(abs / 1e7).toFixed(2)}Cr`;
  }
  if (abs >= 1e5) {
    return `${sign}${(abs / 1e5).toFixed(2)}L`;
  }
  if (abs >= 1e3) {
    return `${sign}${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}${abs.toFixed(0)}`;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function pnlClass(value: number): string {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function formatMacroDayChange(id: string, change: number): string {
  const sign = change > 0 ? "+" : "";
  if (id === "USDINR" || id === "VIX") {
    return `${sign}${change.toFixed(2)}`;
  }
  return `${sign}${formatIndexPrice(Math.abs(change))}`;
}

export function formatExpiryTab(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
