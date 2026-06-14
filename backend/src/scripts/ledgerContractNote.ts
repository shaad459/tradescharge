/**
 * Save contract-note figures and print reconcile vs stored ledger.
 *
 * Example (26 May 2026):
 *   npx tsx src/scripts/ledgerContractNote.ts --date 2026-05-26 --user BK2660 \
 *     --gross 7645 --brokerage 1920 --exchange 2926.53 --gst 873.87 --stt 6252 \
 *     --sebi 8.33 --stamp 125 --net -4460.73
 */
import { restorePersistedSessions, getAuditStorageKey } from "../services/sessionManager.js";
import {
  backfillDailyLedgerFromAudit,
  readLedgerReconcile,
  reconcileLedger,
  readDailyLedger,
  saveContractNote,
  type ContractNoteEntry,
} from "../services/dailyLedger.js";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      const name = key.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[name] = next;
        i++;
      } else {
        out[name] = "true";
      }
    }
  }
  return out;
}

function num(value: string | undefined): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return Number(value);
}

async function resolveUserId(clientOrUser: string | undefined): Promise<string | null> {
  await restorePersistedSessions();
  if (!clientOrUser) {
    const { getActiveSessionUserIds } = await import("../services/kite.js");
    const ids = getActiveSessionUserIds();
    return ids[0] ?? null;
  }
  const { getActiveSessionUserIds } = await import("../services/kite.js");
  for (const id of getActiveSessionUserIds()) {
    if (id === clientOrUser || getAuditStorageKey(id).includes(clientOrUser)) {
      return id;
    }
  }
  return clientOrUser;
}

async function main() {
  const args = parseArgs(process.argv);
  const tradeDate = args.date;
  if (!tradeDate) {
    console.error("Usage: --date YYYY-MM-DD [--user BK2660] --gross ... --net ...");
    process.exit(1);
  }

  const userId = await resolveUserId(args.user);
  if (!userId) {
    console.error("No active session. Log in via the app first, or pass --user.");
    process.exit(1);
  }

  await backfillDailyLedgerFromAudit(userId, tradeDate);

  const cnBody: Omit<ContractNoteEntry, "enteredAt" | "tradeDate"> = {
    payInOutObligation: num(args.gross),
    brokerage: num(args.brokerage),
    exchange: num(args.exchange),
    gst: num(args.gst),
    stt: num(args.stt),
    sebi: num(args.sebi),
    stamp: num(args.stamp),
    netPayable: num(args.net),
    notes: args.notes,
  };

  if (args.gross || args.net) {
    await saveContractNote(userId, tradeDate, cnBody);
  }

  const ledger = await readDailyLedger(userId, tradeDate);
  const reconcile =
    (await readLedgerReconcile(userId, tradeDate)) ??
    (ledger && cnBody.netPayable != null
      ? reconcileLedger(
          { tradeDate, enteredAt: new Date().toISOString(), ...cnBody },
          ledger.summary,
        )
      : null);

  console.log("\n=== LEDGER ===\n", ledger?.summary);
  console.log("\n=== RECONCILE (ledger vs contract note) ===\n", reconcile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
