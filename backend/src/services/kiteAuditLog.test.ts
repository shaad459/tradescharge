import { kiteAuditFingerprint, type KiteAuditRawBundle } from "./kiteAuditLog.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const base: KiteAuditRawBundle = {
  orders: [],
  trades: [],
  positions: { net: [], day: [] },
  margins: { net: 100 },
};

const fp1 = kiteAuditFingerprint(base);
const fp2 = kiteAuditFingerprint(base);
assert(fp1 === fp2, "same payload should produce same fingerprint");

const changed: KiteAuditRawBundle = {
  ...base,
  trades: [
    {
      trade_id: "1",
      order_id: "1",
      exchange: "NFO",
      tradingsymbol: "NIFTY2560524600CE",
      transaction_type: "BUY",
      quantity: 65,
      average_price: 100,
      fill_timestamp: new Date(),
    } as KiteAuditRawBundle["trades"][number],
  ],
};
assert(kiteAuditFingerprint(changed) !== fp1, "trade change should change fingerprint");

console.log("kiteAuditLog.test.ts: all assertions passed");
