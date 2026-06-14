import { useEffect, useMemo, useState } from "react";
import { fetchBreakeven, placeOrder } from "../api/client";
import type { BreakevenResult, DashboardData, PlaceOrderRequest, TradeSelection } from "../types";
import { TradeSuggestion } from "./TradeSuggestion";
import { formatCurrency, formatOptionPrice, formatPointMove, pnlClass } from "../utils/format";
import { buildPortfolioAwareSuggestion, buildPortfolioRecoverySuggestion, buildTradeSuggestion } from "../utils/tradeSuggestion";
import { weightedEntryLots } from "../utils/portfolio";
import { validateOrder } from "../utils/orderValidation";
import { trackEvent, trackFeature } from "../utils/analytics";
import {
  orderEntryLabel,
  resolveOrderEntryPrice,
  roundToTick,
  suggestedBuySlPrices,
  suggestedLimitPrice,
  suggestedSellSlPrices,
} from "../utils/orderPrice";
import { isExitingOpenLeg } from "../utils/positionSide";

interface OrderPadProps {
  selection: TradeSelection | null;
  availableMargin: number;
  portfolioNetPnL: number;
  startingCapital: number;
  mode: "demo" | "live";
  onClose: () => void;
  onSuccess: (message: string, dashboard?: DashboardData) => void;
}

type OrderType = PlaceOrderRequest["orderType"];
type Product = PlaceOrderRequest["product"];
type Validity = PlaceOrderRequest["validity"];

export function OrderPad({
  selection,
  availableMargin,
  portfolioNetPnL,
  startingCapital,
  mode,
  onClose,
  onSuccess,
}: OrderPadProps) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<Product>("NRML");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [validity, setValidity] = useState<Validity>("DAY");
  const [lotsInput, setLotsInput] = useState("");
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [amo, setAmo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breakeven, setBreakeven] = useState<BreakevenResult | null>(null);

  useEffect(() => {
    if (selection) {
      const exitMode =
        selection.heldLots != null &&
        isExitingOpenLeg(
          selection.positionSide ?? "long",
          selection.initialSide ?? "BUY",
          true,
        );
      setSide(selection.initialSide ?? "BUY");
      setProduct("NRML");
      setOrderType("MARKET");
      setValidity("DAY");
      if (exitMode && selection.heldLots != null) {
        setLotsInput(String(selection.heldLots));
      } else if (selection.defaultLots != null) {
        setLotsInput(String(selection.defaultLots));
      } else {
        setLotsInput("");
      }
      setPrice(String(roundToTick(selection.ltp)));
      setTriggerPrice(String(roundToTick(selection.ltp)));
      setAmo(false);
      setError(null);
      setLoading(false);
      setBreakeven(null);
      trackFeature("order_pad", { side: selection.initialSide ?? "BUY" });
    }
  }, [selection]);

  const lotsTrimmedForEffect = lotsInput.trim();
  const lotsForBreakeven =
    lotsTrimmedForEffect === "" ? NaN : Number(lotsTrimmedForEffect);

  const entryPrice = useMemo(
    () =>
      selection
        ? resolveOrderEntryPrice(orderType, selection.ltp, price, triggerPrice)
        : 0,
    [selection, orderType, price, triggerPrice],
  );

  const entryPriceLabel = orderEntryLabel(orderType);
  const isFixedPriceOrder = orderType !== "MARKET";

  const positionSide = selection?.positionSide ?? "long";
  const fromOpenPosition =
    selection?.heldLots != null && selection?.existingBuyPrice != null;
  const exitingOpen =
    fromOpenPosition &&
    isExitingOpenLeg(positionSide, side, true);
  const addingToOpen =
    fromOpenPosition &&
    (positionSide === "short" ? side === "SELL" : side === "BUY");
  const entryBreakevenActive =
    !exitingOpen &&
    (addingToOpen ||
      (!fromOpenPosition && (side === "BUY" || (side === "SELL" && positionSide === "short"))));

  useEffect(() => {
    if (
      !selection ||
      !entryBreakevenActive ||
      !Number.isFinite(lotsForBreakeven) ||
      lotsForBreakeven <= 0 ||
      entryPrice <= 0
    ) {
      if (!exitingOpen) {
        setBreakeven(null);
      }
      return;
    }

    const fromOpen = selection.heldLots != null && selection.existingBuyPrice != null;
    let calcLots = lotsForBreakeven;
    let heldLots: number | undefined;
    let existingBuyPrice: number | undefined;

    if (fromOpen) {
      heldLots = selection.heldLots;
      existingBuyPrice = selection.existingBuyPrice;
      calcLots = selection.heldLots! + lotsForBreakeven;
    }

    const usePortfolioRecovery = selection.reentryFromClosed;
    const portfolioNetForBreakeven = usePortfolioRecovery
      ? portfolioNetPnL
      : fromOpen && selection.otherPortfolioNet !== undefined
        ? selection.otherPortfolioNet
        : undefined;

    fetchBreakeven(
      entryPrice,
      selection.lotSize,
      calcLots,
      heldLots,
      existingBuyPrice,
      portfolioNetForBreakeven,
      usePortfolioRecovery ? startingCapital : undefined,
      positionSide,
    )
      .then(setBreakeven)
      .catch(() => setBreakeven(null));
  }, [
    selection,
    side,
    lotsForBreakeven,
    entryPrice,
    portfolioNetPnL,
    startingCapital,
    positionSide,
    entryBreakevenActive,
    exitingOpen,
  ]);

  useEffect(() => {
    if (
      !selection ||
      !exitingOpen ||
      selection.heldLots == null ||
      selection.existingBuyPrice == null ||
      selection.otherPortfolioNet === undefined ||
      !Number.isFinite(lotsForBreakeven) ||
      lotsForBreakeven <= 0 ||
      entryPrice <= 0
    ) {
      if (exitingOpen) {
        setBreakeven(null);
      }
      return;
    }

    const held = selection.heldLots;
    const exitLots = lotsForBreakeven;
    if (exitLots > held) {
      setBreakeven(null);
      return;
    }

    const remainingLots = held - exitLots;

    fetchBreakeven(
      entryPrice,
      selection.lotSize,
      remainingLots > 0 ? remainingLots : held,
      held,
      selection.existingBuyPrice,
      selection.otherPortfolioNet,
      undefined,
      positionSide,
    )
      .then(setBreakeven)
      .catch(() => setBreakeven(null));
  }, [selection, side, lotsForBreakeven, entryPrice, exitingOpen, positionSide]);

  const draftOrder = useMemo((): PlaceOrderRequest | null => {
    if (!selection) {
      return null;
    }

    const lotsTrimmed = lotsInput.trim();
    const lots = lotsTrimmed === "" ? NaN : Number(lotsTrimmed);
    const needsPrice = orderType === "LIMIT" || orderType === "SL";
    const needsTrigger = orderType === "SL" || orderType === "SL-M";

    return {
      symbol: selection.symbol,
      tradingsymbol: selection.tradingsymbol,
      instrumentType: selection.instrumentType,
      strike: selection.strike,
      expiry: selection.expiry,
      side,
      lots,
      lotSize: selection.lotSize,
      ltp: selection.ltp,
      orderType,
      product,
      validity,
      exchange: selection.exchange,
      price: needsPrice ? Number(price) : undefined,
      triggerPrice: needsTrigger ? Number(triggerPrice) : undefined,
      amo,
      mode,
    };
  }, [selection, side, product, orderType, validity, lotsInput, price, triggerPrice, amo, mode]);

  const validation = useMemo(() => {
    if (!draftOrder || !selection) {
      return { valid: false as const };
    }

    const lotsTrimmed = lotsInput.trim();
    const lots = lotsTrimmed === "" ? NaN : Number(lotsTrimmed);
    const quantity = Number.isFinite(lots) ? lots * selection.lotSize : 0;
    const heldQuantity =
      selection.heldLots != null &&
      isExitingOpenLeg(selection.positionSide ?? "long", side, true)
        ? selection.heldLots * selection.lotSize
        : undefined;

    return validateOrder(draftOrder, {
      quantity,
      heldQuantity,
      availableMargin,
      isLive: mode === "live",
      isAuthenticated: mode === "live",
    });
  }, [draftOrder, selection, lotsInput, side, availableMargin, mode]);

  if (!selection || !draftOrder) {
    return null;
  }

  const exitMode = isExitingOpenLeg(selection.positionSide ?? "long", side, fromOpenPosition);

  const needsPrice = orderType === "LIMIT" || orderType === "SL";
  const needsTrigger = orderType === "SL" || orderType === "SL-M";
  const lotsTrimmed = lotsInput.trim();
  const lots = lotsTrimmed === "" ? NaN : Number(lotsTrimmed);
  const quantity = Number.isFinite(lots) ? lots * selection.lotSize : 0;

  const addFromPosition =
    fromOpenPosition &&
    (selection.positionSide === "short" ? side === "SELL" : side === "BUY") &&
    Boolean(breakeven?.addingLots) &&
    selection.otherPortfolioNet !== undefined;
  const avgEntryPrice =
    addFromPosition && selection.heldLots != null && selection.existingBuyPrice != null
      ? weightedEntryLots(
          selection.existingBuyPrice,
          selection.heldLots,
          entryPrice,
          selection.heldLots + (Number.isFinite(lots) ? lots : 0),
        )
      : breakeven?.entryPrice;
  const entryGuidance =
    entryBreakevenActive && Number.isFinite(lots) && lots > 0 && breakeven != null;
  const exitGuidance =
    exitMode &&
    Number.isFinite(lots) &&
    lots > 0 &&
    breakeven != null &&
    selection.otherPortfolioNet !== undefined;
  const isRecovery = Boolean(
    breakeven?.recoveryMode &&
      breakeven.portfolioNetPnL !== undefined &&
      selection.reentryFromClosed,
  );
  const isPartialExit = Boolean(breakeven?.partialExitLots && breakeven.partialExitLots > 0);
  const suggestion = entryGuidance
    ? addFromPosition
      ? buildPortfolioAwareSuggestion(
          breakeven.netPnLAtLtp,
          breakeven.breakevenPrice,
          portfolioNetPnL,
          breakeven.portfolioNetPnL ??           selection.otherPortfolioNet ?? 0,
          entryPrice,
          breakeven.legBreakevenPrice,
          undefined,
          selection.positionSide ?? "long",
        )
      : isRecovery
        ? buildPortfolioRecoverySuggestion(portfolioNetPnL, breakeven.breakevenPrice, startingCapital)
        : buildTradeSuggestion(breakeven.netPnLAtLtp, breakeven.breakevenPrice)
    : null;
  const exitSuggestion =
    exitGuidance && breakeven
      ? buildPortfolioAwareSuggestion(
          breakeven.netPnLAtLtp,
          breakeven.breakevenPrice,
          breakeven.portfolioNetAfterPartialExit ?? portfolioNetPnL,
          breakeven.adjustedPortfolioNet ?? selection.otherPortfolioNet ?? 0,
          entryPrice,
          breakeven.legBreakevenPrice,
          breakeven.partialExitLots,
          selection.positionSide ?? "long",
        )
      : null;

  const suggestedExitPrice = exitGuidance
    ? breakeven?.breakevenPrice
    : entryGuidance
      ? breakeven?.breakevenPrice
      : undefined;
  const suggestedSl =
    suggestedExitPrice == null
      ? null
      : exitGuidance && (selection.positionSide ?? "long") === "short"
        ? suggestedBuySlPrices(suggestedExitPrice)
        : suggestedSellSlPrices(suggestedExitPrice);
  const portfolioInProfit = exitGuidance
    ? (breakeven?.portfolioNetAfterPartialExit ?? portfolioNetPnL) >= 0
    : addFromPosition
      ? portfolioNetPnL >= 0
      : isRecovery
        ? portfolioNetPnL >= 0
        : (breakeven?.netPnLAtLtp ?? 0) >= 0;

  function applySuggestedLimit() {
    if (suggestedExitPrice == null) return;
    setOrderType("LIMIT");
    setPrice(String(suggestedLimitPrice(suggestedExitPrice)));
  }

  function applySuggestedSlOrder() {
    if (!suggestedSl) return;
    setOrderType("SL");
    setTriggerPrice(String(suggestedSl.trigger));
    setPrice(String(suggestedSl.limit));
  }

  function applySuggestedSlM() {
    if (!suggestedSl) return;
    setOrderType("SL-M");
    setTriggerPrice(String(suggestedSl.trigger));
  }

  const effectivePrice =
    orderType === "MARKET"
      ? selection.ltp
      : orderType === "SL-M"
        ? Number(triggerPrice) || selection.ltp
        : Number(price) || selection.ltp;
  const orderValue = effectivePrice * quantity;
  const fieldErrors = validation.fieldErrors ?? {};

  function buildOrderPayload(
    overrides: Partial<Pick<PlaceOrderRequest, "side" | "lots" | "orderType">> = {},
  ): PlaceOrderRequest | null {
    if (!selection) {
      return null;
    }

    const lotsTrimmed = lotsInput.trim();
    const parsedLots = lotsTrimmed === "" ? NaN : Number(lotsTrimmed);
    const resolvedLots = overrides.lots ?? parsedLots;
    const resolvedSide = overrides.side ?? side;
    const resolvedOrderType = overrides.orderType ?? orderType;
    const needsPrice = resolvedOrderType === "LIMIT" || resolvedOrderType === "SL";
    const needsTrigger = resolvedOrderType === "SL" || resolvedOrderType === "SL-M";

    return {
      symbol: selection.symbol,
      tradingsymbol: selection.tradingsymbol,
      instrumentType: selection.instrumentType,
      strike: selection.strike,
      expiry: selection.expiry,
      side: resolvedSide,
      lots: resolvedLots,
      lotSize: selection.lotSize,
      ltp: selection.ltp,
      orderType: resolvedOrderType,
      product,
      validity,
      exchange: selection.exchange,
      price: needsPrice ? Number(price) : undefined,
      triggerPrice: needsTrigger ? Number(triggerPrice) : undefined,
      amo,
      mode,
    };
  }

  function validatePayload(order: PlaceOrderRequest) {
    if (!selection) {
      return { valid: false as const, error: "No instrument selected." };
    }

    const orderLots = Number(order.lots);
    const quantity = Number.isFinite(orderLots) ? orderLots * selection.lotSize : 0;
    const heldQuantity =
      order.side === "SELL" && selection.heldLots != null
        ? selection.heldLots * selection.lotSize
        : undefined;

    return validateOrder(order, {
      quantity,
      heldQuantity,
      availableMargin,
      isLive: mode === "live",
      isAuthenticated: mode === "live",
    });
  }

  async function submitOrder(
    overrides: Partial<Pick<PlaceOrderRequest, "side" | "lots" | "orderType">> = {},
  ) {
    if (!selection || loading) {
      return;
    }

    const order = buildOrderPayload(overrides);
    if (!order) {
      return;
    }

    const result = validatePayload(order);
    if (!result.valid) {
      setError(result.error ?? "Order validation failed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const placed = await placeOrder(order);
      trackEvent("order_placed", {
        mode,
        side: order.side,
        orderType: order.orderType,
        product,
      });
      trackFeature("order_placed", { side: order.side, orderType: order.orderType });
      onSuccess(placed.message, placed.dashboard);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitOrder();
  }

  function handleExitClick() {
    if (!selection) {
      return;
    }

    if (!fromOpenPosition || selection.heldLots == null) {
      setSide("SELL");
      return;
    }

    if (side !== "SELL") {
      setSide("SELL");
      setLotsInput(String(selection.heldLots));
      setError(null);
      return;
    }

    void submitOrder({ side: "SELL", lots: selection.heldLots });
  }

  return (
    <div className="trade-overlay" onClick={onClose}>
      <div className={`order-pad panel ${side.toLowerCase()}`} onClick={(e) => e.stopPropagation()}>
        <div className="order-pad-head">
          <div>
            <div className="order-symbol">{selection.tradingsymbol}</div>
            <div className="order-meta">
              {selection.label} · {selection.exchange} · Lot {selection.lotSize}
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="order-ltp-row">
          <span>LTP</span>
          <strong>{formatCurrency(selection.ltp)}</strong>
        </div>

        <div className="trade-side-toggle order-side">
          <button
            type="button"
            className={side === "BUY" ? "active buy" : ""}
            onClick={() => {
              setSide("BUY");
              if (fromOpenPosition) {
                setLotsInput("");
              } else if (selection.defaultLots != null) {
                setLotsInput(String(selection.defaultLots));
              }
            }}
          >
            {fromOpenPosition ? "Add more qty" : "BUY"}
          </button>
          <button
            type="button"
            className={side === "SELL" ? "active sell" : ""}
            disabled={loading}
            onClick={() => {
              if (fromOpenPosition) {
                handleExitClick();
                return;
              }
              setSide("SELL");
            }}
          >
            {fromOpenPosition ? (loading && side === "SELL" ? "Exiting…" : "Exit") : "SELL"}
          </button>
        </div>

        {(error || (exitMode && !validation.valid && validation.error)) && (
          <div className="trade-error trade-error-prominent">
            {error ?? validation.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="order-form">
          <div className="order-field">
            <label>Product</label>
            <div className="segmented">
              {(["NRML", "MIS"] as Product[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={product === p ? "active" : ""}
                  onClick={() => setProduct(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="order-field">
            <label htmlFor="order-type">Order type</label>
            <select
              id="order-type"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
            >
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="SL">SL</option>
              <option value="SL-M">SL-M</option>
            </select>
          </div>

          <div className="order-field">
            <label htmlFor="order-qty">
              Quantity{" "}
              {exitMode && selection.heldLots != null && (
                <span className="field-hint">
                  (full position — {selection.heldLots} lot{selection.heldLots > 1 ? "s" : ""})
                </span>
              )}
              {side === "SELL" && selection.heldLots != null && !exitMode && (
                <span className="field-hint">
                  (max {selection.heldLots} lot{selection.heldLots > 1 ? "s" : ""} held)
                </span>
              )}
              {Number.isFinite(lots) && lots > 0 && (
                <span className="field-hint">
                  ({lots} lot{lots > 1 ? "s" : ""} × {selection.lotSize} = {quantity})
                </span>
              )}
            </label>
            <input
              id="order-qty"
              type="text"
              inputMode="numeric"
              placeholder="Lots"
              value={lotsInput}
              onChange={(e) => setLotsInput(e.target.value.replace(/[^\d]/g, ""))}
              className={fieldErrors.lots ? "input-invalid" : ""}
            />
            {fieldErrors.lots && <p className="field-error">{fieldErrors.lots}</p>}
          </div>

          {needsPrice && (
            <div className="order-field">
              <label htmlFor="order-price">Price</label>
              <input
                id="order-price"
                type="number"
                step="0.05"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={fieldErrors.price ? "input-invalid" : ""}
              />
              {fieldErrors.price && <p className="field-error">{fieldErrors.price}</p>}
            </div>
          )}

          {needsTrigger && (
            <div className="order-field">
              <label htmlFor="order-trigger">Trigger price</label>
              <input
                id="order-trigger"
                type="number"
                step="0.05"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                className={fieldErrors.triggerPrice ? "input-invalid" : ""}
              />
              {fieldErrors.triggerPrice && <p className="field-error">{fieldErrors.triggerPrice}</p>}
            </div>
          )}

          {needsTrigger && orderType === "SL" && (
            <p className="field-hint order-sl-hint">
              SL orders need both trigger (activation) and limit (fill) price, like Kite.
            </p>
          )}

          {needsTrigger && orderType === "SL-M" && (
            <p className="field-hint order-sl-hint">
              SL-M uses trigger only — order becomes a market order once triggered.
            </p>
          )}

          <div className="order-field">
            <label htmlFor="order-validity">Validity</label>
            <select
              id="order-validity"
              value={validity}
              onChange={(e) => setValidity(e.target.value as Validity)}
            >
              <option value="DAY">DAY</option>
              <option value="IOC">IOC</option>
            </select>
          </div>

          <label className="order-checkbox">
            <input type="checkbox" checked={amo} onChange={(e) => setAmo(e.target.checked)} />
            AMO (After Market Order)
          </label>

          {exitGuidance && breakeven && exitSuggestion && (
            <div className="order-guidance">
              <div className="order-guidance-head">
                {isPartialExit
                  ? `Partial exit — ${breakeven.partialExitLots} lot${breakeven.partialExitLots! > 1 ? "s" : ""} at ${isFixedPriceOrder ? formatOptionPrice(entryPrice) : "LTP"}, then ${portfolioInProfit ? "SL" : "target"} on ${breakeven.remainingLots ?? breakeven.lots} active`
                  : `Full exit at ${isFixedPriceOrder ? formatOptionPrice(entryPrice) : "LTP"} — portfolio impact`}
              </div>
              <div className="order-guidance-stats">
                <div
                  className={`order-guidance-stat${portfolioInProfit && suggestedSl ? " suggested-sl-stat" : ""}`}
                >
                  <span>{isPartialExit ? (portfolioInProfit ? "SL on active lots" : "Target on active lots") : portfolioInProfit ? "Portfolio SL" : "Portfolio target"}</span>
                  <strong>{formatOptionPrice(breakeven.breakevenPrice)}</strong>
                </div>
                {portfolioInProfit && suggestedSl && (
                  <>
                    <div className="order-guidance-stat suggested-sl-stat">
                      <span>Breakeven SL trigger</span>
                      <strong>{formatOptionPrice(suggestedSl.trigger)}</strong>
                    </div>
                    <div className="order-guidance-stat suggested-sl-stat">
                      <span>Breakeven SL limit</span>
                      <strong>{formatOptionPrice(suggestedSl.limit)}</strong>
                    </div>
                  </>
                )}
                {isPartialExit && breakeven.realizedPartialNet !== undefined && (
                  <div className="order-guidance-stat">
                    <span>Realized at {isFixedPriceOrder ? entryPriceLabel : "LTP"} (this exit)</span>
                    <strong className={pnlClass(breakeven.realizedPartialNet)}>
                      {formatCurrency(breakeven.realizedPartialNet)}
                    </strong>
                  </div>
                )}
                <div className="order-guidance-stat">
                  <span>{isPartialExit ? "Portfolio net after exit" : "Portfolio net"}</span>
                  <strong
                    className={pnlClass(
                      breakeven.portfolioNetAfterPartialExit ?? portfolioNetPnL,
                    )}
                  >
                    {formatCurrency(breakeven.portfolioNetAfterPartialExit ?? portfolioNetPnL)}
                  </strong>
                </div>
                <div className="order-guidance-stat">
                  <span>Position P&amp;L at {isFixedPriceOrder ? entryPriceLabel : "LTP"}</span>
                  <strong className={pnlClass(breakeven.netPnLAtLtp)}>
                    {formatCurrency(breakeven.netPnLAtLtp)}
                  </strong>
                </div>
              </div>
              {isPartialExit && (
                <p className="order-guidance-note">
                  {portfolioNetPnL >= 0
                    ? "Partial exit lowers the portfolio SL on what remains — profit is already banked."
                    : "Partial exit raises the portfolio target on what remains — less qty must recover the loss."}
                </p>
              )}
              <TradeSuggestion suggestion={exitSuggestion} />
              {suggestedExitPrice != null && (
                <div className="order-guidance-actions">
                  {portfolioInProfit ? (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={applySuggestedSlOrder}>
                        Apply SL (trigger + limit)
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={applySuggestedSlM}>
                        Apply SL-M (trigger)
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={applySuggestedLimit}>
                      Apply limit target
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {entryGuidance && breakeven && suggestion && (
            <div className="order-guidance">
              <div className="order-guidance-head">
                {addFromPosition
                  ? `Add ${breakeven.addLots ?? lots} lot${(breakeven.addLots ?? lots) > 1 ? "s" : ""} at ${isFixedPriceOrder ? formatOptionPrice(entryPrice) : "LTP"} — portfolio ${portfolioNetPnL >= 0 ? "SL" : "target"}`
                  : isRecovery
                    ? "Re-entry — portfolio impact"
                    : `Entry at ${isFixedPriceOrder ? formatOptionPrice(entryPrice) : "LTP"} — charge-aware levels`}
              </div>
              <div className="order-guidance-stats">
                <div
                  className={`order-guidance-stat${portfolioInProfit && suggestedSl ? " suggested-sl-stat" : ""}`}
                >
                  <span>
                    {addFromPosition
                      ? portfolioNetPnL >= 0
                        ? "Portfolio SL (after add)"
                        : "Portfolio target (after add)"
                      : isRecovery
                        ? "Capital intact SL"
                        : portfolioInProfit
                          ? "Breakeven SL (after entry)"
                          : "Breakeven target (after entry)"}
                  </span>
                  <strong>{formatOptionPrice(breakeven.breakevenPrice)}</strong>
                </div>
                {portfolioInProfit && suggestedSl && (
                  <>
                    <div className="order-guidance-stat suggested-sl-stat">
                      <span>Breakeven SL trigger</span>
                      <strong>{formatOptionPrice(suggestedSl.trigger)}</strong>
                    </div>
                    <div className="order-guidance-stat suggested-sl-stat">
                      <span>Breakeven SL limit</span>
                      <strong>{formatOptionPrice(suggestedSl.limit)}</strong>
                    </div>
                  </>
                )}
                {addFromPosition && avgEntryPrice != null && (
                  <div className="order-guidance-stat">
                    <span>Avg entry (total lots)</span>
                    <strong>{formatOptionPrice(avgEntryPrice)}</strong>
                  </div>
                )}
                <div className="order-guidance-stat">
                  <span>
                    {isRecovery
                      ? "Net P&L total"
                      : `Net P&L at ${isFixedPriceOrder ? entryPriceLabel : "LTP"}`}
                  </span>
                  <strong className={pnlClass(isRecovery ? portfolioNetPnL : breakeven.netPnLAtLtp)}>
                    {formatCurrency(isRecovery ? portfolioNetPnL : breakeven.netPnLAtLtp)}
                  </strong>
                </div>
                <div className="order-guidance-stat">
                  <span>Move from entry</span>
                  <strong>
                    {formatPointMove(
                      breakeven.breakevenPrice -
                        (avgEntryPrice ?? breakeven.entryPrice),
                    )}
                  </strong>
                </div>
              </div>
              {addFromPosition && (
                <p className="order-guidance-note">
                  {portfolioNetPnL >= 0
                    ? `Adding lots at ${isFixedPriceOrder ? entryPriceLabel : "LTP"} raises the portfolio SL — more size must be protected after charges.`
                    : `Adding lots at ${isFixedPriceOrder ? entryPriceLabel : "LTP"} lowers the portfolio target — extra qty shares the recovery.`}
                </p>
              )}
              {isRecovery && breakeven.newTradeNetAtLtp !== undefined && (
                <p className="order-guidance-note">
                  New entry at {isFixedPriceOrder ? formatOptionPrice(entryPrice) : "LTP"} alone:{" "}
                  {formatCurrency(breakeven.newTradeNetAtLtp)} net (charges only).
                  SL offsets portfolio net {formatCurrency(portfolioNetPnL)} to keep starting capital{" "}
                  {formatCurrency(startingCapital)} intact after round-trip charges.
                </p>
              )}
              <TradeSuggestion suggestion={suggestion} />
            </div>
          )}

          <div className="order-summary">
            <div>
              <span>Required</span>
              <strong>{formatCurrency(orderValue)}</strong>
            </div>
            <div>
              <span>Available</span>
              <strong>{formatCurrency(availableMargin)}</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong className={`badge ${mode}`}>{mode}</strong>
            </div>
          </div>

          {error && <div className="trade-error">{error}</div>}

          {!validation.valid && validation.error && !error && (
            <div className="trade-error trade-error-inline">{validation.error}</div>
          )}

          <button
            type="submit"
            className={`btn order-submit ${side.toLowerCase()}`}
            disabled={loading || !validation.valid}
          >
            {loading
              ? "Placing order…"
              : exitMode
                ? `Exit · ${lots} lot${lots > 1 ? "s" : ""}`
                : `${side} ${selection.instrumentType}`}
          </button>
        </form>
      </div>
    </div>
  );
}
