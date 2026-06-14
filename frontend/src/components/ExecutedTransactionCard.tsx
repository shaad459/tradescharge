import type { ExecutedTransaction } from "../types";
import { formatIstDateTime } from "../utils/datetime";
import { formatCurrency } from "../utils/format";

interface ExecutedTransactionCardProps {
  row: ExecutedTransaction;
}

export function ExecutedTransactionCard({ row }: ExecutedTransactionCardProps) {
  const sideClass = row.side === "BUY" ? "buy" : "sell";
  const statusClass = row.status === "CANCELLED" ? "cancelled" : "complete";
  const qtyLabel =
    row.status === "CANCELLED"
      ? `0/${row.quantity} qty`
      : `${row.filledQuantity}/${row.quantity} qty`;

  return (
    <article className={`executed-tx-card ${sideClass} ${statusClass}`}>
      <div className="executed-tx-head">
        <div>
          <div className={`executed-tx-side ${sideClass}`}>{row.side}</div>
          <div className="executed-tx-title">{row.instrumentLabel}</div>
          <div className="executed-tx-meta">
            {row.exchange} · {row.product} · {row.lots} lot{row.lots > 1 ? "s" : ""} · {qtyLabel} ·{" "}
            {row.orderType}
            {row.orderId ? ` · #${row.orderId}` : ""}
          </div>
        </div>
        <div className="executed-tx-right">
          <span className={`executed-tx-status ${statusClass}`}>{row.status}</span>
          <span className="executed-tx-time">{formatIstDateTime(row.timestamp)}</span>
          {row.status !== "CANCELLED" && (
            <span className="executed-tx-price">{formatCurrency(row.price)}</span>
          )}
          {row.status === "CANCELLED" && row.price > 0 && (
            <span className="executed-tx-price">Limit {formatCurrency(row.price)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
