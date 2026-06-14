import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { Trade } from "kiteconnect";
import { enrichClosedPositions } from "./dashboard.js";
import { istDateKey } from "../utils/istDate.js";
import { isFoExchange } from "./instrumentSymbol.js";
import type { KiteAuditRecord } from "./kiteAuditLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TRADING_LEDGER_ROOT = path.resolve(__dirname, "../../data/trading-ledger");

export interface LedgerTrade {
  tradeId: string;
  orderId: string;
  fillTimestamp: string;
  exchange: string;
  tradingsymbol: string;
  product: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  turnover: number;
}

export interface LedgerSymbolRow {
  tradingsymbol: string;
  exchange: string;
  product: string;
  tradeCount: number;
  buyQty: number;
  sellQty: number;
  buyTurnover: number;
  sellTurnover: number;
  /** sell turnover − buy turnover (matches contract note obligation per symbol). */
  tradeGross: number;
  kiteGross?: number;
  charges: number;
  net: number;
}

export interface LedgerChargeBreakdown {
  brokerage: number;
  exchange: number;
  gst: number;
  stt: number;
  sebi: number;
  stamp: number;
  total: number;
}

export interface DailyLedgerSummary {
  tradeDate: string;
  updatedAt: string;
  finalizedAt: string | null;
  /** True when last fill is after 15:15 IST or ledger was finalized manually/EOD. */
  complete: boolean;
  tradeCount: number;
  orderCount: number;
  firstFillAt: string | null;
  lastFillAt: string | null;
  openingBalance: number | null;
  liveBalance: number | null;
  walletDayChange: number | null;
  grossPnL: number;
  totalCharges: number;
  netPnL: number;
  charges: LedgerChargeBreakdown;
  bySymbol: LedgerSymbolRow[];
  auditFingerprint: string;
  auditCapturedAt: string;
}

export interface ContractNoteEntry {
  enteredAt: string;
  tradeDate: string;
  payInOutObligation?: number;
  brokerage?: number;
  exchange?: number;
  gst?: number;
  stt?: number;
  sebi?: number;
  stamp?: number;
  netPayable?: number;
  notes?: string;
}

export interface LedgerReconcileResult {
  tradeDate: string;
  reconciledAt: string;
  ledger: Pick<DailyLedgerSummary, "grossPnL" | "totalCharges" | "netPnL" | "charges">;
  contractNote: ContractNoteEntry;
  delta: {
    gross: number;
    charges: number;
    net: number;
    brokerage?: number;
    exchange?: number;
    gst?: number;
    stt?: number;
    sebi?: number;
    stamp?: number;
  };
  cnDerived: {
    totalCharges: number;
    netFromGrossMinusCharges: number | null;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ledgerDir(auditKey: string, tradeDate: string): string {
  return path.join(TRADING_LEDGER_ROOT, auditKey, tradeDate);
}

/** Session user id, or an existing 24-char audit storage key (see sessionManager). */
async function resolveAuditKey(userOrKey: string): Promise<string> {
  if (/^[a-f0-9]{24}$/i.test(userOrKey)) {
    return userOrKey.toLowerCase();
  }
  const { getAuditStorageKey } = await import("./sessionManager.js");
  return getAuditStorageKey(userOrKey);
}

function tradesPath(dir: string): string {
  return path.join(dir, "trades.json");
}

function ledgerPath(dir: string): string {
  return path.join(dir, "ledger.json");
}

function contractNotePath(dir: string): string {
  return path.join(dir, "contract-note.json");
}

function reconcilePath(dir: string): string {
  return path.join(dir, "reconcile.json");
}

export function tradeToLedgerTrade(trade: Trade): LedgerTrade | null {
  if (!isFoExchange(trade.exchange)) {
    return null;
  }
  const qty = trade.quantity ?? trade.filled;
  if (!Number.isFinite(qty) || qty <= 0) {
    return null;
  }
  const price = trade.average_price;
  const side = trade.transaction_type === "SELL" ? "SELL" : "BUY";
  return {
    tradeId: String(trade.trade_id),
    orderId: String(trade.order_id),
    fillTimestamp:
      typeof trade.fill_timestamp === "string"
        ? trade.fill_timestamp
        : new Date(trade.fill_timestamp).toISOString(),
    exchange: trade.exchange,
    tradingsymbol: trade.tradingsymbol,
    product: trade.product ?? "NRML",
    side,
    quantity: qty,
    price,
    turnover: round2(price * qty),
  };
}

export function fillTimestampIstHour(fillTimestamp: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(fillTimestamp));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Market close 15:30 IST — treat fills after 15:15 as likely complete for the day. */
export function isLikelyCompleteTradingDay(lastFillAt: string | null): boolean {
  if (!lastFillAt) {
    return false;
  }
  return fillTimestampIstHour(lastFillAt) >= 15 * 60 + 15;
}

export function isAfterMarketCloseIst(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour > 15 || (hour === 15 && minute >= 30);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mergeTrades(existing: LedgerTrade[], incoming: Trade[]): LedgerTrade[] {
  const byId = new Map<string, LedgerTrade>();
  for (const row of existing) {
    byId.set(row.tradeId, row);
  }
  for (const trade of incoming) {
    const row = tradeToLedgerTrade(trade);
    if (row) {
      byId.set(row.tradeId, row);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.fillTimestamp).getTime() - new Date(b.fillTimestamp).getTime(),
  );
}

function grossFromTrades(trades: LedgerTrade[]): Map<string, LedgerSymbolRow> {
  const rows = new Map<string, LedgerSymbolRow>();
  for (const t of trades) {
    const key = `${t.exchange}:${t.tradingsymbol}:${t.product}`;
    const row =
      rows.get(key) ??
      ({
        tradingsymbol: t.tradingsymbol,
        exchange: t.exchange,
        product: t.product,
        tradeCount: 0,
        buyQty: 0,
        sellQty: 0,
        buyTurnover: 0,
        sellTurnover: 0,
        tradeGross: 0,
        charges: 0,
        net: 0,
      } satisfies LedgerSymbolRow);
    row.tradeCount += 1;
    if (t.side === "BUY") {
      row.buyQty += t.quantity;
      row.buyTurnover = round2(row.buyTurnover + t.turnover);
    } else {
      row.sellQty += t.quantity;
      row.sellTurnover = round2(row.sellTurnover + t.turnover);
    }
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    row.tradeGross = round2(row.sellTurnover - row.buyTurnover);
  }
  return rows;
}

function chargeBreakdownFromEnriched(
  enriched: ReturnType<typeof enrichClosedPositions>,
): LedgerChargeBreakdown {
  let brokerage = 0;
  let exchange = 0;
  let gst = 0;
  let stt = 0;
  let sebi = 0;
  let stamp = 0;
  for (const p of enriched) {
    const e = p.pnl.charges.entry;
    const x = p.pnl.charges.exit;
    brokerage += e.brokerage + x.brokerage;
    exchange += e.exchangeCharges + x.exchangeCharges;
    gst += e.gst + x.gst;
    stt += e.stt + x.stt;
    sebi += e.sebiCharges + x.sebiCharges;
    stamp += e.stampDuty + x.stampDuty;
  }
  return {
    brokerage: round2(brokerage),
    exchange: round2(exchange),
    gst: round2(gst),
    stt: round2(stt),
    sebi: round2(sebi),
    stamp: round2(stamp),
    total: round2(brokerage + exchange + gst + stt + sebi + stamp),
  };
}

function buildSummary(
  tradeDate: string,
  trades: LedgerTrade[],
  audit: KiteAuditRecord,
  finalizedAt: string | null,
): DailyLedgerSummary {
  const foTrades = trades;
  const enriched = enrichClosedPositions(
    audit.derived.closedPositions,
    audit.raw.trades,
  );
  const charges = chargeBreakdownFromEnriched(enriched);
  const tradeGrossByKey = grossFromTrades(foTrades);

  const kiteBySymbol = new Map(
    enriched.map((p) => [
      `${p.exchange ?? "NFO"}:${p.tradingsymbol}:${p.product ?? "NRML"}`,
      p,
    ]),
  );

  const bySymbol: LedgerSymbolRow[] = [];
  const allKeys = new Set([...tradeGrossByKey.keys(), ...kiteBySymbol.keys()]);
  for (const key of allKeys) {
    const tradeRow = tradeGrossByKey.get(key);
    const kite = kiteBySymbol.get(key);
    bySymbol.push({
      tradingsymbol: tradeRow?.tradingsymbol ?? kite?.tradingsymbol ?? key,
      exchange: tradeRow?.exchange ?? kite?.exchange ?? "NFO",
      product: tradeRow?.product ?? kite?.product ?? "NRML",
      tradeCount: tradeRow?.tradeCount ?? 0,
      buyQty: tradeRow?.buyQty ?? 0,
      sellQty: tradeRow?.sellQty ?? 0,
      buyTurnover: tradeRow?.buyTurnover ?? 0,
      sellTurnover: tradeRow?.sellTurnover ?? 0,
      tradeGross: tradeRow?.tradeGross ?? 0,
      kiteGross: kite?.pnl.gross,
      charges: kite?.pnl.charges.total ?? 0,
      net: kite?.pnl.net ?? round2((tradeRow?.tradeGross ?? 0) - (kite?.pnl.charges.total ?? 0)),
    });
  }
  bySymbol.sort((a, b) => a.tradingsymbol.localeCompare(b.tradingsymbol));

  const grossPnL = round2(bySymbol.reduce((s, r) => s + r.tradeGross, 0));
  const totalCharges = charges.total;
  const netPnL = round2(grossPnL - totalCharges);

  const orderIds = new Set(audit.raw.orders.map((o) => String(o.order_id)));
  const timestamps = foTrades.map((t) => t.fillTimestamp);
  const opening = audit.derived.marginsSummary?.openingBalance;
  const live = audit.derived.marginsSummary?.net;
  const lastFillAt = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  return {
    tradeDate,
    updatedAt: new Date().toISOString(),
    finalizedAt,
    complete: Boolean(finalizedAt) || isLikelyCompleteTradingDay(lastFillAt),
    tradeCount: foTrades.length,
    orderCount: orderIds.size,
    firstFillAt: timestamps[0] ?? null,
    lastFillAt,
    openingBalance: Number.isFinite(opening) ? round2(opening!) : null,
    liveBalance: Number.isFinite(live) ? round2(live!) : null,
    walletDayChange:
      Number.isFinite(opening) && Number.isFinite(live)
        ? round2(live! - opening!)
        : null,
    grossPnL,
    totalCharges,
    netPnL,
    charges,
    bySymbol,
    auditFingerprint: audit.fingerprint,
    auditCapturedAt: audit.capturedAt,
  };
}

/** Merge fills from a Kite audit snapshot into the IST trading-day ledger. */
export async function mergeDailyLedgerFromAudit(
  userId: string,
  audit: KiteAuditRecord,
): Promise<{ dir: string; summary: DailyLedgerSummary }> {
  const auditKey = await resolveAuditKey(userId);
  const tradeDate = istDateKey(audit.capturedAt);
  const dir = ledgerDir(auditKey, tradeDate);
  await fs.mkdir(dir, { recursive: true });

  const existingTrades = (await readJson<LedgerTrade[]>(tradesPath(dir))) ?? [];
  const trades = mergeTrades(existingTrades, audit.raw.trades);
  await writeJson(tradesPath(dir), trades);

  const prev = await readJson<DailyLedgerSummary>(ledgerPath(dir));
  const summary = buildSummary(tradeDate, trades, audit, prev?.finalizedAt ?? null);
  await writeJson(ledgerPath(dir), summary);

  return { dir, summary };
}

export async function finalizeDailyLedger(
  userId: string,
  tradeDate = istDateKey(),
): Promise<DailyLedgerSummary | null> {
  const auditKey = await resolveAuditKey(userId);
  const dir = ledgerDir(auditKey, tradeDate);
  const summary = await readJson<DailyLedgerSummary>(ledgerPath(dir));
  if (!summary) {
    return null;
  }
  summary.finalizedAt = new Date().toISOString();
  summary.complete = true;
  summary.updatedAt = summary.finalizedAt;
  await writeJson(ledgerPath(dir), summary);
  return summary;
}

export async function listLedgerDays(userId: string): Promise<string[]> {
  const auditKey = await resolveAuditKey(userId);
  const root = path.join(TRADING_LEDGER_ROOT, auditKey);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  } catch {
    return [];
  }
}

export async function readDailyLedger(
  userId: string,
  tradeDate: string,
): Promise<{ summary: DailyLedgerSummary; trades: LedgerTrade[] } | null> {
  const auditKey = await resolveAuditKey(userId);
  const dir = ledgerDir(auditKey, tradeDate);
  const summary = await readJson<DailyLedgerSummary>(ledgerPath(dir));
  const trades = await readJson<LedgerTrade[]>(tradesPath(dir));
  if (!summary || !trades) {
    return null;
  }
  return { summary, trades };
}

export async function saveContractNote(
  userId: string,
  tradeDate: string,
  entry: Omit<ContractNoteEntry, "enteredAt" | "tradeDate">,
): Promise<ContractNoteEntry> {
  const auditKey = await resolveAuditKey(userId);
  const dir = ledgerDir(auditKey, tradeDate);
  await fs.mkdir(dir, { recursive: true });
  const record: ContractNoteEntry = {
    ...entry,
    tradeDate,
    enteredAt: new Date().toISOString(),
  };
  await writeJson(contractNotePath(dir), record);
  const reconcile = reconcileLedger(record, await readJson<DailyLedgerSummary>(ledgerPath(dir)));
  if (reconcile) {
    await writeJson(reconcilePath(dir), reconcile);
  }
  return record;
}

export async function readContractNote(
  userId: string,
  tradeDate: string,
): Promise<ContractNoteEntry | null> {
  const auditKey = await resolveAuditKey(userId);
  return readJson<ContractNoteEntry>(contractNotePath(ledgerDir(auditKey, tradeDate)));
}

export function reconcileLedger(
  contractNote: ContractNoteEntry,
  ledger: DailyLedgerSummary | null,
): LedgerReconcileResult | null {
  if (!ledger) {
    return null;
  }
  const cnCharges = round2(
    (contractNote.brokerage ?? 0) +
      (contractNote.exchange ?? 0) +
      (contractNote.gst ?? 0) +
      (contractNote.stt ?? 0) +
      (contractNote.sebi ?? 0) +
      (contractNote.stamp ?? 0),
  );
  const cnGross = contractNote.payInOutObligation;
  const cnNet = contractNote.netPayable;
  const netFromGross =
    cnGross != null && cnCharges > 0 ? round2(cnGross - cnCharges) : null;

  return {
    tradeDate: ledger.tradeDate,
    reconciledAt: new Date().toISOString(),
    ledger: {
      grossPnL: ledger.grossPnL,
      totalCharges: ledger.totalCharges,
      netPnL: ledger.netPnL,
      charges: ledger.charges,
    },
    contractNote,
    delta: {
      gross: cnGross != null ? round2(ledger.grossPnL - cnGross) : 0,
      charges: round2(ledger.totalCharges - cnCharges),
      net: cnNet != null ? round2(ledger.netPnL - cnNet) : 0,
      brokerage:
        contractNote.brokerage != null
          ? round2(ledger.charges.brokerage - contractNote.brokerage)
          : undefined,
      exchange:
        contractNote.exchange != null
          ? round2(ledger.charges.exchange - contractNote.exchange)
          : undefined,
      gst:
        contractNote.gst != null ? round2(ledger.charges.gst - contractNote.gst) : undefined,
      stt: contractNote.stt != null ? round2(ledger.charges.stt - contractNote.stt) : undefined,
      sebi:
        contractNote.sebi != null ? round2(ledger.charges.sebi - contractNote.sebi) : undefined,
      stamp:
        contractNote.stamp != null
          ? round2(ledger.charges.stamp - contractNote.stamp)
          : undefined,
    },
    cnDerived: {
      totalCharges: cnCharges,
      netFromGrossMinusCharges: netFromGross,
    },
  };
}

export async function readLedgerReconcile(
  userId: string,
  tradeDate: string,
): Promise<LedgerReconcileResult | null> {
  const auditKey = await resolveAuditKey(userId);
  const cached = await readJson<LedgerReconcileResult>(reconcilePath(ledgerDir(auditKey, tradeDate)));
  if (cached) {
    return cached;
  }
  const cn = await readContractNote(userId, tradeDate);
  const ledger = await readJson<DailyLedgerSummary>(ledgerPath(ledgerDir(auditKey, tradeDate)));
  if (!cn || !ledger) {
    return null;
  }
  return reconcileLedger(cn, ledger);
}

/** Rebuild ledger for one IST day from kite-audit files (no live session required). */
export async function backfillDailyLedgerFromAuditKey(
  auditKey: string,
  tradeDate: string,
): Promise<DailyLedgerSummary | null> {
  const { KITE_AUDIT_ROOT } = await import("./kiteAuditLog.js");
  const auditDir = path.join(KITE_AUDIT_ROOT, auditKey, tradeDate);
  const snapshotsFile = path.join(auditDir, "snapshots.jsonl");

  let lastAudit: KiteAuditRecord | null = null;
  const tradeById = new Map<string, LedgerTrade>();

  try {
    const jsonl = await fs.readFile(snapshotsFile, "utf8");
    for (const line of jsonl.trim().split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const record = JSON.parse(line) as KiteAuditRecord;
      lastAudit = record;
      for (const trade of record.raw.trades) {
        const row = tradeToLedgerTrade(trade);
        if (row) {
          tradeById.set(row.tradeId, row);
        }
      }
    }
  } catch {
    // no jsonl
  }

  try {
    const latestText = await fs.readFile(path.join(auditDir, "latest.json"), "utf8");
    const latest = JSON.parse(latestText) as KiteAuditRecord;
    lastAudit = latest;
    for (const trade of latest.raw.trades) {
      const row = tradeToLedgerTrade(trade);
      if (row) {
        tradeById.set(row.tradeId, row);
      }
    }
  } catch {
    // no latest
  }

  if (!lastAudit || tradeById.size === 0) {
    return null;
  }

  const dir = ledgerDir(auditKey, tradeDate);
  await fs.mkdir(dir, { recursive: true });
  const trades = [...tradeById.values()].sort(
    (a, b) => new Date(a.fillTimestamp).getTime() - new Date(b.fillTimestamp).getTime(),
  );
  await writeJson(tradesPath(dir), trades);
  const prev = await readJson<DailyLedgerSummary>(ledgerPath(dir));
  const summary = buildSummary(tradeDate, trades, lastAudit, prev?.finalizedAt ?? null);
  await writeJson(ledgerPath(dir), summary);
  return summary;
}

export async function backfillDailyLedgerFromAudit(
  userId: string,
  tradeDate: string,
): Promise<DailyLedgerSummary | null> {
  return backfillDailyLedgerFromAuditKey(await resolveAuditKey(userId), tradeDate);
}

export async function ledgerStatus(userId: string) {
  const days = await listLedgerDays(userId);
  const today = istDateKey();
  const todayLedger = await readDailyLedger(userId, today);
  return {
    root: TRADING_LEDGER_ROOT,
    days,
    today,
    todayTradeCount: todayLedger?.summary.tradeCount ?? 0,
    todayLastFillAt: todayLedger?.summary.lastFillAt ?? null,
    todayComplete: todayLedger?.summary.complete ?? false,
    todayFinalizedAt: todayLedger?.summary.finalizedAt ?? null,
  };
}
