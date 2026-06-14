import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { bootstrapKiteSessionsAndCapture, captureAllKiteAudits } from "../services/kiteAuditCapture.js";
import { kiteAuditStatus, KITE_AUDIT_ROOT } from "../services/kiteAuditLog.js";
import { getActiveSessionUserIds } from "../services/kite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  await bootstrapKiteSessionsAndCapture();
  const userIds = getActiveSessionUserIds();
  if (userIds.length === 0) {
    console.log("No saved Kite session. Open http://127.0.0.1:5173 and log in once — capture runs automatically.");
    process.exit(1);
  }

  const results = await captureAllKiteAudits("cli-capture");
  for (const userId of userIds) {
    const result = results.find((row) => row.userId === userId);
    const status = await kiteAuditStatus(userId);
    if (result?.ok) {
      console.log(`OK ${userId}: latest at ${status.latestCapturedAt}`);
      console.log(`   folder: ${KITE_AUDIT_ROOT}/${userId}/${status.today}`);
    } else {
      console.error(`FAIL ${userId}: ${result?.error ?? "unknown"}`);
    }
  }
  process.exit(results.every((row) => row.ok) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
