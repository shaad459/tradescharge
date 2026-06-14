import { captureKiteAuditForUser } from "./kiteAuditCapture.js";
import {
  finalizeDailyLedger,
  isAfterMarketCloseIst,
  readDailyLedger,
} from "./dailyLedger.js";
import { getActiveSessionUserIds } from "./kite.js";
import { istDateKey } from "../utils/istDate.js";

/** Finalize today's ledger after market close if we have trades and it is not locked yet. */
export async function runEodLedgerFinalize(): Promise<void> {
  if (!isAfterMarketCloseIst()) {
    return;
  }

  const tradeDate = istDateKey();
  const userIds = getActiveSessionUserIds();

  for (const userId of userIds) {
    const existing = await readDailyLedger(userId, tradeDate);
    if (existing?.summary.finalizedAt) {
      continue;
    }

    await captureKiteAuditForUser(userId, "eod-ledger-capture");
    const after = await readDailyLedger(userId, tradeDate);
    if (after && after.summary.tradeCount > 0) {
      await finalizeDailyLedger(userId, tradeDate);
      console.log(
        `Trading ledger finalized ${tradeDate} for ${userId}: ${after.summary.tradeCount} trades, gross ${after.summary.grossPnL}, net ${after.summary.netPnL}`,
      );
    }
  }
}

/** On startup, finalize previous IST days that have trades but were never locked. */
export async function finalizeStaleLedgerDays(): Promise<void> {
  const userIds = getActiveSessionUserIds();
  const today = istDateKey();

  for (const userId of userIds) {
    const { listLedgerDays } = await import("./dailyLedger.js");
    const days = await listLedgerDays(userId);
    for (const day of days) {
      if (day >= today) {
        continue;
      }
      const ledger = await readDailyLedger(userId, day);
      if (ledger && ledger.summary.tradeCount > 0 && !ledger.summary.finalizedAt) {
        await finalizeDailyLedger(userId, day);
        console.log(`Trading ledger back-filled finalize for ${userId} ${day}`);
      }
    }
  }
}
