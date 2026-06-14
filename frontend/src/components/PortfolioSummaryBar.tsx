import type { DashboardData } from "../types";
import { computeAllPositionsTotals } from "../utils/portfolio";
import { formatCurrency, pnlClass } from "../utils/format";

interface PortfolioSummaryBarProps {
  dashboard: DashboardData;
}

export function PortfolioSummaryBar({ dashboard }: PortfolioSummaryBarProps) {
  const totals = computeAllPositionsTotals(dashboard);
  const walletDayChange = totals.walletDayChange;
  const modelVsCashMismatch =
    dashboard.mode === "live" &&
    walletDayChange != null &&
    Math.abs(walletDayChange - totals.netPnL) > 500;

  return (
    <section className="portfolio-summary-bar" aria-label="Portfolio P and L summary">
      <div className="portfolio-summary-head">
        <h2>Total P&amp;L</h2>
        <span className="portfolio-summary-meta">
          {totals.positionCount} position{totals.positionCount !== 1 ? "s" : ""} ·{" "}
          {totals.openCount} open · {totals.closedCount} closed
        </span>
      </div>
      <div className="portfolio-summary-metrics">
        <div className="portfolio-metric">
          <label>Gross P&amp;L</label>
          <strong className={pnlClass(totals.grossPnL)}>{formatCurrency(totals.grossPnL)}</strong>
        </div>
        <div className="portfolio-metric">
          <label>Net P&amp;L</label>
          <strong className={pnlClass(totals.netPnL)}>{formatCurrency(totals.netPnL)}</strong>
          <span className="portfolio-metric-hint">Gross minus modeled charges</span>
        </div>
        <div className="portfolio-metric">
          <label>Total charges</label>
          <strong className="charges-color">{formatCurrency(totals.totalCharges)}</strong>
        </div>
        {dashboard.mode === "live" && walletDayChange != null ? (
          <div className="portfolio-metric">
            <label>Cash vs opening</label>
            <strong className={pnlClass(walletDayChange)}>{formatCurrency(walletDayChange)}</strong>
            <span className="portfolio-metric-hint">Kite balance move today</span>
          </div>
        ) : null}
      </div>
      {modelVsCashMismatch ? (
        <p className="portfolio-summary-warning" role="status">
          Modeled net and Kite cash move differ — compare with Console P&amp;L or your contract note
          net payable.
        </p>
      ) : null}
    </section>
  );
}
