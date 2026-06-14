import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const AUDIT =
  "d:/Tradescharge/backend/data/kite-audit/29d648fef2ad84510ae9e08a/2026-05-25/latest.json";
const TRADEBOOK = "c:/Users/shaad/Downloads/tradebook-BK2660-FO (1).csv";
const PNL_XLSX = "c:/Users/shaad/Downloads/pnl-BK2660 (2).xlsx";

const CN = {
  gross: -6682,
  brokerage: 840,
  exchange: 1757.62,
  gst: 468.46,
  stt: 3705,
  sebi: 4.95,
  stamp: 74,
  netPayable: -13532.02,
  totalCharges: 13532.02 - 6682,
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
const enriched = audit.derived.enrichedClosed as Array<{
  tradingsymbol: string;
  quantity: number;
  buyPrice: number;
  exitPrice: number;
  kiteGrossPnL: number;
  pnl: { gross: number; net: number; charges: { total: number; entry: Record<string, number>; exit: Record<string, number> } };
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

console.log("\n=== APP (May 25 audit snapshot) ===\n");
for (const p of enriched) {
  appGross += p.pnl.gross;
  appCharges += p.pnl.charges.total;
  appNet += p.pnl.net;
  const e = p.pnl.charges.entry;
  const x = p.pnl.charges.exit;
  appBrokerage += e.brokerage + x.brokerage;
  appStamp += e.stampDuty + x.stampDuty;
  appStt += e.stt + x.stt;
  appExchange += e.exchangeCharges + x.exchangeCharges;
  appSebi += e.sebiCharges + x.sebiCharges;
  appGst += e.gst + x.gst;
  console.log(
    `${p.tradingsymbol} | qty ${p.quantity} | entry ${p.buyPrice} exit ${p.exitPrice} | gross ${p.pnl.gross} | ch ${p.pnl.charges.total} | net ${p.pnl.net} | kiteGross ${p.kiteGrossPnL}`,
  );
}
console.log("\nAPP TOTALS:", {
  gross: round2(appGross),
  charges: round2(appCharges),
  net: round2(appNet),
});

console.log("\nAPP CHARGE BREAKDOWN:", {
  brokerage: round2(appBrokerage),
  exchange: round2(appExchange),
  gst: round2(appGst),
  stt: round2(appStt),
  sebi: round2(appSebi),
  stamp: round2(appStamp),
  sum: round2(appBrokerage + appExchange + appGst + appStt + appSebi + appStamp),
});

console.log("\n=== CONTRACT NOTE (25 May) ===\n", CN);

console.log("\n=== DELTA (App vs Contract Note) ===\n", {
  grossDiff: round2(appGross - CN.gross),
  chargesDiff: round2(appCharges - CN.totalCharges),
  netDiff: round2(appNet - CN.netPayable),
});

const csvText = fs.readFileSync(TRADEBOOK, "utf8");
const lines = csvText.trim().split(/\r?\n/);
const headers = lines[0].split(",");
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

type Agg = { buy: number; sell: number; buyQty: number; sellQty: number; buyOrders: Set<string>; sellOrders: Set<string> };
const bySym = new Map<string, Agg>();

for (let li = 1; li < lines.length; li++) {
  const cols = lines[li].split(",");
  const row = {
    symbol: cols[idx.symbol],
    trade_date: cols[idx.trade_date],
    trade_type: cols[idx.trade_type],
    quantity: cols[idx.quantity],
    price: cols[idx.price],
    order_id: cols[idx.order_id],
  };
  if (row.trade_date !== "2026-05-25") continue;
  const sym = row.symbol;
  const agg = bySym.get(sym) ?? {
    buy: 0,
    sell: 0,
    buyQty: 0,
    sellQty: 0,
    buyOrders: new Set<string>(),
    sellOrders: new Set<string>(),
  };
  const q = Number(row.quantity);
  const p = Number(row.price);
  const t = row.trade_type.toLowerCase();
  if (t === "buy") {
    agg.buy += q * p;
    agg.buyQty += q;
    agg.buyOrders.add(row.order_id);
  } else {
    agg.sell += q * p;
    agg.sellQty += q;
    agg.sellOrders.add(row.order_id);
  }
  bySym.set(sym, agg);
}

console.log("\n=== TRADEBOOK May 25 (by symbol) ===\n");
let tbGross = 0;
for (const [sym, a] of [...bySym.entries()].sort()) {
  const gross = round2(a.sell - a.buy);
  tbGross += gross;
  const balanced = Math.abs(a.buyQty - a.sellQty) < 0.001;
  console.log(
    `${sym} | buyQty ${a.buyQty} sellQty ${a.sellQty}${balanced ? "" : " UNBALANCED"} | gross ${gross} | orders B${a.buyOrders.size}/S${a.sellOrders.size}`,
  );
}
console.log("\nTRADEBOOK gross total:", round2(tbGross));

const wb = XLSX.readFile(PNL_XLSX);
console.log("\n=== KITE P&L XLSX ===\nSheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) as unknown[][];
  console.log(`\n--- ${name} (${data.length} rows) ---`);
  for (const row of data.slice(0, 15)) {
    console.log(row.join(" | "));
  }
  for (const row of data) {
    const line = row.map(String).join(" ").toLowerCase();
    if (line.includes("2026-05-25") || line.includes("25-05-2026") || line.includes("realised") || line.includes("net p")) {
      console.log(">>", row.join(" | "));
    }
  }
}
