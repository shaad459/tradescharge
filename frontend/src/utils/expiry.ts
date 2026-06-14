const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istTodayStart(): Date {
  const parts = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function parseExpiryDate(expiry: string): Date {
  const [y, m, d] = expiry.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayDiff(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 86_400_000);
}

/** Kite-style relative label: "2 days", "1 week", "4 months", "1.5 years". */
export function formatRelativeExpiry(expiry: string, now = istTodayStart()): string {
  const exp = parseExpiryDate(expiry);
  const diffDays = dayDiff(now, exp);

  if (diffDays <= 0) {
    return "0 days";
  }
  if (diffDays === 1) {
    return "1 day";
  }
  if (diffDays < 7) {
    return `${diffDays} days`;
  }
  if (diffDays <= 13) {
    return `${diffDays} days`;
  }

  const weeks = Math.round(diffDays / 7);
  if (weeks <= 4) {
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }

  if (diffDays >= 25 && diffDays <= 38) {
    return "1 month";
  }

  const months = Math.max(1, Math.round(diffDays / 30.44));
  if (months < 12) {
    return months === 1 ? "1 month" : `${months} months`;
  }

  const years = diffDays / 365.25;
  if (years < 1.25) {
    return "1 year";
  }

  const roundedHalf = Math.round(years * 2) / 2;
  if (Number.isInteger(roundedHalf)) {
    return `${roundedHalf} years`;
  }
  return `${roundedHalf} years`;
}

function getMonthlyExpiries(expiries: string[]): Set<string> {
  const byMonth = new Map<string, string[]>();
  for (const date of expiries) {
    const key = date.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(date);
    byMonth.set(key, list);
  }

  const monthly = new Set<string>();
  for (const dates of byMonth.values()) {
    dates.sort();
    monthly.add(dates[dates.length - 1]);
  }
  return monthly;
}

export function isWeeklyExpiry(expiry: string, allExpiries: string[]): boolean {
  return !getMonthlyExpiries(allExpiries).has(expiry);
}

export function formatExpiryLabel(expiry: string): string {
  const date = parseExpiryDate(expiry);
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const relative = formatRelativeExpiry(expiry);
  return `${day} ${month} (${relative})`;
}

export function formatExpiryShort(expiry: string): string {
  return formatExpiryLabel(expiry);
}

/** Full date for toolbar stamp, e.g. "26 May 2025". */
export function formatExpiryStamp(expiry: string): string {
  const date = parseExpiryDate(expiry);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export const EXPIRY_QUICK_COUNT = 3;
