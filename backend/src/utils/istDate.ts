const IST_TIMEZONE = "Asia/Kolkata";

export function istDateKey(date: Date | string = new Date()): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function yesterdayIstIso(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}
