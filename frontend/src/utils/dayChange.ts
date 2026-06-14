const IST_TIMEZONE = "Asia/Kolkata";

const STORAGE_PREFIX = "tc_day_start_v1";



export function istDateKey(date: Date | string = new Date()): string {

  const value = typeof date === "string" ? new Date(date) : date;

  return new Intl.DateTimeFormat("en-CA", {

    timeZone: IST_TIMEZONE,

    year: "numeric",

    month: "2-digit",

    day: "2-digit",

  }).format(value);

}



function storageKey(mode: "demo" | "live"): string {

  return `${STORAGE_PREFIX}:${mode}:${istDateKey()}`;

}



/** Day change vs Kite opening balance when available; else first balance seen today (IST). */

export function getDayChangePct(

  balance: number,

  mode: "demo" | "live",

  openingBalance?: number,

): number {

  if (!Number.isFinite(balance)) {

    return 0;

  }



  if (openingBalance != null && Number.isFinite(openingBalance) && openingBalance > 0) {

    return Math.round(((balance - openingBalance) / openingBalance) * 10000) / 100;

  }



  const key = storageKey(mode);

  const stored = localStorage.getItem(key);



  if (stored == null) {

    localStorage.setItem(key, String(balance));

    return 0;

  }



  const dayStart = Number(stored);

  if (!Number.isFinite(dayStart) || dayStart <= 0) {

    localStorage.setItem(key, String(balance));

    return 0;

  }



  return Math.round(((balance - dayStart) / dayStart) * 10000) / 100;

}

