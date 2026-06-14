import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAuditStorageKey } from "./sessionManager.js";
import { istDateKey } from "../utils/istDate.js";
import type { Order as KiteOrder, Position as KitePosition, Trade } from "kiteconnect";
import type { ClosedPosition, EnrichedClosedPosition, ExecutedTransaction } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const KITE_AUDIT_ROOT = path.resolve(__dirname, "../../data/kite-audit");

const DEFAULT_INTERVAL_MS = 60_000;

function auditEnabled(): boolean {
  return process.env.KITE_AUDIT_LOG !== "0";
}

function auditIntervalMs(): number {
  const parsed = Number(process.env.KITE_AUDIT_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

function todayKey(date = new Date()): string {
  return istDateKey(date);
}

function userAuditDir(userId: string, day = todayKey()): string {
  return path.join(KITE_AUDIT_ROOT, getAuditStorageKey(userId), day);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface KiteAuditRawBundle {
  orders: KiteOrder[];
  trades: Trade[];
  positions: { net: KitePosition[]; day: KitePosition[] };
  margins: unknown;
}

export interface KiteAuditDerivedBundle {
  closedPositions: ClosedPosition[];
  enrichedClosed?: EnrichedClosedPosition[];
  executedTransactions: ExecutedTransaction[];
  openPositionCount: number;
  marginsSummary: {
    net: number;
    available: number;
    openingBalance: number;
    m2mRealised: number;
    m2mUnrealised: number;
  };
}

export interface KiteAuditRecord {
  capturedAt: string;
  source: string;
  fingerprint: string;
  counts: {
    orders: number;
    trades: number;
    dayPositions: number;
    netPositions: number;
    closedPositions: number;
    executedOrders: number;
  };
  raw: KiteAuditRawBundle;
  derived: KiteAuditDerivedBundle;
}

const lastByUser = new Map<string, { fingerprint: string; at: number }>();

export function kiteAuditFingerprint(raw: KiteAuditRawBundle): string {
  const payload = {
    orders: raw.orders.map((o) => [
      o.order_id,
      o.status,
      o.filled_quantity,
      o.pending_quantity,
      o.average_price,
    ]),
    trades: raw.trades.map((t) => [t.trade_id, t.order_id, t.quantity, t.average_price]),
    day: raw.positions.day.map((p) => [
      p.tradingsymbol,
      p.product,
      p.quantity,
      p.pnl,
      p.realised,
      p.m2m,
      p.day_buy_quantity,
      p.day_sell_quantity,
      p.day_buy_value,
      p.day_sell_value,
    ]),
    net: raw.positions.net.map((p) => [p.tradingsymbol, p.product, p.quantity, p.pnl]),
    margins: raw.margins,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function shouldWrite(userId: string, fingerprint: string, force: boolean): boolean {
  if (force) {
    return true;
  }
  const prev = lastByUser.get(userId);
  const now = Date.now();
  if (!prev) {
    return true;
  }
  if (prev.fingerprint !== fingerprint) {
    return true;
  }
  return now - prev.at >= auditIntervalMs();
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function appendJsonl(dir: string, record: KiteAuditRecord): Promise<void> {
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(path.join(dir, "snapshots.jsonl"), line, "utf8");
}

async function writeLatest(dir: string, record: KiteAuditRecord): Promise<void> {
  await fs.writeFile(path.join(dir, "latest.json"), JSON.stringify(record, null, 2), "utf8");
}

async function writeForcedCapture(dir: string, record: KiteAuditRecord): Promise<void> {
  const stamp = record.capturedAt.replace(/[:.]/g, "-");
  await fs.writeFile(path.join(dir, `capture-${stamp}.json`), JSON.stringify(record, null, 2), "utf8");
}

/** Persist Kite API payloads for contract-note / charge reconciliation (local disk only). */
export async function recordKiteAuditLog(
  userId: string,
  input: {
    source: string;
    raw: KiteAuditRawBundle;
    derived: KiteAuditDerivedBundle;
    force?: boolean;
  },
): Promise<{ written: boolean; path?: string; fingerprint: string }> {
  if (!auditEnabled() || !userId) {
    return { written: false, fingerprint: "" };
  }

  const fingerprint = kiteAuditFingerprint(input.raw);
  if (!shouldWrite(userId, fingerprint, Boolean(input.force))) {
    return { written: false, fingerprint };
  }

  const capturedAt = new Date().toISOString();
  const record: KiteAuditRecord = {
    capturedAt,
    source: input.source,
    fingerprint,
    counts: {
      orders: input.raw.orders.length,
      trades: input.raw.trades.length,
      dayPositions: input.raw.positions.day.length,
      netPositions: input.raw.positions.net.length,
      closedPositions: input.derived.closedPositions.length,
      executedOrders: input.derived.executedTransactions.length,
    },
    raw: input.raw,
    derived: input.derived,
  };

  const dir = userAuditDir(userId);
  await ensureDir(dir);
  await appendJsonl(dir, record);
  await writeLatest(dir, record);
  if (input.force) {
    await writeForcedCapture(dir, record);
  }

  lastByUser.set(userId, { fingerprint, at: Date.now() });

  try {
    const { mergeDailyLedgerFromAudit } = await import("./dailyLedger.js");
    await mergeDailyLedgerFromAudit(userId, record);
  } catch (error) {
    console.error(`Daily ledger merge failed (${userId}):`, error);
  }

  return { written: true, path: dir, fingerprint };
}

export async function readLatestKiteAudit(userId: string, day = todayKey()) {
  const file = path.join(userAuditDir(userId, day), "latest.json");
  try {
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text) as KiteAuditRecord;
  } catch {
    return null;
  }
}

export async function listKiteAuditDays(userId: string): Promise<string[]> {
  const root = path.join(KITE_AUDIT_ROOT, getAuditStorageKey(userId));
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function kiteAuditStatus(userId: string) {
  const days = await listKiteAuditDays(userId);
  const today = todayKey();
  const todayDir = userAuditDir(userId, today);
  let todayLineCount = 0;
  try {
    const jsonl = await fs.readFile(path.join(todayDir, "snapshots.jsonl"), "utf8");
    todayLineCount = jsonl.trim() ? jsonl.trim().split("\n").length : 0;
  } catch {
    // no log yet today
  }
  const latest = await readLatestKiteAudit(userId, today);
  return {
    enabled: auditEnabled(),
    root: KITE_AUDIT_ROOT,
    intervalMs: auditIntervalMs(),
    days,
    today,
    todayLineCount,
    latestCapturedAt: latest?.capturedAt ?? null,
    latestFingerprint: latest?.fingerprint ?? null,
    latestCounts: latest?.counts ?? null,
  };
}
