import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { isViewOnly } from "./config/viewOnly.js";
import { getPublicAppUrl, shouldServeFrontend } from "./config/publicUrl.js";
import { createApp } from "./createApp.js";
import { KITE_AUDIT_ROOT } from "./services/kiteAuditLog.js";
import { bootstrapKiteSessionsAndCapture, captureAllKiteAudits } from "./services/kiteAuditCapture.js";
import {
  finalizeStaleLedgerDays,
  runEodLedgerFinalize,
} from "./services/dailyLedgerScheduler.js";
import { TRADING_LEDGER_ROOT } from "./services/dailyLedger.js";
import { restorePersistedSessions } from "./services/sessionManager.js";
import { warmKiteInstrumentsCsv } from "./services/kiteInstrumentsCsv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = createApp();
const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const publicUrl = getPublicAppUrl();

const AUDIT_CAPTURE_INTERVAL_MS = 10 * 60 * 1000;

warmKiteInstrumentsCsv();

const server = app.listen(port, host, () => {
  console.log(`Tradescharge API running at http://${host}:${port}`);
  console.log(`Public URL: ${publicUrl}`);
  if (shouldServeFrontend()) {
    console.log("Serving frontend from frontend/dist (single-origin)");
  } else {
    console.log("API only — point FRONTEND_URL at your Vite dev server");
  }
  console.log(
    process.env.KITE_API_SECRET
      ? "Kite Connect: configured (live login ready)"
      : "Kite Connect: demo mode (add KITE_API_SECRET for live login)",
  );
  console.log(isViewOnly() ? "Mode: view-only (orders disabled)" : "Mode: full (orders enabled)");
  void restorePersistedSessions().then(() => {
    if (process.env.KITE_AUDIT_LOG !== "0") {
      console.log(`Kite audit log: ${KITE_AUDIT_ROOT} (set KITE_AUDIT_LOG=0 to disable)`);
      console.log(`Trading ledger: ${TRADING_LEDGER_ROOT} (IST day folders + contract-note.json)`);
      void bootstrapKiteSessionsAndCapture().then(() => finalizeStaleLedgerDays());
    }
  });
  if (process.env.KITE_AUDIT_LOG !== "0") {
    setInterval(() => {
      void captureAllKiteAudits("scheduled-capture").then(() => runEodLedgerFinalize());
    }, AUDIT_CAPTURE_INTERVAL_MS);
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the other Node process (Task Manager → node) or run with PORT=${port + 1}.`,
    );
    process.exit(1);
  }
  throw err;
});
