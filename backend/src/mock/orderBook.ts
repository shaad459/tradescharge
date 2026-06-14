import type { DemoOrder, ExecutionAlert, OrderStatus, OrderTag, PlaceOrderRequest } from "../types.js";
import { fetchInstrumentLtp } from "../services/kite.js";
import {
  getMockPositions,
  mergeOrAddMockPosition,
  reduceMockPosition,
} from "./positionStore.js";

let openOrders: DemoOrder[] = [];
let orderHistory: DemoOrder[] = [];
let nextOrderId = 1;
let nextAlertId = 1;

function orderTagFor(body: PlaceOrderRequest): OrderTag | undefined {
  if (body.orderType === "SL" || body.orderType === "SL-M") {
    return "SL";
  }
  if (body.orderType === "LIMIT" && body.side === "SELL") {
    return "TARGET";
  }
  if (body.orderType === "LIMIT" && body.side === "BUY") {
    return "ENTRY";
  }
  return undefined;
}

function alertMessage(order: DemoOrder): string {
  const leg = `${order.symbol} ${order.strike} ${order.instrumentType}`;
  if (order.orderTag === "SL") {
    return `SL hit — ${leg} sold${order.fillPrice != null ? ` at ₹${order.fillPrice}` : ""}`;
  }
  if (order.orderTag === "TARGET") {
    return `Target hit — ${leg} sold${order.fillPrice != null ? ` at ₹${order.fillPrice}` : ""}`;
  }
  return `${order.side} order filled — ${leg}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function orderKey(order: Pick<DemoOrder, "symbol" | "instrumentType" | "strike" | "expiry">): string {
  return `${order.symbol}:${order.instrumentType}:${order.strike}:${order.expiry}`;
}

function cloneOrder(order: DemoOrder): DemoOrder {
  return { ...order };
}

export function getOpenOrders(): DemoOrder[] {
  return openOrders.filter((order) => order.status === "OPEN").map(cloneOrder);
}

export function getOrderHistory(): DemoOrder[] {
  return orderHistory.map(cloneOrder);
}

export function getExecutedOrders(): DemoOrder[] {
  return orderHistory.filter((order) => order.status === "EXECUTED").map(cloneOrder);
}

export function clearOrderBook() {
  openOrders = [];
  orderHistory = [];
  nextOrderId = 1;
}

export function findMockLongPosition(body: PlaceOrderRequest) {
  return getMockPositions().find(
    (p) =>
      p.symbol === body.symbol.toUpperCase() &&
      p.instrumentType === body.instrumentType &&
      p.strike === body.strike &&
      p.expiry === body.expiry &&
      p.side === "long",
  );
}

export function pendingSellQuantity(body: PlaceOrderRequest): number {
  const key = orderKey({
    symbol: body.symbol.toUpperCase(),
    instrumentType: body.instrumentType,
    strike: body.strike,
    expiry: body.expiry,
  });
  return openOrders
    .filter((o) => o.side === "SELL" && orderKey(o) === key)
    .reduce((sum, o) => sum + o.quantity, 0);
}

function resolveLimitPrice(body: PlaceOrderRequest): number {
  return Number(body.price);
}

function resolveTriggerPrice(body: PlaceOrderRequest): number {
  return Number(body.triggerPrice);
}

function shouldQueueOrder(body: PlaceOrderRequest, ltp: number): boolean {
  if (body.orderType === "MARKET") {
    return false;
  }
  if (body.orderType === "LIMIT") {
    const limit = resolveLimitPrice(body);
    if (body.side === "BUY") {
      return ltp > limit;
    }
    return ltp < limit;
  }
  if (body.orderType === "SL" || body.orderType === "SL-M") {
    const trigger = resolveTriggerPrice(body);
    if (body.side === "SELL") {
      return ltp > trigger;
    }
    return ltp < trigger;
  }
  return false;
}

function fillPriceForOrder(body: PlaceOrderRequest, ltp: number): number {
  if (body.orderType === "MARKET") {
    return ltp;
  }
  if (body.orderType === "LIMIT") {
    return resolveLimitPrice(body);
  }
  if (body.orderType === "SL-M") {
    return ltp;
  }
  return resolveLimitPrice(body);
}

function executeFill(
  body: PlaceOrderRequest,
  quantity: number,
  lotSize: number,
  fillPrice: number,
  product: "NRML" | "MIS" = "NRML",
): { openPositionId?: string; closedPositionId?: string } {
  const symbol = body.symbol.toUpperCase();
  if (body.side === "BUY") {
    const position = mergeOrAddMockPosition(
      symbol,
      body.instrumentType,
      body.strike,
      body.expiry,
      "long",
      fillPrice,
      quantity,
      lotSize,
      product,
    );
    return { openPositionId: position.id };
  }

  const result = reduceMockPosition(
    symbol,
    body.instrumentType,
    body.strike,
    body.expiry,
    quantity,
    fillPrice,
  );
  return { closedPositionId: result.closedPositionId };
}

function createOrderRecord(
  body: PlaceOrderRequest,
  quantity: number,
  lotSize: number,
  lots: number,
  ltp: number,
  status: OrderStatus,
  fillPrice?: number,
  orderTag?: OrderTag,
  linkedIds?: { openPositionId?: string; closedPositionId?: string },
): DemoOrder {
  const timestamp = nowIso();
  return {
    id: `ord-${nextOrderId++}`,
    tradingsymbol: body.tradingsymbol,
    symbol: body.symbol.toUpperCase(),
    instrumentType: body.instrumentType,
    strike: body.strike,
    expiry: body.expiry,
    side: body.side,
    orderType: body.orderType,
    product: body.product ?? "NRML",
    quantity,
    lotSize,
    lots,
    price:
      body.orderType === "LIMIT" || body.orderType === "SL" ? resolveLimitPrice(body) : undefined,
    triggerPrice:
      body.orderType === "SL" || body.orderType === "SL-M"
        ? resolveTriggerPrice(body)
        : undefined,
    status,
    orderTag: orderTag ?? orderTagFor(body),
    placedAt: timestamp,
    updatedAt: timestamp,
    fillPrice,
    referenceLtp: ltp,
    openPositionId: linkedIds?.openPositionId,
    closedPositionId: linkedIds?.closedPositionId,
  };
}

function moveToHistory(order: DemoOrder, status: OrderStatus, fillPrice?: number, linkedIds?: {
  openPositionId?: string;
  closedPositionId?: string;
}) {
  orderHistory.unshift({
    ...order,
    status,
    fillPrice,
    openPositionId: linkedIds?.openPositionId ?? order.openPositionId,
    closedPositionId: linkedIds?.closedPositionId ?? order.closedPositionId,
    updatedAt: nowIso(),
  });
}

function buildExecutionAlert(order: DemoOrder): ExecutionAlert | null {
  if (order.status !== "EXECUTED" || !order.orderTag) {
    return null;
  }
  if (order.orderTag !== "SL" && order.orderTag !== "TARGET") {
    return null;
  }

  const navigateTo = order.side === "SELL" ? "closed" : "open";
  const targetId =
    navigateTo === "closed"
      ? order.closedPositionId ?? ""
      : order.openPositionId ?? "";

  if (!targetId) {
    return null;
  }

  return {
    id: `alert-${nextAlertId++}`,
    orderId: order.id,
    orderTag: order.orderTag,
    side: order.side,
    symbol: order.symbol,
    instrumentType: order.instrumentType,
    strike: order.strike,
    expiry: order.expiry,
    fillPrice: order.fillPrice,
    message: alertMessage(order),
    navigateTo,
    targetId,
    timestamp: nowIso(),
  };
}

export interface PlaceDemoOrderResult {
  order: DemoOrder;
  queued: boolean;
}

export function placeDemoOrder(
  body: PlaceOrderRequest,
  quantity: number,
  lotSize: number,
  lots: number,
  ltp: number,
): PlaceDemoOrderResult {
  if (shouldQueueOrder(body, ltp)) {
    const key = orderKey({
      symbol: body.symbol.toUpperCase(),
      instrumentType: body.instrumentType,
      strike: body.strike,
      expiry: body.expiry,
    });

    if (body.side === "SELL") {
      openOrders = openOrders.filter(
        (o) => !(o.side === "SELL" && orderKey(o) === key),
      );
    }

    const order = createOrderRecord(body, quantity, lotSize, lots, ltp, "OPEN");
    openOrders.unshift(order);
    return { order, queued: true };
  }

  const fillPrice = fillPriceForOrder(body, ltp);
  const product = body.product ?? "NRML";
  const linkedIds = executeFill(body, quantity, lotSize, fillPrice, product);
  const order = createOrderRecord(body, quantity, lotSize, lots, ltp, "EXECUTED", fillPrice, undefined, linkedIds);
  moveToHistory(order, "EXECUTED", fillPrice, linkedIds);
  return { order, queued: false };
}

export function cancelOpenOrder(orderId: string): DemoOrder | null {
  const index = openOrders.findIndex((o) => o.id === orderId);
  if (index < 0) {
    return null;
  }
  const [order] = openOrders.splice(index, 1);
  moveToHistory(order, "CANCELLED");
  return cloneOrder({ ...order, status: "CANCELLED", updatedAt: nowIso() });
}

function ltpForOpenOrder(order: DemoOrder, accessToken?: string): number {
  const position = getMockPositions().find(
    (p) =>
      p.symbol === order.symbol &&
      p.instrumentType === order.instrumentType &&
      p.strike === order.strike &&
      p.expiry === order.expiry,
  );
  if (position) {
    return position.ltp;
  }
  return order.referenceLtp;
}

async function refreshOpenOrderLtps(accessToken?: string) {
  if (!accessToken) {
    for (const order of openOrders) {
      const position = findMockLongPosition({
        ...order,
        symbol: order.symbol,
        side: order.side,
        tradingsymbol: order.tradingsymbol,
        lots: order.lots,
        ltp: order.referenceLtp,
      } as PlaceOrderRequest);
      if (position) {
        order.referenceLtp = position.ltp;
      }
    }
    return;
  }

  await Promise.all(
    openOrders.map(async (order) => {
      const position = getMockPositions().find(
        (p) =>
          p.symbol === order.symbol &&
          p.instrumentType === order.instrumentType &&
          p.strike === order.strike &&
          p.expiry === order.expiry,
      );
      if (position) {
        order.referenceLtp = position.ltp;
        return;
      }
      const exchange = order.symbol === "SENSEX" ? "BFO" : "NFO";
      const ltp = await fetchInstrumentLtp(accessToken, exchange, order.tradingsymbol);
      if (ltp != null) {
        order.referenceLtp = ltp;
      }
    }),
  );
}

function bodyFromOrder(order: DemoOrder): PlaceOrderRequest {
  return {
    symbol: order.symbol,
    tradingsymbol: order.tradingsymbol,
    instrumentType: order.instrumentType,
    strike: order.strike,
    expiry: order.expiry,
    side: order.side,
    lots: order.lots,
    lotSize: order.lotSize,
    ltp: order.referenceLtp,
    orderType: order.orderType,
    product: order.product,
    validity: "DAY",
    price: order.price,
    triggerPrice: order.triggerPrice,
    mode: "demo",
  };
}

export interface ProcessPendingOrdersResult {
  executedCount: number;
  alerts: ExecutionAlert[];
}

export async function processPendingOrders(accessToken?: string): Promise<ProcessPendingOrdersResult> {
  if (openOrders.length === 0) {
    return { executedCount: 0, alerts: [] };
  }

  await refreshOpenOrderLtps(accessToken);

  let executedCount = 0;
  const alerts: ExecutionAlert[] = [];
  const remaining: DemoOrder[] = [];

  for (const order of openOrders) {
    const ltp = ltpForOpenOrder(order, accessToken);
    const body = bodyFromOrder(order);

    if (shouldQueueOrder(body, ltp)) {
      order.referenceLtp = ltp;
      remaining.push(order);
      continue;
    }

    try {
      const fillPrice = fillPriceForOrder(body, ltp);
      if (order.side === "SELL") {
        const position = findMockLongPosition(body);
        if (!position || position.quantity < order.quantity) {
          remaining.push(order);
          continue;
        }
      }
      const linkedIds = executeFill(body, order.quantity, order.lotSize, fillPrice, order.product);
      const executedOrder: DemoOrder = {
        ...order,
        status: "EXECUTED",
        fillPrice,
        ...linkedIds,
        updatedAt: nowIso(),
      };
      moveToHistory(executedOrder, "EXECUTED", fillPrice, linkedIds);
      const alert = buildExecutionAlert(executedOrder);
      if (alert) {
        alerts.push(alert);
      }
      executedCount += 1;
    } catch {
      remaining.push(order);
    }
  }

  openOrders = remaining;
  return { executedCount, alerts };
}
