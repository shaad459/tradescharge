import { useMemo } from "react";
import type { IndexSymbol, OptionChainResponse, OptionChainRow, OptionLeg } from "../types";
import { formatIndianCompact, formatOptionPrice, formatPointMove, pnlClass } from "../utils/format";

interface OptionChainTableProps {
  chain: OptionChainResponse;
  chainSymbol: IndexSymbol;
  selectedStrike: { tradingsymbol: string } | null;
  strikeSearch: string;
  onPickCe: (leg: OptionLeg, strike: number) => void;
  onPickPe: (leg: OptionLeg, strike: number) => void;
}

function rowMatchesSearch(row: OptionChainRow, search: string): boolean {
  const q = search.trim();
  if (!q) return false;
  return String(row.strike).includes(q);
}

function maxOiInChain(rows: OptionChainRow[]): number {
  let max = 0;
  for (const row of rows) {
    if (row.ce?.oi) max = Math.max(max, row.ce.oi);
    if (row.pe?.oi) max = Math.max(max, row.pe.oi);
  }
  return max;
}

function OiChangeCell({ oiChange }: { oiChange: number }) {
  const cls = pnlClass(oiChange);
  const sign = oiChange > 0 ? "+" : "";
  return (
    <td className={`oi-chg-cell ${cls}`}>
      <span className={`oi-change ${cls}`}>
        {oiChange === 0 ? "—" : `${sign}${formatIndianCompact(oiChange)}`}
      </span>
    </td>
  );
}

function OiCell({
  oi,
  maxOi,
  side,
}: {
  oi: number;
  maxOi: number;
  side: "ce" | "pe";
}) {
  const widthPct = maxOi > 0 ? Math.min(100, (oi / maxOi) * 100) : 0;
  return (
    <td className={`oi-cell oi-cell-${side}`}>
      <div className="oi-bar-wrap" aria-hidden>
        <div className={`oi-bar oi-bar-${side}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="oi-value">{oi > 0 ? formatIndianCompact(oi) : "—"}</span>
    </td>
  );
}

function LtpCell({
  leg,
  side,
  selected,
  onPick,
}: {
  leg: OptionLeg | null;
  side: "ce" | "pe";
  selected: boolean;
  onPick: () => void;
}) {
  if (!leg) {
    return <td className={`ltp-cell ltp-cell-${side} muted-cell`}>—</td>;
  }
  return (
    <td
      className={`ltp-cell ltp-cell-${side} pick-leg ${side} ${selected ? "leg-selected" : ""}`}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onPick();
      }}
    >
      <span className="ltp-main">{formatOptionPrice(leg.ltp)}</span>
      <span className={`ltp-change ${pnlClass(leg.ltpChange)}`}>
        {leg.ltpChange === 0 ? "—" : formatPointMove(leg.ltpChange)}
      </span>
    </td>
  );
}

export function OptionChainTable({
  chain,
  chainSymbol,
  selectedStrike,
  strikeSearch,
  onPickCe,
  onPickPe,
}: OptionChainTableProps) {
  const rows = useMemo(() => {
    const q = strikeSearch.trim();
    if (!q) return chain.chain;
    return chain.chain.filter((row) => rowMatchesSearch(row, q));
  }, [chain.chain, strikeSearch]);

  const maxOi = useMemo(() => maxOiInChain(chain.chain), [chain.chain]);

  return (
    <>
      <div className="chain-table-wrap kite-chain-wrap">
        <table className="chain-table kite-chain">
          <thead>
            <tr>
              <th className="chain-side-head calls" colSpan={3}>
                Calls
              </th>
              <th className="strike-head">Strike</th>
              <th className="chain-side-head puts" colSpan={3}>
                Puts
              </th>
            </tr>
            <tr className="chain-col-labels">
              <th className="oi-chg-head">OI chg</th>
              <th className="oi-head">OI</th>
              <th className="ltp-head">LTP</th>
              <th />
              <th className="ltp-head">LTP</th>
              <th className="oi-head">OI</th>
              <th className="oi-chg-head">OI chg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hit = strikeSearch.trim() && rowMatchesSearch(row, strikeSearch);
              const ceSelected = selectedStrike?.tradingsymbol === row.ce?.tradingsymbol;
              const peSelected = selectedStrike?.tradingsymbol === row.pe?.tradingsymbol;
              return (
                <tr
                  key={row.strike}
                  className={`${row.isAtm ? "atm-row" : ""} ${hit ? "search-hit-row" : ""}`}
                >
                  <OiChangeCell oiChange={row.ce?.oiChange ?? 0} />
                  <OiCell oi={row.ce?.oi ?? 0} maxOi={maxOi} side="ce" />
                  <LtpCell
                    leg={row.ce}
                    side="ce"
                    selected={Boolean(ceSelected)}
                    onPick={() => row.ce && onPickCe(row.ce, row.strike)}
                  />
                  <td className="strike-cell strike-pick-cell">
                    <span className="strike-pick-value">{row.strike}</span>
                    <span className="strike-pick-actions">
                      <button
                        type="button"
                        className={`strike-pick-btn ce ${ceSelected ? "active" : ""}`}
                        disabled={!row.ce}
                        onClick={() => row.ce && onPickCe(row.ce, row.strike)}
                      >
                        CE
                      </button>
                      <button
                        type="button"
                        className={`strike-pick-btn pe ${peSelected ? "active" : ""}`}
                        disabled={!row.pe}
                        onClick={() => row.pe && onPickPe(row.pe, row.strike)}
                      >
                        PE
                      </button>
                    </span>
                  </td>
                  <LtpCell
                    leg={row.pe}
                    side="pe"
                    selected={Boolean(peSelected)}
                    onPick={() => row.pe && onPickPe(row.pe, row.strike)}
                  />
                  <OiCell oi={row.pe?.oi ?? 0} maxOi={maxOi} side="pe" />
                  <OiChangeCell oiChange={row.pe?.oiChange ?? 0} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chain.summary && (
        <div className="chain-summary-strip" aria-label="Chain summary">
          <span>
            PCR <strong>{chain.summary.pcr.toFixed(2)}</strong>
          </span>
          <span>
            Max pain <strong>{chain.summary.maxPain}</strong>
          </span>
          <span>
            ATM IV <strong>{chain.summary.atmIv.toFixed(1)}%</strong>
          </span>
          <span>
            IV %ile <strong>{chain.summary.ivPercentile.toFixed(0)}</strong>
          </span>
          <span className="muted">
            {chainSymbol} · {chain.expiry}
          </span>
        </div>
      )}
    </>
  );
}
