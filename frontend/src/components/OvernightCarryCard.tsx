import type { OvernightCarry } from "../types";
import { formatCurrency } from "../utils/format";
import { formatIstDateTime } from "../utils/datetime";

interface OvernightCarryCardProps {
  carry: OvernightCarry;
  highlighted?: boolean;
  onViewPosition: (positionId: string) => void;
}

export function OvernightCarryCard({
  carry,
  highlighted = false,
  onViewPosition,
}: OvernightCarryCardProps) {
  return (
    <article
      className={`position-card overnight-carry-card${highlighted ? " position-highlight" : ""}`}
      data-position-id={carry.positionId}
    >
      <div className="position-head">
        <div>
          <div className="position-title">
            {carry.symbol} {carry.strike}{" "}
            <span className={`badge ${carry.instrumentType.toLowerCase()}`}>
              {carry.instrumentType}
            </span>
            <span className="badge overnight">Overnight</span>
          </div>
          <div className="position-meta">
            {carry.product} carry · {carry.lots} lot{carry.lots > 1 ? "s" : ""} · {carry.quantity}{" "}
            qty · Exp {carry.expiry}
          </div>
          <div className="order-pending-hint">
            Held from {formatIstDateTime(carry.openedAt)} · Avg {formatCurrency(carry.buyPrice)} ·
            LTP {formatCurrency(carry.ltp)}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onViewPosition(carry.positionId)}
        >
          View position
        </button>
      </div>
    </article>
  );
}
