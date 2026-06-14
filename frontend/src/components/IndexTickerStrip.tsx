import { useEffect, useState } from "react";
import { fetchIndexTickers } from "../api/client";
import type { IndexSymbol, IndexTicker } from "../types";
import { formatIndexPrice, formatPercentChange, pnlClass } from "../utils/format";

const INDEX_LABELS: Record<IndexSymbol, string> = {
  NIFTY: "Nifty 50",
  BANKNIFTY: "Bank Nifty",
  SENSEX: "Sensex",
};

const INDEX_ORDER: IndexSymbol[] = ["NIFTY", "BANKNIFTY", "SENSEX"];

interface IndexTickerStripProps {
  streamedIndexTickers?: IndexTicker[];
}

export function IndexTickerStrip({ streamedIndexTickers }: IndexTickerStripProps) {
  const [indexTickers, setIndexTickers] = useState<IndexTicker[]>([]);

  useEffect(() => {
    if (streamedIndexTickers?.length) {
      setIndexTickers(streamedIndexTickers);
    }
  }, [streamedIndexTickers]);

  useEffect(() => {
    fetchIndexTickers()
      .then(setIndexTickers)
      .catch(console.error);
  }, []);

  return (
    <section className="panel index-ticker-panel" aria-label="Index prices">
      <div className="oc-index-strip">
        {INDEX_ORDER.map((symbol) => {
          const ticker = indexTickers.find((t) => t.symbol === symbol);

          return (
            <div key={symbol} className="oc-index-chip static">
              <span className="oc-index-name">{INDEX_LABELS[symbol]}</span>
              {ticker ? (
                <>
                  <span className="oc-index-spot">{formatIndexPrice(ticker.spotPrice)}</span>
                  <span className={`oc-index-change ${pnlClass(ticker.spotChange)}`}>
                    {ticker.spotChange > 0 ? "+" : ""}
                    {formatIndexPrice(ticker.spotChange)} ({formatPercentChange(ticker.spotChangePct)})
                  </span>
                </>
              ) : (
                <span className="oc-index-spot muted">—</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
