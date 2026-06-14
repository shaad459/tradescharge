import { ChargeBreakdown } from "./ChargeBreakdown";
import type { EnrichedClosedPosition } from "../types";
import { formatIstDateTime } from "../utils/datetime";
import { formatCurrency, pnlClass } from "../utils/format";
import { formatPositionTitle, positionLots } from "../utils/instrument";
import { closedPriceLabels, sideBadge } from "../utils/positionSide";

interface ClosedPositionCardProps {
  position: EnrichedClosedPosition;
  highlighted?: boolean;
  onReenter?: (position: EnrichedClosedPosition, side: "BUY" | "SELL") => Promise<void>;
  reenterLoading?: string | null;
}

export function ClosedPositionCard({
  position,
  highlighted = false,
  onReenter,
  reenterLoading = null,
}: ClosedPositionCardProps) {
  const { pnl } = position;
  const lots = positionLots(position.quantity, position.lotSize);
  const title = formatPositionTitle(position);
  const priceLabels = closedPriceLabels(position.side);
  const badge = sideBadge(position.side);
  const loadingKey = (side: "BUY" | "SELL") => `${position.id}:${side}`;

  return (
    <article
      className={`position-card closed-position-card${highlighted ? " position-highlight" : ""}`}
      data-position-id={position.id}
    >
      <div className="position-head">
        <div>
          <div className="position-title">{title}</div>
          <div className="position-meta">
            {lots} lot{lots > 1 ? "s" : ""} · {position.quantity} qty
            {badge ? ` · ${badge}` : ""}
            {position.exitBrokerageOrders && position.exitBrokerageOrders > 1
              ? ` · ${position.exitBrokerageOrders} exit orders`
              : position.exitOrderId
                ? ` · Order ${position.exitOrderId}`
                : ""}{" "}
            · Closed{" "}
            {formatIstDateTime(position.closedAt)}
          </div>
        </div>
        <div className="pnl-block">
          <div className={`pnl-net ${pnlClass(pnl.net)}`}>{formatCurrency(pnl.net)}</div>
          <div className="pnl-gross">Gross: {formatCurrency(pnl.gross)}</div>
        </div>
      </div>

      {onReenter && (
        <div className="position-actions">
          <button
            type="button"
            className="position-trade-btn buy"
            disabled={reenterLoading != null}
            onClick={() => void onReenter(position, "BUY")}
          >
            {reenterLoading === loadingKey("BUY") ? "Loading…" : "Buy"}
          </button>
          <button
            type="button"
            className="position-trade-btn sell"
            disabled={reenterLoading != null}
            onClick={() => void onReenter(position, "SELL")}
          >
            {reenterLoading === loadingKey("SELL") ? "Loading…" : "Sell"}
          </button>
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <label>{priceLabels.entry}</label>
          <span>{formatCurrency(position.buyPrice)}</span>
        </div>
        <div className="metric">
          <label>{priceLabels.exit}</label>
          <span>{formatCurrency(position.exitPrice)}</span>
        </div>
        <div className="metric">
          <label>Capital</label>
          <span>{formatCurrency(position.capitalDeployed)}</span>
        </div>
        <div className="metric">
          <label>Charges</label>
          <span>{formatCurrency(pnl.charges.total)}</span>
        </div>
        <div className="metric">
          <label>Expiry</label>
          <span>{position.expiry}</span>
        </div>
      </div>

      <div className="charges-panel flat-charges">
        <ChargeBreakdown
          entry={pnl.charges.entry}
          exit={pnl.charges.exit}
          total={pnl.charges.total}
        />
      </div>
    </article>
  );
}
