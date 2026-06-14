import type { Order as KiteOrder, Position as KitePosition } from "kiteconnect";
import { resolveFoLotSize } from "../constants.js";
import { loadKiteInstruments, lookupLotSizeFromCache } from "./kiteInstruments.js";
import type { ClosedPosition, DemoOrder, OrderStatus, Position } from "../types.js";
import { isFoExchange, parseTradingsymbol } from "./instrumentSymbol.js";
import { buildExecutedTransactions } from "./executedTransactions.js";
import { buildClosedPositionsFromKiteDayBook } from "./liveClosedPositions.js";
import { kiteClient, parseEquityMargins } from "./kite.js";
import { enrichClosedPositions } from "./dashboard.js";
import { recordKiteAuditLog } from "./kiteAuditLog.js";

export interface LiveKiteAuditContext {
  userId: string;
  source: string;
  force?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const PENDING_STATUSES = new Set([
  "OPEN",
  "TRIGGER PENDING",
  "AMO REQ RECEIVED",
  "VALIDATION PENDING",
  "OPEN PENDING",
  "PUT ORDER REQ RECEIVED",
  "MODIFY AMO REQ RECEIVED",
  "CANCEL AMO REQ RECEIVED",
]);

function toIso(value: Date | string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapOrderType(orderType: string): DemoOrder["orderType"] {
  if (orderType === "LIMIT" || orderType === "SL" || orderType === "SL-M" || orderType === "MARKET") {
    return orderType;
  }
  return "MARKET";
}

function mapProduct(product: string): DemoOrder["product"] {
  return product === "MIS" ? "MIS" : "NRML";
}

function mapOrderStatus(order: KiteOrder): OrderStatus | null {
  if (order.status === "COMPLETE" && order.filled_quantity > 0) {
    return "EXECUTED";
  }
  if (order.status === "CANCELLED") {
    return "CANCELLED";
  }
  if (PENDING_STATUSES.has(order.status) || order.pending_quantity > 0) {
    return "OPEN";
  }
  return null;
}

function referenceLtpForOrder(
  order: KiteOrder,
  ltpBySymbol: Map<string, number>,
): number {
  return ltpBySymbol.get(order.tradingsymbol) ?? order.average_price ?? order.price ?? 0;
}

export function mapKiteOrder(order: KiteOrder, ltpBySymbol: Map<string, number>): DemoOrder | null {
  const status = mapOrderStatus(order);
  if (!status) {
    return null;
  }

  const parsed = parseTradingsymbol(order.tradingsymbol);
  const lotSize =
    lookupLotSizeFromCache(order.tradingsymbol) ?? resolveFoLotSize(undefined, parsed.symbol);
  const quantity = order.quantity > 0 ? order.quantity : order.filled_quantity + order.pending_quantity;
  const lots = lotSize > 0 ? Math.max(1, Math.round(quantity / lotSize)) : 1;
  const placedAt = toIso(order.order_timestamp);
  const updatedAt = toIso(order.exchange_update_timestamp ?? order.exchange_timestamp ?? order.order_timestamp);

  return {
    id: String(order.order_id),
    tradingsymbol: order.tradingsymbol,
    symbol: parsed.symbol,
    instrumentType: parsed.instrumentType,
    strike: parsed.strike,
    expiry: parsed.expiry,
    side: order.transaction_type === "SELL" ? "SELL" : "BUY",
    orderType: mapOrderType(order.order_type),
    product: mapProduct(order.product),
    quantity,
    lotSize,
    lots,
    price: order.price > 0 ? order.price : undefined,
    triggerPrice: order.trigger_price > 0 ? order.trigger_price : undefined,
    status,
    placedAt,
    updatedAt,
    fillPrice:
      status === "EXECUTED" && order.average_price > 0 ? order.average_price : undefined,
    referenceLtp: referenceLtpForOrder(order, ltpBySymbol),
    variety: order.variety,
  };
}

export function partitionKiteOrders(orders: KiteOrder[], ltpBySymbol: Map<string, number>) {
  const openOrders: DemoOrder[] = [];
  const orderHistory: DemoOrder[] = [];

  for (const order of orders) {
    if (!isFoExchange(order.exchange)) {
      continue;
    }
    const mapped = mapKiteOrder(order, ltpBySymbol);
    if (!mapped) {
      continue;
    }
    if (mapped.status === "OPEN") {
      openOrders.push(mapped);
    } else if (mapped.status === "EXECUTED" || mapped.status === "CANCELLED") {
      orderHistory.push(mapped);
    }
  }

  openOrders.sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  orderHistory.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return { openOrders, orderHistory };
}

function entryPriceForPosition(p: KitePosition, side: "long" | "short"): number {
  if (p.average_price > 0) {
    return p.average_price;
  }
  if (side === "long") {
    return p.buy_price > 0 ? p.buy_price : 0;
  }
  return p.sell_price > 0 ? p.sell_price : 0;
}

/** Fast LTP poll — Kite positions `last_price` (same field as the Kite positions screen). */
export async function fetchNetPositionLtps(accessToken: string): Promise<Map<string, number>> {
  const kite = kiteClient(accessToken);
  const { net } = await kite.getPositions();
  const ltps = new Map<string, number>();

  for (const row of net) {
    if (row.quantity !== 0 && isFoExchange(row.exchange) && row.last_price > 0) {
      ltps.set(`${row.tradingsymbol}:${row.product}`, row.last_price);
    }
  }

  return ltps;
}

export function mapKiteNetPositions(net: KitePosition[]): Position[] {
  return net
    .filter((p) => p.quantity !== 0 && isFoExchange(p.exchange))
    .map((p) => {
      const parsed = parseTradingsymbol(p.tradingsymbol);
      const lotSize =
        lookupLotSizeFromCache(p.tradingsymbol) ??
        resolveFoLotSize(p.multiplier, parsed.symbol);
      const qty = Math.abs(p.quantity);
      const side = p.quantity > 0 ? "long" : "short";

      return {
        id: `${p.tradingsymbol}:${p.product}`,
        tradingsymbol: p.tradingsymbol,
        symbol: parsed.symbol,
        instrumentType: parsed.instrumentType,
        strike: parsed.strike,
        expiry: parsed.expiry,
        side,
        buyPrice: entryPriceForPosition(p, side),
        quantity: qty,
        lotSize,
        ltp: p.last_price,
        restLtp: p.last_price,
        product: mapProduct(p.product),
        kiteGrossPnL: round2(p.pnl),
        exchange: p.exchange === "BFO" ? "BFO" : "NFO",
        instrumentToken: p.instrument_token,
      } satisfies Position;
    });
}

function ltpMapFromPositions(net: KitePosition[], day: KitePosition[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of [...net, ...day]) {
    if (isFoExchange(row.exchange) && row.last_price > 0) {
      map.set(row.tradingsymbol, row.last_price);
    }
  }
  return map;
}

export interface LiveKiteSnapshot {
  positions: Position[];
  closedPositions: ClosedPosition[];
  trades: import("kiteconnect").Trade[];
  executedTransactions: import("../types.js").ExecutedTransaction[];
  openOrders: DemoOrder[];
  orderHistory: DemoOrder[];
  margins: {
    net: number;
    available: number;
    openingBalance: number;
    m2mRealised: number;
    m2mUnrealised: number;
    marginEnabled: boolean;
  };
}

/** Single Kite fetch for positions, orders, and today's closed legs — source of truth for gross P&L. */
export async function fetchLiveKiteSnapshot(
  accessToken: string,
  audit?: LiveKiteAuditContext,
): Promise<LiveKiteSnapshot> {
  const kite = kiteClient(accessToken);
  const [orders, trades, { net, day }, marginsRaw] = await Promise.all([
    kite.getOrders(),
    kite.getTrades(),
    kite.getPositions(),
    kite.getMargins("equity"),
  ]);
  const margins = parseEquityMargins(marginsRaw);

  await loadKiteInstruments();
  const ltpBySymbol = ltpMapFromPositions(net, day);
  const { openOrders, orderHistory } = partitionKiteOrders(orders, ltpBySymbol);
  const positions = mapKiteNetPositions(net);
  const closedPositions = buildClosedPositionsFromKiteDayBook(day, net, trades);
  const executedTransactions = buildExecutedTransactions(orders);

  const snapshot: LiveKiteSnapshot = {
    positions,
    closedPositions,
    trades,
    executedTransactions,
    openOrders,
    orderHistory,
    margins: {
      net: margins.net,
      available: margins.available,
      openingBalance: margins.openingBalance,
      m2mRealised: margins.m2mRealised,
      m2mUnrealised: margins.m2mUnrealised,
      marginEnabled: margins.marginEnabled,
    },
  };

  if (audit?.userId) {
    void recordKiteAuditLog(audit.userId, {
      source: audit.source,
      force: audit.force,
      raw: {
        orders,
        trades,
        positions: { net, day },
        margins: marginsRaw,
      },
      derived: {
        closedPositions,
        enrichedClosed: enrichClosedPositions(closedPositions, trades),
        executedTransactions,
        openPositionCount: positions.length,
        marginsSummary: snapshot.margins,
      },
    }).catch((error) => {
      console.error(`Kite audit log failed (${audit.userId}):`, error);
    });
  }

  return snapshot;
}
