import { useEffect, useState } from "react";

import { fetchBreakeven } from "../api/client";

import type { BreakevenResult } from "../types";

import { formatCurrency, formatOptionPrice, formatPointMove, pnlClass } from "../utils/format";

import { weightedEntryLots } from "../utils/portfolio";



interface PositionBreakevenProps {

  positionId: string;

  lotSize: number;

  ltp: number;

  defaultLots: number;

  heldLots: number;

  existingBuyPrice: number;

  otherPortfolioNet: number;

  totalPortfolioNet: number;

  baselineFullExitPrice: number;

  positionSide?: "long" | "short";

}



export function PositionBreakeven({

  positionId,

  lotSize,

  ltp,

  defaultLots,

  heldLots,

  existingBuyPrice,

  otherPortfolioNet,

  totalPortfolioNet,

  baselineFullExitPrice,

  positionSide = "long",

}: PositionBreakevenProps) {

  const [lots, setLots] = useState(defaultLots);

  const [result, setResult] = useState<BreakevenResult | null>(null);



  useEffect(() => {

    setLots(defaultLots);

  }, [defaultLots]);



  useEffect(() => {

    fetchBreakeven(
      ltp,
      lotSize,
      lots,
      heldLots,
      existingBuyPrice,
      otherPortfolioNet,
      undefined,
      positionSide,
    )

      .then(setResult)

      .catch(console.error);

  }, [ltp, lotSize, lots, heldLots, existingBuyPrice, otherPortfolioNet, positionSide]);



  const isPartialExit = lots < heldLots;

  const isAdding = lots > heldLots;

  const partialExitLots = isPartialExit ? heldLots - lots : 0;

  const addLots = isAdding ? lots - heldLots : 0;

  const avgEntryPrice =

    isAdding && result

      ? weightedEntryLots(existingBuyPrice, heldLots, ltp, lots)

      : (result?.entryPrice ?? existingBuyPrice);

  const moveFromEntry = result ? result.breakevenPrice - avgEntryPrice : 0;

  const legBreakeven = result?.legBreakevenPrice;

  const showLegBreakeven =

    legBreakeven !== undefined && Math.abs(legBreakeven - (result?.breakevenPrice ?? 0)) > 0.05;

  const legMoveFromEntry = legBreakeven !== undefined ? legBreakeven - avgEntryPrice : 0;

  const displayPortfolioNet =

    result?.portfolioNetAfterPartialExit ?? totalPortfolioNet;

  const exitDelta =

    result && lots !== heldLots ? result.breakevenPrice - baselineFullExitPrice : 0;

  const showDirection =

    result != null && lots !== heldLots && Math.abs(exitDelta) > 0.01;



  const scenarioLabel = isPartialExit

    ? positionSide === "short"

      ? "Portfolio zero-net cover (remaining lots)"

      : "Portfolio zero-net exit (remaining lots)"

    : isAdding

      ? positionSide === "short"

        ? "Portfolio zero-net cover (after add)"

        : "Portfolio zero-net exit (after add)"

      : positionSide === "short"

        ? "Portfolio zero-net cover price"

        : "Portfolio zero-net exit price";



  return (

    <div className="position-breakeven" aria-label="Breakeven calculator">

      <div className="breakeven-section-title">Breakeven calculator</div>



      <div className="breakeven-header">

        <span className="breakeven-label">{scenarioLabel}</span>

        {result && (

          <strong className="breakeven-price">{formatOptionPrice(result.breakevenPrice)}</strong>

        )}

      </div>



      <div className="breakeven-controls">

        <label htmlFor={`lots-${positionId}`}>

          {isPartialExit ? (

            <>

              Remaining lots: {lots} · model {partialExitLots} lot exit at LTP first

            </>

          ) : isAdding ? (

            <>

              Total lots: {lots} (+{lots - heldLots} modeled buy at LTP)

            </>

          ) : (

            <>Lots: {lots}</>

          )}

        </label>

        <input

          id={`lots-${positionId}`}

          type="range"

          min={1}

          max={
            isAdding
              ? heldLots + 5
              : isPartialExit
                ? Math.max(1, heldLots - 1)
                : heldLots
          }

          value={lots}

          onChange={(e) => setLots(Number(e.target.value))}

        />

      </div>



      {showDirection && (

        <p className="breakeven-direction">

          Full position modeled price{" "}

          <strong>{formatOptionPrice(baselineFullExitPrice)}</strong>

          {" → "}

          <strong>{formatOptionPrice(result!.breakevenPrice)}</strong>

          {isPartialExit ? (

            <> — changes when partial exit is included in the model</>

          ) : (

            <> — changes when added lots are included in the model</>

          )}

        </p>

      )}



      {result && (

        <div className="breakeven-stats">

          <div className="breakeven-stat">

            <span>{isAdding ? "Avg entry price (total lots)" : "Entry price"}</span>

            <strong>{formatOptionPrice(avgEntryPrice)}</strong>

          </div>

          {isAdding && (

            <div className="breakeven-stat breakeven-stat-note">

              <span>Blend</span>

              <strong>

                {heldLots} @ {formatOptionPrice(existingBuyPrice)} + {addLots} @{" "}

                {formatOptionPrice(ltp)}

              </strong>

            </div>

          )}

          <div className="breakeven-stat">

            <span>Held lots (open position)</span>

            <strong>{heldLots}</strong>

          </div>

          {result.lots !== heldLots && (

            <div className="breakeven-stat breakeven-stat-note">

              <span>{isPartialExit ? "Remaining lots (slider)" : "Lots in model (slider)"}</span>

              <strong>{result.lots}</strong>

            </div>

          )}

          <div className="breakeven-stat">

            <span>Capital deployed (active)</span>

            <strong>{formatCurrency(result.capitalDeployed)}</strong>

          </div>

          {isPartialExit && result.realizedPartialNet !== undefined && (

            <div className="breakeven-stat">

              <span>Modeled partial exit at LTP ({partialExitLots} lot)</span>

              <strong className={pnlClass(result.realizedPartialNet)}>

                {formatCurrency(result.realizedPartialNet)}

              </strong>

            </div>

          )}

          <div className="breakeven-stat">

            <span>{isPartialExit ? "Portfolio net after partial exit" : "Portfolio net"}</span>

            <strong className={pnlClass(displayPortfolioNet)}>

              {formatCurrency(displayPortfolioNet)}

            </strong>

          </div>

          <div className="breakeven-stat">

            <span>Position P&amp;L at LTP</span>

            <strong className={pnlClass(result.netPnLAtLtp)}>

              {formatCurrency(result.netPnLAtLtp)}

            </strong>

          </div>

          <div className="breakeven-stat">

            <span>Move from entry</span>

            <strong className={moveFromEntry >= 0 ? "positive" : "negative"}>

              {formatPointMove(moveFromEntry)}

            </strong>

          </div>

          {showLegBreakeven && (

            <div className="breakeven-stat">

              <span>Leg zero-net exit (active lots only)</span>

              <strong>{formatOptionPrice(legBreakeven!)}</strong>

            </div>

          )}

        </div>

      )}



      {result && (

        <p className="breakeven-hint">

          {isPartialExit ? (

            <>

              Model assumes <strong>{partialExitLots}</strong> lot{partialExitLots > 1 ? "s" : ""}{" "}

              exited at LTP, then <strong>{lots}</strong> lot{lots > 1 ? "s" : ""} exited at{" "}

              <strong>{formatOptionPrice(result.breakevenPrice)}</strong> (

              <strong>{formatPointMove(moveFromEntry)}</strong> from entry)

              {result.portfolioZeroAchievable === false ? (

                <>

                  {" "}

                  — charge breakeven on active lots only (portfolio zero not reachable on{" "}

                  {lots} lot{lots > 1 ? "s" : ""} alone after the modeled partial exit).

                </>

              ) : (

                <>

                  {" "}

                  — estimated overall portfolio net would be ~₹0 after charges (partial exit uses

                  its own sell-order fees in the model)

                </>

              )}

              . Modeled portfolio net after partial exit:{" "}

              <strong className={pnlClass(displayPortfolioNet)}>

                {formatCurrency(displayPortfolioNet)}

              </strong>

              .

            </>

          ) : showLegBreakeven ? (

            <>

              At <strong>{formatOptionPrice(result.breakevenPrice)}</strong> (

              <strong>{formatPointMove(moveFromEntry)}</strong> from entry), estimated overall

              portfolio net would be ~₹0 after charges. Portfolio net now{" "}

              <strong className={pnlClass(totalPortfolioNet)}>

                {formatCurrency(totalPortfolioNet)}

              </strong>

              . For active lots alone, zero-net exit (charges only) is{" "}

              <strong>{formatOptionPrice(legBreakeven!)}</strong> (

              <strong>{formatPointMove(legMoveFromEntry)}</strong> from entry).

            </>

          ) : (

            <>

              At <strong>{formatOptionPrice(result.breakevenPrice)}</strong> (

              <strong>{formatPointMove(moveFromEntry)}</strong> from entry), estimated net on

              active lots after charges would be ~₹0

              {isAdding ? " (model includes a separate buy on added lots)" : ""}.

            </>

          )}

        </p>

      )}



      <p className="calculator-disclaimer">

        Illustrative only — based on your data and charge assumptions. Not investment advice; you

        decide whether and where to trade on Kite.

      </p>

    </div>

  );

}

