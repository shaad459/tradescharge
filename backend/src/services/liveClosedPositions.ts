import type { Order as KiteOrder, Position as KitePosition, Trade } from "kiteconnect";
import { getLotSize } from "../constants.js";
import type { ClosedPosition } from "../types.js";
import { isFoExchange, parseTradingsymbol } from "./instrumentSymbol.js";
import { kiteClient } from "./kite.js";
interface BuyLot {
  price: number;
  qty: number;
}
interface MatchedCloseLeg {
  buyPrice: number;
  quantity: number;
}
interface SellOrderGroup {
  executionKey: string;
  orderIds: string[];
  bookKey: string;
  trades: Trade[];
  firstFillMs: number;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function positionBookKey(tradingsymbol: string, exchange: string, product: string): string {
  return `${exchange}:${tradingsymbol}:${product}`;
}
function tradeKey(trade: Pick<Trade, "exchange" | "tradingsymbol" | "product">): string {
  return positionBookKey(trade.tradingsymbol, trade.exchange, trade.product);
}
function orderBookKey(order: Pick<KiteOrder, "exchange" | "tradingsymbol" | "product">): string {
  return positionBookKey(order.tradingsymbol, order.exchange, order.product);
}
function normalizedOrderId(trade: Pick<Trade, "order_id" | "exchange_order_id" | "trade_id">): string {
  if (trade.order_id != null && String(trade.order_id).trim() !== "") {
    return String(trade.order_id).trim();
  }
  if (trade.exchange_order_id != null && String(trade.exchange_order_id).trim() !== "") {
    return `ex:${String(trade.exchange_order_id).trim()}`;
  }
  return `fill:${trade.trade_id}`;
}
function tradeQty(trade: Trade): number {
  const qty = trade.quantity ?? trade.filled;
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}
function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function entryPriceFromDay(
  dayByKey: Map<string, KitePosition>,
  key: string,
  tradingsymbol: string,
): number | undefined {
  const day = dayByKey.get(key);
  if (!day) {
    return undefined;
  }
  if (day.day_buy_quantity > 0 && day.day_buy_price > 0) {
    return day.day_buy_price;
  }
  if (day.buy_price > 0) {
    return day.buy_price;
  }
  if (day.average_price > 0) {
    return day.average_price;
  }
  console.warn(`No entry price on Kite day book for ${tradingsymbol}; skipping closed leg.`);
  return undefined;
}
function weightedBuyPrice(legs: MatchedCloseLeg[]): number {
  const totalQty = legs.reduce((sum, leg) => sum + leg.quantity, 0);
  if (totalQty <= 0) {
    return 0;
  }
  const cost = legs.reduce((sum, leg) => sum + leg.buyPrice * leg.quantity, 0);
  return round2(cost / totalQty);
}
/**
 * Map each Kite sell order_id â†’ execution cluster.
 * Partial fills share one order_id; autoslice / CO children may share parent or order_timestamp.
 */
export function buildSellExecutionClusterMap(orders: KiteOrder[]): Map<string, string> {
  const orderIdToCluster = new Map<string, string>();
  const sellOrders = orders.filter(
    (order) => order.transaction_type === "SELL" && isFoExchange(order.exchange),
  );
  for (const order of sellOrders) {
    const id = String(order.order_id).trim();
    const parent = order.parent_order_id?.trim();
    if (parent) {
      orderIdToCluster.set(id, `${orderBookKey(order)}|parent:${parent}`);
    }
  }
  const byTimestamp = new Map<string, KiteOrder[]>();
  for (const order of sellOrders) {
    const id = String(order.order_id).trim();
    if (orderIdToCluster.has(id)) {
      continue;
    }
    const bucketKey = `${orderBookKey(order)}|${toIsoTimestamp(order.order_timestamp)}`;
    const list = byTimestamp.get(bucketKey) ?? [];
    list.push(order);
    byTimestamp.set(bucketKey, list);
  }
  for (const [bucketKey, bucketOrders] of byTimestamp) {
    if (bucketOrders.length <= 1) {
      continue;
    }
    const clusterKey = `${bucketKey}|batch`;
    for (const order of bucketOrders) {
      orderIdToCluster.set(String(order.order_id).trim(), clusterKey);
    }
  }
  const BURST_MS = 15_000;
  const unclustered = sellOrders
    .filter((order) => !orderIdToCluster.has(String(order.order_id).trim()))
    .sort(
      (a, b) =>
        new Date(a.order_timestamp).getTime() - new Date(b.order_timestamp).getTime(),
    );
  let burst: KiteOrder[] = [];
  const flushBurst = () => {
    if (burst.length === 0) {
      return;
    }
    const book = orderBookKey(burst[0]);
    const anchorMs = new Date(burst[0].order_timestamp).getTime();
    const clusterKey =
      burst.length > 1
        ? `${book}|burst:${anchorMs}`
        : `${book}|order:${String(burst[0].order_id).trim()}`;
    for (const order of burst) {
      orderIdToCluster.set(String(order.order_id).trim(), clusterKey);
    }
    burst = [];
  };
  for (const order of unclustered) {
    if (burst.length === 0) {
      burst.push(order);
      continue;
    }
    const sameBook = orderBookKey(order) === orderBookKey(burst[0]);
    const withinBurst =
      new Date(order.order_timestamp).getTime() - new Date(burst[0].order_timestamp).getTime() <=
      BURST_MS;
    if (sameBook && withinBurst) {
      burst.push(order);
    } else {
      flushBurst();
      burst.push(order);
    }
  }
  flushBurst();
  for (const order of sellOrders) {
    const id = String(order.order_id).trim();
    if (!orderIdToCluster.has(id)) {
      orderIdToCluster.set(id, `${orderBookKey(order)}|order:${id}`);
    }
  }
  return orderIdToCluster;
}
function sellExecutionKey(trade: Trade, clusterMap: Map<string, string>): string {
  const orderId = normalizedOrderId(trade);
  const clustered = clusterMap.get(orderId);
  if (clustered) {
    return clustered;
  }
  return `${tradeKey(trade)}|order:${orderId}`;
}
/** One Zerodha sell execution â†’ one closed row (partial fills + autoslice batch merged). */
function pushConsolidatedClose(
  closed: ClosedPosition[],
  legs: MatchedCloseLeg[],
  meta: {
    executionKey: string;
    exitOrderIds: string[];
    tradingsymbol: string;
    exchange: string;
    product: string;
    exitPrice: number;
    closedAt: string;
  },
): void {
  if (legs.length === 0) {
    return;
  }
  const parsed = parseTradingsymbol(meta.tradingsymbol);
  const quantity = legs.reduce((sum, leg) => sum + leg.quantity, 0);
  if (quantity <= 0) {
    return;
  }
  const exitBrokerageOrders = meta.exitOrderIds.length;
  const primaryOrderId = meta.exitOrderIds[0];
  closed.push({
    id: `live-exec-${meta.executionKey.replace(/[|:]/g, "-")}`,
    exitOrderId: primaryOrderId,
    exitOrderIds: exitBrokerageOrders > 1 ? meta.exitOrderIds : undefined,
    exitBrokerageOrders,
    tradingsymbol: meta.tradingsymbol,
    exchange: meta.exchange as "NFO" | "BFO",
    symbol: parsed.symbol,
    instrumentType: parsed.instrumentType,
    strike: parsed.strike,
    expiry: parsed.expiry,
    side: "long",
    buyPrice: weightedBuyPrice(legs),
    exitPrice: meta.exitPrice,
    quantity,
    lotSize: getLotSize(parsed.symbol),
    product: meta.product === "MIS" ? "MIS" : "NRML",
    closedAt: meta.closedAt,
  });
}
function fifoMatchSell(
  bookKey: string,
  sellQty: number,
  buyQueues: Map<string, BuyLot[]>,
  dayByKey: Map<string, KitePosition>,
  tradingsymbol: string,
): MatchedCloseLeg[] {
  let remaining = sellQty;
  const queue = buyQueues.get(bookKey) ?? [];
  const matchedLegs: MatchedCloseLeg[] = [];
  while (remaining > 0 && queue.length > 0) {
    const lot = queue[0];
    const matched = Math.min(remaining, lot.qty);
    matchedLegs.push({ buyPrice: lot.price, quantity: matched });
    lot.qty -= matched;
    remaining -= matched;
    if (lot.qty <= 0) {
      queue.shift();
    }
  }
  if (remaining > 0) {
    const entry = entryPriceFromDay(dayByKey, bookKey, tradingsymbol);
    if (entry != null) {
      matchedLegs.push({ buyPrice: entry, quantity: remaining });
      remaining = 0;
    }
  }
  buyQueues.set(bookKey, queue);
  return matchedLegs;
}
function consolidateSellOrder(group: SellOrderGroup): {
  totalQty: number;
  exitPrice: number;
  closedAt: string;
} {
  let totalQty = 0;
  let turnover = 0;
  let closedAt = "";
  for (const trade of group.trades) {
    const qty = tradeQty(trade);
    totalQty += qty;
    turnover += trade.average_price * qty;
    const ts = toIsoTimestamp(trade.fill_timestamp);
    if (!closedAt || new Date(ts).getTime() > new Date(closedAt).getTime()) {
      closedAt = ts;
    }
  }
  return {
    totalQty,
    exitPrice: totalQty > 0 ? round2(turnover / totalQty) : 0,
    closedAt,
  };
}
/**
 * Build today's closed F&O from Kite trade book.
 * - FIFO for cost basis
 * - One row per sell **execution** (partial fills on one order_id merged; autoslice batch merged)
 * - Brokerage: â‚¹20 Ã— distinct exit order ids (matches Zerodha per executed order)
 */
export function buildClosedPositionsFromTrades(
  trades: Trade[],
  dayPositions: KitePosition[] = [],
  orders: KiteOrder[] = [],
): ClosedPosition[] {
  const dayByKey = new Map<string, KitePosition>();
  for (const day of dayPositions) {
    if (isFoExchange(day.exchange)) {
      dayByKey.set(tradeKey(day), day);
    }
  }
  const sellClusterMap = buildSellExecutionClusterMap(orders);
  const foTrades = trades
    .filter((trade) => isFoExchange(trade.exchange))
    .filter((trade) => tradeQty(trade) > 0);
  const buyTrades = foTrades
    .filter((t) => t.transaction_type === "BUY")
    .sort((a, b) => new Date(a.fill_timestamp).getTime() - new Date(b.fill_timestamp).getTime());
  const sellTrades = foTrades.filter((t) => t.transaction_type === "SELL");
  const buyQueues = new Map<string, BuyLot[]>();
  for (const trade of buyTrades) {
    const key = tradeKey(trade);
    const queue = buyQueues.get(key) ?? [];
    queue.push({ price: trade.average_price, qty: tradeQty(trade) });
    buyQueues.set(key, queue);
  }
  const sellGroups = new Map<string, SellOrderGroup>();
  for (const trade of sellTrades) {
    const executionKey = sellExecutionKey(trade, sellClusterMap);
    const fillMs = new Date(trade.fill_timestamp).getTime();
    const orderId = normalizedOrderId(trade);
    const existing = sellGroups.get(executionKey);
    if (existing) {
      existing.trades.push(trade);
      existing.firstFillMs = Math.min(existing.firstFillMs, fillMs);
      if (!existing.orderIds.includes(orderId)) {
        existing.orderIds.push(orderId);
      }
    } else {
      sellGroups.set(executionKey, {
        executionKey,
        orderIds: [orderId],
        bookKey: tradeKey(trade),
        trades: [trade],
        firstFillMs: fillMs,
      });
    }
  }
  const orderedSellGroups = [...sellGroups.values()].sort((a, b) => a.firstFillMs - b.firstFillMs);
  const closed: ClosedPosition[] = [];
  for (const group of orderedSellGroups) {
    const sample = group.trades[0];
    const { totalQty, exitPrice, closedAt } = consolidateSellOrder(group);
    if (totalQty <= 0) {
      continue;
    }
    const matchedLegs = fifoMatchSell(
      group.bookKey,
      totalQty,
      buyQueues,
      dayByKey,
      sample.tradingsymbol,
    );
    pushConsolidatedClose(closed, matchedLegs, {
      executionKey: group.executionKey,
      exitOrderIds: group.orderIds,
      tradingsymbol: sample.tradingsymbol,
      exchange: sample.exchange,
      product: sample.product,
      exitPrice,
      closedAt,
    });
  }
  return closed.sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );
}
function countDistinctBrokerageOrders(trades: Trade[]): {
  entryByKey: Map<string, number>;
  exitByKey: Map<string, number>;
} {
  const entrySets = new Map<string, Set<string>>();
  const exitSets = new Map<string, Set<string>>();

  for (const trade of trades) {
    if (!isFoExchange(trade.exchange)) {
      continue;
    }
    const key = tradeKey(trade);
    const orderId = normalizedOrderId(trade);
    if (trade.transaction_type === "BUY") {
      const set = entrySets.get(key) ?? new Set();
      set.add(orderId);
      entrySets.set(key, set);
    } else if (trade.transaction_type === "SELL") {
      const set = exitSets.get(key) ?? new Set();
      set.add(orderId);
      exitSets.set(key, set);
    }
  }

  const toCount = (sets: Map<string, Set<string>>) =>
    new Map([...sets].map(([key, ids]) => [key, Math.max(1, ids.size)]));

  return {
    entryByKey: toCount(entrySets),
    exitByKey: toCount(exitSets),
  };
}

/** First intraday fill on this contract — opening side for a flat leg. */
export function inferClosedSideFromTrades(
  trades: Trade[],
  bookKey: string,
): "long" | "short" | undefined {
  let firstMs = Number.POSITIVE_INFINITY;
  let firstSide: "long" | "short" | undefined;

  for (const t of trades) {
    if (!isFoExchange(t.exchange) || tradeKey(t) !== bookKey) {
      continue;
    }
    const ms = new Date(t.fill_timestamp).getTime();
    if (ms < firstMs) {
      firstMs = ms;
      firstSide = t.transaction_type === "SELL" ? "short" : "long";
    }
  }

  return firstSide;
}

function inferClosedSide(
  row: KitePosition,
  trades: Trade[],
  bookKey: string,
): "long" | "short" {
  const fromTrades = inferClosedSideFromTrades(trades, bookKey);
  if (fromTrades) {
    return fromTrades;
  }
  if (row.day_sell_quantity > 0 && row.day_buy_quantity === 0) {
    return "short";
  }
  if (row.day_buy_quantity > 0 && row.day_sell_quantity === 0) {
    return "long";
  }
  return "long";
}

/** Entry and exit marks; `buyPrice` / `exitPrice` fields store entry then exit for both sides. */
function closedEntryExitPrices(
  row: KitePosition,
  side: "long" | "short",
): { entryPrice: number; exitPrice: number } {
  const dayBuy =
    row.day_buy_price > 0 ? row.day_buy_price : row.buy_price > 0 ? row.buy_price : 0;
  const daySell =
    row.day_sell_price > 0 ? row.day_sell_price : row.sell_price > 0 ? row.sell_price : 0;

  if (side === "long") {
    const entry = dayBuy > 0 ? dayBuy : row.average_price;
    const exit = daySell > 0 ? daySell : entry;
    return { entryPrice: entry, exitPrice: exit };
  }

  const entry = daySell > 0 ? daySell : row.average_price;
  const exit = dayBuy > 0 ? dayBuy : entry;
  return { entryPrice: entry, exitPrice: exit };
}

function mapBrokerageOrderCounts(
  side: "long" | "short",
  buyOrdersByKey: Map<string, number>,
  sellOrdersByKey: Map<string, number>,
  bookKey: string,
): { entryBrokerageOrders?: number; exitBrokerageOrders?: number } {
  const buy = buyOrdersByKey.get(bookKey);
  const sell = sellOrdersByKey.get(bookKey);
  if (side === "long") {
    return { entryBrokerageOrders: buy, exitBrokerageOrders: sell };
  }
  return { entryBrokerageOrders: sell, exitBrokerageOrders: buy };
}

function peakTradeQuantity(trades: Trade[], bookKey: string): number {
  let peak = 0;
  for (const trade of trades) {
    if (!isFoExchange(trade.exchange) || tradeKey(trade) !== bookKey) {
      continue;
    }
    peak = Math.max(peak, tradeQty(trade));
  }
  return peak;
}

function lastFillTimestampByKey(trades: Trade[]): Map<string, string> {
  const lastMs = new Map<string, number>();
  for (const trade of trades) {
    if (!isFoExchange(trade.exchange)) {
      continue;
    }
    const key = tradeKey(trade);
    const ms = new Date(trade.fill_timestamp).getTime();
    if (ms > (lastMs.get(key) ?? 0)) {
      lastMs.set(key, ms);
    }
  }
  return new Map([...lastMs].map(([key, ms]) => [key, new Date(ms).toISOString()]));
}

/** Kite Positions P&L for flat legs — prefer `pnl` / `m2m`, then turnover delta. */
function intradayGrossPnL(row: KitePosition): number {
  const realised = row.realised ?? 0;
  const pnl = row.pnl ?? 0;
  const m2m = row.m2m ?? 0;

  if (Math.abs(pnl) >= 0.005) {
    return round2(pnl);
  }
  if (Math.abs(realised) >= 0.005) {
    return round2(realised);
  }
  if (Math.abs(m2m) >= 0.005) {
    return round2(m2m);
  }
  if (row.day_sell_value > 0 && row.day_buy_value > 0) {
    return round2(row.day_sell_value - row.day_buy_value);
  }
  if (
    row.day_buy_quantity > 0 &&
    row.day_sell_quantity > 0 &&
    row.day_buy_price > 0 &&
    row.day_sell_price > 0
  ) {
    const qty = Math.min(row.day_buy_quantity, row.day_sell_quantity);
    return round2((row.day_sell_price - row.day_buy_price) * qty);
  }
  return round2(pnl + realised + m2m);
}

function pushClosedFromKiteRow(
  row: KitePosition,
  netQtyByKey: Map<string, number>,
  trades: Trade[],
  entryByKey: Map<string, number>,
  exitByKey: Map<string, number>,
  lastFillByKey: Map<string, string>,
  closed: ClosedPosition[],
  seen: Set<string>,
): void {
  if (!isFoExchange(row.exchange)) {
    return;
  }

  const key = positionBookKey(row.tradingsymbol, row.exchange, row.product);
  if (seen.has(key) || (netQtyByKey.get(key) ?? 0) !== 0) {
    return;
  }

  const grossPnL = intradayGrossPnL(row);
  const dayActivity =
    row.day_buy_quantity > 0 ||
    row.day_sell_quantity > 0 ||
    row.buy_quantity > 0 ||
    row.sell_quantity > 0;

  if (!dayActivity && Math.abs(grossPnL) < 0.005) {
    return;
  }

  const parsed = parseTradingsymbol(row.tradingsymbol);
  const side = inferClosedSide(row, trades, key);
  const { entryPrice, exitPrice } = closedEntryExitPrices(row, side);
  const brokerage = mapBrokerageOrderCounts(side, entryByKey, exitByKey, key);
  const lotSize = getLotSize(parsed.symbol);
  let quantity = Math.max(row.day_buy_quantity, row.day_sell_quantity, 0);
  const peakQty = peakTradeQuantity(trades, key);
  if (peakQty > 0) {
    quantity = peakQty;
  }
  const product = row.product === "MIS" ? "MIS" : "NRML";

  closed.push({
    id: `${row.tradingsymbol}:${product}`,
    tradingsymbol: row.tradingsymbol,
    exchange: row.exchange === "BFO" ? "BFO" : "NFO",
    symbol: parsed.symbol,
    instrumentType: parsed.instrumentType,
    strike: parsed.strike,
    expiry: parsed.expiry,
    side,
    buyPrice: round2(entryPrice),
    exitPrice: round2(exitPrice),
    quantity,
    lotSize,
    product,
    closedAt: lastFillByKey.get(key) ?? new Date().toISOString(),
    kiteGrossPnL: round2(grossPnL),
    entryBrokerageOrders: brokerage.entryBrokerageOrders,
    exitBrokerageOrders: brokerage.exitBrokerageOrders,
  });
  seen.add(key);
}

/**
 * One closed row per contract (tradingsymbol + product), matching Kite Positions.
 * Re-entry and re-exit on the same strike stay on one row; gross = Kite day/net `pnl`.
 */
export function buildClosedPositionsFromKiteDayBook(
  dayPositions: KitePosition[],
  netPositions: KitePosition[] = [],
  trades: Trade[] = [],
): ClosedPosition[] {
  const netQtyByKey = new Map<string, number>();
  for (const row of netPositions) {
    if (isFoExchange(row.exchange)) {
      netQtyByKey.set(positionBookKey(row.tradingsymbol, row.exchange, row.product), row.quantity);
    }
  }

  const { entryByKey, exitByKey } = countDistinctBrokerageOrders(trades);
  const lastFillByKey = lastFillTimestampByKey(trades);
  const closed: ClosedPosition[] = [];
  const seen = new Set<string>();

  for (const day of dayPositions) {
    pushClosedFromKiteRow(
      day,
      netQtyByKey,
      trades,
      entryByKey,
      exitByKey,
      lastFillByKey,
      closed,
      seen,
    );
  }

  for (const net of netPositions) {
    if (net.quantity !== 0) {
      continue;
    }
    pushClosedFromKiteRow(
      net,
      netQtyByKey,
      trades,
      entryByKey,
      exitByKey,
      lastFillByKey,
      closed,
      seen,
    );
  }

  return closed.sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );
}

/** Spread Kite day-book `realised` across trade-built legs (legacy / debug). */
export function applyKiteRealisedGross(
  closed: ClosedPosition[],
  dayPositions: KitePosition[] = [],
): void {
  if (closed.length === 0) {
    return;
  }
  const legsByKey = new Map<string, ClosedPosition[]>();
  for (const leg of closed) {
    if (!leg.tradingsymbol || !leg.exchange) {
      continue;
    }
    const key = positionBookKey(leg.tradingsymbol, leg.exchange, leg.product ?? "NRML");
    const list = legsByKey.get(key) ?? [];
    list.push(leg);
    legsByKey.set(key, list);
  }
  for (const day of dayPositions) {
    if (!isFoExchange(day.exchange)) {
      continue;
    }
    const key = positionBookKey(day.tradingsymbol, day.exchange, day.product);
    const legs = legsByKey.get(key);
    if (!legs?.length) {
      continue;
    }
    const realised = day.realised ?? 0;
    if (!Number.isFinite(realised) || Math.abs(realised) < 0.005) {
      continue;
    }
    const calcGross = legs.map((leg) =>
      leg.side === "short"
        ? round2((leg.buyPrice - leg.exitPrice) * leg.quantity)
        : round2((leg.exitPrice - leg.buyPrice) * leg.quantity),
    );
    const calcTotal = round2(calcGross.reduce((sum, value) => sum + value, 0));
    if (Math.abs(calcTotal) < 0.01) {
      if (legs.length === 1) {
        legs[0].kiteGrossPnL = round2(realised);
      }
      continue;
    }
    let assigned = 0;
    for (let index = 0; index < legs.length; index++) {
      const leg = legs[index];
      const share =
        index === legs.length - 1
          ? round2(realised - assigned)
          : round2(realised * (calcGross[index] / calcTotal));
      leg.kiteGrossPnL = share;
      assigned = round2(assigned + share);
    }
  }
}
export async function fetchLiveClosedPositions(accessToken: string): Promise<ClosedPosition[]> {
  const kite = kiteClient(accessToken);
  const [trades, { net, day }] = await Promise.all([kite.getTrades(), kite.getPositions()]);
  return buildClosedPositionsFromKiteDayBook(day, net, trades);
}
/** Debug: compare raw Kite fills vs consolidated closed legs. */
export async function fetchKiteBookSummary(accessToken: string) {
  const kite = kiteClient(accessToken);
  const [orders, trades, positions] = await Promise.all([
    kite.getOrders(),
    kite.getTrades(),
    kite.getPositions(),
  ]);
  const foTrades = trades.filter((t) => isFoExchange(t.exchange));
  const sellTrades = foTrades.filter((t) => t.transaction_type === "SELL");
  const sellOrderIds = new Set(sellTrades.map((t) => normalizedOrderId(t)));
  const clusterMap = buildSellExecutionClusterMap(orders);
  const executionClusters = new Set(
    sellTrades.map((t) => sellExecutionKey(t, clusterMap)),
  );
  const closedKite = buildClosedPositionsFromKiteDayBook(positions.day, positions.net, trades);
  const closedTrades = buildClosedPositionsFromTrades(trades, positions.day, orders);
  applyKiteRealisedGross(closedTrades, positions.day);
  return {
    orderCount: orders.length,
    tradeCount: foTrades.length,
    sellFillCount: sellTrades.length,
    sellOrderCount: sellOrderIds.size,
    sellExecutionCount: executionClusters.size,
    closedPositionCount: closedKite.length,
    tradeBasedClosedCount: closedTrades.length,
    closedPositions: closedKite.map((p) => ({
      id: p.id,
      exitOrderId: p.exitOrderId,
      exitOrderIds: p.exitOrderIds,
      exitBrokerageOrders: p.exitBrokerageOrders,
      tradingsymbol: p.tradingsymbol,
      quantity: p.quantity,
      lotSize: p.lotSize,
      lots: Math.round(p.quantity / p.lotSize),
      buyPrice: p.buyPrice,
      exitPrice: p.exitPrice,
      closedAt: p.closedAt,
      kiteGrossPnL: p.kiteGrossPnL,
    })),
    sellFills: sellTrades.map((t) => ({
      tradeId: t.trade_id,
      orderId: t.order_id,
      executionKey: sellExecutionKey(t, clusterMap),
      tradingsymbol: t.tradingsymbol,
      quantity: t.quantity ?? t.filled,
      price: t.average_price,
      time: toIsoTimestamp(t.fill_timestamp),
    })),
  };
}
