import fs from "fs";

const AUDIT =
  "d:/Tradescharge/backend/data/kite-audit/29d648fef2ad84510ae9e08a/2026-05-26/latest.json";

/** From BK2660_2026-05-26_2026-05-27.pdf summary (page 4). */
const CN = {
  payInOutObligation: 7645,
  brokerage: 1920,
  exchange: 2926.53,
  gst: 873.87,
  stt: 6252,
  sebi: 8.33,
  stamp: 125,
  netPayable: -4460.73,
};

/** Contract summary table (page 1): sell proceeds + buy cost (buy shown negative). */
const CN_SYMBOL_GROSS: Record<string, number> = {
  BANKNIFTY26MAY54500CE: -311,
  BANKNIFTY26MAY54600CE: 13727,
  BANKNIFTY26MAY54800CE: -14749,
  BANKNIFTY26MAY55000CE: 36130.5,
  BANKNIFTY26MAY55600PE: 5,
  BANKNIFTY26MAY56000PE: -4963.5,
  NIFTY26MAY23600CE: 1949,
  NIFTY26MAY23800CE: -1481.75,
  NIFTY26MAY23900CE: -1965,
  NIFTY26MAY24100PE: -593.5,
  NIFTY26MAY24200PE: 637.25,
  SENSEX26MAY75400CE: -10075,
  SENSEX26MAY75500CE: -11622,
  SENSEX26MAY76000CE: 34,
  SENSEX26MAY77000PE: -997,
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
const enriched = audit.derived.enrichedClosed as Array<{
  tradingsymbol: string;
  pnl: { gross: number; net: number; charges: { total: number } };
  kiteGrossPnL: number;
}>;

let appGross = 0;
let appCharges = 0;
let appNet = 0;
let appBrokerage = 0;
let appStamp = 0;
let appStt = 0;
let appExchange = 0;
let appSebi = 0;
let appGst = 0;

console.log("\n=== PER SYMBOL (App vs CN contract table) ===\n");
for (const p of enriched) {
  appGross += p.pnl.gross;
  appCharges += p.pnl.charges.total;
  appNet += p.pnl.net;
  const e = p.pnl.charges as { entry: Record<string, number>; exit: Record<string, number> };
  const entry = e.entry ?? (p.pnl.charges as unknown as { entry: Record<string, number> }).entry;
  const exit = e.exit ?? (p.pnl.charges as unknown as { exit: Record<string, number> }).exit;
  if (entry && exit) {
    appBrokerage += entry.brokerage + exit.brokerage;
    appStamp += entry.stampDuty + exit.stampDuty;
    appStt += entry.stt + exit.stt;
    appExchange += entry.exchangeCharges + exit.exchangeCharges;
    appSebi += entry.sebiCharges + exit.sebiCharges;
    appGst += entry.gst + exit.gst;
  }
  const cnG = CN_SYMBOL_GROSS[p.tradingsymbol];
  const diff = cnG != null ? round2(p.pnl.gross - cnG) : null;
  console.log(
    `${p.tradingsymbol} | app ${p.pnl.gross} | cn ${cnG ?? "n/a"} | diff ${diff ?? "n/a"}`,
  );
}

const cnTableGross = round2(
  Object.values(CN_SYMBOL_GROSS).reduce((s, v) => s + v, 0),
);
const cnCharges = round2(
  CN.brokerage + CN.exchange + CN.gst + CN.stt + CN.sebi + CN.stamp,
);

console.log("\n=== TOTALS ===\n");
console.log("CN pay-in/out obligation (gross):", CN.payInOutObligation);
console.log("CN contract-table gross sum:     ", cnTableGross);
console.log("CN total charges:                ", cnCharges);
console.log("CN net payable:                  ", CN.netPayable);
console.log("CN check gross - charges:        ", round2(CN.payInOutObligation - cnCharges));

console.log("\nAPP (audit snapshot ~2:38 PM IST):");
console.log({
  gross: round2(appGross),
  charges: round2(appCharges),
  net: round2(appNet),
});
console.log("APP charge breakdown:", {
  brokerage: round2(appBrokerage),
  exchange: round2(appExchange),
  gst: round2(appGst),
  stt: round2(appStt),
  sebi: round2(appSebi),
  stamp: round2(appStamp),
});

console.log("\n=== DELTA (App vs Contract Note) ===\n");
console.log({
  grossVsPayInOut: round2(appGross - CN.payInOutObligation),
  grossVsTable: round2(appGross - cnTableGross),
  chargesDiff: round2(appCharges - cnCharges),
  netDiff: round2(appNet - CN.netPayable),
});

const trades = audit.raw.trades as Array<{ fill_timestamp: string }>;
const times = trades.map((t) => t.fill_timestamp).sort();
console.log("\nAudit trades:", trades.length, "first", times[0], "last", times[times.length - 1]);
