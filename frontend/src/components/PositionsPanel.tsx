import { useEffect, useMemo, useRef, useState } from "react";
import { ClosedPositionCard } from "./ClosedPositionCard";
import { ExecutedTransactionCard } from "./ExecutedTransactionCard";
import { PositionCard } from "./PositionCard";
import type {
  EnrichedClosedPosition,
  EnrichedPosition,
  ExecutedTransaction,
  PositionsNavigation,
  TradeSelection,
} from "../types";
import { closedPositionToTradeSelection } from "../utils/trade";
import { trackFeature } from "../utils/analytics";
import { normalizeExecutedForDisplay } from "../utils/executed";
import { VIEW_ONLY } from "../config/viewOnly";

type PositionsTab = "open" | "closed" | "executed";

interface PositionsPanelProps {
  openPositions: EnrichedPosition[];
  closedPositions: EnrichedClosedPosition[];
  executedTransactions?: ExecutedTransaction[];
  mode: "demo" | "live";
  navigation?: PositionsNavigation | null;
  onNavigationHandled?: () => void;
  onTrade?: (selection: TradeSelection) => void;
}

export function PositionsPanel({
  openPositions,
  closedPositions,
  executedTransactions = [],
  mode,
  navigation,
  onNavigationHandled,
  onTrade,
}: PositionsPanelProps) {
  const [tab, setTab] = useState<PositionsTab>("open");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reenterLoading, setReenterLoading] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const executedRows = useMemo(
    () => normalizeExecutedForDisplay(executedTransactions),
    [executedTransactions],
  );

  const portfolioNet = useMemo(() => {
    const closedNet = closedPositions.reduce((sum, position) => sum + position.pnl.net, 0);
    const openNet = openPositions.reduce((sum, position) => sum + position.pnl.net, 0);
    return Math.round((openNet + closedNet) * 100) / 100;
  }, [openPositions, closedPositions]);

  useEffect(() => {
    if (!navigation) {
      return;
    }

    setTab(navigation.panel);
    if (navigation.highlightId) {
      setHighlightId(navigation.highlightId);
    }

    requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector(
        `[data-position-id="${navigation.highlightId}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const timer = window.setTimeout(() => {
      setHighlightId(null);
      onNavigationHandled?.();
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [navigation, onNavigationHandled]);

  async function handleClosedReenter(position: EnrichedClosedPosition, side: "BUY" | "SELL") {
    if (!onTrade) {
      return;
    }
    const key = `${position.id}:${side}`;
    setReenterLoading(key);
    try {
      const selection = await closedPositionToTradeSelection(position, side);
      trackFeature("closed_reentry", { side });
      onTrade(selection);
    } catch (err) {
      console.error(err);
    } finally {
      setReenterLoading(null);
    }
  }

  return (
    <section className="panel positions-panel" ref={panelRef}>
      <div className="positions-tabs">
        <button
          type="button"
          className={tab === "open" ? "active" : ""}
          onClick={() => {
            setTab("open");
            trackFeature("positions_open_tab");
          }}
        >
          Open Positions ({openPositions.length})
        </button>
        <button
          type="button"
          className={tab === "closed" ? "active" : ""}
          onClick={() => {
            setTab("closed");
            trackFeature("positions_closed_tab");
          }}
        >
          Closed Positions ({closedPositions.length})
        </button>
        <button
          type="button"
          className={tab === "executed" ? "active" : ""}
          onClick={() => {
            setTab("executed");
            trackFeature("positions_executed_tab");
          }}
        >
          Executed ({executedRows.length})
        </button>
      </div>

      {tab === "open" && (
        <>
          {openPositions.length === 0 && (
            <p className="empty-positions">
              No open positions. Trade on Kite — positions sync automatically when logged in.
            </p>
          )}
          {openPositions.map((position) => (
            <PositionCard
              key={position.id}
              position={position}
              highlighted={highlightId === position.id}
              otherPortfolioNet={Math.round((portfolioNet - position.pnl.net) * 100) / 100}
              totalPortfolioNet={portfolioNet}
              onTrade={onTrade}
            />
          ))}
        </>
      )}

      {tab === "closed" && (
        <>
          {closedPositions.length === 0 && (
            <p className="empty-positions">
              {mode === "live"
                ? "No flat positions today. Contracts you fully exit on Kite appear here (one row per strike, same as Kite Positions)."
                : VIEW_ONLY
                  ? "No closed positions yet. Closed trades from Kite appear here with charge-aware net P&L."
                  : "No closed positions yet. Sell from an open position to record a closed trade."}
            </p>
          )}
          {closedPositions.map((position) => (
            <ClosedPositionCard
              key={position.id}
              position={position}
              highlighted={highlightId === position.id}
              onReenter={VIEW_ONLY ? undefined : handleClosedReenter}
              reenterLoading={reenterLoading}
            />
          ))}
        </>
      )}

      {tab === "executed" && (
        <>
          {executedRows.length === 0 && (
            <p className="empty-positions">
              {mode === "live"
                ? "No executed orders today. Matches Kite Orders → Executed (one row per order, e.g. 455/455)."
                : "Executed transactions appear when logged in to Kite."}
            </p>
          )}
          {executedRows.map((row) => (
            <ExecutedTransactionCard key={row.id} row={row} />
          ))}
        </>
      )}
    </section>
  );
}
