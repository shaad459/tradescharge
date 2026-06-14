import type { Request, Response } from "express";
import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG } from "../constants.js";
import {
  cancelOpenOrder,
  findMockLongPosition,
  pendingSellQuantity,
  placeDemoOrder,
} from "../mock/orderBook.js";
import {
  MOCK_BALANCE,
  getMockPositions,
  getClosedPositions,
} from "../mock/positionStore.js";
import type { PlaceOrderRequest, Position } from "../types.js";
import { buildDashboard } from "./dashboard.js";
import { fetchLiveKiteSnapshot } from "./liveKiteSync.js";
import { refreshLiveStream } from "./liveStream.js";
import {
  cancelKiteOrder,
  fetchLiveMargins,
  fetchLivePositions,
  getSession,
  isKiteConfigured,
  placeKiteOrder,
  refreshMockPositionsFromKite,
} from "./kite.js";
import { parseKiteOrderError, validateOrder } from "./orderValidation.js";
import { getTradingMode } from "../utils/tradingMode.js";

function findHeldQuantity(body: PlaceOrderRequest, positions: Position[]): number {
  const match = positions.find(
    (p) =>
      p.symbol === body.symbol.toUpperCase() &&
      p.instrumentType === body.instrumentType &&
      p.strike === body.strike &&
      p.expiry === body.expiry &&
      p.side === "long",
  );
  return match?.quantity ?? 0;
}

async function buildDemoDashboardResponse(req: Request) {
  const userId = req.cookies?.tc_user as string | undefined;
  const session = userId ? getSession(userId) : undefined;
  const tradingMode = getTradingMode(req);
  const kiteConnected = Boolean(session?.accessToken && isKiteConfigured());

  if (kiteConnected && tradingMode === "demo" && session) {
    const [margins, refreshedPositions] = await Promise.all([
      fetchLiveMargins(session.accessToken),
      refreshMockPositionsFromKite(session.accessToken),
    ]);
    return buildDashboard(
      refreshedPositions,
      margins.net,
      margins.available,
      "demo",
      true,
      getClosedPositions(),
      true,
    );
  }

  return buildDashboard(
    getMockPositions(),
    MOCK_BALANCE,
    MOCK_BALANCE * 0.82,
    "demo",
    false,
    getClosedPositions(),
    false,
  );
}

function orderMessage(
  body: PlaceOrderRequest,
  queued: boolean,
  fillPrice: number,
  symbol: string,
): string {
  if (queued) {
    if (body.orderType === "LIMIT") {
      return `Demo ${body.side} LIMIT at ₹${body.price} — open order. Fills when LTP reaches your price.`;
    }
    const trigger = Number(body.triggerPrice);
    return (
      `Demo ${body.orderType} ${body.side} placed — active while LTP is above ₹${trigger}. ` +
      `Position stays open until LTP falls to the trigger (like Kite).`
    );
  }

  if (body.side === "BUY") {
    return `Demo BUY ${body.orderType} at ₹${fillPrice} — added to position.`;
  }

  const stillOpen = getMockPositions().some(
    (p) =>
      p.symbol === symbol &&
      p.instrumentType === body.instrumentType &&
      p.strike === body.strike &&
      p.expiry === body.expiry,
  );

  if (!stillOpen) {
    return `Demo ${body.side} ${body.orderType} at ₹${fillPrice} — position closed.`;
  }
  return `Demo ${body.side} ${body.orderType} at ₹${fillPrice} — quantity reduced.`;
}

export async function handlePlaceOrder(req: Request, res: Response) {
  const body = req.body as PlaceOrderRequest;

  const symbol = body.symbol?.toUpperCase() as IndexSymbol;
  const config = INDEX_CONFIG[symbol];
  if (!config) {
    return res.status(400).json({ error: "Unsupported symbol" });
  }

  const lotSize = body.lotSize || config.lotSize;
  const lots = Number(body.lots);
  const quantity = Number.isFinite(lots) ? lots * lotSize : 0;

  const userId = req.cookies?.tc_user as string | undefined;
  const session = userId ? getSession(userId) : undefined;
  const useLive = Boolean(session?.accessToken && isKiteConfigured() && body.mode !== "demo");

  let heldQuantity = 0;
  if (body.side === "SELL") {
    if (useLive && session) {
      const livePositions = await fetchLivePositions(session.accessToken);
      heldQuantity = findHeldQuantity(body, livePositions);
    } else {
      heldQuantity =
        findHeldQuantity(body, getMockPositions()) - pendingSellQuantity(body);
    }
  }

  const validation = validateOrder(body, {
    quantity,
    heldQuantity,
    availableMargin: useLive ? undefined : MOCK_BALANCE * 0.82,
    isLive: useLive,
    isAuthenticated: Boolean(session?.accessToken),
  });

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error ?? "Order validation failed." });
  }

  const price =
    body.orderType === "LIMIT" || body.orderType === "SL"
      ? Number(body.price)
      : body.orderType === "SL-M"
        ? Number(body.triggerPrice)
        : Number(body.ltp);

  try {
    if (useLive && session) {
      const [margins, positions] = await Promise.all([
        fetchLiveMargins(session.accessToken),
        fetchLivePositions(session.accessToken),
      ]);

      const liveMarginCheck = validateOrder(body, {
        quantity,
        heldQuantity: findHeldQuantity(body, positions),
        availableMargin: margins.available,
        isLive: true,
        isAuthenticated: true,
      });

      if (!liveMarginCheck.valid) {
        return res.status(400).json({ error: liveMarginCheck.error ?? "Order validation failed." });
      }

      const orderId = await placeKiteOrder(session.accessToken, {
        exchange: body.exchange ?? config.exchange,
        tradingsymbol: body.tradingsymbol,
        transaction_type: body.side,
        quantity,
        product: body.product ?? "NRML",
        order_type: body.orderType,
        price: body.orderType === "LIMIT" || body.orderType === "SL" ? price : undefined,
        trigger_price:
          body.orderType === "SL" || body.orderType === "SL-M"
            ? Number(body.triggerPrice)
            : undefined,
        validity: body.validity ?? "DAY",
        disclosed_quantity: body.disclosedQuantity,
        amo: body.amo,
      });

      // Give Kite a moment to reflect fills, then refresh positions for the response.
      if (body.orderType === "MARKET" || body.orderType === "SL-M") {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      const snapshot = userId
        ? await refreshLiveStream(userId, session.accessToken)
        : await fetchLiveKiteSnapshot(session.accessToken);

      const dashboard = buildDashboard(
        snapshot.positions,
        snapshot.margins.net,
        snapshot.margins.available,
        "live",
        true,
        snapshot.closedPositions,
        true,
        {
          openOrders: snapshot.openOrders,
          orderHistory: snapshot.orderHistory,
          executedTransactions: snapshot.executedTransactions,
        },
        {
          openingBalance: snapshot.margins.openingBalance,
          m2mRealised: snapshot.margins.m2mRealised,
          m2mUnrealised: snapshot.margins.m2mUnrealised,
          marginEnabled: snapshot.margins.marginEnabled,
        },
        snapshot.trades,
      );

      return res.json({
        success: true,
        orderId: String(orderId),
        message: `${body.side} order placed on Kite.`,
        mode: "live",
        dashboard,
      });
    }

    const mockPosition = findMockLongPosition(body);
    const currentLtp = mockPosition?.ltp ?? Number(body.ltp);
    const result = placeDemoOrder(body, quantity, lotSize, lots, currentLtp);
    const fillPrice = result.order.fillPrice ?? price;
    const dashboard = await buildDemoDashboardResponse(req);

    return res.json({
      success: true,
      orderId: result.order.id,
      message: orderMessage(body, result.queued, fillPrice, symbol),
      mode: "demo",
      dashboard,
    });
  } catch (error) {
    const message = parseKiteOrderError(error);
    return res.status(400).json({ error: message });
  }
}

export async function handleCancelOrder(req: Request, res: Response) {
  const orderId = req.params.id;
  if (!orderId) {
    return res.status(400).json({ error: "Order id is required." });
  }

  const userId = req.cookies?.tc_user as string | undefined;
  const session = userId ? getSession(userId) : undefined;
  const tradingMode = getTradingMode(req);
  const useLive = Boolean(session?.accessToken && isKiteConfigured() && tradingMode === "live");

  try {
    if (useLive && session) {
      const kite = (await import("./kite.js")).kiteClient(session.accessToken);
      const orders = await kite.getOrders();
      const match = orders.find((order) => String(order.order_id) === orderId);
      await cancelKiteOrder(session.accessToken, orderId, match?.variety ?? "regular");

      const snapshot = userId
        ? await refreshLiveStream(userId, session.accessToken)
        : await fetchLiveKiteSnapshot(session.accessToken);
      const dashboard = buildDashboard(
        snapshot.positions,
        snapshot.margins.net,
        snapshot.margins.available,
        "live",
        true,
        snapshot.closedPositions,
        true,
        {
          openOrders: snapshot.openOrders,
          orderHistory: snapshot.orderHistory,
          executedTransactions: snapshot.executedTransactions,
        },
        {
          openingBalance: snapshot.margins.openingBalance,
          m2mRealised: snapshot.margins.m2mRealised,
          m2mUnrealised: snapshot.margins.m2mUnrealised,
          marginEnabled: snapshot.margins.marginEnabled,
        },
        snapshot.trades,
      );

      return res.json({
        success: true,
        message: "Order cancelled on Kite.",
        dashboard,
      });
    }

    const cancelled = cancelOpenOrder(orderId);
    if (!cancelled) {
      return res.status(404).json({ error: "Open order not found." });
    }

    const dashboard = await buildDemoDashboardResponse(req);
    return res.json({
      success: true,
      order: cancelled,
      message: "Order cancelled.",
      dashboard,
    });
  } catch (error) {
    const message = parseKiteOrderError(error);
    return res.status(400).json({ error: message });
  }
}
