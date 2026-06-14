import { backfillDailyLedgerFromAuditKey, readLedgerReconcile, saveContractNote } from "../services/dailyLedger.js";

const auditKey = process.argv[2] ?? "29d648fef2ad84510ae9e08a";
const tradeDate = process.argv[3] ?? "2026-05-26";

const summary = await backfillDailyLedgerFromAuditKey(auditKey, tradeDate);
console.log("ledger", summary);

await saveContractNote(auditKey, tradeDate, {
  payInOutObligation: 7645,
  brokerage: 1920,
  exchange: 2926.53,
  gst: 873.87,
  stt: 6252,
  sebi: 8.33,
  stamp: 125,
  netPayable: -4460.73,
});

console.log("reconcile", await readLedgerReconcile(auditKey, tradeDate));
