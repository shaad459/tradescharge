# Daily trading ledger (contract-note audit)

While you are logged in and `KITE_AUDIT_LOG` is enabled (default), Tradescharge keeps a **per-day record** under:

`backend/data/trading-ledger/<your-audit-key>/<YYYY-MM-DD>/`

| File | Purpose |
|------|---------|
| `trades.json` | Every FO fill that day (deduped by `trade_id`, merged on each sync) |
| `ledger.json` | Running totals: gross (sell−buy per symbol), charges, net, last fill time |
| `contract-note.json` | Figures you enter from Zerodha’s contract note |
| `reconcile.json` | App vs contract-note deltas |

Dates use **IST** (India trading day), not UTC.

## What runs automatically

- **Every live sync** (~3s) and **every 10 minutes** → new fills merged into today’s `trades.json`
- **After 15:30 IST** (with an active session) → extra capture + **finalize** today’s ledger
- **On startup** → finalize any past IST days that had trades but were never locked

Keep the backend running through the close when possible so the last hour of trades is captured.

## Save contract-note figures

### API (logged in)

```http
PUT /api/ledger/2026-05-26/contract-note
Content-Type: application/json

{
  "payInOutObligation": 7645,
  "brokerage": 1920,
  "exchange": 2926.53,
  "gst": 873.87,
  "stt": 6252,
  "sebi": 8.33,
  "stamp": 125,
  "netPayable": -4460.73
}
```

Then:

```http
GET /api/ledger/2026-05-26
```

Response includes `reconcile` with `delta.gross`, `delta.charges`, `delta.net`.

### CLI

From `backend/`:

```bash
npx tsx src/scripts/ledgerContractNote.ts --date 2026-05-26 --user BK2660 \
  --gross 7645 --brokerage 1920 --exchange 2926.53 --gst 873.87 --stt 6252 \
  --sebi 8.33 --stamp 125 --net -4460.73
```

Use **Pay in/Pay out obligation** from the contract note summary as `--gross`.  
Use **Net amount receivable/(payable)** as `--net` (negative = loss, same sign as the PDF).

### Backfill an old day from audit snapshots

```bash
npx tsx -e "import { restorePersistedSessions } from './src/services/sessionManager.js';
import { backfillDailyLedgerFromAudit } from './src/services/dailyLedger.js';
await restorePersistedSessions();
console.log(await backfillDailyLedgerFromAudit('YOUR_USER_ID', '2026-05-26'));"
```

## Workflow with the assistant

1. Trade with the app connected (live login).
2. After the contract note is published, send the summary figures (or the PDF).
3. I read `ledger.json` + `contract-note.json` (or run the script above) and report gaps.

Disable logging only if needed: `KITE_AUDIT_LOG=0` in `.env`.
