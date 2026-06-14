import { useState } from "react";

import { ChargeBreakdown } from "./ChargeBreakdown";

import { PositionBreakeven } from "./PositionBreakeven";

import { TradeSuggestion } from "./TradeSuggestion";

import type { EnrichedPosition, TradeSelection } from "../types";

import { positionTradeSelection } from "../utils/trade";
import { openStopTargetLabels } from "../utils/positionSide";

import { formatCurrency, pnlClass } from "../utils/format";
import { formatPositionTitle, positionLots } from "../utils/instrument";
import { openEntryLabel, sideBadge } from "../utils/positionSide";
import { trackFeature } from "../utils/analytics";



interface PositionCardProps {
  position: EnrichedPosition;
  highlighted?: boolean;
  otherPortfolioNet: number;
  totalPortfolioNet: number;
  onTrade?: (selection: TradeSelection) => void;
}

export function PositionCard({ position, highlighted = false, otherPortfolioNet, totalPortfolioNet, onTrade }: PositionCardProps) {

  const { pnl } = position;

  const lots = positionLots(position.quantity, position.lotSize);
  const title = formatPositionTitle(position);
  const badge = sideBadge(position.side);
  const levelLabels = openStopTargetLabels(position.side);

  const [chargesOpen, setChargesOpen] = useState(false);



  return (

    <article className={`position-card${highlighted ? " position-highlight" : ""}`} data-position-id={position.id}>

      <div className="position-head">

        <div>

          <div className="position-title">{title}</div>

          <div className="position-meta">

            {lots} lot{lots > 1 ? "s" : ""} · {position.quantity} qty · Lot size {position.lotSize}
            {badge ? ` · ${badge}` : ""} · Exp {position.expiry}

          </div>

        </div>

        <div className="pnl-block">

          <div className={`pnl-net ${pnlClass(pnl.net)}`}>{formatCurrency(pnl.net)}</div>

          <div className="pnl-gross">Gross: {formatCurrency(pnl.gross)}</div>

        </div>

      </div>



      {onTrade && (
        <div className="position-actions">
          <button
            type="button"
            className="position-trade-btn buy"
            onClick={() => {
              trackFeature("position_add");
              onTrade(positionTradeSelection(position, "add", otherPortfolioNet));
            }}
          >
            Add more quantity
          </button>

          <button
            type="button"
            className="position-trade-btn sell"
            onClick={() => {
              trackFeature("position_exit");
              onTrade(positionTradeSelection(position, "exit", otherPortfolioNet));
            }}
          >
            Exit
          </button>
        </div>
      )}



      <div className="metrics">

        <div className="metric">

          <label>{openEntryLabel(position.side)}</label>

          <span>{formatCurrency(position.buyPrice)}</span>

        </div>

        <div className="metric">

          <label>LTP</label>

          <span>{formatCurrency(position.ltp)}</span>

        </div>

        <div className="metric">

          <label>Capital</label>

          <span>{formatCurrency(position.capitalDeployed)}</span>

        </div>

        <div className="metric">

          <label>{levelLabels.stopLoss}</label>

          <span>{position.stopLoss ? formatCurrency(position.stopLoss) : "—"}</span>

        </div>

        <div className="metric">

          <label>{levelLabels.target}</label>

          <span>{position.target ? formatCurrency(position.target) : "—"}</span>

        </div>

      </div>



      <TradeSuggestion suggestion={position.suggestion} />



      <PositionBreakeven
        positionId={position.id}
        lotSize={position.lotSize}
        ltp={position.ltp}
        defaultLots={lots}
        heldLots={lots}
        existingBuyPrice={position.buyPrice}
        otherPortfolioNet={otherPortfolioNet}
        totalPortfolioNet={totalPortfolioNet}
        baselineFullExitPrice={position.breakevenPrice}
        positionSide={position.side}
      />



      <div className="charges-dropdown">

        <button

          type="button"

          className="charges-toggle"

          onClick={() => setChargesOpen((open) => !open)}

          aria-expanded={chargesOpen}

        >

          <span>Charges</span>

          <span className="charges-toggle-value">{formatCurrency(pnl.charges.total)}</span>

          <span className="charges-chevron">{chargesOpen ? "▾" : "▸"}</span>

        </button>

        {chargesOpen && (

          <div className="charges-panel">

            <ChargeBreakdown

              entry={pnl.charges.entry}

              exit={pnl.charges.exit}

              total={pnl.charges.total}

            />

          </div>

        )}

      </div>

    </article>

  );

}


